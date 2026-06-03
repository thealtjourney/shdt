"""Insight 8 — Risk profile broken down by property type."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class PropertyTypeRiskInsight(Insight):
    """Per-property-type flood exposure and deprivation profile."""

    rank = 8
    key = "property_type_risk"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        rows = ctx.db.execute(
            text(
                """
                SELECT property_type,
                       COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE flood_risk_rivers_seas = 'High')   AS flood_high,
                       COUNT(*) FILTER (WHERE flood_risk_rivers_seas = 'Medium') AS flood_med,
                       AVG(census_disability_pct)                                AS avg_disability,
                       AVG(census_overcrowded_pct)                               AS avg_overcrowded,
                       AVG(imd_decile) FILTER (WHERE imd_decile IS NOT NULL)     AS avg_imd_decile,
                       COUNT(*) FILTER (WHERE imd_decile BETWEEN 1 AND 3)        AS deprived_count
                FROM properties
                WHERE property_type IS NOT NULL
                GROUP BY property_type
                ORDER BY total DESC
                """
            )
        ).fetchall()

        if not rows:
            return None

        parts: list[str] = []
        has_flat = False
        for r in rows:
            ptype, total, fhigh, fmed, _avg_dis, _avg_over, _avg_dec, dep_count = r
            if total <= 0:
                continue
            if ptype == "Flat":
                has_flat = True
            flood_pct = ((fhigh or 0) + (fmed or 0)) / total * 100
            deprived_pct = (dep_count or 0) / total * 100 if dep_count else 0
            part = f"{ptype}s: {total:,} ({flood_pct:.0f}% flood risk"
            if deprived_pct > 0:
                part += f", {deprived_pct:.0f}% in deprived areas"
            part += ")"
            parts.append(part)

        description = "Risk exposure varies by property type. " + ". ".join(parts) + "."
        if has_flat:
            description += " Flats may need communal flood plans; houses benefit from individual resilience measures."

        return {
            "title": "Property Type Risk Profile",
            "severity": "medium",
            "icon": "🏠",
            "metric": f"{len(rows)} property types",
            "description": description,
            "action": (
                "Tailor maintenance and resilience strategies by property type. Flats need "
                "communal approaches; houses allow individual property-level interventions. "
                "Focus on deprived areas first."
            ),
            "data_sources": ["Property Database", "EA Flood Risk", "IoD 2025"],
        }
