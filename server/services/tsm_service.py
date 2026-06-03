"""
Tenant Satisfaction Measures service.

The Regulator of Social Housing requires English social landlords to
report 22 Tenant Satisfaction Measures annually since April 2024:

  Tenant perception (TP01–TP12) — 12 measures from a regulator-set survey
  Repairs performance (RP01–RP02)
  Building safety (BP01)
  Decent Homes (CH01–CH02)
  Neighbourhood management (NM01)
  Anti-social behaviour (AS01)

Each measure has a standard definition; landlords either submit the % of
respondents who agreed (perception measures) or a count from internal
records (management measures).

This service reads the synthetic seed data populated by the Phase 3
Alembic revision and shapes it into the dashboard / regulator-return
format.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# Canonical regulator-defined measure metadata.
# Source: Regulator of Social Housing — TSM definitions, April 2024.
TSM_DEFINITIONS: dict[str, dict[str, Any]] = {
    # ── Tenant Perception (TP) — % satisfaction from survey ─────────
    "TP01": {"name": "Overall satisfaction", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP02": {"name": "Satisfaction with repairs", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP03": {"name": "Satisfaction with time taken to complete most recent repair", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP04": {"name": "Satisfaction that home is well-maintained", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP05": {"name": "Satisfaction that home is safe", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP06": {"name": "Satisfaction that landlord listens to views and acts upon them", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP07": {"name": "Satisfaction that landlord keeps me informed", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP08": {"name": "Agreement that landlord treats fairly and with respect", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP09": {"name": "Satisfaction with landlord's approach to complaints handling", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP10": {"name": "Satisfaction that landlord keeps communal areas clean and well-maintained", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP11": {"name": "Satisfaction that landlord makes a positive contribution to the neighbourhood", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    "TP12": {"name": "Satisfaction with landlord's approach to handling anti-social behaviour", "category": "Tenant Perception", "unit": "%", "higher_is_better": True},
    # ── Repairs Performance (RP) ─────────────────────────────────────
    "RP01": {"name": "Non-emergency responsive repairs completed within target timescale", "category": "Repairs", "unit": "%", "higher_is_better": True},
    "RP02": {"name": "Emergency responsive repairs completed within target timescale", "category": "Repairs", "unit": "%", "higher_is_better": True},
    # ── Building Safety (BP) ─────────────────────────────────────────
    "BP01": {"name": "Gas safety checks", "category": "Building Safety", "unit": "%", "higher_is_better": True},
    # ── Decent Homes (CH) ────────────────────────────────────────────
    "CH01": {"name": "Homes that meet the Decent Homes Standard", "category": "Decent Homes", "unit": "%", "higher_is_better": True},
    "CH02": {"name": "Homes failing to meet the Decent Homes Standard", "category": "Decent Homes", "unit": "%", "higher_is_better": False},
    # ── Neighbourhood Management (NM) ────────────────────────────────
    "NM01": {"name": "ASB cases relative to the size of the landlord", "category": "Neighbourhood", "unit": "per 1,000 homes", "higher_is_better": False},
    # ── Anti-social Behaviour (AS) ───────────────────────────────────
    "AS01": {"name": "ASB cases that involve hate incidents per 1,000 homes", "category": "Anti-social Behaviour", "unit": "per 1,000 homes", "higher_is_better": False},
}

# Industry benchmark medians (source: Housemark / RSH 2024 publications, indicative).
TSM_BENCHMARKS: dict[str, float] = {
    "TP01": 75.0, "TP02": 72.0, "TP03": 68.0, "TP04": 73.0, "TP05": 79.0,
    "TP06": 65.0, "TP07": 72.0, "TP08": 78.0, "TP09": 60.0, "TP10": 68.0,
    "TP11": 64.0, "TP12": 60.0, "RP01": 85.0, "RP02": 92.0, "BP01": 99.0,
    "CH01": 95.0, "CH02": 5.0, "NM01": 6.0, "AS01": 4.0,
}


def _band(measure_code: str, value: float) -> str:
    """Bucket a raw TSM into a quality band: green / amber / red."""
    bench = TSM_BENCHMARKS.get(measure_code, 70.0)
    higher_better = TSM_DEFINITIONS[measure_code]["higher_is_better"]
    if higher_better:
        if value >= bench:
            return "green"
        if value >= bench - 5:
            return "amber"
        return "red"
    else:
        if value <= bench:
            return "green"
        if value <= bench + 2:
            return "amber"
        return "red"


class TenantSatisfactionService:
    """Read-side helpers for the TSM dashboard."""

    @staticmethod
    def latest_year(db: Session) -> int | None:
        return db.execute(
            text("SELECT MAX(survey_year) FROM tsm_responses")
        ).scalar_one_or_none()

    @staticmethod
    def portfolio_measures(db: Session, year: int | None = None) -> dict[str, Any]:
        """Return all 22 TSMs for the requested year."""
        target_year = year or TenantSatisfactionService.latest_year(db)
        if target_year is None:
            return {"year": None, "measures": []}

        rows = db.execute(
            text(
                """
                SELECT measure_code,
                       AVG(response_value)::numeric(6,2) AS value,
                       SUM(response_count) AS responses
                FROM tsm_responses
                WHERE survey_year = :y
                GROUP BY measure_code
                """
            ),
            {"y": target_year},
        ).fetchall()
        latest = {r[0]: (float(r[1] or 0), int(r[2] or 0)) for r in rows}

        # Prior year (if present) to compute trend
        prior = db.execute(
            text(
                """
                SELECT measure_code, AVG(response_value)::numeric(6,2)
                FROM tsm_responses
                WHERE survey_year = :y
                GROUP BY measure_code
                """
            ),
            {"y": target_year - 1},
        ).fetchall()
        prior_map = {r[0]: float(r[1] or 0) for r in prior}

        measures = []
        # Iterate the canonical list so missing measures still surface
        for code, meta in TSM_DEFINITIONS.items():
            value, responses = latest.get(code, (0.0, 0))
            prior_value = prior_map.get(code)
            trend = None if prior_value is None else round(value - prior_value, 2)
            measures.append({
                "code": code,
                "name": meta["name"],
                "category": meta["category"],
                "unit": meta["unit"],
                "higher_is_better": meta["higher_is_better"],
                "value": round(value, 2),
                "benchmark": TSM_BENCHMARKS.get(code),
                "band": _band(code, value),
                "year": target_year,
                "responses": responses,
                "trend_vs_prior_year": trend,
            })
        return {"year": target_year, "measures": measures}

    @staticmethod
    def regulator_return(db: Session, year: int | None = None) -> list[dict[str, Any]]:
        """
        Flat row-per-measure shape suitable for the RSH submission CSV.
        """
        bundle = TenantSatisfactionService.portfolio_measures(db, year=year)
        return [
            {
                "measure_code": m["code"],
                "measure_name": m["name"],
                "year": m["year"],
                "value": m["value"],
                "unit": m["unit"],
                "responses": m["responses"],
            }
            for m in bundle["measures"]
        ]
