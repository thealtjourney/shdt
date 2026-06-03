#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SHDT — one-time Azure subscription bootstrap.
#
# What this does:
#   1. Registers the Azure resource providers SHDT needs.
#   2. Creates an App Registration + Service Principal for GitHub Actions OIDC
#      (so the CD workflow can deploy without long-lived secrets).
#   3. Federates GitHub → Azure AD so workflow_run / push events on this repo
#      can mint short-lived tokens.
#   4. Grants the SP the minimum roles needed (Contributor on the future RG,
#      User Access Administrator on the subscription so it can grant other roles
#      via Bicep).
#   5. Prints out the values to set as GitHub Action secrets.
#
# Run this ONCE per Azure subscription. It is idempotent.
#
# Prerequisites:
#   * Azure CLI logged in: `az login`
#   * You're an Owner of the target subscription (needed for role assignments)
#   * GitHub repo URL (e.g. github.com/seanoconnor/shdt)
#
# Usage:
#   ./infra/scripts/bootstrap.sh \
#       --github-repo seanoconnor/shdt \
#       --subscription <subscription-id-or-name>
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────
APP_NAME=shdt
ENVIRONMENT=prod
LOCATION=uksouth
GITHUB_REPO=""
SUBSCRIPTION=""
SP_NAME=""

# ── Args ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    --subscription) SUBSCRIPTION="$2"; shift 2 ;;
    --app-name) APP_NAME="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

[[ -z "$GITHUB_REPO" ]] && { echo "ERROR: --github-repo is required (e.g. user/repo)"; exit 1; }
SP_NAME="${APP_NAME}-${ENVIRONMENT}-github-deployer"
RG_NAME="rg-${APP_NAME}-${ENVIRONMENT}-uks"

# ── Resolve subscription ──────────────────────────────────────
if [[ -n "$SUBSCRIPTION" ]]; then
  az account set --subscription "$SUBSCRIPTION"
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "──────────────────────────────────────────────"
echo "Subscription : $SUBSCRIPTION_ID"
echo "Tenant       : $TENANT_ID"
echo "App / env    : $APP_NAME / $ENVIRONMENT"
echo "Location     : $LOCATION"
echo "GitHub repo  : $GITHUB_REPO"
echo "──────────────────────────────────────────────"

# ── 1. Register resource providers ────────────────────────────
echo ""
echo "[1/5] Registering required resource providers…"
PROVIDERS=(
  Microsoft.Resources
  Microsoft.ManagedIdentity
  Microsoft.KeyVault
  Microsoft.Storage
  Microsoft.ContainerRegistry
  Microsoft.DBforPostgreSQL
  Microsoft.OperationalInsights
  Microsoft.Insights
  Microsoft.App
  Microsoft.Web
)
for p in "${PROVIDERS[@]}"; do
  state=$(az provider show -n "$p" --query 'registrationState' -o tsv 2>/dev/null || echo "NotRegistered")
  if [[ "$state" != "Registered" ]]; then
    echo "  registering $p…"
    az provider register -n "$p" --wait >/dev/null
  else
    echo "  ✓ $p already registered"
  fi
done

# ── 2. Create the App Registration / SP ───────────────────────
echo ""
echo "[2/5] Creating Service Principal '$SP_NAME'…"
APP_ID=$(az ad app list --display-name "$SP_NAME" --query '[0].appId' -o tsv 2>/dev/null || echo "")
if [[ -z "$APP_ID" ]]; then
  APP_ID=$(az ad app create --display-name "$SP_NAME" --query appId -o tsv)
  echo "  Created application appId=$APP_ID"
else
  echo "  ✓ Application already exists: appId=$APP_ID"
fi

SP_OBJECT_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv 2>/dev/null || echo "")
if [[ -z "$SP_OBJECT_ID" ]]; then
  SP_OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
  echo "  Created service principal object_id=$SP_OBJECT_ID"
else
  echo "  ✓ Service Principal already exists: $SP_OBJECT_ID"
fi

# ── 3. Federate GitHub → Azure AD (OIDC) ──────────────────────
echo ""
echo "[3/5] Configuring federated credentials for GitHub Actions…"
for SUBJECT in \
  "repo:${GITHUB_REPO}:ref:refs/heads/main" \
  "repo:${GITHUB_REPO}:environment:prod" \
  "repo:${GITHUB_REPO}:pull_request"
do
  CRED_NAME="${GITHUB_REPO//\//-}-$(echo "$SUBJECT" | sha256sum | cut -c1-8)"
  EXISTS=$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='$CRED_NAME'] | length(@)" -o tsv)
  if [[ "$EXISTS" == "0" ]]; then
    az ad app federated-credential create \
      --id "$APP_ID" \
      --parameters "$(cat <<EOF
{
  "name": "$CRED_NAME",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$SUBJECT",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
)" >/dev/null
    echo "  ✓ Federated credential added: $SUBJECT"
  else
    echo "  ✓ Federated credential already exists: $SUBJECT"
  fi
done

# ── 4. Role assignments ───────────────────────────────────────
echo ""
echo "[4/5] Granting role assignments…"
SUBSCRIPTION_SCOPE="/subscriptions/${SUBSCRIPTION_ID}"

# Contributor — needed to manage all resources in the RG (created later by Bicep)
echo "  → Contributor on subscription"
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$SUBSCRIPTION_SCOPE" >/dev/null 2>&1 || echo "    (already assigned)"

# User Access Administrator — needed because main.bicep grants RBAC roles
echo "  → User Access Administrator on subscription"
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "User Access Administrator" \
  --scope "$SUBSCRIPTION_SCOPE" >/dev/null 2>&1 || echo "    (already assigned)"

# ── 5. Print GitHub secrets ────────────────────────────────────
echo ""
echo "[5/5] Set the following secrets in your GitHub repo:"
echo "──────────────────────────────────────────────"
echo "    AZURE_CLIENT_ID       = $APP_ID"
echo "    AZURE_TENANT_ID       = $TENANT_ID"
echo "    AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
echo "    ADMIN_PRINCIPAL_ID    = $(az ad signed-in-user show --query id -o tsv)"
echo "    POSTGRES_ADMIN_PASSWORD = (generate one: openssl rand -base64 32)"
echo "──────────────────────────────────────────────"
echo ""
echo "Next steps:"
echo "  1. Add the secrets above to GitHub: Repo → Settings → Secrets → Actions"
echo "  2. Generate a Postgres password and add it as POSTGRES_ADMIN_PASSWORD"
echo "  3. From GitHub Actions, run the 'CD — Production' workflow with"
echo "     deploy_infra=true to create the Azure resources for the first time."
echo ""
echo "Bootstrap complete."
