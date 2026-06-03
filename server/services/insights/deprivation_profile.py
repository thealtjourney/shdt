"""Insight 2 — Deprivation Profile from IoD 2025."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class DeprivationProfileInsight(Insight):
    """Portfolio profile against IoD 2025 deciles, with cross-vulnerability flags."""

    rank = 2
    key = "deprivation_profile"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        row = ctx.db.execute(
            text(
                """
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE imd_decile IS NOT NULL) AS enriched,
                       COUNT(*) FILTER (WHERE imd_decile BETWEEN 1 AND 3) AS most_deprived,
                       COUNT(*) FILTER (WHERE imd_decile BETWEEN 4 AND 6) AS mid_deprived,
                       COUNT(*) FILTER (WHERE imd_decile BETWEEN 7 AND 10) AS least_deprived,
                       AVG(imd_score) FILTER (WHERE imd_score IS NOT NULL) AS avg_score,
                       COUNT(*) FILTER (
                           WHERE imd_decile BETWEEN 1 AND 3
                             AND flood_risk_rivers_seas IN ('High','Medium')
                       ) AS deprived_and_flood,
                       COUNT(*) FILTER (
                           WHERE imd_decile BETWEEN 1 AND 3
                             AND census_disability_pct > 15
                       ) AS deprived_and_disabled
                FROM properties
                """
            )
        ).fetchone()

        if not row or not row[1] or row[1] <= 0:
            return None

        total, enriched, most, mid, least, _avg_score, dep_flood, dep_disabled = row
        most_pct = (most or 0) / enriched * 100

        if most_pct > 50:
            concentration = "highly concentrated in deprived areas"
            severity = "critical"
        elif most_pct > 35:
            concentration = "skewed toward deprived areas"
            severity = "high"
        else:
            concentration = "spread across deprivation levels"
            severity = "medium"

        desc = (
            f"Of {enriched:,} properties with IoD 2025 data: {most or 0:,} ({most_pct:.0f}%) "
            f"are in the most deprived 30% of areas nationally (deciles 1-3), "
            f"{mid or 0:,} in mid-range (deciles 4-6), and {least or 0:,} in the least "
            f"deprived areas. Portfolio is {concentration}. "
        )
        if dep_flood:
            desc += f"{dep_flood:,} highly-deprived properties also face flood risk — a compounding vulnerability. "
        if dep_disabled:
            desc += f"{dep_disabled:,} highly-deprived properties have high disability rates — indicating need for targeted support."

        return {
            "title": "Deprivation Profile — IoD 2025",
            "severity": severity,
            "icon": "📊",
            "metric": f"{most_pct:.0f}% in deciles 1-3",
            "description": desc,
            "action": (
                "Focus investment and service delivery in decile 1-3 areas where social "
                "impact is greatest. Cross-reference with fuel poverty and health "
                "deprivation sub-scores to target specific interventions."
            ),
            "data_sources": ["IoD 2025 (MHCLG)", "EA Flood Risk", "Census Demographics"],
        }
