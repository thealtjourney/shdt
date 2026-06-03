"""Insight 10 — Broadband and digital readiness."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class BroadbandReadinessInsight(Insight):
    """Headline Ofcom broadband coverage figures across the portfolio."""

    rank = 10
    key = "broadband_readiness"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        row = ctx.db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total,
                    AVG(broadband_max_download) AS avg_download,
                    MIN(broadband_max_download) AS min_download,
                    MAX(broadband_max_download) AS max_download,
                    COUNT(*) FILTER (WHERE broadband_superfast_available = true) AS superfast,
                    COUNT(*) FILTER (WHERE broadband_ultrafast_available = true) AS ultrafast,
                    COUNT(*) FILTER (WHERE broadband_fttp_available = true)      AS fttp
                FROM properties
                WHERE broadband_max_download IS NOT NULL
                """
            )
        ).fetchone()

        if not row or not row[0]:
            return None

        total, avg_dl, min_dl, max_dl, superfast, _ultra, fttp = row
        superfast_pct = (superfast or 0) / total * 100
        fttp_pct = (fttp or 0) / total * 100

        return {
            "title": "Broadband & Digital Readiness",
            "severity": "info" if avg_dl and avg_dl > 50 else "medium",
            "icon": "📡",
            "metric": f"{avg_dl:.0f} Mbps average" if avg_dl else f"{total:,} assessed",
            "description": (
                f"Broadband assessed across {total:,} properties. "
                f"Average download: {avg_dl:.0f}Mbps (range: {min_dl:.0f}-{max_dl:.0f}Mbps). "
                f"Superfast available: {superfast_pct:.0f}%. Full fibre (FTTP): {fttp_pct:.0f}%. "
                + (
                    "Good connectivity supports digital service delivery and smart home technologies."
                    if avg_dl and avg_dl > 50
                    else "Some areas may need digital inclusion support."
                )
            ),
            "action": (
                "Leverage good broadband coverage to roll out tenant portals, smart heating "
                "controls, and digital repair reporting. Monitor for any future gaps."
            ),
            "data_sources": ["Ofcom Broadband Data"],
        }
