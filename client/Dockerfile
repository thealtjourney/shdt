# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────
# SHDT frontend — production container
#
# Two stages:
#   Stage 1 (build):   npm ci && vite build → /app/dist
#   Stage 2 (runtime): nginx serves the build output
#
# Design notes:
#  * Vite builds to dist/, not build/.
#  * Runtime config is injected at container start via env-config.js so the
#    same image works against staging and prod backends without rebuilding.
#  * nginx serves on 8080 (non-privileged) so the image runs as non-root.
#  * SPA routing handled by `try_files $uri /index.html`.
#
# When deploying to Azure Static Web Apps the build is uploaded directly
# (no nginx container) — this Dockerfile is for docker-compose.prod and
# any container-based hosting (Container Apps, App Service, AKS).
# ─────────────────────────────────────────────────────────────────

# ─── Stage 1: build ─────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install deps with a clean cache
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .

# Build-time arg for the API base URL baked into the bundle.
# Override at build time with: docker build --build-arg VITE_API_BASE_URL=https://...
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build && ls -la dist/

# ─── Stage 2: runtime ───────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

ARG APP_VERSION=0.1.0
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.version=${APP_VERSION}
LABEL org.opencontainers.image.revision=${GIT_COMMIT}

# nginx config
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Build artefacts
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Runtime config injection — env vars are written into env-config.js at
# container start so the same image works in any environment.
USER root
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
