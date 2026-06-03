#!/bin/bash
# ─────────────────────────────────────────────────────
# SHDT – Social Housing Digital Twins – Startup Script
# ─────────────────────────────────────────────────────
# Usage:  ./start.sh              (starts everything, no enrichment)
#         ./start.sh --stop       (stops everything)
#         ./start.sh --refresh    (start + refresh ALL live data: weather, crime, flood, census, broadband)
#         ./start.sh --setup      (first-time: dedup + full enrich + forecast + census + broadband)
#         ./start.sh --enrich     (start + run core enrichment: postcodes, crime, flood, IMD)
#         ./start.sh --forecast   (start + fetch weather forecasts for flood risk)
#         ./start.sh --census     (start + run Census 2021 enrichment)
#         ./start.sh --broadband  (start + run broadband & utilities enrichment)
#         ./start.sh --dedup      (start + remove duplicate properties)
#         ./start.sh --re-enrich-flood  (re-run flood enrichment with improved EA data)
#
# Combine flags as needed:  ./start.sh --forecast --census --broadband
# ─────────────────────────────────────────────────────

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colours for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   🏠  SHDT – Local Development Stack    ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

# ── Stop mode ───────────────────────────────────────
if [[ "$1" == "--stop" ]]; then
  banner
  echo -e "${YELLOW}Stopping all SHDT services...${NC}"

  # Kill background processes we started (by PID files)
  for pidfile in "$SCRIPT_DIR/.pid_backend" "$SCRIPT_DIR/.pid_frontend"; do
    if [[ -f "$pidfile" ]]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && echo -e "${GREEN}  ✓ Stopped process $pid${NC}"
      fi
      rm -f "$pidfile"
    fi
  done

  # Stop Docker containers
  echo -e "${YELLOW}  Stopping Docker containers...${NC}"
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" down 2>/dev/null || true
  echo -e "${GREEN}  ✓ Docker containers stopped${NC}"

  echo ""
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
fi

# ── Start mode ──────────────────────────────────────
banner

# 1) Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

command -v docker >/dev/null 2>&1 || { echo -e "${RED}  ✗ Docker not found. Please install Docker Desktop.${NC}"; exit 1; }
echo -e "${GREEN}  ✓ Docker${NC}"

command -v node >/dev/null 2>&1 || { echo -e "${RED}  ✗ Node.js not found. Please install Node.js 18+.${NC}"; exit 1; }
echo -e "${GREEN}  ✓ Node.js $(node --version)${NC}"

command -v python3 >/dev/null 2>&1 || { echo -e "${RED}  ✗ Python 3 not found. Please install Python 3.9+.${NC}"; exit 1; }
echo -e "${GREEN}  ✓ Python $(python3 --version 2>&1 | awk '{print $2}')${NC}"

echo ""

# 2) Start PostgreSQL / PostGIS via Docker
echo -e "${YELLOW}Starting PostgreSQL database...${NC}"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d postgres 2>&1 | grep -v "^$"
echo -e "${GREEN}  ✓ PostgreSQL container starting${NC}"

# Wait for database to be ready
echo -e "${YELLOW}  Waiting for database to accept connections...${NC}"
for i in $(seq 1 30); do
  if docker exec shdt-postgres pg_isready -U shdt -q 2>/dev/null; then
    echo -e "${GREEN}  ✓ Database is ready${NC}"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo -e "${RED}  ✗ Database did not become ready in time. Check Docker.${NC}"
    exit 1
  fi
  sleep 1
done

echo ""

# 3) Run any pending migrations
echo -e "${YELLOW}Running database migrations...${NC}"
MIGRATIONS_DIR="$SCRIPT_DIR/database/migrations"
if [[ -d "$MIGRATIONS_DIR" ]]; then
  for sql_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$sql_file")
    echo -e "  Applying ${filename}..."
    docker exec -i shdt-postgres psql -U shdt -d shdt -f - < "$sql_file" 2>&1 | grep -i "error" || true
  done
  echo -e "${GREEN}  ✓ Migrations applied${NC}"
else
  echo -e "${YELLOW}  No migrations directory found, skipping${NC}"
fi

echo ""

# 4) Set up Python venv & start backend
echo -e "${YELLOW}Starting backend server...${NC}"
VENV_DIR="$SCRIPT_DIR/server/venv"

# Create venv if it doesn't exist or if python symlink is broken
if [[ ! -f "$VENV_DIR/bin/python" ]] || ! "$VENV_DIR/bin/python" --version &>/dev/null; then
  echo -e "${YELLOW}  Creating Python virtual environment...${NC}"
  rm -rf "$VENV_DIR"
  python3 -m venv "$VENV_DIR"
  echo -e "${GREEN}  ✓ Virtual environment created${NC}"

  echo -e "${YELLOW}  Installing Python dependencies (this may take a minute)...${NC}"
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  # Install requirements individually, skipping geopandas (needs GDAL)
  while IFS= read -r package || [[ -n "$package" ]]; do
    # Skip comments, empty lines, and geopandas
    [[ -z "$package" || "$package" == \#* ]] && continue
    pkg_name=$(echo "$package" | cut -d'=' -f1 | cut -d'>' -f1 | cut -d'<' -f1 | tr -d ' ')
    if [[ "${pkg_name,,}" == "geopandas" ]]; then
      echo -e "${YELLOW}    Skipping geopandas (requires GDAL)${NC}"
      continue
    fi
    "$VENV_DIR/bin/pip" install --quiet "$package" 2>/dev/null || echo -e "${YELLOW}    Warning: failed to install $package${NC}"
  done < "$SCRIPT_DIR/server/requirements.txt"

  # Ensure python-multipart is installed (needed by FastAPI)
  "$VENV_DIR/bin/pip" install --quiet python-multipart 2>/dev/null
  echo -e "${GREEN}  ✓ Dependencies installed${NC}"
fi

# Kill any existing backend on port 8000
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true

cd "$SCRIPT_DIR/server"
"$VENV_DIR/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 --workers 4 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$SCRIPT_DIR/.pid_backend"
cd "$SCRIPT_DIR"
echo -e "${GREEN}  ✓ Backend server starting on http://localhost:8000${NC}"

# Wait a moment for backend to be ready before enrichment
sleep 3

# Expand shorthand flags
ARGS="$*"

# --setup is shorthand for first-time full setup: dedup + enrich + forecast + census + broadband
if [[ "$ARGS" == *"--setup"* ]]; then
  ARGS="$ARGS --dedup --enrich --forecast --census --broadband"
fi

# --refresh re-runs all live data enrichments (everything except dedup)
if [[ "$ARGS" == *"--refresh"* ]]; then
  ARGS="$ARGS --enrich --forecast --census --broadband"
fi

# 4b) Run deduplication if requested
if [[ "$ARGS" == *"--dedup"* ]]; then
  echo ""
  echo -e "${YELLOW}Removing duplicate properties...${NC}"

  cd "$SCRIPT_DIR/server"
  "$VENV_DIR/bin/python" deduplicate.py --execute 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done
  cd "$SCRIPT_DIR"

  echo -e "${GREEN}  ✓ Deduplication complete${NC}"
  echo ""
fi

# 4c) Run data enrichment if requested
if [[ "$ARGS" == *"--enrich"* ]]; then
  echo ""
  echo -e "${YELLOW}Running data enrichment (postcodes, crime, flood, IMD)...${NC}"
  echo -e "${YELLOW}  This populates the dashboard with real area-level scores.${NC}"
  echo -e "${YELLOW}  First run may take 10-30 minutes depending on property count.${NC}"
  echo ""

  cd "$SCRIPT_DIR/server"

  # Run enrichment for free data sources (skip EPC — needs API key)
  "$VENV_DIR/bin/python" enrich_all.py --skip epc 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}  ✓ Enrichment complete — dashboard should now show area risk scores${NC}"
  echo ""
fi

# 4d) Run weather forecast enrichment if requested
if [[ "$ARGS" == *"--forecast"* ]]; then
  echo ""
  echo -e "${YELLOW}Fetching weather forecasts for predictive flood risk...${NC}"
  echo -e "${YELLOW}  Pulling 7-day rainfall forecasts from Open-Meteo (UK Met Office models).${NC}"
  echo -e "${YELLOW}  Combining with flood zone data for dynamic risk scoring.${NC}"
  echo ""

  cd "$SCRIPT_DIR/server"
  "$VENV_DIR/bin/python" enrich_forecast.py 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}  ✓ Forecast enrichment complete — Flood Intelligence page now shows predictions${NC}"
  echo ""
fi

# 4e) Re-enrich flood data with improved EA WFS queries
if [[ "$ARGS" == *"--re-enrich-flood"* ]]; then
  echo ""
  echo -e "${YELLOW}Re-enriching flood risk data with improved EA spatial queries...${NC}"
  echo -e "${YELLOW}  This updates River & Sea risk levels using EA's WFS dataset.${NC}"
  echo -e "${YELLOW}  Properties with 'Not Assessed' will be re-classified.${NC}"
  echo ""

  cd "$SCRIPT_DIR/server"
  "$VENV_DIR/bin/python" enrich_flood.py --re-enrich 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}  ✓ Flood re-enrichment complete — River & Sea risk data updated${NC}"
  echo ""
fi


# 4f) Run census + broadband enrichment if requested
if [[ "$ARGS" == *"--census"* ]]; then
  echo ""
  echo -e "${YELLOW}Running Census 2021 demographic enrichment...${NC}"
  echo -e "${YELLOW}  Populating LSOA-level Census data (age profiles, household composition).${NC}"
  echo ""

  cd "$SCRIPT_DIR/server"
  "$VENV_DIR/bin/python" enrich_census.py 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}  ✓ Census enrichment complete${NC}"
  echo ""
fi

# 4g) Run broadband & utilities enrichment if requested
if [[ "$ARGS" == *"--broadband"* ]]; then
  echo ""
  echo -e "${YELLOW}Running broadband & utilities enrichment...${NC}"
  echo -e "${YELLOW}  Populating Ofcom broadband speeds and DNO/GDN data.${NC}"
  echo ""

  cd "$SCRIPT_DIR/server"
  "$VENV_DIR/bin/python" enrich_broadband.py 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  cd "$SCRIPT_DIR"
  echo ""
  echo -e "${GREEN}  ✓ Broadband & utilities enrichment complete${NC}"
  echo ""
fi
echo ""

# 5) Install npm dependencies & start frontend
echo -e "${YELLOW}Starting frontend dev server...${NC}"
cd "$SCRIPT_DIR/client"

if [[ ! -d "node_modules" ]]; then
  echo -e "${YELLOW}  Installing npm dependencies...${NC}"
  npm install --silent 2>&1 | tail -1
  echo -e "${GREEN}  ✓ npm dependencies installed${NC}"
fi

# Clear Vite cache if it exists (avoids permission issues)
rm -rf node_modules/.vite 2>/dev/null || true

# Kill any existing frontend on port 5173
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

npx vite --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$SCRIPT_DIR/.pid_frontend"
cd "$SCRIPT_DIR"
echo -e "${GREEN}  ✓ Frontend dev server starting on http://localhost:5173${NC}"

echo ""

# 6) Done!
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All services are starting up!${NC}"
echo ""
echo -e "  🗄️  Database:  ${CYAN}localhost:5432${NC}"
echo -e "  🖥️  Backend:   ${CYAN}http://localhost:8000${NC}"
echo -e "  🌐 Frontend:  ${CYAN}http://localhost:5173${NC}"
echo -e "  📊 pgAdmin:   ${CYAN}http://localhost:5050${NC} (optional)"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop, or run ${YELLOW}./start.sh --stop${NC}"
echo ""
echo -e "  💡 Refresh all live data (weather, crime, flood, census, broadband):"
echo -e "     ${YELLOW}./start.sh --refresh${NC}"
echo -e "  💡 First-time full setup (dedup + all enrichments):"
echo -e "     ${YELLOW}./start.sh --setup${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo ""

# Trap Ctrl+C to clean up
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  rm -f "$SCRIPT_DIR/.pid_backend" "$SCRIPT_DIR/.pid_frontend"
  echo -e "${GREEN}Done. Database container is still running (use ./start.sh --stop to stop it).${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
