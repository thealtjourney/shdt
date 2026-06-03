"""Insight 4 — Flood Zone correlated with Repair Demand."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from .base import Insight, InsightContext, register


@register
class FloodRepairsInsight(Insight):
    """How does flood-zone classification track with repair frequency and cost?"""

    rank = 4
    key = "flood_repairs"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        df = ctx.df_repairs
        if df is None or len(df) == 0 or "Address1" not in df.columns:
            return None
        if not ctx.addr_to_info:
            return None

        df_fr = df.copy()
        df_fr["_street"] = df_fr["Address1"].astype(str).str.lower().str.strip()
        df_fr["_flood"] = df_fr["_street"].map(
            lambda x: ctx.addr_to_info.get(x, {}).get("flood")
        )
        matched_fr = df_fr.dropna(subset=["_flood"])
        if len(matched_fr) <= 100:
            return None

        flood_high = matched_fr[matched_fr["_flood"] == "High"]
        flood_med = matched_fr[matched_fr["_flood"] == "Medium"]
        flood_low = matched_fr[matched_fr["_flood"] == "Very Low"]

        cost_col = "TotalCost" if "TotalCost" in matched_fr.columns else None

        props_high = ctx.db.execute(
            text("SELECT COUNT(*) FROM properties WHERE flood_risk_rivers_seas = 'High'")
        ).scalar() or 1
        props_med = ctx.db.execute(
            text("SELECT COUNT(*) FROM properties WHERE flood_risk_rivers_seas = 'Medium'")
        ).scalar() or 1
        props_low = ctx.db.execute(
            text("SELECT COUNT(*) FROM properties WHERE flood_risk_rivers_seas = 'Very Low'")
        ).scalar() or 1

        rate_high = len(flood_high) / props_high
        rate_med = len(flood_med) / props_med
        rate_low = len(flood_low) / props_low if props_low > 0 else 0

        avg_cost_high = float(flood_high[cost_col].mean()) if cost_col and len(flood_high) > 0 else 0.0
        avg_cost_low = float(flood_low[cost_col].mean()) if cost_col and len(flood_low) > 0 else 0.0

        description = (
            f"Properties in HIGH flood risk zones average {rate_high:.1f} repairs each "
            f"vs {rate_low:.1f} in Very Low risk zones"
            + (f" ({((rate_high / rate_low - 1) * 100):.0f}% more)" if rate_low > 0 else "")
            + f". Medium risk zones average {rate_med:.1f} repairs/property."
            + (
                f" Average repair cost is £{avg_cost_high:,.0f} in high-risk vs "
                f"£{avg_cost_low:,.0f} in low-risk zones."
                if avg_cost_high > 0 and avg_cost_low > 0
                else ""
            )
            + " Flood-related damp, structural damage, and drainage issues likely drive these higher repair volumes."
        )

        return {
            "title": "Flood Zone Drives Higher Repair Demand",
            "severity": "high" if rate_high > rate_low * 1.2 else "medium",
            "icon": "💧",
            "metric": f"{rate_high:.1f} repairs/property (high risk)",
            "description": description,
            "action": (
                "Invest in flood resilience for high-risk properties to reduce recurring "
                "repair costs. Review drainage, damp-proofing, and flood defences."
            ),
            "data_sources": ["Repairs Data", "EA Flood Risk", "Property Database"],
        }
