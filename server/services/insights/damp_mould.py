"""Insight 11 — Damp & Mould Risk (Awaab's Law context)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class DampMouldInsight(Insight):
    """
    Highlights the portfolio's damp & mould risk profile and surfaces the
    open Awaab's Law caseload + SLA breach count alongside it.

    The score itself is computed in the Phase 3 Alembic migration (and
    refreshed by the damp_mould_service) — this insight reads the result.
    """

    rank = 11
    key = "damp_mould_risk"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        # Score distribution
        dist = ctx.db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE damp_mould_risk_band = 'Critical') AS critical,
                    COUNT(*) FILTER (WHERE damp_mould_risk_band = 'High')     AS high,
                    COUNT(*) FILTER (WHERE damp_mould_risk_band = 'Medium')   AS medium,
                    COUNT(*) FILTER (WHERE damp_mould_risk_band = 'Low')      AS low,
                    AVG(damp_mould_risk_score)::numeric(5,2) AS avg_score
                FROM properties
                WHERE damp_mould_risk_score IS NOT NULL
                """
            )
        ).fetchone()

        if not dist or not dist[0]:
            return None
        total, critical, high, medium, low, avg_score = dist

        # Awaab caseload alongside (may be empty in fresh installs)
        caseload = ctx.db.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE stage = 'reported')         AS reported,
                    COUNT(*) FILTER (WHERE stage = 'investigated')     AS investigated,
                    COUNT(*) FILTER (WHERE stage = 'repair_scheduled') AS scheduled,
                    COUNT(*) FILTER (WHERE stage IN ('repaired','closed')) AS resolved,
                    COUNT(*) FILTER (WHERE sla_breached AND stage NOT IN ('repaired','closed')) AS open_breaches,
                    COUNT(*) AS total_cases
                FROM awaab_cases
                """
            )
        ).fetchone()
        reported, investigated, scheduled, resolved, open_breaches, total_cases = caseload or (0, 0, 0, 0, 0, 0)

        # Top 5 highest-risk wards
        top_wards = ctx.db.execute(
            text(
                """
                SELECT ward_name,
                       COUNT(*) AS properties,
                       AVG(damp_mould_risk_score)::numeric(5,2) AS avg_score
                FROM properties
                WHERE damp_mould_risk_score IS NOT NULL AND ward_name IS NOT NULL
                GROUP BY ward_name
                HAVING COUNT(*) >= 5
                ORDER BY avg_score DESC
                LIMIT 5
                """
            )
        ).fetchall()

        critical_pct = (critical or 0) / total * 100 if total else 0.0
        severity = "critical" if critical_pct > 5 or open_breaches > 10 else \
                   "high" if critical_pct > 2 or open_breaches > 0 else \
                   "medium"

        description_parts = [
            f"Portfolio damp & mould risk averages {avg_score} / 100 across {total:,} assessed properties."
        ]
        description_parts.append(
            f"{critical or 0:,} ({critical_pct:.1f}%) properties are in the Critical band, "
            f"{high or 0:,} High, {medium or 0:,} Medium, {low or 0:,} Low."
        )
        if total_cases:
            description_parts.append(
                f"There are {total_cases:,} Awaab's Law cases on the books "
                f"({reported or 0} reported, {investigated or 0} investigating, {scheduled or 0} scheduled, {resolved or 0} resolved); "
                f"{open_breaches or 0} are currently breaching SLA."
            )
        else:
            description_parts.append(
                "No Awaab's Law cases have been opened yet — once tenant reports start flowing, "
                "they'll appear here with live SLA timers."
            )

        return {
            "title": "Damp & Mould Risk + Awaab's Law Caseload",
            "severity": severity,
            "icon": "💧",
            "metric": f"{critical or 0:,} Critical, {high or 0:,} High",
            "description": " ".join(description_parts),
            "action": (
                "Prioritise inspections in the highest-risk Critical band. Open Awaab's Law "
                "cases proactively for tenants reporting damp; track resolution against the "
                "14-day investigation and 7-day emergency repair SLAs. Use the explanation "
                "panel on each property to tailor remediation (insulation, ventilation, "
                "heating upgrades)."
            ),
            "data_sources": [
                "EPC Register",
                "Census 2021 (overcrowding, no-central-heating)",
                "Property age",
                "EA Flood Risk",
                "Tenant complaints (Awaab's Law cases)",
            ],
            "areas": [
                {"ward": w[0], "properties": int(w[1]), "avg_score": float(w[2])}
                for w in top_wards
            ],
            "caseload": {
                "reported": reported or 0,
                "investigated": investigated or 0,
                "scheduled": scheduled or 0,
                "resolved": resolved or 0,
                "open_breaches": open_breaches or 0,
                "total": total_cases or 0,
            },
        }
