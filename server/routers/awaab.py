"""Awaab's Law caseload API."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_session
from services.awaab_service import AwaabService, VALID_SEVERITIES, VALID_STAGES

router = APIRouter(prefix="/awaab", tags=["awaab"])


@router.get("/kanban")
def kanban(db: Session = Depends(get_session)):
    """All cases grouped by stage, plus totals and breach count."""
    return AwaabService.kanban(db)


@router.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_session)):
    case = AwaabService.case(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    return case


@router.post("/cases")
def open_case(
    payload: dict = Body(..., examples=[{
        "property_id": "00000000-0000-0000-0000-000000000000",
        "severity": "standard",
        "reporter_channel": "portal",
        "description": "Tenant reports damp on bedroom wall.",
    }]),
    db: Session = Depends(get_session),
):
    pid = payload.get("property_id")
    if not pid:
        raise HTTPException(status_code=400, detail="property_id is required")
    severity = payload.get("severity", "standard")
    if severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"severity must be one of {VALID_SEVERITIES}")
    return AwaabService.open_case(
        db,
        property_id=pid,
        severity=severity,
        reporter_channel=payload.get("reporter_channel"),
        description=payload.get("description"),
        actor=payload.get("actor", "user"),
    )


@router.patch("/cases/{case_id}/stage")
def transition_case(
    case_id: str,
    payload: dict = Body(..., examples=[{"to_stage": "investigated", "actor": "surveyor", "note": "Site visit completed."}]),
    db: Session = Depends(get_session),
):
    to_stage = payload.get("to_stage")
    if to_stage not in VALID_STAGES:
        raise HTTPException(status_code=400, detail=f"to_stage must be one of {VALID_STAGES}")
    try:
        return AwaabService.transition(
            db, case_id=case_id,
            to_stage=to_stage,
            actor=payload.get("actor", "user"),
            note=payload.get("note"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
