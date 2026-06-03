"""Tests for the new insights registry."""
from __future__ import annotations

from services.insights.base import Insight, register, REGISTRY, run_all_insights


def test_registry_contains_flood_risk():
    """Importing the package registers FloodRiskInsight."""
    # Triggers the registration side effects
    import services.insights  # noqa: F401

    keys = {cls.key for cls in REGISTRY}
    assert "flood_risk" in keys


def test_register_rejects_non_insight():
    """The decorator must guard against accidental misuse."""
    import pytest

    class NotAnInsight:
        key = "x"

    with pytest.raises(TypeError):
        register(NotAnInsight)  # type: ignore[arg-type]


def test_register_rejects_empty_key():
    import pytest

    class WithoutKey(Insight):
        key = ""
        def compute(self, db):
            return None

    with pytest.raises(ValueError):
        register(WithoutKey)


def test_run_all_insights_skips_failures(monkeypatch):
    """A raising insight must not break the rest."""

    class GoodInsight(Insight):
        key = "good_one"
        rank = 1
        def compute(self, db):
            return {"title": "ok"}

    class BadInsight(Insight):
        key = "broken_one"
        rank = 2
        def compute(self, db):
            raise RuntimeError("boom")

    # Replace the registry for this test
    monkeypatch.setattr("services.insights.base.REGISTRY", [GoodInsight, BadInsight])
    results = run_all_insights(db=None)  # GoodInsight ignores db
    keys = [r["key"] for r in results]
    assert "good_one" in keys
    assert "broken_one" not in keys
