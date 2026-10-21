"""Best-effort private error tracking for host workers, never conversion containers."""

import json
import os
import re
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def capture_worker_failure(event, environment=None):
    environment = os.environ if environment is None else environment
    if (
        event.get("event") != "worker-failed"
        or environment.get("ERROR_MONITORING_ENABLED") == "false"
    ):
        return
    origin = environment.get("SUPABASE_URL", "")
    key = environment.get("SUPABASE_SERVICE_ROLE_KEY")
    try:
        parsed = urlsplit(origin)
        if (
            not key
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
        ):
            return
        if parsed.scheme != "https" and not (
            parsed.scheme == "http"
            and parsed.hostname in ("localhost", "127.0.0.1", "::1")
        ):
            return
        revision = environment.get("GITHUB_SHA", "")
        envelope = {
            "event": "worker-failed",
            "component": "map-import",
            "dependency": "worker",
            "status": 500,
            "revision": revision
            if re.fullmatch(r"[a-f0-9]{40}", revision)
            else "unknown",
        }
        reference = event.get("jobId")
        if isinstance(reference, str) and re.fullmatch(
            r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}",
            reference,
        ):
            envelope["reference"] = reference
        request = urllib.request.Request(
            origin.rstrip("/") + "/rest/v1/rpc/record_operational_error",
            data=json.dumps({"p_event": envelope}).encode(),
            headers={
                "apikey": key,
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        # Only trusted server configuration selects this origin; redirects are refused,
        # HTTPS certificates are verified and the response body is never logged.
        # nosemgrep: local-runtime.semgrep-rules.python.lang.security.audit.dynamic-urllib-use-detected
        with urllib.request.build_opener(NoRedirect()).open(
            request, timeout=2
        ) as response:
            response.read(1024)
    except Exception:
        # Monitoring must never replace the original processing error or expose it.
        print('{"event":"monitoring-delivery-failed"}', flush=True)
