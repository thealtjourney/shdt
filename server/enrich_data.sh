#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Data Enrichment Pipeline — Run from the server/ directory
# ═══════════════════════════════════════════════════════════════
#
# Runs all enrichment steps in the correct order:
#   1. Postcodes.io → LSOA codes, ward, region  (free API)
#   2. IMD 2025     → deprivation deciles        (downloads CSV from GOV.UK)
#   3. Census 2021  → demographics per area       (generated from IMD + national stats)
#   4. Broadband    → Ofcom speeds & coverage     (generated from region data)
#
# Optional steps (require more time / API limits):
#   5. Crime        → Police API crime stats       (rate-limited)
#   6. Flood        → EA flood risk zones           (already populated if you see data)
#
# Usage:
#   ./enrich_data.sh              # Run the core pipeline (postcodes → IMD → census → broadband)
#   ./enrich_data.sh --all        # Run everything including crime and flood
#   ./enrich_data.sh --imd-only   # Just re-run IMD + census (if postcodes already done)
#
# ═══════════════════════════════════════════════════════════════

set -e

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Work out where we are
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Find Python — check for venv first, then system
VENV_DIR="$(dirname "$SCRIPT_DIR")/venv"
if [ -f "$VENV_DIR/bin/python" ]; then
    PYTHON="$VENV_DIR/bin/python"
elif [ -f "$SCRIPT_DIR/../venv/bin/python" ]; then
    PYTHON="$SCRIPT_DIR/../venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
else
    echo -e "${RED}Error: No Python found. Create a venv or install Python 3.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SHDT Data Enrichment Pipeline${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "  Python: $PYTHON"
echo ""

ARGS="$*"

run_step() {
    local step_num="$1"
    local step_name="$2"
    local command="$3"

    echo ""
    echo -e "${YELLOW}── Step $step_num: $step_name ──${NC}"
    echo -e "  Running: $PYTHON $command"
    echo ""

    if eval "$PYTHON $command"; then
        echo ""
        echo -e "${GREEN}  ✓ $step_name complete${NC}"
    else
        echo ""
        echo -e "${RED}  ✗ $step_name failed (exit code $?)${NC}"
        echo -e "${RED}    Check the output above for details.${NC}"
        echo -e "${YELLOW}    Continuing with next step...${NC}"
    fi
}

# ── IMD-only mode: skip postcodes, just re-run IMD + census ──
if [[ "$ARGS" == *"--imd-only"* ]]; then
    echo -e "${YELLOW}  Mode: IMD + Census only (skipping postcodes)${NC}"
    run_step "1" "IoD 2025 Deprivation Data (download + enrich)" "enrich_imd.py --download --force"
    run_step "2" "Census 2021 Demographics (re-run with fresh IMD data)" "enrich_census.py --force"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Done! IMD + Census enrichment complete.${NC}"
    echo -e "${GREEN}  Restart the app to see updated Strategic Insights.${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    exit 0
fi

# ── Core pipeline ──
echo -e "  Mode: ${YELLOW}Core pipeline${NC} (postcodes → IMD → census → broadband)"
if [[ "$ARGS" == *"--all"* ]]; then
    echo -e "         ${YELLOW}+ crime + flood${NC}"
fi
echo ""

# Step 1: Postcodes.io — gets LSOA codes, ward names, regions
run_step "1" "Postcodes.io Enrichment (LSOA codes, wards, regions)" "enrich_postcodes.py"

# Step 2: IMD 2025 — downloads from GOV.UK, matches LSOA → deprivation decile
run_step "2" "IoD 2025 Deprivation Data (download + enrich)" "enrich_imd.py --download --force"

# Step 3: Census 2021 — generates demographics based on IMD deciles
# This MUST run after IMD so it uses real deprivation data, not defaults
# --force ensures it regenerates even if previously enriched (with wrong defaults)
run_step "3" "Census 2021 Demographics" "enrich_census.py --force"

# Step 4: Broadband — Ofcom speeds and coverage
run_step "4" "Broadband & Utilities (Ofcom data)" "enrich_broadband.py"

# Optional: Crime + Flood (only with --all)
if [[ "$ARGS" == *"--all"* ]]; then
    run_step "5" "Police Crime Data" "enrich_all.py --only crime"
    run_step "6" "EA Flood Risk Data" "enrich_all.py --only flood"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Enrichment pipeline complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}What was done:${NC}"
echo -e "    ✓ Postcodes.io  → LSOA codes, ward names, regions"
echo -e "    ✓ IoD 2025      → Deprivation deciles (1-10) per LSOA"
echo -e "    ✓ Census 2021   → Age, disability, overcrowding, heating per area"
echo -e "    ✓ Broadband     → Download/upload speeds, FTTP availability"
if [[ "$ARGS" == *"--all"* ]]; then
    echo -e "    ✓ Crime         → Police API crime statistics"
    echo -e "    ✓ Flood         → EA flood risk zones"
fi
echo ""
echo -e "  ${YELLOW}Next: Restart the app to see the enriched data in Strategic Insights.${NC}"
echo ""
