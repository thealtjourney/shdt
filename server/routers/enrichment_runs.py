"""Enrichment audit-trail API for the EnrichmentStatusPage."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_session
from services.enrichment_runs_service import EnrichmentRunsService, SOURCES

router = APIRouter(prefix="/enrichment", tags=["enrichment-runs"])


@router.get("/status")
def get_status(db: Session = Depends(get_session)):
    """Per-source latest-run summary for the dashboard tiles."""
    return EnrichmentRunsService.status(db)


@router.get("/runs")
def list_runs(
    source: str | None = Query(None, description=f"Filter by source: {','.join(SOURCES)}"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_session),
):
    """Recent runs across (optionally one) source."""
    if source and source not in SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source. Valid: {SOURCES}")
    return {"runs": EnrichmentRunsService.runs(db, source=source, limit=limit)}


@router.post("/trigger")
def trigger(
    payload: dict = Body(..., examples=[{"source": "crime"}, {"source": "forecast", "limit": 50}]),
):
    """Manually kick off an enrichment run. Returns immediately; row in enrichment_runs is written by the runner."""
    source = payload.get("source")
    if not source:
        raise HTTPException(status_code=400, detail="source is required")
    if source not in SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source. Valid: {SOURCES}")
    try:
        return EnrichmentRunsService.trigger_manual(
            source,
            user=payload.get("user"),
            limit=payload.get("limit"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
