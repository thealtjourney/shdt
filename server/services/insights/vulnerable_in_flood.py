"""Insight 5 — Vulnerable residents in High flood-risk zones."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class VulnerableInFloodInsight(Insight):
    """Cross-references EA flood risk with Census demographics and IoD."""

    rank = 5
    key = "vulnerable_in_flood"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        row = ctx.db.execute(
            text(
                """
                SELECT COUNT(*) AS total,
                       AVG(census_age_65_plus_pct)        AS avg_elderly,
                       AVG(census_disability_pct)         AS avg_disability,
                       AVG(census_single_person_hh_pct)   AS avg_single,
                       COUNT(*) FILTER (WHERE flood_risk_surface_water IN ('High','Medium')) AS surface_risk_too,
                       COUNT(*) FILTER (WHERE imd_decile BETWEEN 1 AND 3) AS also_deprived,
                       AVG(imd_score) FILTER (WHERE imd_score IS NOT NULL) AS avg_imd_score
                FROM properties
                WHERE flood_risk_rivers_seas IN ('High')
                  AND census_age_65_plus_pct IS NOT NULL
                """
            )
        ).fetchone()

        if not row or not row[0]:
            return None

        total, avg_elderly, avg_disab, avg_single, surface_risk_too, also_deprived, _ = row

        desc = f"{total:,} properties in HIGH flood risk zones house communities with "
        desc += f"{avg_elderly:.0f}% elderly residents, " if avg_elderly else ""
        desc += f"{avg_disab:.0f}% disability rate, " if avg_disab else ""
        desc += f"and {avg_single:.0f}% single-person households" if avg_single else ""
        desc += f". {surface_risk_too or 0:,} of these also face high surface water risk. "
        if also_deprived:
            desc += (
                f"{also_deprived:,} of these flood-risk properties are also in the most "
                f"deprived 30% of areas (IoD deciles 1-3) — a triple vulnerability of "
                f"flood exposure, deprivation, and demographic fragility. "
            )
        desc += "These residents may have limited support networks and mobility during flood events."

        return {
            "title": "Vulnerable Residents in High Flood Risk Zones",
            "severity": "critical" if (also_deprived or 0) > 100 else "high",
            "icon": "⚠️",
            "metric": f"{total:,} properties",
            "description": desc,
            "action": (
                "Ensure flood emergency plans specifically address vulnerable tenants. "
                "Pre-register for EA flood warnings. Consider personal evacuation plans "
                "for elderly and disabled residents in deprived areas where self-recovery "
                "capacity is lowest."
            ),
            "data_sources": ["EA Flood Risk", "Census Demographics", "IoD 2025"],
        }
