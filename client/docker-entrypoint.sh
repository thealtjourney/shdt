#!/bin/sh
# Inject runtime config into env-config.js so the same image can target
# different backends without a rebuild.
#
# Reads from these env vars:
#   API_BASE_URL    — base URL for backend API calls (e.g. https://api.shdt.example.com)
#   APP_VERSION     — surfaced for ops / debug
#   APP_ENV         — 'staging' / 'prod' / etc.
set -eu

CONFIG_PATH="/usr/share/nginx/html/env-config.js"

API_BASE_URL="${API_BASE_URL:-/api}"
APP_VERSION="${APP_VERSION:-0.1.0}"
APP_ENV="${APP_ENV:-prod}"

cat > "${CONFIG_PATH}" <<EOF
// Generated at container start — do not edit by hand.
window.__SHDT_CONFIG__ = {
  apiBaseUrl: "${API_BASE_URL}",
  appVersion: "${APP_VERSION}",
  appEnv: "${APP_ENV}"
};
EOF

echo "Wrote runtime config: ${CONFIG_PATH}"
echo "  API_BASE_URL=${API_BASE_URL}"
echo "  APP_VERSION=${APP_VERSION}"
echo "  APP_ENV=${APP_ENV}"

exec "$@"
