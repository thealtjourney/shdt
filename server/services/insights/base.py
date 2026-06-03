"""
Insight base class and registry.

Each strategic insight is a small class with two responsibilities:
- compute the data (`compute(ctx)`)
- shape it into the response card (`render(data)`)

A single try/except at the registry level isolates failures: one broken
insight cannot cascade and break the others.

The shared `InsightContext` is built once per request by `run_all_insights`
and contains the DB session plus pre-loaded shared data (repairs, complaints,
address mapping). Insights opt in to whichever pieces they need.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)


# ── Shared context passed to every insight ─────────────────────────


@dataclass
class InsightContext:
    """
    Bundle of shared data passed to each insight.

    Pre-loaded once per request so insights that need the same DataFrame
    or address mapping don't reload it from disk repeatedly.
    """
    db: Session
    df_repairs: Any | None = None       # pandas.DataFrame | None
    df_complaints: Any | None = None    # pandas.DataFrame | None
    addr_to_info: dict[str, dict[str, Any]] = field(default_factory=dict)


def build_context(db: Session) -> InsightContext:
    """
    Construct the shared context for one strategic-insights request.

    Loads repairs / complaints DataFrames (cached for 5 minutes by
    operational_analytics_service) and the address-to-postcode mapping.
    Failures are logged and tolerated — insights that depend on missing
    data simply return None from compute().
    """
    ctx = InsightContext(db=db)

    # Repairs / complaints (Excel-backed)
    try:
        from services.operational_analytics_service import _load_df_cached  # type: ignore
        ctx.df_repairs = _load_df_cached("Repairs by Contractor.xlsx")
    except Exception:
        log.warning("insights.context.repairs_load_failed", exc_info=True)
    try:
        from services.operational_analytics_service import _load_df_cached  # type: ignore
        ctx.df_complaints = _load_df_cached("Complaints Data 1.xlsx")
    except Exception:
        log.warning("insights.context.complaints_load_failed", exc_info=True)

    # Address → property metadata mapping (used by Excel-bound insights)
    try:
        rows = db.execute(text(
            "SELECT address, postcode, flood_risk_rivers_seas, property_type, imd_decile "
            "FROM properties "
            "WHERE postcode IS NOT NULL AND address IS NOT NULL"
        )).fetchall()
        for r in rows:
            street = str(r[0]).split(",")[0].lower().strip()
            ctx.addr_to_info[street] = {
                "postcode": r[1],
                "flood": r[2],
                "type": r[3],
                "imd_decile": r[4],
            }
    except Exception:
        log.warning("insights.context.addr_load_failed", exc_info=True)

    return ctx


# ── Insight base ───────────────────────────────────────────────────


class Insight(ABC):
    """An insight produces a single ranked card for the Strategic Insights page."""

    #: Stable rank for sorting in the UI
    rank: int = 99

    #: Stable identifier (used for logging / metrics / unit tests)
    key: str = ""

    @abstractmethod
    def compute(self, ctx: InsightContext) -> dict[str, Any] | None:
        """
        Compute this insight's data using the shared context.

        Return None if the insight cannot be computed (e.g. data not present);
        the registry will skip it without raising.
        """

    def render(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Default renderer — wraps `data` with rank/key. Override if you need
        custom formatting.
        """
        return {"rank": self.rank, "key": self.key, **data}


# ── Registry ────────────────────────────────────────────────────────
REGISTRY: list[type[Insight]] = []


def register(cls: type[Insight]) -> type[Insight]:
    """Class decorator that adds an Insight subclass to the global registry."""
    if not issubclass(cls, Insight):
        raise TypeError(f"{cls!r} must subclass Insight")
    if not cls.key:
        raise ValueError(f"{cls.__name__} must define a non-empty `key`")
    REGISTRY.append(cls)
    return cls


def run_all_insights(db: Session) -> list[dict[str, Any]]:
    """
    Run every registered insight in rank order with one shared context.

    Failures are logged and skipped — a broken insight never blocks the others.
    """
    ctx = build_context(db)
    results: list[dict[str, Any]] = []
    for cls in sorted(REGISTRY, key=lambda c: c.rank):
        instance = cls()
        try:
            data = instance.compute(ctx)
        except Exception:
            log.exception("insight.compute_failed", extra={"insight": instance.key})
            continue
        if data is None:
            log.debug("insight.no_data", extra={"insight": instance.key})
            continue
        try:
            results.append(instance.render(data))
        except Exception:
            log.exception("insight.render_failed", extra={"insight": instance.key})
    return results
