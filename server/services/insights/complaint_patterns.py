"""Insight 6 — Complaint patterns and Stage 2 escalation."""
from __future__ import annotations

from typing import Any

from .base import Insight, InsightContext, register


@register
class ComplaintPatternsInsight(Insight):
    """Surface complaint volumes, escalation rate and average resolution time."""

    rank = 6
    key = "complaint_patterns"

    @staticmethod
    def _first_present(df, names: list[str]) -> str | None:
        for name in names:
            if name in df.columns:
                return name
        return None

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        df = ctx.df_complaints
        if df is None or len(df) == 0:
            return None

        total = len(df)
        stage_col = self._first_present(df, ["Stage", "stage", "STAGE"])
        cat_col = self._first_present(df, ["Category", "category", "CATEGORY"])
        days_col = self._first_present(df, ["Total Days", "total_days", "TotalDays", "Days"])

        stage2 = 0
        if stage_col:
            stage2 = int(df[stage_col].astype(str).str.contains("2", na=False).sum())
        escalation_rate = stage2 / total * 100 if total > 0 else 0.0

        top_cat_text = ""
        if cat_col:
            top_cats = df[cat_col].value_counts().head(3)
            top_cat_text = ", ".join([f"{cat} ({count})" for cat, count in top_cats.items()])

        avg_days = 0.0
        avg_days_all = 0.0
        if days_col:
            avg_days_all = float(df[days_col].mean())
            if stage_col:
                s2 = df[df[stage_col].astype(str).str.contains("2", na=False)]
                if len(s2) > 0:
                    avg_days = float(s2[days_col].mean())

        desc_parts = [f"{total} complaints recorded."]
        if stage2 > 0:
            desc_parts.append(f"{stage2:.0f} escalated to Stage 2 ({escalation_rate:.1f}% rate).")
        if avg_days > 0:
            desc_parts.append(f"Average Stage 2 resolution: {avg_days:.0f} days.")
        elif avg_days_all > 0:
            desc_parts.append(f"Average resolution time: {avg_days_all:.0f} days.")
        if top_cat_text:
            desc_parts.append(f"Top categories: {top_cat_text}.")

        return {
            "title": "Complaint Patterns & Escalation",
            "severity": "high" if escalation_rate > 20 else "medium",
            "icon": "📋",
            "metric": f"{total} complaints",
            "description": " ".join(desc_parts),
            "action": (
                "Investigate root causes in top complaint categories. Review initial "
                "response procedures to prevent escalation."
            ),
            "data_sources": ["Complaints Data"],
        }
