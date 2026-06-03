"""
Health and readiness probes.

- /healthz : liveness — process is up. Cheap, no dependencies.
- /readyz  : readiness — DB ping + any other critical dependency.
- /version : commit SHA / version metadata for ops dashboards.

Designed to be wired into Kubernetes / Container Apps probes:
    livenessProbe:  GET /healthz   — restart on failure
    readinessProbe: GET /readyz    — remove from load balancer on failure
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Response, status
from sqlalchemy import text

log = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

# Track process boot time once at import to compute uptime cheaply.
_BOOTED_AT = time.time()


@router.get("/healthz", summary="Liveness probe")
def healthz() -> dict[str, Any]:
    """Cheap liveness — just confirms the process is responsive."""
    return {
        "status": "ok",
        "uptime_s": round(time.time() - _BOOTED_AT, 1),
    }


@router.get("/readyz", summary="Readiness probe")
def readyz(response: Response) -> dict[str, Any]:
    """
    Readiness — checks dependencies (currently: DB).

    Returns 503 if a dependency is unhealthy so load balancers stop routing
    traffic until the dependency recovers.
    """
    checks: dict[str, Any] = {}
    overall = True

    # --- Database ---
    try:
        # Lazy import: this module must be importable even if database is not
        # yet initialised (e.g. in some test contexts).
        from database import engine  # type: ignore

        t0 = time.perf_counter()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = {
            "ok": True,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
    except Exception as e:  # pragma: no cover - intentional broad catch
        log.warning("readyz: database check failed", exc_info=True)
        checks["database"] = {"ok": False, "error": str(e)[:200]}
        overall = False

    if not overall:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": "ok" if overall else "degraded", "checks": checks}


@router.get("/version", summary="Service version metadata")
def version() -> dict[str, Any]:
    """Small endpoint for ops dashboards / status checks."""
    return {
        "service": "shdt-backend",
        "version": os.getenv("APP_VERSION", "0.1.0"),
        "commit": os.getenv("GIT_COMMIT", "unknown"),
        "env": os.getenv("DEPLOY_ENV", "local"),
        "started_at": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(_BOOTED_AT)
        ),
    }
