"""
Structured JSON logging for SHDT.

Designed to be ingested by Azure Application Insights / Log Analytics or any
JSON-aware log aggregator. Local development still produces readable single-line
JSON which is easy to scan with `jq`.

Every log record includes:
    - ts          (ISO8601 UTC timestamp)
    - level       (DEBUG/INFO/WARNING/ERROR/CRITICAL)
    - logger      (logger name)
    - msg         (the message)
    - request_id  (when inside a request — see middleware.py)
    - route       (when available)
    - latency_ms  (for access logs)

Use it from any module like:

    from observability import get_logger
    log = get_logger(__name__)
    log.info("something happened", extra={"property_id": pid})
"""
from __future__ import annotations

import json
import logging
import logging.config
import os
import sys
import time
from contextvars import ContextVar
from typing import Any

# Context vars set by RequestIdMiddleware so that any log call inside a
# request automatically carries the right correlation IDs.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
route_ctx: ContextVar[str | None] = ContextVar("route", default=None)
user_id_ctx: ContextVar[str | None] = ContextVar("user_id", default=None)


# Reserved attributes set on every LogRecord by the stdlib that we don't want
# to repeat in the JSON payload's `extras`.
_RESERVED = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "message", "module",
    "msecs", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}


class JsonFormatter(logging.Formatter):
    """JSON log formatter that flattens `extra={}` keys into the top-level record."""

    def __init__(self, service: str = "shdt-backend", env: str = "local") -> None:
        super().__init__()
        self.service = service
        self.env = env

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "service": self.service,
            "env": self.env,
        }

        # Pull correlation IDs from contextvars, if set
        rid = request_id_ctx.get()
        if rid:
            payload["request_id"] = rid
        route = route_ctx.get()
        if route:
            payload["route"] = route
        uid = user_id_ctx.get()
        if uid:
            payload["user_id"] = uid

        # Flatten anything passed via `extra={...}`
        for k, v in record.__dict__.items():
            if k in _RESERVED or k.startswith("_"):
                continue
            if k in payload:
                continue
            try:
                json.dumps(v)
                payload[k] = v
            except (TypeError, ValueError):
                payload[k] = repr(v)

        # Attach exception info if present
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str, ensure_ascii=False)


def _install_safe_extra_handling() -> None:
    """
    Monkey-patch ``logging.Logger._log`` so that reserved LogRecord
    attribute names passed in ``extra={...}`` are silently renamed
    instead of raising ``KeyError("Attempt to overwrite 'X' in LogRecord")``.

    Reserved names (``module``, ``filename``, ``message``, ``args``, etc.)
    collide with attributes Python sets on every LogRecord; passing them
    via ``extra`` is a common foot-gun that crashes whichever code path
    happens to log them. Rather than asking every caller to remember the
    list, we prefix any reserved key with ``x_`` before the underlying
    logger sees it.

    Idempotent: subsequent calls are no-ops.
    """
    if getattr(logging.Logger._log, "_shdt_safe", False):
        return

    original_log = logging.Logger._log

    def safe_log(self, level, msg, args, exc_info=None, extra=None, **kw):
        if extra:
            extra = {
                (f"x_{k}" if k in _RESERVED or k in ("message", "asctime") else k): v
                for k, v in extra.items()
            }
        return original_log(self, level, msg, args, exc_info=exc_info, extra=extra, **kw)

    safe_log._shdt_safe = True  # type: ignore[attr-defined]
    logging.Logger._log = safe_log  # type: ignore[method-assign]


def configure_logging(
    level: str | None = None,
    *,
    service: str = "shdt-backend",
    env: str | None = None,
) -> None:
    """
    Configure root + uvicorn loggers to emit JSON to stdout.

    Idempotent — safe to call multiple times.
    """
    # Install the safe-extra patch first so even errors raised during
    # configuration use the protected logger machinery.
    _install_safe_extra_handling()

    log_level = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    deployed_env = env or os.getenv("DEPLOY_ENV", "local")

    formatter = JsonFormatter(service=service, env=deployed_env)
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(formatter)

    # Configure the root logger
    root = logging.getLogger()
    root.setLevel(log_level)
    # Remove any pre-existing handlers to avoid duplicate emission
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)

    # Quieten noisy third parties; raise to DEBUG via env var if needed
    for noisy in ("uvicorn.access", "watchfiles.main", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel("WARNING")

    # Make uvicorn logs use our formatter too
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False


def get_logger(name: str) -> logging.Logger:
    """Convenience wrapper so call sites do not import logging directly."""
    return logging.getLogger(name)
