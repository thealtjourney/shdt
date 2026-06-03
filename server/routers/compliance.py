"""Compliance API — backs the Compliance dashboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_session
from services.compliance_service import ComplianceService

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.get("/summary")
def get_summary(db: Session = Depends(get_session)):
    """Five-tile RAG summary of statutory compliance regimes."""
    return ComplianceService.portfolio_summary(db)


@router.get("/breaches")
def list_breaches(
    regime: str | None = Query(None, description="Filter by regime: gas|electrical|fra|asbestos|legionella"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_session),
):
    """Properties currently in breach — drill-down list."""
    return ComplianceService.list_breaches(db, regime=regime, limit=limit)


@router.get("/properties/{property_id}")
def get_property_certificates(property_id: str, db: Session = Depends(get_session)):
    """All certificates for a single property."""
    return {
        "property_id": property_id,
        "certificates": ComplianceService.property_certificates(db, property_id),
    }
