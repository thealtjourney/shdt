"""
Strategic insights — one file per insight, registered automatically.

Each insight is a small class implementing the `Insight` interface and
registered via the `@register` decorator. The registry is walked by
`run_all_insights(db)` which builds a single shared `InsightContext` and
executes each insight in rank order with isolated error handling.

To add a new insight:

    @register
    class MyInsight(Insight):
        rank = 11
        key = "my_insight"
        def compute(self, ctx):
            ...

…then add `from . import my_insight` below.
"""
from .base import (
    Insight,
    InsightContext,
    register,
    REGISTRY,
    run_all_insights,
    build_context,
)

# Importing each insight module triggers the @register side effect.
from . import flood_risk             # noqa: F401  rank 1
from . import deprivation_profile    # noqa: F401  rank 2
from . import repair_spend           # noqa: F401  rank 3
from . import flood_repairs          # noqa: F401  rank 4
from . import vulnerable_in_flood    # noqa: F401  rank 5
from . import complaint_patterns     # noqa: F401  rank 6
from . import contractor_performance # noqa: F401  rank 7
from . import property_type_risk     # noqa: F401  rank 8
from . import tenant_vulnerability   # noqa: F401  rank 9
from . import broadband_readiness    # noqa: F401  rank 10
from . import damp_mould             # noqa: F401  rank 11

__all__ = [
    "Insight",
    "InsightContext",
    "register",
    "REGISTRY",
    "run_all_insights",
    "build_context",
]
