"""
ASGI middleware:
- RequestIdMiddleware: attaches an X-Request-ID to every request and binds it
  into the logging contextvars so structured logs carry it automatically.
- AccessLogMiddleware: emits one JSON access-log line per request with route,
  status, latency_ms.
"""
from __future__ import annotations

import time
import uuid
import logging
from typing import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

from .logging_config import request_id_ctx, route_ctx

log = logging.getLogger("shdt.access")

CallNext = Callable[[Request], Awaitable[Response]]


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Set / propagate X-Request-ID. Generated as a short UUID4 if absent."""

    HEADER = "X-Request-ID"

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        rid = request.headers.get(self.HEADER) or uuid.uuid4().hex[:16]
        token_rid = request_id_ctx.set(rid)
        # Try to set the route name (can be None for unknown routes)
        try:
            route = request.scope.get("route")
            route_name = getattr(route, "path", None) or request.url.path
        except Exception:  # pragma: no cover - defensive
            route_name = request.url.path
        token_route = route_ctx.set(route_name)
        try:
            response = await call_next(request)
            response.headers[self.HEADER] = rid
            return response
        finally:
            request_id_ctx.reset(token_rid)
            route_ctx.reset(token_route)


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Emit one structured access log per request."""

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            log.info(
                "access",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                    "latency_ms": latency_ms,
                    "client": request.client.host if request.client else None,
                },
            )
