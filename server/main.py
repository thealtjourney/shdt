"""
SHDT Backend — FastAPI application entry point.

Wires up:
  - Structured JSON logging (observability.configure_logging)
  - Request-ID + access-log middleware
  - Health probes (/healthz, /readyz, /version)
  - CORS (origins env-driven for prod)
  - All API routers under /api

Run with:
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Bootstrap observability before anything else imports a logger ──
from observability import (
    configure_logging,
    get_logger,
    RequestIdMiddleware,
    AccessLogMiddleware,
    health_router,
)

configure_logging()
log = get_logger(__name__)

# ── Routers ────────────────────────────────────────────────────────
from routers import (
    properties,
    layers,
    analytics,
    exports,
    search,
    datahub,
    scenarios,
)
# Phase 3 — domain credibility
from routers import (
    compliance,
    tsm,
    awaab,
    damp_mould,
)
# Phase 4 — scheduled enrichment audit trail
from routers import enrichment_runs as enrichment_runs_router


# ── CORS origins ───────────────────────────────────────────────────
# Comma-separated env var for prod; falls back to localhost:5173 for dev.
_cors_raw = os.environ.get(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,https://localhost:5173",
)
ALLOWED_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]


# ── App ────────────────────────────────────────────────────────────
app = FastAPI(
    title="SHDT Backend",
    description="Social Housing Digital Twin Backend API",
    version=os.environ.get("APP_VERSION", "0.1.0"),
)

# Order matters: add request-ID first so subsequent middleware/handlers see it.
app.add_middleware(RequestIdMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health and version probes (no /api prefix so probes don't collide with API).
app.include_router(health_router)

# Application API
app.include_router(properties.router, prefix="/api")
app.include_router(layers.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(datahub.router, prefix="/api")
app.include_router(scenarios.router, prefix="/api")

# Phase 3 — domain credibility
app.include_router(compliance.router, prefix="/api")
app.include_router(tsm.router, prefix="/api")
app.include_router(awaab.router, prefix="/api")
app.include_router(damp_mould.router, prefix="/api")
app.include_router(enrichment_runs_router.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "SHDT Backend API", "version": app.version}


# Backward-compat: keep /health (now identical to /healthz) so existing
# probes do not break during the transition.
@app.get("/health")
async def health_legacy():
    return {"status": "healthy"}


log.info(
    "shdt.startup",
    extra={
        "version": app.version,
        "cors_origins": ALLOWED_ORIGINS,
        "secrets_backend": os.environ.get("SECRETS_BACKEND", "dotenv"),
        "storage_backend": os.environ.get("STORAGE_BACKEND", "local"),
    },
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
