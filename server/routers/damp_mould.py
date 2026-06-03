"""Damp & Mould risk API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_session
from services.damp_mould_service import DampMouldService

router = APIRouter(prefix="/damp-mould", tags=["damp-mould"])


@router.get("/heatmap")
def heatmap(db: Session = Depends(get_session)):
    """Per-ward summary for the map heatmap layer."""
    return {"wards": DampMouldService.heatmap(db)}


@router.get("/top-at-risk")
def top_at_risk(
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_session),
):
    return {"properties": DampMouldService.top_at_risk(db, limit=limit)}


@router.get("/properties/{property_id}/explain")
def explain(property_id: str, db: Session = Depends(get_session)):
    """Per-property explanation panel — score breakdown + open cases."""
    payload = DampMouldService.explain(db, property_id)
    if not payload:
        raise HTTPException(status_code=404, detail="property not found")
    return payload
