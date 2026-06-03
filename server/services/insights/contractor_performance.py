"""Insight 7 — Contractor performance benchmarking."""
from __future__ import annotations

from typing import Any

from .base import Insight, InsightContext, register


@register
class ContractorPerformanceInsight(Insight):
    """Top contractors by volume, on-time attendance and total spend."""

    rank = 7
    key = "contractor_performance"

    @staticmethod
    def _first_present(df, names: list[str]) -> str | None:
        for n in names:
            if n in df.columns:
                return n
        return None

    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        df = ctx.df_repairs
        if df is None or len(df) == 0:
            return None

        contractor_col = self._first_present(df, ["ContractorName", "Contractor", "contractor_name"])
        ontime_col = self._first_present(df, ["Attended On Time", "attended_on_time", "AttendedOnTime"])
        cost_col = "TotalCost" if "TotalCost" in df.columns else None

        if not contractor_col:
            return None

        agg_kwargs = {"count": (contractor_col, "size")}
        if cost_col:
            agg_kwargs["total_cost"] = (cost_col, "sum")
            agg_kwargs["avg_cost"] = (cost_col, "mean")
        if ontime_col:
            agg_kwargs["ontime_pct"] = (
                ontime_col,
                lambda x: (x.astype(str).str.lower() == "yes").mean() * 100,
            )

        contractor_stats = df.groupby(contractor_col).agg(**agg_kwargs).sort_values("count", ascending=False)
        overall_ontime = (
            (df[ontime_col].astype(str).str.lower() == "yes").mean() * 100 if ontime_col else 0
        )
        total_cost_all = float(df[cost_col].sum()) if cost_col else 0.0

        worst_ontime = None
        if ontime_col and "ontime_pct" in contractor_stats.columns:
            high_volume = contractor_stats[contractor_stats["count"] > 100]
            if len(high_volume) > 0:
                worst_ontime = high_volume.sort_values("ontime_pct").head(1)

        desc = f"{len(contractor_stats)} contractors handle {len(df):,} repair orders."
        if overall_ontime > 0:
            desc += f" Overall on-time attendance: {overall_ontime:.1f}%."
        if total_cost_all > 0:
            desc += f" Total spend: £{total_cost_all:,.0f}."
        if worst_ontime is not None and len(worst_ontime) > 0:
            wn = worst_ontime.index[0]
            wp = worst_ontime.iloc[0].get("ontime_pct", 0)
            wc = int(worst_ontime.iloc[0]["count"])
            desc += f" Worst performer (100+ jobs): {wn} at {wp:.0f}% on-time across {wc} jobs."

        return {
            "title": "Contractor Performance Benchmarking",
            "severity": "medium",
            "icon": "👷",
            "metric": (
                f"{overall_ontime:.0f}% on-time" if overall_ontime > 0 else f"{len(contractor_stats)} contractors"
            ),
            "description": desc,
            "action": (
                "Review SLAs with underperforming contractors. Consider consolidating to "
                "fewer, better-performing contractors."
            ),
            "data_sources": ["Repairs Data", "Contractor Performance"],
        }
