"""
Read-side helpers for the enrichment_runs audit trail.

Powers /api/enrichment/runs and the EnrichmentStatusPage. Also exposes
a manual-trigger helper that the page's "Run now" button calls.
"""
from __future__ import annotations

import os
import subprocess
import sys
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# Sources whose status the page surfaces. Order matters — controls
# rendering order on the page.
SOURCES = [
    "forecast",
    "crime",
    "flood",
    "epc",
    "postcodes",
    "broadband",
    "uprn",
    "imd",
    "census",
]


# Human-readable labels + scheduled-cadence summary for the page.
SOURCE_META: dict[str, dict[str, str]] = {
    "forecast":  {"label": "Weather forecast (Open-Meteo + EA)", "cadence": "Every 4 hours"},
    "crime":     {"label": "UK Police crime statistics",         "cadence": "Daily 03:00"},
    "flood":     {"label": "EA flood risk (rivers, sea, surface)", "cadence": "Weekly Sunday 04:00"},
    "epc":       {"label": "EPC register",                       "cadence": "Daily 02:00"},
    "postcodes": {"label": "Postcodes.io geographical context",  "cadence": "Weekly Sunday 05:00"},
    "broadband": {"label": "Ofcom broadband and utilities",      "cadence": "Monthly 1st"},
    "uprn":      {"label": "OS Open UPRN coordinates",           "cadence": "Monthly 1st"},
    "imd":       {"label": "IoD 2025 deprivation indices",       "cadence": "Annual / on release"},
    "census":    {"label": "Census 2021 demographics",           "cadence": "Manual / on release"},
}


class EnrichmentRunsService:
    """Read-side helpers — the runner module owns writes."""

    @staticmethod
    def status(db: Session) -> dict[str, Any]:
        """Latest run + summary stats per source for the dashboard tiles."""
        rows = db.execute(
            text(
                """
                SELECT source, id, status, started_at, finished_at, duration_ms,
                       triggered_by, summary, error
                FROM enrichment_latest_runs
                """
            )
        ).fetchall()
        latest_by_source = {r[0]: r for r in rows}

        # Roll-up — counts of running / failed in last 7d
        rollup_rows = db.execute(
            text(
                """
                SELECT source,
                       COUNT(*) FILTER (WHERE status = 'success') AS success_7d,
                       COUNT(*) FILTER (WHERE status = 'failed')  AS failed_7d,
                       COUNT(*) FILTER (WHERE status = 'running') AS running
                FROM enrichment_runs
                WHERE started_at > NOW() - INTERVAL '7 days'
                GROUP BY source
                """
            )
        ).fetchall()
        rollup = {r[0]: {"success_7d": r[1], "failed_7d": r[2], "running": r[3]} for r in rollup_rows}

        sources_payload = []
        for src in SOURCES:
            meta = SOURCE_META.get(src, {"label": src, "cadence": "—"})
            latest = latest_by_source.get(src)
            roll = rollup.get(src, {"success_7d": 0, "failed_7d": 0, "running": 0})
            sources_payload.append({
                "source": src,
                "label": meta["label"],
                "cadence": meta["cadence"],
                "latest": _shape_run(latest) if latest else None,
                "running_now": roll["running"] > 0,
                "success_7d": roll["success_7d"],
                "failed_7d": roll["failed_7d"],
            })

        return {
            "sources": sources_payload,
            "as_of": _utcnow_iso(),
        }

    @staticmethod
    def runs(db: Session, source: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": limit}
        clause = ""
        if source:
            clause = "WHERE source = :source"
            params["source"] = source

        rows = db.execute(
            text(
                f"""
                SELECT source, id, status, started_at, finished_at, duration_ms,
                       triggered_by, triggered_by_user, summary, error, host
                FROM enrichment_runs
                {clause}
                ORDER BY started_at DESC
                LIMIT :limit
                """
            ),
            params,
        ).fetchall()
        return [_shape_run(r) for r in rows]

    @staticmethod
    def trigger_manual(source: str, *, user: str | None = None, limit: int | None = None) -> dict[str, Any]:
        """
        Kick off an enrichment run as a background subprocess.

        In production, the page's "Run now" button POSTs here; for
        non-Azure deploys this falls through to invoking
        `python -m jobs.cli` locally. In Azure Container Apps, the
        preferred path is `az containerapp job start` from a higher-
        privileged backend — that's left as a Phase 4.1 hardening step.
        """
        if source not in SOURCES:
            raise ValueError(f"Unknown source {source!r}")

        env = os.environ.copy()
        env["JOB_TRIGGERED_BY"] = "manual"
        if user:
            env["JOB_TRIGGERED_BY_USER"] = user

        cmd = [sys.executable, "-m", "jobs.cli", "--source", source, "--triggered-by", "manual"]
        if limit is not None:
            cmd.extend(["--limit", str(limit)])

        # Detached subprocess — return immediately. The runner writes its
        # own row in enrichment_runs so the UI will pick up the run.
        subprocess.Popen(  # noqa: S603 — args are constructed from validated input
            cmd, env=env, cwd=_server_dir(),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            close_fds=True, start_new_session=True,
        )
        return {"queued": True, "source": source}


# ── helpers ────────────────────────────────────────────────────────


def _shape_run(row: Any) -> dict[str, Any]:
    """Normalise a row from enrichment_runs / enrichment_latest_runs."""
    keys = ["source", "id", "status", "started_at", "finished_at", "duration_ms",
            "triggered_by", "triggered_by_user", "summary", "error", "host"]
    # Tolerate the smaller view tuple
    values = list(row)
    while len(values) < len(keys):
        values.append(None)
    out: dict[str, Any] = dict(zip(keys, values))
    out["id"] = str(out["id"]) if out["id"] is not None else None
    out["started_at"] = out["started_at"].isoformat() if out["started_at"] else None
    out["finished_at"] = out["finished_at"].isoformat() if out["finished_at"] else None
    return out


def _server_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _utcnow_iso() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).isoformat()
