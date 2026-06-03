"""
Job runner — wraps every scheduled enrichment script with consistent
audit trail, locking, error handling and signal-safe shutdown.

Responsibilities:
  1. Open a row in `enrichment_runs` with status='running'.
  2. Acquire a Postgres advisory lock keyed on (source) so two instances
     of the same job never run simultaneously — important when manual
     triggers race against the cron schedule.
  3. Configure structured JSON logging (delegated to observability).
  4. Install a SIGTERM handler so Container Apps Jobs can drain cleanly.
  5. Run the wrapped function. Whatever dict it returns becomes the
     `summary` column on the run record.
  6. On exception: capture error + traceback, mark the run as 'failed',
     re-raise so Container Apps marks the job as failed.
  7. Always release the lock and update the row, even on SIGTERM.

Exit codes:
    0 — success
    1 — uncaught exception
    2 — could not acquire lock (another instance is running)
   130 — cancelled by SIGTERM / SIGINT
"""
from __future__ import annotations

import datetime as dt
import functools
import hashlib
import json
import logging
import os
import signal
import socket
import sys
import time
import traceback
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Iterator

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

# Canonical list of enrichment sources. Each Container Apps Job uses one
# of these as its `source` parameter; the runner persists it on every row.
JOB_SOURCES = (
    "postcodes",
    "imd",
    "census",
    "broadband",
    "crime",
    "flood",
    "epc",
    "uprn",
    "forecast",
    "all",
)


@dataclass
class JobContext:
    """State the runner threads through one execution."""
    run_id: str
    source: str
    triggered_by: str
    started_at: dt.datetime
    log: logging.Logger
    summary: dict[str, Any]
    cancelled: bool


# ── Module state for the signal handler ─────────────────────────────
_active_context: JobContext | None = None


def _sigterm_handler(signum: int, _frame: Any) -> None:
    """Mark the in-flight run as cancelled and exit with code 130."""
    sig_name = signal.Signals(signum).name
    if _active_context is not None:
        _active_context.cancelled = True
        _active_context.log.warning(
            "job.cancelled",
            extra={"signal": sig_name, "source": _active_context.source},
        )
    sys.exit(130)


# ── Postgres advisory lock ─────────────────────────────────────────


def _lock_key(source: str) -> int:
    """
    Stable 63-bit signed int derived from the source name. Postgres
    advisory locks take a bigint so we hash the source and truncate.
    """
    digest = hashlib.sha256(source.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


@contextmanager
def _advisory_lock(engine: Engine, source: str, log: logging.Logger) -> Iterator[bool]:
    """
    Try to acquire a session-scoped advisory lock on `source`. Yields True
    if acquired, False otherwise. Releases on context exit (and also at
    connection close as a safety net).
    """
    key = _lock_key(source)
    conn = engine.raw_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT pg_try_advisory_lock(%s)", (key,))
        acquired = bool(cur.fetchone()[0])
        if not acquired:
            log.warning("job.lock_busy", extra={"source": source})
            yield False
            return
        log.info("job.lock_acquired", extra={"source": source})
        try:
            yield True
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s)", (key,))
            conn.commit()
            log.info("job.lock_released", extra={"source": source})
    finally:
        conn.close()


# ── Run-record CRUD ─────────────────────────────────────────────────


def _open_run(session: Session, ctx: JobContext) -> None:
    session.execute(
        text(
            """
            INSERT INTO enrichment_runs
              (id, source, triggered_by, status, started_at, host, git_commit)
            VALUES (:id, :source, :trig, 'running', :started, :host, :commit)
            """
        ),
        {
            "id": ctx.run_id,
            "source": ctx.source,
            "trig": ctx.triggered_by,
            "started": ctx.started_at,
            "host": socket.gethostname()[:128],
            "commit": (os.environ.get("GIT_COMMIT") or "unknown")[:40],
        },
    )
    session.commit()


def _close_run(
    session: Session,
    ctx: JobContext,
    *,
    status: str,
    error: str | None = None,
    tb: str | None = None,
) -> None:
    finished_at = dt.datetime.now(dt.timezone.utc)
    duration_ms = int((finished_at - ctx.started_at).total_seconds() * 1000)
    session.execute(
        text(
            """
            UPDATE enrichment_runs
            SET status = :status,
                finished_at = :finished,
                duration_ms = :duration,
                summary = :summary,
                error = :error,
                traceback = :tb
            WHERE id = :id
            """
        ),
        {
            "id": ctx.run_id,
            "status": status,
            "finished": finished_at,
            "duration": duration_ms,
            "summary": json.dumps(ctx.summary) if ctx.summary else None,
            "error": (error or "")[:1000] or None,
            "tb": tb,
        },
    )
    session.commit()


# ── The decorator ──────────────────────────────────────────────────


def run_job(
    source: str,
    *,
    triggered_by: str | None = None,
    require_lock: bool = True,
) -> Callable[[Callable[..., Any]], Callable[..., int]]:
    """
    Decorator: wrap a `main()` function with the runner.

    The decorated function should return a dict (or None) — whatever it
    returns is persisted as the `summary` column on the run row. Logs
    written via standard `logging` are emitted as structured JSON via the
    observability layer.

    `triggered_by` defaults to the value of the JOB_TRIGGERED_BY env var
    (which Container Apps Jobs sets per execution context) or 'schedule'.

    Set `require_lock=False` for read-only jobs that can safely run in
    parallel.
    """
    if source not in JOB_SOURCES:
        raise ValueError(f"Unknown source {source!r}; add it to JOB_SOURCES.")

    def decorator(fn: Callable[..., Any]) -> Callable[..., int]:
        @functools.wraps(fn)
        def wrapped(*args: Any, **kwargs: Any) -> int:
            global _active_context

            # Local imports so that simply importing this module does not
            # eagerly initialise the database engine (matters for tests).
            from observability import configure_logging  # type: ignore
            from database import engine, SessionLocal  # type: ignore

            configure_logging(service="shdt-job", env=os.environ.get("DEPLOY_ENV", "local"))
            log = logging.getLogger(f"shdt.job.{source}")

            ctx = JobContext(
                run_id=str(uuid.uuid4()),
                source=source,
                triggered_by=(triggered_by or os.environ.get("JOB_TRIGGERED_BY") or "schedule"),
                started_at=dt.datetime.now(dt.timezone.utc),
                log=log,
                summary={},
                cancelled=False,
            )
            _active_context = ctx

            signal.signal(signal.SIGTERM, _sigterm_handler)
            signal.signal(signal.SIGINT, _sigterm_handler)

            log.info(
                "job.starting",
                extra={"source": source, "run_id": ctx.run_id, "triggered_by": ctx.triggered_by},
            )

            session = SessionLocal()
            try:
                _open_run(session, ctx)
            finally:
                session.close()

            exit_code = 0
            error_msg: str | None = None
            tb_text: str | None = None

            try:
                if require_lock:
                    with _advisory_lock(engine, source, log) as acquired:
                        if not acquired:
                            error_msg = f"another {source} job is already running"
                            log.warning("job.skipped_lock_busy", extra={"source": source})
                            exit_code = 2
                        else:
                            t0 = time.perf_counter()
                            result = fn(ctx, *args, **kwargs)
                            elapsed = round(time.perf_counter() - t0, 2)
                            if isinstance(result, dict):
                                ctx.summary = {**result, "elapsed_seconds": elapsed}
                            else:
                                ctx.summary = {"elapsed_seconds": elapsed}
                else:
                    t0 = time.perf_counter()
                    result = fn(ctx, *args, **kwargs)
                    elapsed = round(time.perf_counter() - t0, 2)
                    if isinstance(result, dict):
                        ctx.summary = {**result, "elapsed_seconds": elapsed}
                    else:
                        ctx.summary = {"elapsed_seconds": elapsed}
            except SystemExit:
                # SIGTERM handler raised; let it propagate after status update
                exit_code = 130
                raise
            except Exception as exc:  # noqa: BLE001 — broad on purpose
                exit_code = 1
                error_msg = str(exc)
                tb_text = traceback.format_exc()
                log.exception(
                    "job.failed",
                    extra={"source": source, "run_id": ctx.run_id},
                )
            finally:
                # Always update the row, even on cancellation
                final_status = (
                    "cancelled" if ctx.cancelled
                    else "failed" if exit_code != 0
                    else "success"
                )
                close_session = SessionLocal()
                try:
                    _close_run(
                        close_session, ctx,
                        status=final_status,
                        error=error_msg,
                        tb=tb_text,
                    )
                except Exception:  # pragma: no cover — last-ditch
                    log.exception("job.failed_to_close_run", extra={"source": source})
                finally:
                    close_session.close()
                _active_context = None

            log.info(
                "job.finished",
                extra={
                    "source": source,
                    "run_id": ctx.run_id,
                    "status": final_status,
                    "exit_code": exit_code,
                    "summary": ctx.summary,
                },
            )
            return exit_code

        return wrapped

    return decorator
