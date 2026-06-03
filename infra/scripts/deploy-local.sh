#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SHDT — local Bicep deploy convenience wrapper.
#
# For when you want to run a Bicep deployment from your laptop instead of
# via the GitHub Actions CD workflow (e.g. testing infra changes
# before opening a PR).
#
# Prerequisites:
#   * az login (as a user with Contributor + User Access Administrator on
#     the target subscription)
#   * Postgres password set in env: export POSTGRES_ADMIN_PASSWORD=...
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ -z "${POSTGRES_ADMIN_PASSWORD:-}" ]]; then
  echo "ERROR: POSTGRES_ADMIN_PASSWORD env var is not set."
  echo "Generate one with: export POSTGRES_ADMIN_PASSWORD=\"\$(openssl rand -base64 32)\""
  exit 1
fi

ADMIN_PRINCIPAL_ID=$(az ad signed-in-user show --query id -o tsv)
DEPLOYMENT_NAME="shdt-prod-$(date +%Y%m%d-%H%M%S)"

echo "Deployment    : $DEPLOYMENT_NAME"
echo "Admin OID     : $ADMIN_PRINCIPAL_ID"

az deployment sub create \
  --name "$DEPLOYMENT_NAME" \
  --location uksouth \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/prod.bicepparam \
  --parameters adminPrincipalId="$ADMIN_PRINCIPAL_ID" \
  --parameters postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
  --query 'properties.outputs' \
  -o json | jq .

echo ""
echo "Deployment complete. Outputs above."
