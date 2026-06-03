"""
Reconciliation API Router
Endpoints for data import preview, conflict resolution, and rollback operations.
"""

from typing import Dict, List, Optional
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models import DataSnapshot, DataChange, User
from app.services.reconciliation.engine import ReconciliationEngine
from app.core.config import logger


router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])


# Request/Response models
class PreviewRequest:
    """Preview import file"""
    data_type: str  # properties, components, maintenance, tenants
    import_mode: str = "upsert"  # upsert, append, replace
    data_source: Optional[str] = None


class PreviewResponse:
    """Snapshot preview with diff summary"""
    id: int
    data_type: str
    record_count: int
    imported_at: datetime
    status: str
    diff_summary: Dict


class DiffDetail:
    """Field-level change detail"""
    id: int
    entity_type: str
    entity_id: str
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    is_conflict: bool
    is_enriched_field: bool
    resolution: Optional[str]


class ConflictResolutionRequest:
    """Apply resolutions to conflicts"""
    resolutions: Dict[str, str]  # {change_id: resolution}
    manual_overrides: Optional[Dict[str, str]] = None  # {field_path: value}


@router.post("/preview", response_model=PreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    data_type: str = Query(...),
    import_mode: str = Query("upsert"),
    data_source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PreviewResponse:
    """
    Preview data import from file.
    Detects changes, conflicts, and enriched field overwrites without applying.

    Returns DataSnapshot with diff_summary containing:
    - inserts, updates, deletes counts
    - updates_safe: safe updates without conflicts
    - updates_with_conflicts: requires resolution
    - enriched_field_conflicts: list of enriched field conflicts
    - conflicts_by_field: field-level conflict counts
    """
    if data_type not in ["properties", "components", "maintenance", "tenants"]:
        raise HTTPException(status_code=400, detail="Invalid data_type")

    try:
        # Read and parse file
        contents = await file.read()
        import json
        import csv
        from io import StringIO, BytesIO

        # Detect format
        if file.filename.endswith(".json"):
            file_data = json.loads(contents.decode())
            if isinstance(file_data, dict):
                file_data = file_data.get("records", [])
        elif file.filename.endswith((".csv", ".tsv")):
            delimiter = "\t" if file.filename.endswith(".tsv") else ","
            text = contents.decode()
            reader = csv.DictReader(StringIO(text), delimiter=delimiter)
            file_data = list(reader)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        # Calculate file hash
        import hashlib
        file_hash = hashlib.sha256(contents).hexdigest()

        # Get organisation from user
        organisation_id = current_user.organisation_id

        # Create engine and preview
        engine = ReconciliationEngine(db, organisation_id, current_user.id)
        snapshot = engine.preview_import(
            file_data=file_data,
            data_type=data_type,
            file_name=file.filename,
            file_hash=file_hash,
            import_mode=import_mode,
            data_source=data_source or "manual",
        )

        return PreviewResponse(
            id=snapshot.id,
            data_type=snapshot.data_type,
            record_count=snapshot.record_count,
            imported_at=snapshot.imported_at,
            status=snapshot.status,
            diff_summary=snapshot.diff_summary,
        )

    except Exception as e:
        logger.error(f"Preview import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")


@router.get("/{snapshot_id}/diff", response_model=List[DiffDetail])
async def get_diff_details(
    snapshot_id: int,
    entity_type: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    has_conflict: Optional[bool] = Query(None),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[DiffDetail]:
    """
    Get detailed diff for snapshot.
    Can filter by entity type, change type, or conflict status.
    """
    snapshot = db.query(DataSnapshot).filter_by(id=snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    if snapshot.organisation_id != current_user.organisation_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    query = db.query(DataChange).filter_by(snapshot_id=snapshot_id)

    if entity_type:
        query = query.filter_by(entity_type=entity_type)
    if change_type:
        query = query.filter_by(change_type=change_type)
    if has_conflict is not None:
        query = query.filter_by(is_conflict=has_conflict)

    changes = query.limit(limit).all()

    return [
        DiffDetail(
            id=c.id,
            entity_type=c.entity_type,
            entity_id=c.entity_id,
            field_name=c.field_name,
            old_value=c.old_value,
            new_value=c.new_value,
            is_conflict=c.is_conflict,
            is_enriched_field=c.is_enriched_field,
            resolution=c.resolution,
        )
        for c in changes
    ]


@router.post("/{snapshot_id}/apply", response_model=Dict)
async def apply_import(
    snapshot_id: int,
    request: ConflictResolutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Apply snapshot changes with conflict resolutions.

    Resolution types:
    - accept_import: Use import value
    - keep_current: Keep existing value
    - manual_override: Use manual override from manual_overrides dict

    Returns applied_count and any error messages.
    """
    snapshot = db.query(DataSnapshot).filter_by(id=snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    if snapshot.organisation_id != current_user.organisation_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    if snapshot.status != "preview":
        raise HTTPException(
            status_code=400, detail="Snapshot must be in preview status"
        )

    try:
        engine = ReconciliationEngine(db, snapshot.organisation_id, current_user.id)

        # Store manual overrides
        if request.manual_overrides:
            snapshot.manual_overrides = request.manual_overrides

        # Apply import
        applied_count, errors = engine.apply_import(
            snapshot_id=snapshot_id, resolutions=request.resolutions
        )

        return {
            "snapshot_id": snapshot_id,
            "status": "applied",
            "applied_count": applied_count,
            "errors": errors,
            "error_count": len(errors),
        }

    except Exception as e:
        logger.error(f"Apply import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Apply failed: {str(e)}")


@router.post("/{snapshot_id}/rollback", response_model=Dict)
async def rollback_import(
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Rollback a previously applied import.
    Reverts all changes from this snapshot.
    """
    snapshot = db.query(DataSnapshot).filter_by(id=snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    if snapshot.organisation_id != current_user.organisation_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    if snapshot.status != "applied":
        raise HTTPException(
            status_code=400, detail="Snapshot must be in applied status"
        )

    try:
        engine = ReconciliationEngine(db, snapshot.organisation_id, current_user.id)
        reverted_count = engine.rollback_import(snapshot_id)

        return {
            "snapshot_id": snapshot_id,
            "status": "rolled_back",
            "reverted_count": reverted_count,
        }

    except Exception as e:
        logger.error(f"Rollback failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(e)}")


@router.get("/history", response_model=List[PreviewResponse])
async def get_reconciliation_history(
    data_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[PreviewResponse]:
    """
    Get reconciliation history for organisation.
    Ordered by most recent imports first.
    """
    query = db.query(DataSnapshot).filter_by(
        organisation_id=current_user.organisation_id
    )

    if data_type:
        query = query.filter_by(data_type=data_type)
    if status:
        query = query.filter_by(status=status)

    snapshots = query.order_by(DataSnapshot.imported_at.desc()).limit(limit).all()

    return [
        PreviewResponse(
            id=s.id,
            data_type=s.data_type,
            record_count=s.record_count,
            imported_at=s.imported_at,
            status=s.status,
            diff_summary=s.diff_summary,
        )
        for s in snapshots
    ]


@router.get("/config", response_model=Dict)
async def get_reconciliation_config(
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Get reconciliation configuration and field protection rules.
    Returns enriched fields and safe update field mappings.
    """
    from app.services.reconciliation.engine import ENRICHED_FIELDS, SAFE_UPDATE_FIELDS

    return {
        "enriched_fields": ENRICHED_FIELDS,
        "safe_update_fields": SAFE_UPDATE_FIELDS,
        "supported_types": ["properties", "components", "maintenance", "tenants"],
        "import_modes": ["upsert", "append", "replace"],
    }


@router.patch("/config", response_model=Dict)
async def update_reconciliation_config(
    enriched_fields: Optional[Dict] = None,
    safe_update_fields: Optional[Dict] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict:
    """
    Update field protection configuration.
    Admin only.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")

    # Store in organisation settings or system config
    # This is a placeholder for actual implementation
    return {
        "message": "Config updated",
        "enriched_fields": enriched_fields,
        "safe_update_fields": safe_update_fields,
    }
