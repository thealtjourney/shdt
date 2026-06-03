# SHDT — Azure deployment guide

End-to-end walkthrough for deploying SHDT to Azure UK South. Targets a
single production environment — staging can be added later by copying
`infra/bicep/parameters/prod.bicepparam` to `staging.bicepparam` and
duplicating the workflow.

## Target architecture

See `ARCHITECTURE.md` for the full diagram. In short:

| Component | Azure service | Why |
|---|---|---|
| Backend | Azure Container Apps (consumption) | Auto-scale, scale-to-zero, ~free at low load |
| Frontend | Azure Static Web Apps (Standard) | Built-in CDN, custom domain, free TLS |
| Database | Azure Database for PostgreSQL Flexible Server (Burstable B2s) | PostGIS supported, ~£40/mo |
| Secrets | Azure Key Vault (RBAC mode) | No long-lived secrets in code or env |
| File storage | Azure Storage Account + Blob | Excel uploads, OS UPRN cache, IoD downloads |
| Observability | Application Insights + Log Analytics | App traces + container logs in one place |
| Image registry | Azure Container Registry (Basic) | Pull via Managed Identity, no creds |
| Identity | User-Assigned Managed Identity | Single identity for KV / Blob / ACR |
| CDN / WAF | (Optional, Phase 2.1) Azure Front Door | Add when scaling beyond MVP |

## One-time prerequisites

You need:

- An Azure subscription (Free tier is fine to start; Contributor or Owner role on it).
- The Azure CLI ≥ 2.60 installed locally (`az version`).
- A GitHub repository for the SHDT code (does not need to be public).
- The `gh` CLI logged in if you want to use it to push (optional).

```bash
az login
az account set --subscription "<subscription-id-or-name>"
az account show     # confirm you're on the right subscription
```

## Step 1 — Bootstrap the subscription

The bootstrap script registers required resource providers, creates the
GitHub Actions service principal, and federates the OIDC trust so that
GitHub Actions can deploy without storing long-lived secrets.

```bash
./infra/scripts/bootstrap.sh \
    --github-repo <your-github-username>/shdt \
    --subscription <subscription-id>
```

It will print the GitHub secrets you need to set. Open
`https://github.com/<your-username>/shdt/settings/secrets/actions` and add:

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | App registration appId from script output |
| `AZURE_TENANT_ID` | Tenant ID from script output |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID from script output |
| `ADMIN_PRINCIPAL_ID` | Your user's object ID |
| `POSTGRES_ADMIN_PASSWORD` | Generate with `openssl rand -base64 32` |

## Step 2 — First deploy (infrastructure)

From the **Actions** tab in GitHub, run **CD — Production** with these inputs:

- `deploy_infra` = `true`
- `deploy_backend` = `true`
- `deploy_frontend` = `true`

The first run takes ~10 minutes. Watch the `infra` job — it creates the
resource group, Postgres, ACR, Key Vault, Container Apps environment, etc.

If you'd rather deploy from your laptop the first time:

```bash
export POSTGRES_ADMIN_PASSWORD="$(openssl rand -base64 32)"
./infra/scripts/deploy-local.sh
```

…then add `POSTGRES_ADMIN_PASSWORD` to GitHub secrets so future deploys
can read it.

## Step 3 — Apply the database schema

Container Apps starts the backend automatically, but the schema needs to
be applied once. Two paths:

**Option A — manual (safest first time):**

```bash
# Get the Postgres FQDN
PSQL_HOST=$(az postgres flexible-server list \
  -g rg-shdt-prod-uks --query '[0].fullyQualifiedDomainName' -o tsv)

# Get admin password from Key Vault
KV_NAME=$(az keyvault list -g rg-shdt-prod-uks --query '[0].name' -o tsv)
PG_PWD=$(az keyvault secret show \
  --vault-name "$KV_NAME" \
  --name postgres-admin-password \
  --query value -o tsv)

# Apply the schema
PGPASSWORD="$PG_PWD" psql \
  -h "$PSQL_HOST" -U shdt_admin -d shdt \
  -f database/init.sql

# Apply migrations in order
for f in database/migrations/*.sql; do
  echo "Applying $f"
  PGPASSWORD="$PG_PWD" psql -h "$PSQL_HOST" -U shdt_admin -d shdt -f "$f"
done

# Stamp Alembic at the current head so future migrations work
cd server
alembic stamp head
```

**Option B — Alembic only (after migrating all SQL files into Alembic revisions):**

```bash
cd server
DATABASE_URL="postgresql://shdt_admin:$PG_PWD@$PSQL_HOST/shdt?sslmode=require" \
  alembic upgrade head
```

## Step 4 — Confirm everything works

```bash
# Backend health
BACKEND_FQDN=$(az containerapp show \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks \
  --query 'properties.configuration.ingress.fqdn' -o tsv)

curl -s "https://$BACKEND_FQDN/healthz" | jq .
curl -s "https://$BACKEND_FQDN/readyz"  | jq .
curl -s "https://$BACKEND_FQDN/version" | jq .

# Frontend
SWA_HOST=$(az staticwebapp show \
  -n swa-shdt-prod-uks -g rg-shdt-prod-uks \
  --query 'defaultHostname' -o tsv)

echo "Open in browser: https://$SWA_HOST"
```

## Step 5 — Wire CORS to the deployed frontend

The Bicep deploy sets `CORS_ALLOW_ORIGINS=https://*.azurestaticapps.net`
which is permissive enough to work out of the box. Once you have a
custom domain, tighten it:

```bash
az containerapp update \
  --name ca-shdt-prod-uks-api \
  --resource-group rg-shdt-prod-uks \
  --set-env-vars CORS_ALLOW_ORIGINS="https://shdt.example.com"
```

## Operational basics

### Logs

```bash
# Tail Container App logs
az containerapp logs show \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks --follow

# Query App Insights
az monitor app-insights query \
  --app appi-shdt-prod-uks -g rg-shdt-prod-uks \
  --analytics-query "traces | where timestamp > ago(15m) | project timestamp, message"
```

### Rolling back

Container Apps keeps every revision. To roll back:

```bash
az containerapp revision list \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks \
  --query '[].{name:name, created:properties.createdTime, active:properties.active}' \
  -o table

az containerapp revision activate \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks \
  --revision <previous-revision-name>
```

### Rotating the Postgres admin password

```bash
NEW_PWD=$(openssl rand -base64 32)
az postgres flexible-server update \
  -n psql-shdt-prod-uks-<token> -g rg-shdt-prod-uks \
  --admin-password "$NEW_PWD"
az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name postgres-admin-password \
  --value "$NEW_PWD"
# Restart the Container App so it picks up the new secret
az containerapp revision restart -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks
```

### Adding a new application secret (e.g. EPC API key)

```bash
az keyvault secret set --vault-name "$KV_NAME" --name epc-api-key --value '...'
# Then add a Key Vault reference to the Container App
az containerapp secret set \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks \
  --secrets epc-api-key=keyvaultref:https://${KV_NAME}.vault.azure.net/secrets/epc-api-key,identityref:<MI_RESOURCE_ID>
az containerapp update \
  -n ca-shdt-prod-uks-api -g rg-shdt-prod-uks \
  --set-env-vars EPC_API_KEY=secretref:epc-api-key
```

## Cost monitoring

Set a budget alert on the resource group:

```bash
az consumption budget create \
  --budget-name shdt-prod-monthly \
  --amount 100 \
  --category Cost \
  --time-grain Monthly \
  --start-date "$(date -u +%Y-%m-01)" \
  --end-date "$(date -u +%Y-12-01)" \
  --resource-group-filter rg-shdt-prod-uks \
  --notifications threshold=80,enabled=true,operator=GreaterThan,contactEmails=skoconnor90@gmail.com,notificationLanguage=en-us
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `bootstrap.sh` fails with "InsufficientPrivileges" | You need Owner on the subscription, not just Contributor |
| Bicep deploy fails registering PostGIS | Re-run; sometimes the extension allow-list propagates slower than the server creation |
| Container App stuck in "Failed" | Check `az containerapp logs show`; usually env var or Key Vault permission |
| Backend `/readyz` returns 503 | Postgres firewall rule or migration not applied — run Step 3 |
| Frontend 404 on routes | SPA fallback missing — check `client/staticwebapp.config.json` (or nginx.conf for container path) |
| `azure/login` fails in GitHub Actions | OIDC subject mismatch — re-run `bootstrap.sh` to re-federate |

## What's NOT in this deployment (yet)

These belong in a Phase 2.1 hardening pass:

- VNet integration / private endpoints for Postgres and Storage
- Azure Front Door + WAF in front of the SWA + Container App
- Custom domain (configure on SWA + Container App once you have one)
- Cross-region disaster recovery
- Private DNS for the Container Apps environment
