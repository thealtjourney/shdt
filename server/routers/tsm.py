"""Tenant Satisfaction Measures API."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_session
from services.tsm_service import TenantSatisfactionService

router = APIRouter(prefix="/tsm", tags=["tsm"])


@router.get("/measures")
def get_measures(
    year: int | None = Query(None, description="Survey year; defaults to most recent"),
    db: Session = Depends(get_session),
):
    """All 22 TSMs with values, benchmarks, bands and year-on-year trend."""
    return TenantSatisfactionService.portfolio_measures(db, year=year)


@router.get("/regulator-return.csv")
def regulator_return_csv(
    year: int | None = Query(None),
    db: Session = Depends(get_session),
):
    """Download the TSM submission CSV in the regulator's expected shape."""
    rows = TenantSatisfactionService.regulator_return(db, year=year)
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=["measure_code", "measure_name", "year", "value", "unit", "responses"],
    )
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tsm-{rows[0]["year"] if rows else "current"}.csv"'},
    )
