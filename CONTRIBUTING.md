# Contributing to SHDT

Working norms for the SHDT codebase. Lightweight where it can be,
explicit where it has to be.

## Branch strategy

Trunk-based development with short-lived feature branches:

```
main          ←  always deployable; protected; merges via PR
└─ feat/...   ←  one branch per change; deleted after merge
   fix/...
   chore/...
   docs/...
```

**Don't:**
- Long-running branches (more than ~3 days). Rebase or merge `main`
  daily.
- Direct pushes to `main`. CI / branch protection blocks this.
- Feature branches from feature branches. Branch from `main`.

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

`<type>` is one of:

| Type | When to use |
|---|---|
| `feat` | A new user-visible feature |
| `fix` | A bug fix |
| `chore` | Tooling, deps, refactor with no behaviour change |
| `docs` | Docs only |
| `test` | Adding / fixing tests only |
| `perf` | Perf improvement |
| `refactor` | Code change that neither adds a feature nor fixes a bug |
| `build` | CI / Docker / Bicep / build pipeline |
| `revert` | Reverts a previous commit |

`<scope>` is the area touched: `backend`, `frontend`, `infra`, `enrich`,
`docs`, `ci`, etc.

Examples:

```
feat(insights): add damp-and-mould risk model
fix(backend): handle null ward_name in flood_risk insight
chore(deps): bump httpx 0.27.2 → 0.28.0
infra(bicep): switch postgres SKU to GeneralPurpose
docs(deployment): add troubleshooting for OIDC mismatch
```

The body is optional but encouraged for non-trivial changes — explain
*why*, not *what* (the diff already shows what).

The footer can include `BREAKING CHANGE:` if applicable, or
`Refs:` / `Closes:` issue references.

## Pull requests

- Open a PR as soon as work is committable. Mark `Draft` if not ready.
- Keep PRs small. <400 lines of changed code is the sweet spot. If a PR
  is big, split it: scaffolding first, behaviour change second.
- Title uses the same Conventional Commits format as the lead commit.
- Link the related Build Order item or issue in the description.

PR checklist (in the PR description):

- [ ] Tests added or existing tests cover the change
- [ ] Lint / typecheck pass locally
- [ ] If the change adds an env var, `.env.example` and
      `AZURE_DEPLOYMENT.md` are updated
- [ ] If the change touches Bicep, `ARCHITECTURE.md` is updated
- [ ] Manual verification steps documented in the PR description

## Code review

Required for `main`. One approval is enough at current team size; raise
to two when the team grows.

Review style:
- Suggest, don't dictate.
- Distinguish *blocking* feedback ("this leaks a connection") from
  *nice-to-have* ("rename this var").
- Prefer asking questions over making assertions.
- Approve with comments rather than blocking when the comments are
  cleanup-able post-merge.

## Local development workflow

```bash
# First-time setup
cp server/.env.example server/.env
cp .env.production.example .env
# Edit DB_PASSWORD, SECRET_KEY in both

# Backend
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# Frontend
cd ../client
npm install

# Run everything
./start.sh

# Run tests
cd server && pytest
cd client && npm test
```

## Pre-commit hooks (recommended, not required)

Install [pre-commit](https://pre-commit.com/) and let it catch
formatting / lint issues before they hit CI:

```bash
pip install pre-commit
pre-commit install
```

Hooks configured in `.pre-commit-config.yaml`:
- `ruff` (Python lint + format)
- `eslint` (TypeScript / React)
- `prettier` (TypeScript / Markdown / YAML)
- `bicep build` (Bicep validation)
- Trailing whitespace, EOL fixer, large-file blocker

## When to update which doc

| Change | Update |
|---|---|
| New API endpoint | `server/main.py` route inclusion. Backend OpenAPI updates automatically. |
| New env var | `server/.env.example` + `AZURE_DEPLOYMENT.md` env table |
| New Azure resource | `infra/bicep/`, `ARCHITECTURE.md`, `AZURE_DEPLOYMENT.md` |
| New build phase | `SHDT_Build_Order.docx` (or its source) |
| New decision affecting future work | `ARCHITECTURE.md` decision log |

## Releasing

For now: every push to `main` deploys to prod via the CD workflow. Until
SHDT has external users, this is fine.

When external users land:

1. Create a tag: `git tag v0.2.0 && git push --tags`.
2. Workflow promotes the tagged image from staging to prod.
3. Release notes auto-generated from Conventional Commit messages.

## Code ownership

`CODEOWNERS` will be added once the team grows beyond a single
maintainer. Until then, every PR routes to the project lead.

## Security disclosure

Don't open public issues for security findings. Email the lead directly
(`skoconnor90@gmail.com`) — patches will land before disclosure.
