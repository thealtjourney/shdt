"""Insight 1 — Significant Flood Risk Across Portfolio."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class FloodRiskInsight(Insight):
    """Cross-references EA flood risk (rivers/sea + surface water) with portfolio."""

    rank = 1
    key = "flood_risk"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        row = ctx.db.execute(
            text(
                """
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE flood_risk_rivers_seas = 'High')   AS high_rivers,
                       COUNT(*) FILTER (WHERE flood_risk_rivers_seas = 'Medium') AS med_rivers,
                       COUNT(*) FILTER (WHERE flood_risk_surface_water = 'High') AS high_surface,
                       COUNT(*) FILTER (WHERE flood_risk_surface_water = 'Medium') AS med_surface,
                       COUNT(*) FILTER (
                           WHERE flood_risk_rivers_seas   IN ('High','Medium')
                             AND flood_risk_surface_water IN ('High','Medium')
                       ) AS dual_risk,
                       ARRAY_AGG(DISTINCT ward_name) FILTER (
                           WHERE ward_name IS NOT NULL
                             AND flood_risk_rivers_seas = 'High'
                       ) AS hotspot_wards
                FROM properties
                WHERE flood_risk_rivers_seas IS NOT NULL
                """
            )
        ).fetchone()

        if not row or not row[0]:
            return None

        total, high_r, med_r, high_s, med_s, dual, wards = row
        return {
            "title": "Significant Flood Risk Across Portfolio",
            "severity": "critical",
            "icon": "🌊",
            "metric": f"{(high_r or 0) + (med_r or 0):,} at risk (rivers)",
            "description": (
                f"Of {total:,} assessed properties, {high_r or 0:,} face HIGH river/sea "
                f"flood risk and {med_r or 0:,} face MEDIUM risk. Surface-water flooding "
                f"adds {high_s or 0:,} HIGH and {med_s or 0:,} MEDIUM risk properties. "
                f"{dual or 0:,} properties face DUAL risk from both rivers and surface water "
                f"— these are the most vulnerable assets."
            ),
            "action": (
                "Review emergency response plans for high-risk properties. Prioritise "
                "flood resilience measures (raised electrics, flood doors, resilient "
                "flooring). Ensure tenants in dual-risk properties have evacuation plans."
            ),
            "data_sources": [
                "EA Flood Risk (Rivers & Sea)",
                "EA Flood Risk (Surface Water)",
            ],
            "areas": list((wards or [])[:5]),
        }
