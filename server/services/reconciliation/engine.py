"""
Reconciliation Engine - Core logic for data import previews, conflict detection, and application.
Handles field protection, enriched field detection, and multi-step conflict resolution.
"""

import hashlib
import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, asdict
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import JSON

from app.models import (
    DataSnapshot,
    DataChange,
    Property,
    Component,
    MaintenanceRecord,
    Tenant,
)
from app.core.config import logger


class ChangeType(str, Enum):
    INSERT = "insert"
    UPDATE = "update"
    DELETE = "delete"


class Resolution(str, Enum):
    ACCEPT_IMPORT = "accept_import"
    KEEP_CURRENT = "keep_current"
    MANUAL_OVERRIDE = "manual_override"
    PENDING = "pending"


# Fields that are enriched by the system and should never be overwritten
ENRICHED_FIELDS = {
    "property": {
        "energy_rating",
        "epc_expiry",
        "council_tax_band",
        "flood_risk_level",
        "last_surveyed",
        "calculated_age",
        "maintenance_score",
    },
    "component": {
        "age_calculated",
        "replacement_due",
        "maintenance_status",
        "condition_score",
    },
    "maintenance": {"status", "assigned_to", "completion_date", "cost_actual"},
    "tenant": {"deposit_held", "reference_checked", "right_to_rent_verified"},
}

# Fields that are safe to auto-update without conflict
SAFE_UPDATE_FIELDS = {
    "property": {"address", "postcode", "uprn", "description", "notes", "owner_name"},
    "component": {"name", "location", "description", "model_number"},
    "maintenance": {"description", "scheduled_date", "priority"},
    "tenant": {"first_name", "last_name", "email", "phone"},
}


@dataclass
class ImportRecord:
    """Single record from import file"""

    entity_type: str
    entity_id: str
    data: Dict[str, Any]
    source: str = "import"


@dataclass
class ChangeDetection:
    """Change detection result"""

    change_type: ChangeType
    field_changes: Dict[str, Tuple[Any, Any]]  # {field: (old, new)}
    conflicts: Dict[str, Dict[str, Any]]  # {field: {old, new, conflict_reason}}
    is_safe_update: bool


class ReconciliationEngine:
    """
    Core reconciliation engine for data imports.
    Provides preview, conflict detection, application, and rollback capabilities.
    """

    def __init__(self, db: Session, organisation_id: UUID, user_id: UUID):
        self.db = db
        self.organisation_id = organisation_id
        self.user_id = user_id

    def preview_import(
        self,
        file_data: List[Dict[str, Any]],
        data_type: str,
        file_name: str,
        file_hash: str,
        import_mode: str,
        data_source: str = "manual",
    ) -> DataSnapshot:
        """
        Preview import without applying changes.
        Returns snapshot with diff summary and conflict details.

        Args:
            file_data: List of records from import file
            data_type: Type of data (properties, components, maintenance, tenants)
            file_name: Original filename
            file_hash: SHA256 hash of file
            import_mode: upsert, append, or replace
            data_source: Source system identifier

        Returns:
            DataSnapshot with preview status and diff_summary
        """
        snapshot = DataSnapshot(
            organisation_id=self.organisation_id,
            data_type=data_type,
            file_name=file_name,
            file_hash=file_hash,
            record_count=len(file_data),
            imported_by=self.user_id,
            import_mode=import_mode,
            status="preview",
            data_source=data_source,
        )

        import_records = [
            ImportRecord(
                entity_type=data_type.rstrip("s"),  # properties -> property
                entity_id=record.get("id") or record.get("uprn") or record.get("code"),
                data=record,
                source=data_source,
            )
            for record in file_data
        ]

        diff_summary = {
            "total_records": len(import_records),
            "inserts": 0,
            "updates": 0,
            "updates_safe": 0,
            "updates_with_conflicts": 0,
            "deletes": 0,
            "conflicts_by_field": {},
            "enriched_field_conflicts": [],
            "manual_override_flags": [],
        }

        all_changes = []

        for record in import_records:
            existing = self._find_existing_entity(record.entity_type, record.entity_id)

            if not existing:
                # New record
                detection = ChangeDetection(
                    change_type=ChangeType.INSERT,
                    field_changes={},
                    conflicts={},
                    is_safe_update=True,
                )
                diff_summary["inserts"] += 1
                all_changes.extend(
                    self._create_change_records(
                        snapshot, record, detection, record.data
                    )
                )
            else:
                # Existing record - detect changes
                detection = self._detect_changes(
                    record.entity_type, existing, record.data
                )

                if detection.change_type == ChangeType.UPDATE:
                    if detection.conflicts:
                        diff_summary["updates_with_conflicts"] += 1
                        diff_summary["enriched_field_conflicts"].extend(
                            [
                                f"{record.entity_id}:{field}"
                                for field in detection.conflicts
                                if field in ENRICHED_FIELDS.get(record.entity_type, {})
                            ]
                        )
                    elif detection.is_safe_update:
                        diff_summary["updates_safe"] += 1

                    diff_summary["updates"] += 1

                    for field, (old, new) in detection.field_changes.items():
                        if field not in diff_summary["conflicts_by_field"]:
                            diff_summary["conflicts_by_field"][field] = 0
                        if field in detection.conflicts:
                            diff_summary["conflicts_by_field"][field] += 1

                    all_changes.extend(
                        self._create_change_records(
                            snapshot, record, detection, record.data
                        )
                    )

        snapshot.diff_summary = diff_summary
        self.db.add(snapshot)
        self.db.flush()

        # Add all change records
        self.db.add_all(all_changes)
        self.db.commit()

        logger.info(
            f"Preview created for {snapshot.id}: {diff_summary['inserts']} inserts, "
            f"{diff_summary['updates']} updates, {len(diff_summary['enriched_field_conflicts'])} conflicts"
        )

        return snapshot

    def apply_import(
        self, snapshot_id: int, resolutions: Optional[Dict[str, str]] = None
    ) -> Tuple[int, List[str]]:
        """
        Apply import changes to database.
        Uses provided conflict resolutions or applies safe updates automatically.

        Args:
            snapshot_id: DataSnapshot ID to apply
            resolutions: {change_id: resolution} mapping

        Returns:
            Tuple of (applied_count, error_messages)
        """
        snapshot = self.db.query(DataSnapshot).filter_by(id=snapshot_id).first()
        if not snapshot:
            raise ValueError(f"Snapshot {snapshot_id} not found")

        if snapshot.status != "preview":
            raise ValueError(f"Snapshot {snapshot_id} is not in preview status")

        changes = self.db.query(DataChange).filter_by(snapshot_id=snapshot_id).all()
        resolutions = resolutions or {}
        applied_count = 0
        errors = []

        for change in changes:
            try:
                resolution = resolutions.get(str(change.id), Resolution.PENDING)

                # Skip pending without resolution
                if change.is_conflict and resolution == Resolution.PENDING:
                    continue

                # Apply based on resolution
                if resolution == Resolution.ACCEPT_IMPORT:
                    self._apply_field_change(change, use_import_value=True)
                elif resolution == Resolution.KEEP_CURRENT:
                    self._apply_field_change(change, use_import_value=False)
                elif resolution == Resolution.MANUAL_OVERRIDE:
                    # Manual override captured in manual_overrides
                    override_value = snapshot.manual_overrides.get(
                        f"{change.entity_id}:{change.field_name}"
                    )
                    if override_value is not None:
                        self._apply_field_change(
                            change, use_import_value=False, override_value=override_value
                        )

                change.resolution = resolution
                change.resolved_by = self.user_id
                change.resolved_at = datetime.utcnow()
                applied_count += 1

            except Exception as e:
                errors.append(
                    f"Failed to apply change {change.id} ({change.entity_type}:"
                    f"{change.entity_id}:{change.field_name}): {str(e)}"
                )

        snapshot.status = "applied"
        self.db.commit()

        logger.info(
            f"Applied snapshot {snapshot_id}: {applied_count} changes applied, {len(errors)} errors"
        )

        return applied_count, errors

    def rollback_import(self, snapshot_id: int) -> int:
        """
        Rollback a previously applied import.
        Reverts all changes from this snapshot.

        Args:
            snapshot_id: DataSnapshot ID to rollback

        Returns:
            Number of changes reverted
        """
        snapshot = self.db.query(DataSnapshot).filter_by(id=snapshot_id).first()
        if not snapshot:
            raise ValueError(f"Snapshot {snapshot_id} not found")

        if snapshot.status != "applied":
            raise ValueError(f"Snapshot {snapshot_id} is not in applied status")

        changes = (
            self.db.query(DataChange)
            .filter_by(snapshot_id=snapshot_id, resolution=Resolution.ACCEPT_IMPORT)
            .all()
        )

        reverted = 0
        for change in changes:
            try:
                if change.change_type == ChangeType.INSERT:
                    # Delete inserted record
                    entity = self._find_existing_entity(
                        change.entity_type, change.entity_id
                    )
                    if entity:
                        self.db.delete(entity)
                elif change.change_type == ChangeType.UPDATE:
                    # Restore old value
                    self._apply_field_change(change, use_import_value=False)
                reverted += 1
            except Exception as e:
                logger.error(f"Failed to rollback change {change.id}: {str(e)}")

        snapshot.status = "rolled_back"
        self.db.commit()

        logger.info(f"Rolled back snapshot {snapshot_id}: {reverted} changes reverted")
        return reverted

    # Private helper methods

    def _find_existing_entity(self, entity_type: str, entity_id: str) -> Optional[Any]:
        """Find existing entity by type and ID"""
        model_map = {
            "property": Property,
            "component": Component,
            "maintenance": MaintenanceRecord,
            "tenant": Tenant,
        }
        model = model_map.get(entity_type)
        if not model:
            return None

        return self.db.query(model).filter(
            sa.or_(
                model.id == entity_id,
                getattr(model, "uprn", None) == entity_id,
                getattr(model, "code", None) == entity_id,
            )
        ).first()

    def _detect_changes(
        self, entity_type: str, existing: Any, new_data: Dict[str, Any]
    ) -> ChangeDetection:
        """Detect changes and identify conflicts"""
        field_changes = {}
        conflicts = {}

        for field, new_value in new_data.items():
            if not hasattr(existing, field):
                continue

            old_value = getattr(existing, field)

            if old_value != new_value:
                field_changes[field] = (old_value, new_value)

                # Check for conflict: enriched field
                if field in ENRICHED_FIELDS.get(entity_type, {}):
                    conflicts[field] = {
                        "old": old_value,
                        "new": new_value,
                        "reason": "enriched_field",
                    }

        is_safe = (
            len(conflicts) == 0
            and all(
                f in SAFE_UPDATE_FIELDS.get(entity_type, {}) for f in field_changes
            )
        )

        return ChangeDetection(
            change_type=ChangeType.UPDATE if field_changes else ChangeType.INSERT,
            field_changes=field_changes,
            conflicts=conflicts,
            is_safe_update=is_safe,
        )

    def _create_change_records(
        self,
        snapshot: DataSnapshot,
        record: ImportRecord,
        detection: ChangeDetection,
        import_data: Dict[str, Any],
    ) -> List[DataChange]:
        """Create DataChange records for audit trail"""
        changes = []

        for field, (old_value, new_value) in detection.field_changes.items():
            is_enriched = field in ENRICHED_FIELDS.get(record.entity_type, {})
            is_conflict = field in detection.conflicts

            change = DataChange(
                snapshot_id=snapshot.id,
                entity_type=record.entity_type,
                entity_id=record.entity_id,
                change_type=detection.change_type,
                field_name=field,
                old_value=str(old_value) if old_value else None,
                new_value=str(new_value) if new_value else None,
                is_conflict=is_conflict,
                is_enriched_field=is_enriched,
                resolution=Resolution.PENDING if is_conflict else None,
            )
            changes.append(change)

        return changes

    def _apply_field_change(
        self,
        change: DataChange,
        use_import_value: bool,
        override_value: Optional[Any] = None,
    ) -> None:
        """Apply a single field change to the entity"""
        entity = self._find_existing_entity(change.entity_type, change.entity_id)
        if not entity:
            return

        if override_value is not None:
            value_to_set = override_value
        elif use_import_value:
            value_to_set = change.new_value
        else:
            value_to_set = change.old_value

        setattr(entity, change.field_name, value_to_set)
        self.db.flush()
