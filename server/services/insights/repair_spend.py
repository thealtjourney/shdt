"""Insight 3 — Repair Spend Concentration by postcode."""
from __future__ import annotations

from typing import Any

from .base import Insight, InsightContext, register


@register
class RepairSpendInsight(Insight):
    """Identify postcodes that account for a disproportionate share of repair spend."""

    rank = 3
    key = "repair_spend"

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        df = ctx.df_repairs
        if df is None or len(df) == 0 or "Address1" not in df.columns:
            return None
        if not ctx.addr_to_info:
            return None

        df_rc = df.copy()
        df_rc["_street"] = df_rc["Address1"].astype(str).str.lower().str.strip()
        df_rc["_postcode"] = df_rc["_street"].map(
            lambda x: ctx.addr_to_info.get(x, {}).get("postcode")
        )
        matched = df_rc.dropna(subset=["_postcode"])
        if len(matched) == 0:
            return None

        cost_col = "TotalCost" if "TotalCost" in matched.columns else None
        total_cost = float(matched[cost_col].sum()) if cost_col else 0.0
        total_matched = len(matched)

        if cost_col:
            pc_spend = (
                matched.groupby("_postcode")
                .agg(count=("_postcode", "size"), cost=(cost_col, "sum"), avg_cost=(cost_col, "mean"))
                .sort_values("cost", ascending=False)
                .head(10)
            )
        else:
            pc_spend = (
                matched.groupby("_postcode")
                .size()
                .reset_index(name="count")
                .set_index("_postcode")
                .sort_values("count", ascending=False)
                .head(10)
            )
            pc_spend["cost"] = 0
            pc_spend["avg_cost"] = 0

        top_pc = pc_spend.index[0]
        top5_cost = float(pc_spend.head(5)["cost"].sum()) if cost_col else 0.0
        top5_pct = (top5_cost / total_cost * 100) if total_cost > 0 else 0.0

        if top5_pct > 0:
            description = (
                f"{total_matched:,} repair orders mapped across the portfolio"
                + (f", totalling £{total_cost:,.0f}" if total_cost > 0 else "")
                + f". Top postcode {top_pc} alone accounts for {int(pc_spend.iloc[0]['count'])} repairs"
                + (f" (£{float(pc_spend.iloc[0]['cost']):,.0f})" if cost_col else "")
                + f". The top 5 postcodes represent {top5_pct:.0f}% of total spend — a clear "
                + "concentration of reactive maintenance."
            )
        else:
            description = (
                f"{total_matched:,} repair orders mapped across the portfolio. "
                f"The top 5 postcodes account for {int(pc_spend.head(5)['count'].sum()):,} repairs."
            )

        return {
            "title": "Repair Spend Concentration — Postcode Hotspots",
            "severity": "high",
            "icon": "🔧",
            "metric": f"£{total_cost:,.0f} total spend" if total_cost > 0 else f"{total_matched:,} repairs",
            "description": description,
            "action": (
                "Investigate repeat-repair properties in top postcodes. Consider planned "
                "maintenance programmes to shift from reactive to proactive spend."
            ),
            "data_sources": ["Repairs Data", "Property Database"],
            "top_postcodes": [
                {"postcode": pc, "repairs": int(row["count"]), "cost": float(row.get("cost", 0))}
                for pc, row in pc_spend.iterrows()
            ],
        }
