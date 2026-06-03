"""
Single CLI entry point for Container Apps Jobs.

Container Apps Jobs are configured to run:

    python -m jobs.cli --source <source> [--limit N]

This dispatcher imports the right enrich_*.py script lazily, runs its
entry function under the @run_job decorator (so audit trail + locking +
SIGTERM handling are all consistent across every source), and exits with
the runner's exit code.

Usage:

    # From CLI / a Container Apps Job
    python -m jobs.cli --source crime
    python -m jobs.cli --source forecast --limit 100

    # As a Python import
    from jobs.cli import dispatch
    rc = dispatch("forecast")

The legacy `python enrich_crime.py` invocation continues to work
unchanged — this dispatcher is additive.
"""
from __future__ import annotations

import argparse
import importlib
import logging
import sys
from typing import Any

from .runner import JOB_SOURCES, run_job


log = logging.getLogger(__name__)


# Map each source to (module_name, callable_name).
# Most scripts have a top-level `run_enrichment` or `main` function — we
# centralise the routing here so the per-script files stay untouched.
_SOURCE_ENTRY: dict[str, tuple[str, str]] = {
    "postcodes": ("enrich_postcodes", "main"),
    "imd":       ("enrich_imd", "main"),
    "census":    ("enrich_census", "main"),
    "broadband": ("enrich_broadband", "main"),
    "crime":     ("enrich_crime", "run_enrichment"),
    "flood":     ("enrich_flood", "run_enrichment"),
    "epc":       ("enrich_epc", "main"),
    "uprn":      ("enrich_uprn", "main"),
    "forecast":  ("enrich_forecast", "run_enrichment"),
    "all":       ("enrich_all", "main"),
}


def dispatch(source: str, **kwargs: Any) -> int:
    """
    Run the named enrichment under the runner.

    `**kwargs` are forwarded to the underlying entry function (e.g. limit).
    Returns the runner's exit code (0 success, 1 error, 2 lock busy,
    130 cancelled).
    """
    if source not in JOB_SOURCES:
        raise ValueError(f"Unknown source {source!r}. Valid: {JOB_SOURCES}")
    if source not in _SOURCE_ENTRY:
        raise NotImplementedError(
            f"Source {source!r} has no dispatch entry yet — add it to _SOURCE_ENTRY."
        )

    module_name, fn_name = _SOURCE_ENTRY[source]

    @run_job(source)
    def _runner(ctx, **inner_kwargs: Any) -> dict[str, Any]:
        # Note: never use 'module' as an extra key — it's a reserved
        # LogRecord attribute and Python's logging library will refuse it.
        ctx.log.info(
            "dispatch.invoking_legacy_entry",
            extra={
                "target_module": module_name,
                "target_fn": fn_name,
                "kwargs": list(inner_kwargs.keys()),
            },
        )
        module = importlib.import_module(module_name)
        fn = getattr(module, fn_name)
        # Call the legacy entry. It may or may not return a dict; normalise.
        result = fn(**inner_kwargs)
        if isinstance(result, dict):
            return result
        return {"completed": True}

    return _runner(**kwargs)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="SHDT scheduled enrichment runner (used by Container Apps Jobs).",
    )
    parser.add_argument(
        "--source",
        required=True,
        choices=sorted(_SOURCE_ENTRY.keys()),
        help="Which enrichment source to run.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit forwarded to the enrichment script.",
    )
    parser.add_argument(
        "--triggered-by",
        choices=("schedule", "manual", "api"),
        default=None,
        help="Override JOB_TRIGGERED_BY for this run.",
    )
    args = parser.parse_args(argv)

    import os
    if args.triggered_by:
        os.environ["JOB_TRIGGERED_BY"] = args.triggered_by

    kwargs: dict[str, Any] = {}
    if args.limit is not None:
        kwargs["limit"] = args.limit

    return dispatch(args.source, **kwargs)


if __name__ == "__main__":
    sys.exit(main())
