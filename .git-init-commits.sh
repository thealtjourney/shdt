#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# One-time bootstrap script to create a clean git history for SHDT.
#
# Run this ONCE on your local machine to lay down 5 logical commits.
# After it runs, you can connect to a GitHub remote with:
#
#    gh repo create <user>/shdt --private --source=. --remote=origin
#    git push -u origin main
#
# Or manually:
#    git remote add origin git@github.com:<user>/shdt.git
#    git push -u origin main
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

# Refuse to run if there's already history (safety)
if [[ -n "$(git log --oneline 2>/dev/null)" ]]; then
  echo "ERROR: Repository already has commits. Refusing to overwrite history."
  echo "If you really want to start fresh, run: rm -rf .git && git init -b main"
  exit 1
fi

# Set author if missing
git config user.email "${GIT_USER_EMAIL:-skoconnor90@gmail.com}" >/dev/null
git config user.name  "${GIT_USER_NAME:-Sean O'Connor}" >/dev/null

# ── Commit 1: existing application baseline ─────────────────────
echo "→ Commit 1/5: baseline application"
git add \
  client/ server/ database/ data/ docs/ \
  docker-compose.yml start.sh Makefile \
  README*.md AUTH*.md AUTHENTICATION_SYSTEM_SUMMARY.md \
  EXAMPLES.md IMPLEMENTATION_GUIDE.md INTEGRATION_CHECKLIST.md \
  PROJECT_STATUS.md REQUIREMENTS_AUTH.txt nginx/ \
  .env.production.example 2>/dev/null

# Exclude foundations/Azure files from this first commit so the history
# tells the story in the right order. Use git restore --staged to peel them off.
git restore --staged \
  server/observability/ server/config/ server/storage/ server/http_client.py \
  server/HTTP_MIGRATION.md server/alembic/ server/alembic.ini \
  server/pytest.ini server/requirements-dev.txt server/tests/ \
  server/services/insights/ server/services/enrichment/DISABLED_README.md \
  server/services/enrichment/monitor.py.disabled \
  server/Dockerfile server/.dockerignore server/.env.example \
  client/vitest.config.ts client/src/test/ client/src/components/__tests__/ \
  client/src/pages/insights/ client/Dockerfile client/nginx.conf \
  client/docker-entrypoint.sh client/.dockerignore client/index.html \
  database/migrations/README.md database/migrations/_archived__004_enrichment_superseded.sql.bak \
  2>/dev/null || true

git commit -q -m "chore: initial import of existing SHDT codebase

The state of SHDT before the Phase 1 foundations refactor:
  - 16 frontend pages, 22+ React components, App.tsx ~4,100 lines
  - 17 routers, 16 services, analytics_service ~1,600 lines
  - 10 enrichment scripts (postcodes/IoD/Census/Ofcom/Crime/Flood/EPC/UPRN/Forecast/Master)
  - Postgres + PostGIS via docker-compose
  - Auth scaffolding, notifications, multi-tenancy data model
  - Documentation: PROJECT_STATUS, AUTH_*, EXAMPLES, INTEGRATION_CHECKLIST"

# ── Commit 2: project review documents ──────────────────────────
echo "→ Commit 2/5: review and roadmap documents"
git add SHDT_Project_Review.docx SHDT_Build_Order.docx
git commit -q -m "docs: independent project review and 14-week build order

  - SHDT_Project_Review.docx: third-party review identifying strengths, gaps,
    competitive positioning, and prioritised next builds
  - SHDT_Build_Order.docx: sequenced 14-week plan covering foundations,
    Azure deployment, domain credibility features, IoT scaffolding, and
    hero features"

# ── Commit 3: Phase 1 foundations ───────────────────────────────
echo "→ Commit 3/5: Phase 1 foundations"
git add \
  server/observability/ server/config/ server/storage/ \
  server/http_client.py server/HTTP_MIGRATION.md \
  server/alembic/ server/alembic.ini \
  server/pytest.ini server/requirements-dev.txt server/tests/ \
  server/services/insights/ server/services/enrichment/DISABLED_README.md \
  server/services/enrichment/monitor.py.disabled \
  server/.env.example server/database.py server/main.py \
  server/services/analytics_service.py \
  server/services/operational_analytics_service.py \
  server/enrich_postcodes.py server/routers/scenarios.py \
  client/vitest.config.ts client/src/test/ \
  client/src/components/__tests__/ \
  client/src/pages/insights/ \
  client/src/pages/ScenarioPlanner.tsx \
  client/package.json client/src/App.tsx \
  database/migrations/README.md \
  database/migrations/_archived__004_enrichment_superseded.sql.bak \
  FOUNDATIONS_SUMMARY.md

git commit -q -m "feat: Phase 1 foundations — observability, abstractions, tests, refactor

What changed:
  - JSON logging, request_id middleware, /healthz + /readyz + /version
  - SecretsProvider abstraction (Dotenv/Env/Key Vault) wired into database.py
  - Storage abstraction (Local FS / Azure Blob) wired into operational analytics
  - Alembic configured for future migrations
  - http_client.py wraps httpx + curl fallback; enrich_postcodes.py migrated
  - All 10 Strategic Insights extracted into individual files with shared
    InsightContext; analytics_service.py 1,603 → 1,122 lines
  - First Insights tab (GuideTab) extracted from App.tsx with snapshot tests
  - pytest scaffolding (32 tests), Vitest scaffolding
  - GitHub Actions CI workflow (Postgres + PostGIS service container)
  - Dead code archived (enrichment/monitor.py disabled, dup migration)
  - Scenarios marked deprecated pending decision

Behaviour unchanged. App.tsx 4,103 → 3,920 lines. 32 tests passing."

# ── Commit 4: Phase 2 Azure deployment artefacts ────────────────
echo "→ Commit 4/5: Phase 2 Azure deployment"
git add \
  infra/ \
  server/Dockerfile server/.dockerignore \
  client/Dockerfile client/nginx.conf client/docker-entrypoint.sh \
  client/.dockerignore client/index.html \
  docker-compose.prod.yml \
  AZURE_DEPLOYMENT.md ARCHITECTURE.md
git commit -q -m "feat(infra): Phase 2 — Azure deployment artefacts

What landed:
  - Multi-stage Dockerfiles (backend Python; frontend Vite + nginx)
  - docker-compose.prod.yml mirrors the Azure target architecture
  - Bicep IaC: main.bicep + 9 modules (RG, KV, ACR, Storage, Postgres,
    Container Apps Env+App, Static Web App, Identity, Observability)
  - GitHub Actions CD workflow (OIDC federated identity, no long-lived secrets)
  - bootstrap.sh for one-time subscription setup
  - deploy-local.sh for laptop-driven deploys
  - AZURE_DEPLOYMENT.md walkthrough
  - ARCHITECTURE.md with Mermaid diagram and decision log

Target: Azure UK South, single prod env, ~£45–£60/month at low usage."

# ── Commit 5: contributor experience and git hygiene ────────────
echo "→ Commit 5/5: contributing guidelines and git hygiene"
git add \
  .gitignore .gitattributes \
  .github/pull_request_template.md \
  .pre-commit-config.yaml .markdownlint.yaml \
  CONTRIBUTING.md README.md \
  .git-init-commits.sh
git commit -q -m "chore: contributor experience — gitignore, hooks, PR template, conventions

  - Comprehensive .gitignore (Python, Node, secrets, Azure, IDE)
  - .gitattributes for consistent line endings
  - Conventional Commits + branch strategy in CONTRIBUTING.md
  - PR template with checklist
  - pre-commit hooks: ruff, prettier, markdownlint, bicep build
  - Refreshed README.md with current repo layout"

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "Done. Five commits laid down:"
git log --oneline
echo ""
echo "Next steps:"
echo "  1. Create a GitHub repo (private):"
echo "       gh repo create <user>/shdt --private --source=. --remote=origin"
echo "     OR:"
echo "       git remote add origin git@github.com:<user>/shdt.git"
echo ""
echo "  2. Push:"
echo "       git push -u origin main"
echo ""
echo "  3. Add branch protection rules on GitHub:"
echo "       Settings → Branches → Add rule for main"
echo "         ✓ Require pull request before merging"
echo "         ✓ Require status checks to pass"
echo "         ✓ Include administrators"
echo "──────────────────────────────────────────────────────────────"
