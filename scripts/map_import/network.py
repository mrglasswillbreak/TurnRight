"""Public-only HTTPS with DNS pinning and bounded redirects/downloads."""
import hashlib
import http.client
import ipaddress
import json
import socket
import ssl
import time
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit

MAX_BYTES = 50 * 1024 * 1024


def public_addresses(host):
    addresses = sorted({r[4][0] for r in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise ValueError('Source must resolve exclusively to public internet addresses.')
    return addresses


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=90, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def fetch_public(url, *, form=None, limit=MAX_BYTES, cache=None):
    key = hashlib.sha256((url + json.dumps(form, sort_keys=True)).encode()).hexdigest()
    cached = Path(cache) / key if cache else None
    if cached and cached.exists() and time.time() - cached.stat().st_mtime < 3600:
        return cached.read_bytes()
    for redirect in range(5):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError('Use a public HTTPS source without credentials.')
        connection = PinnedHTTPS(parsed.hostname, public_addresses(parsed.hostname)[0])
        path = parsed.path or '/'
        if parsed.query:
            path += '?' + parsed.query
        body = urlencode(form).encode() if form is not None else None
        headers = {'User-Agent': 'TurnRight-CampusImport/1.0', 'Accept-Encoding': 'identity'}
        if body is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        try:
            connection.request('POST' if body is not None else 'GET', path, body, headers)
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader('Location', ''))
                if response.status == 303:
                    form = None
                continue
            if response.status in (429, 502, 503, 504):
                if redirect == 4:
                    raise ValueError('Source is busy. Retry this import later; existing data is unchanged.')
                time.sleep(min(15, 2 ** redirect))
                continue
            if response.status != 200:
                raise ValueError(f'Source request failed ({response.status}). No changes were applied.')
            if int(response.getheader('Content-Length', '0')) > limit:
                raise ValueError('Source download exceeds the import limit. Select a smaller area.')
            data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError('Source download exceeds the import limit.')
            if cached:
                cached.parent.mkdir(parents=True, exist_ok=True)
                cached.write_bytes(data)
            return data
        finally:
            connection.close()
    raise ValueError('Too many source redirects.')


def public_json(url, form=None, cache=None):
    value = json.loads(fetch_public(url, form=form, cache=cache))
    if isinstance(value, dict) and value.get('error'):
        raise ValueError('The source rejected this request: ' + str(value['error'].get('message', value['error'])))
    return value
