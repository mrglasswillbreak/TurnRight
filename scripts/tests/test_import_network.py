"""Exercise the importer's network boundary without contacting external services."""

import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from map_import import network


class ImportNetworkTests(unittest.TestCase):
    def response(self, status=200, data=b"map", headers=None):
        response = MagicMock(status=status)
        response.read.return_value = data
        response.getheader.side_effect = lambda name, default=None: (headers or {}).get(
            name, default
        )
        return response

    def connections(self, responses):
        connections = []
        for response in responses:
            connection = MagicMock()
            connection.getresponse.return_value = response
            connections.append(connection)
        return connections

    def test_dns_requires_every_answer_to_be_public(self):
        for addresses in [
            [],
            ["127.0.0.1"],
            ["::1"],
            ["10.0.0.1"],
            ["8.8.8.8", "192.168.1.1"],
        ]:
            with (
                self.subTest(addresses=addresses),
                patch.object(
                    socket,
                    "getaddrinfo",
                    return_value=[
                        (None, None, None, None, (ip, 443)) for ip in addresses
                    ],
                ),
                self.assertRaisesRegex(ValueError, "exclusively"),
            ):
                network.public_addresses("maps.example")
        with patch.object(
            socket,
            "getaddrinfo",
            return_value=[
                (None, None, None, None, (ip, 443))
                for ip in ["8.8.8.8", "1.1.1.1", "8.8.8.8"]
            ],
        ):
            self.assertEqual(
                network.public_addresses("maps.example"), ["1.1.1.1", "8.8.8.8"]
            )

    def test_connection_pins_address_but_verifies_original_tls_hostname(self):
        with (
            patch.object(network.ssl, "create_default_context") as context,
            patch.object(socket, "create_connection") as connect,
        ):
            connection = network.PinnedHTTPS("maps.example", "8.8.8.8", timeout=12)
            connection.connect()
            connect.assert_called_once_with(("8.8.8.8", 443), 12)
            context.return_value.wrap_socket.assert_called_once_with(
                connect.return_value, server_hostname="maps.example"
            )
            self.assertIs(
                connection.sock, context.return_value.wrap_socket.return_value
            )

    def test_rejects_unsafe_urls_before_opening_connection(self):
        with patch.object(network, "PinnedHTTPS") as connection:
            for url in [
                "http://maps.example",
                "https:///path",
                "https://u:p@maps.example",
                "https://maps.example:8443",
            ]:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    network.fetch_public(url)
            connection.assert_not_called()

    def test_redirect_revalidates_dns_and_303_discards_post_body(self):
        connections = self.connections(
            [
                self.response(
                    303, headers={"Location": "https://next.example/data?q=1"}
                ),
                self.response(data=b"verified"),
            ]
        )
        with (
            patch.object(network, "PinnedHTTPS", side_effect=connections),
            patch.object(
                network, "public_addresses", side_effect=[["8.8.8.8"], ["1.1.1.1"]]
            ) as addresses,
        ):
            self.assertEqual(
                network.fetch_public("https://maps.example", form={"q": "a b"}),
                b"verified",
            )
        self.assertEqual(
            [c.args for c in addresses.call_args_list],
            [("maps.example",), ("next.example",)],
        )
        self.assertEqual(
            connections[0].request.call_args.args[:3], ("POST", "/", b"q=a+b")
        )
        self.assertEqual(
            connections[1].request.call_args.args[:3], ("GET", "/data?q=1", None)
        )
        for connection in connections:
            connection.close.assert_called_once()

    def test_redirect_to_private_host_is_rejected(self):
        connection = self.connections(
            [self.response(302, headers={"Location": "https://internal.example"})]
        )[0]
        with (
            patch.object(network, "PinnedHTTPS", return_value=connection) as factory,
            patch.object(
                network,
                "public_addresses",
                side_effect=[["8.8.8.8"], ValueError("private")],
            ),
            self.assertRaisesRegex(ValueError, "private"),
        ):
            network.fetch_public("https://maps.example")
        factory.assert_called_once()
        connection.close.assert_called_once()

    def test_bounded_retries_and_redirects_always_close_connections(self):
        for status, message in [(503, "busy"), (307, "redirects")]:
            connections = self.connections(
                [
                    self.response(status, headers={"Location": "/again"})
                    for _ in range(5)
                ]
            )
            with (
                self.subTest(status=status),
                patch.object(network, "PinnedHTTPS", side_effect=connections),
                patch.object(network, "public_addresses", return_value=["8.8.8.8"]),
                patch.object(network.time, "sleep") as sleep,
                self.assertRaisesRegex(ValueError, message),
            ):
                network.fetch_public("https://maps.example")
            self.assertEqual(sleep.call_count, 4 if status == 503 else 0)
            for connection in connections:
                connection.close.assert_called_once()

    def test_status_and_both_download_size_bounds_fail_closed(self):
        for response, message in [
            (self.response(403), "403"),
            (self.response(headers={"Content-Length": "5"}), "limit"),
            (self.response(data=b"12345"), "limit"),
        ]:
            connection = self.connections([response])[0]
            with (
                self.subTest(message=message),
                patch.object(network, "PinnedHTTPS", return_value=connection),
                patch.object(network, "public_addresses", return_value=["8.8.8.8"]),
                self.assertRaisesRegex(ValueError, message),
            ):
                network.fetch_public("https://maps.example", limit=4)
            connection.close.assert_called_once()

    def test_cache_hit_expiry_and_smaller_caller_limit(self):
        with tempfile.TemporaryDirectory() as folder:
            connection = self.connections([self.response(data=b"first")])[0]
            with (
                patch.object(
                    network, "PinnedHTTPS", return_value=connection
                ) as factory,
                patch.object(network, "public_addresses", return_value=["8.8.8.8"]),
            ):
                self.assertEqual(
                    network.fetch_public("https://maps.example", cache=folder), b"first"
                )
                self.assertEqual(
                    network.fetch_public("https://maps.example", cache=folder), b"first"
                )
                self.assertEqual(factory.call_count, 1)
                with self.assertRaisesRegex(ValueError, "limit"):
                    network.fetch_public("https://maps.example", cache=folder, limit=2)
                for file in Path(folder).iterdir():
                    os.utime(file, (1, 1))
                connection.getresponse.return_value = self.response(data=b"new")
                self.assertEqual(
                    network.fetch_public("https://maps.example", cache=folder), b"new"
                )
                self.assertEqual(factory.call_count, 2)

    def test_source_json_preserves_results_and_reports_provider_errors(self):
        for value in [{"features": []}, [1, 2]]:
            with patch.object(
                network, "fetch_public", return_value=json.dumps(value).encode()
            ):
                self.assertEqual(network.public_json("https://maps.example"), value)
        with (
            patch.object(
                network, "fetch_public", return_value=b'{"error":{"message":"denied"}}'
            ),
            self.assertRaisesRegex(ValueError, "denied"),
        ):
            network.public_json("https://maps.example")


if __name__ == "__main__":
    unittest.main()
