# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────
# SHDT backend — production container
#
# Multi-stage build:
#   Stage 1 (builder): install Python deps into a virtualenv
#   Stage 2 (runtime): copy the venv + source into a slim image
#
# Design notes:
#  * Uses Python 3.11-slim — Linux uses OpenSSL (not LibreSSL), so the
#    macOS subprocess+curl workaround disappears. http_client.py auto-
#    detects this and uses httpx natively in this image.
#  * Logs to stdout/stderr only (no /app/logs files). Application Insights
#    in Azure Container Apps picks them up automatically.
#  * Runs as a non-root user (UID 10001) — required by Container Apps
#    security baselines.
#  * /healthz and /readyz are wired in at the app level
#    (server/observability/health.py).
#  * Build-time args APP_VERSION and GIT_COMMIT surface in /version for ops
#    dashboards and incident triage.
# ─────────────────────────────────────────────────────────────────

# ─── Stage 1: builder ───────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Tools needed to compile psycopg2 etc.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build a self-contained venv to copy into the runtime stage
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY requirements.txt .
RUN pip install --upgrade pip wheel \
 && pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir gunicorn 'uvicorn[standard]'

# ─── Stage 2: runtime ───────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Build-time metadata surfaced via /version
ARG APP_VERSION=0.1.0
ARG GIT_COMMIT=unknown

ENV APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT} \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    DEPLOY_ENV=prod \
    LOG_LEVEL=INFO \
    SECRETS_BACKEND=env \
    STORAGE_BACKEND=local \
    HTTP_BACKEND=httpx

# Runtime libs only (no compilers); curl kept for fallback HTTP path
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ca-certificates \
        tini \
 && rm -rf /var/lib/apt/lists/* \
 && update-ca-certificates

# Non-root user (UID 10001)
RUN groupadd --system --gid 10001 shdt \
 && useradd  --system --uid 10001 --gid shdt --create-home --shell /usr/sbin/nologin shdt

WORKDIR /app

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application source
COPY --chown=shdt:shdt . /app

USER shdt

EXPOSE 8000

# tini handles SIGTERM cleanly so Container Apps can drain connections
ENTRYPOINT ["/usr/bin/tini", "--"]

# Container Apps will hit this for liveness; /readyz is the readiness target
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --silent --fail http://localhost:8000/healthz || exit 1

# Multi-worker uvicorn via gunicorn. Workers are deliberately conservative
# for Container Apps consumption tier (vCPU=0.5 / mem=1GB by default);
# bump --workers to 4 when running on a heavier SKU.
CMD ["gunicorn", \
     "main:app", \
     "--bind", "0.0.0.0:8000", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
