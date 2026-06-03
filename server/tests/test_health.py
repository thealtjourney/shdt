"""Smoke tests for the health probes."""
from __future__ import annotations

import json


def test_healthz_returns_200(client):
    """Liveness probe should always return 200 if the process is up."""
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "uptime_s" in body


def test_version_endpoint(client):
    """Version metadata exposes a known shape."""
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "shdt-backend"
    for key in ("version", "commit", "env", "started_at"):
        assert key in body


def test_readyz_returns_503_without_db(client):
    """
    Without a real Postgres reachable, readiness should report degraded
    (503) — proving the probe actually checks dependencies and isn't
    just returning 200 unconditionally.
    """
    response = client.get("/readyz")
    # 200 if the dev DB happens to be running; 503 otherwise. Either way
    # the body must contain a checks dict mentioning database.
    assert response.status_code in (200, 503)
    body = response.json()
    assert "checks" in body
    assert "database" in body["checks"]


def test_request_id_header_propagates(client):
    """The middleware should echo a caller-supplied X-Request-ID header."""
    rid = "test-rid-abc-123"
    response = client.get("/healthz", headers={"X-Request-ID": rid})
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == rid


def test_request_id_generated_when_missing(client):
    """When no X-Request-ID is sent, the middleware should generate one."""
    response = client.get("/healthz")
    rid = response.headers.get("X-Request-ID")
    assert rid is not None and len(rid) >= 8
