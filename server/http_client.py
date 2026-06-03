"""
HTTP client helper.

The codebase historically used subprocess+curl because macOS LibreSSL 2.8.3
breaks Python's `requests` SSL handshake against modern TLS endpoints. That
workaround does not generalise:

* It can't run requests in parallel without spinning up many subprocesses
* Each call has subprocess overhead (~30-50ms)
* Error handling is brittle (parse status from stdout)
* It blocks moving to async fetch patterns

The fix in production is simple: Linux containers (and modern macOS Python
builds) use OpenSSL, where httpx works fine. So we expose a single
`http_post_json` / `http_get_json` API backed by httpx in production and
falling back to subprocess+curl on macOS-LibreSSL-only systems.

Selection rule:
* `HTTP_BACKEND=httpx`  — force httpx (production / Linux)
* `HTTP_BACKEND=curl`   — force subprocess+curl (legacy macOS workaround)
* unset                 — auto-detect: try httpx; if SSL handshake fails on
                          first call, transparently fall back to curl

Usage:

    from http_client import http_post_json
    result = http_post_json("https://api.example.com/foo", {"key": "value"})
    if result["success"]:
        body = result["data"]
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from typing import Any

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 20

# Auto-detected at first call; do not consult before then.
_resolved_backend: str | None = None


def _select_backend() -> str:
    """Return 'httpx' or 'curl', honouring HTTP_BACKEND override."""
    global _resolved_backend
    if _resolved_backend is not None:
        return _resolved_backend

    forced = os.environ.get("HTTP_BACKEND", "").lower().strip()
    if forced in ("httpx", "curl"):
        _resolved_backend = forced
        return _resolved_backend

    # Default: try httpx first; we trust it's working unless an actual
    # request fails with SSLError, in which case we down-shift to curl.
    try:
        import httpx  # noqa: F401
        _resolved_backend = "httpx"
    except ImportError:
        _resolved_backend = "curl" if shutil.which("curl") else "httpx"
    return _resolved_backend


def _curl_post_json(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    """POST JSON via subprocess+curl. Legacy macOS-LibreSSL fallback."""
    if not shutil.which("curl"):
        return {"success": False, "data": None, "error": "curl not available", "status": None}
    try:
        result = subprocess.run(
            [
                "curl", "-s", "-w", "\n%{http_code}",
                "--max-time", str(timeout),
                "-X", "POST",
                "-H", "Content-Type: application/json",
                "-d", json.dumps(payload),
                url,
            ],
            capture_output=True,
            text=True,
            timeout=timeout + 5,
        )
        parts = result.stdout.rsplit("\n", 1)
        if len(parts) != 2:
            return {"success": False, "data": None, "error": f"Invalid curl response: {result.stdout[:200]}", "status": None}
        body, status_code = parts[0], parts[1].strip()
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            return {"success": False, "data": None, "error": f"Invalid JSON: {e}", "status": status_code}
        return {"success": status_code == "200", "data": data, "error": None if status_code == "200" else f"HTTP {status_code}", "status": status_code}
    except subprocess.TimeoutExpired:
        return {"success": False, "data": None, "error": f"curl timeout after {timeout}s", "status": None}
    except Exception as e:
        return {"success": False, "data": None, "error": f"curl error: {e}", "status": None}


def _curl_get_json(url: str, timeout: int) -> dict[str, Any]:
    """GET JSON via subprocess+curl."""
    if not shutil.which("curl"):
        return {"success": False, "data": None, "error": "curl not available", "status": None}
    try:
        result = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "--max-time", str(timeout), url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        parts = result.stdout.rsplit("\n", 1)
        if len(parts) != 2:
            return {"success": False, "data": None, "error": f"Invalid curl response: {result.stdout[:200]}", "status": None}
        body, status_code = parts[0], parts[1].strip()
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            return {"success": False, "data": None, "error": f"Invalid JSON: {e}", "status": status_code}
        return {"success": status_code == "200", "data": data, "error": None if status_code == "200" else f"HTTP {status_code}", "status": status_code}
    except subprocess.TimeoutExpired:
        return {"success": False, "data": None, "error": f"curl timeout after {timeout}s", "status": None}
    except Exception as e:
        return {"success": False, "data": None, "error": f"curl error: {e}", "status": None}


def http_post_json(url: str, payload: dict[str, Any], *, timeout: int = DEFAULT_TIMEOUT_S) -> dict[str, Any]:
    """
    POST a JSON body and return ``{"success": bool, "data": dict|None, "error": str|None, "status": str|None}``.

    Drop-in replacement for the ad-hoc subprocess+curl pattern in the
    enrichment scripts. Picks httpx by default, falling back to curl on
    SSL handshake failure (LibreSSL workaround).
    """
    backend = _select_backend()

    if backend == "httpx":
        try:
            import httpx
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, json=payload)
                try:
                    data = resp.json()
                except Exception as e:
                    return {"success": False, "data": None, "error": f"Invalid JSON: {e}", "status": str(resp.status_code)}
                return {
                    "success": resp.status_code == 200,
                    "data": data,
                    "error": None if resp.status_code == 200 else f"HTTP {resp.status_code}",
                    "status": str(resp.status_code),
                }
        except Exception as e:
            # Likely SSL handshake fail under LibreSSL — fall back once and remember
            log.warning("http_client.httpx_failed_falling_back_to_curl", extra={"url": url, "error": str(e)})
            global _resolved_backend
            _resolved_backend = "curl"
            return _curl_post_json(url, payload, timeout)

    return _curl_post_json(url, payload, timeout)


def http_get_json(url: str, *, timeout: int = DEFAULT_TIMEOUT_S) -> dict[str, Any]:
    """GET JSON and return ``{"success", "data", "error", "status"}``."""
    backend = _select_backend()

    if backend == "httpx":
        try:
            import httpx
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url)
                try:
                    data = resp.json()
                except Exception as e:
                    return {"success": False, "data": None, "error": f"Invalid JSON: {e}", "status": str(resp.status_code)}
                return {
                    "success": resp.status_code == 200,
                    "data": data,
                    "error": None if resp.status_code == 200 else f"HTTP {resp.status_code}",
                    "status": str(resp.status_code),
                }
        except Exception as e:
            log.warning("http_client.httpx_failed_falling_back_to_curl", extra={"url": url, "error": str(e)})
            global _resolved_backend
            _resolved_backend = "curl"
            return _curl_get_json(url, timeout)

    return _curl_get_json(url, timeout)
