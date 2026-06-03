# Migrating the rest of `get_strategic_insights`

`server/services/analytics_service.py::get_strategic_insights` is currently
~500 lines covering ten insights in one method. This package extracts each
insight into its own file. Insight 1 (Flood Risk) is already extracted as a
worked example — `flood_risk.py`.

## The pattern

Every insight becomes a class decorated with `@register`:

```python
from sqlalchemy import text
from sqlalchemy.orm import Session
from .base import Insight, register

@register
class MyInsight(Insight):
    rank = 4                # display order in the UI
    key = "my_insight"      # stable identifier used in logs/metrics

    def compute(self, db: Session) -> dict | None:
        row = db.execute(text("SELECT ...")).fetchone()
        if not row:
            return None
        return {
            "title": "...",
            "severity": "high",       # critical | high | medium | info
            "icon": "🏠",
            "metric": "...",
            "description": "...",
            "action": "...",
            "data_sources": ["..."],
        }
```

Then add the import to `__init__.py`:

```python
from . import my_insight  # noqa: F401
```

That is the entire pattern. No wiring, no boilerplate — `run_all_insights`
walks the registry.

## Migration checklist

- [x] 1. Flood Risk — `flood_risk.py`
- [ ] 2. Deprivation Profile (IoD 2025) — `deprivation_profile.py`
- [ ] 3. Repair Spend Concentration — `repair_spend.py`
- [ ] 4. Flood Zone Drives Higher Repair Demand — `flood_repairs.py`
- [ ] 5. Vulnerable Residents in Flood Zones — `vulnerable_in_flood.py`
- [ ] 6. Complaint Patterns & Escalation — `complaint_patterns.py`
- [ ] 7. Contractor Performance Benchmarking — `contractor_performance.py`
- [ ] 8. Property Type Risk Profile — `property_type_risk.py`
- [ ] 9. Tenant Vulnerability Profile — `tenant_vulnerability.py`
- [ ] 10. Broadband & Digital Readiness — `broadband_readiness.py`

## How to migrate one insight at a time (zero-downtime)

1. Copy the relevant try/except block from
   `analytics_service.get_strategic_insights` into a new file in this package.
2. Reshape it into the `Insight` class skeleton above. The body of `compute`
   is the existing query; the dict you build inside the try block is the
   return value.
3. Import the new module from `__init__.py`.
4. In `analytics_service.get_strategic_insights`, **delete** the original
   try/except block for that insight. The registry now provides it.
5. Run the test suite. Compare the rendered insight cards before/after
   migration to confirm no behaviour change.

When all ten are extracted, replace the entire `get_strategic_insights`
method body with:

```python
from services.insights import run_all_insights
return {"insights": run_all_insights(db), "count": len(insights)}
```

## Why this pattern

- **Failure isolation** — already present in the original (per-insight
  try/except), but now expressed structurally rather than as a 10x
  copy-pasted block.
- **Testability** — each insight class is trivially unit-testable in
  isolation against a fixture DB.
- **Discoverability** — adding a new insight is one new file; no editing of
  a 1,600-line service.
- **Ordering** — `rank` is explicit and obvious in code review.

## Related

The same pattern applies to splitting `client/src/App.tsx`:

- One file per Insights tab under `client/src/pages/insights/`
- One file per Strategic Insight card UI under
  `client/src/pages/insights/strategic/cards/`

See the parallel demonstration in `client/src/pages/insights/strategic/`.
