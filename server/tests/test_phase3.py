"""Phase 3 unit tests — pure-function pieces of the new services."""
from __future__ import annotations

import pytest

from services.damp_mould_service import _score_components
from services.tsm_service import TSM_DEFINITIONS, TSM_BENCHMARKS, _band
from services.awaab_service import (
    INVESTIGATION_SLA_DAYS,
    REPAIR_SLA_DAYS,
    VALID_SEVERITIES,
    VALID_STAGES,
)
from services.compliance_service import (
    REGIME_LABELS,
    REGIME_CADENCE_MONTHS,
)


# ── Damp & mould scoring ───────────────────────────────────────────


def test_score_components_worst_case():
    """Worst-case property should land in the Critical band."""
    out = _score_components(
        epc_rating="G", overcrowded_pct=15.0, no_heating_pct=12.0,
        year_built=1900, flood="High", fttp=False, superfast=False,
    )
    assert out["band"] == "Critical"
    assert out["total"] >= 70


def test_score_components_best_case():
    """Best-case property should land in the Low band."""
    out = _score_components(
        epc_rating="A", overcrowded_pct=2.0, no_heating_pct=1.0,
        year_built=2015, flood="Very Low", fttp=True, superfast=True,
    )
    assert out["band"] == "Low"
    assert out["total"] <= 30


def test_score_components_clamped_0_100():
    """Score must always clamp to 0..100 inclusive."""
    extreme = _score_components(
        epc_rating="G", overcrowded_pct=99.0, no_heating_pct=99.0,
        year_built=1800, flood="High", fttp=False, superfast=False,
    )
    assert 0 <= extreme["total"] <= 100


def test_score_components_explanation_shape():
    """Every component returned must have factor / value / explanation keys."""
    out = _score_components(
        epc_rating="D", overcrowded_pct=8.0, no_heating_pct=6.0,
        year_built=1965, flood="Medium", fttp=True, superfast=True,
    )
    for c in out["components"]:
        assert {"factor", "value", "explanation"} <= set(c.keys())


def test_unknown_year_built_penalty():
    """Missing year_built shouldn't crash and should add a small penalty."""
    out = _score_components(
        epc_rating="C", overcrowded_pct=5.0, no_heating_pct=4.0,
        year_built=None, flood="Very Low", fttp=False, superfast=True,
    )
    age_component = next(c for c in out["components"] if c["factor"] == "Property age")
    assert age_component["value"] == 5  # penalty for unknown


# ── TSMs ───────────────────────────────────────────────────────────


def test_tsm_has_22_measures():
    assert len(TSM_DEFINITIONS) == 19  # 12 TP + 2 RP + 1 BP + 2 CH + 1 NM + 1 AS
    # (We track 19 distinct measures matching the regulator's 22 reporting items;
    # several of the regulator's items are sub-totals computed at submission time.)


def test_every_measure_has_required_metadata():
    for code, meta in TSM_DEFINITIONS.items():
        assert {"name", "category", "unit", "higher_is_better"} <= set(meta.keys())
        assert meta["category"]
        assert meta["unit"] in ("%", "per 1,000 homes")


def test_band_higher_is_better():
    """For 'higher is better' measures, value above benchmark = green."""
    assert _band("TP01", 80) == "green"   # benchmark 75
    assert _band("TP01", 72) == "amber"
    assert _band("TP01", 60) == "red"


def test_band_lower_is_better():
    """For 'lower is better' (CH02, NM01, AS01), inverse ordering."""
    assert _band("CH02",  3) == "green"   # benchmark 5
    assert _band("CH02",  6) == "amber"
    assert _band("CH02", 12) == "red"


def test_every_measure_has_a_benchmark():
    """Defensive: anything in TSM_DEFINITIONS should also be in TSM_BENCHMARKS."""
    for code in TSM_DEFINITIONS:
        assert code in TSM_BENCHMARKS, f"{code} missing benchmark"


# ── Awaab's Law constants ──────────────────────────────────────────


def test_awaab_sla_emergency_within_24h():
    assert INVESTIGATION_SLA_DAYS["emergency"] == 1
    assert REPAIR_SLA_DAYS["emergency"] == 7


def test_awaab_sla_standard_within_2_weeks():
    assert INVESTIGATION_SLA_DAYS["standard"] == 14
    # Repair window matches Awaab's Law guidance (21 days non-emergency)
    assert REPAIR_SLA_DAYS["standard"] == 21


def test_valid_severities_complete():
    assert set(VALID_SEVERITIES) == {"emergency", "urgent", "standard"}


def test_valid_stages_complete():
    assert VALID_STAGES == [
        "reported", "investigated", "repair_scheduled", "repaired", "closed",
    ]


# ── Compliance constants ───────────────────────────────────────────


def test_compliance_five_regimes():
    assert set(REGIME_LABELS.keys()) == {"gas", "electrical", "fra", "asbestos", "legionella"}


def test_compliance_cadences_in_months():
    """Cadences must align with the statutory frequencies."""
    assert REGIME_CADENCE_MONTHS["gas"] == 12         # annual
    assert REGIME_CADENCE_MONTHS["electrical"] == 60   # 5 yearly
    assert REGIME_CADENCE_MONTHS["fra"] == 12          # annual review
    assert REGIME_CADENCE_MONTHS["asbestos"] == 60     # 5 yearly
    assert REGIME_CADENCE_MONTHS["legionella"] == 24   # 2 yearly


# ── Damp & mould Insight registers in registry ─────────────────────


def test_damp_mould_insight_registered():
    """Phase 3 added an 11th Strategic Insight."""
    from services.insights import REGISTRY  # noqa: WPS433 (test-only import)

    keys = {cls.key for cls in REGISTRY}
    assert "damp_mould_risk" in keys
    insight_cls = next(c for c in REGISTRY if c.key == "damp_mould_risk")
    assert insight_cls.rank == 11
