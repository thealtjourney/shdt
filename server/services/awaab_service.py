"""
Awaab's Law caseload service.

Awaab's Law (the Social Housing (Regulation) Act 2023, in force from
2025) requires social landlords to investigate damp & mould reports
within strict statutory timeframes. SHDT models this as a Kanban with
five lanes:

    reported  →  investigated  →  repair_scheduled  →  repaired  →  closed

SLA targets (default; the model accepts override per-case):

    Standard / urgent severity:
      investigation must start within 14 days of report
      repair must complete within 21 days of report
    Emergency severity:
      investigation within 24 hours
      repair within 7 days

Every state transition is recorded in awaab_case_events for an audit
trail.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


VALID_STAGES = ["reported", "investigated", "repair_scheduled", "repaired", "closed"]
VALID_SEVERITIES = ["emergency", "urgent", "standard"]

INVESTIGATION_SLA_DAYS = {"emergency": 1, "urgent": 14, "standard": 14}
REPAIR_SLA_DAYS = {"emergency": 7, "urgent": 21, "standard": 21}


class AwaabService:
    """CRUD + analytics for Awaab's Law cases."""

    # ── Reads ─────────────────────────────────────────────────

    @staticmethod
    def kanban(db: Session) -> dict[str, Any]:
        """Return cases grouped by stage for the Kanban view."""
        rows = db.execute(
            text(
                """
                SELECT ac.id, ac.property_id, ac.reported_at, ac.severity, ac.stage,
                       ac.reporter_channel, ac.description, ac.assigned_to,
                       ac.investigation_due_at, ac.repair_due_at,
                       ac.investigated_at, ac.repair_scheduled_at, ac.repaired_at,
                       ac.sla_breached, ac.sla_breach_reason,
                       p.address, p.postcode, p.ward_name
                FROM awaab_cases ac
                JOIN properties p ON p.id = ac.property_id
                ORDER BY ac.reported_at DESC
                """
            )
        ).fetchall()

        lanes: dict[str, list[dict[str, Any]]] = {s: [] for s in VALID_STAGES}
        breach_count = 0
        now = datetime.now(timezone.utc)

        for r in rows:
            (case_id, prop_id, reported_at, severity, stage, channel, desc, assigned,
             inv_due, rep_due, inv_at, sched_at, repaired_at, breached, breach_reason,
             address, postcode, ward) = r

            # Compute the live SLA state from data on the fly so freshly
            # opened cases reflect time pressure even if no flag has been set.
            inv_breach = bool(
                stage == "reported" and inv_due and inv_due < now
            )
            rep_breach = bool(
                stage in {"investigated", "repair_scheduled"} and rep_due and rep_due < now
            )
            live_breached = bool(breached) or inv_breach or rep_breach
            if live_breached and stage not in {"repaired", "closed"}:
                breach_count += 1

            lanes[stage].append({
                "id": str(case_id),
                "property_id": str(prop_id),
                "address": address,
                "postcode": postcode,
                "ward_name": ward,
                "reported_at": reported_at.isoformat() if reported_at else None,
                "severity": severity,
                "reporter_channel": channel,
                "description": desc,
                "assigned_to": assigned,
                "investigation_due_at": inv_due.isoformat() if inv_due else None,
                "repair_due_at": rep_due.isoformat() if rep_due else None,
                "investigated_at": inv_at.isoformat() if inv_at else None,
                "repair_scheduled_at": sched_at.isoformat() if sched_at else None,
                "repaired_at": repaired_at.isoformat() if repaired_at else None,
                "sla_breached": live_breached,
                "sla_breach_reason": breach_reason,
                "hours_remaining_investigation": _hours_until(inv_due, now) if stage == "reported" else None,
                "hours_remaining_repair": _hours_until(rep_due, now) if stage in {"investigated", "repair_scheduled"} else None,
            })

        return {
            "lanes": lanes,
            "totals": {stage: len(cases) for stage, cases in lanes.items()},
            "open_breaches": breach_count,
            "total_cases": sum(len(c) for c in lanes.values()),
        }

    @staticmethod
    def case(db: Session, case_id: str) -> dict[str, Any] | None:
        """Single case + its event history."""
        row = db.execute(
            text(
                """
                SELECT ac.*, p.address, p.postcode, p.ward_name, p.local_authority_name,
                       p.damp_mould_risk_score, p.damp_mould_risk_band
                FROM awaab_cases ac
                JOIN properties p ON p.id = ac.property_id
                WHERE ac.id = :cid
                """
            ),
            {"cid": case_id},
        ).mappings().first()
        if not row:
            return None

        events = db.execute(
            text(
                """
                SELECT id, event_type, from_stage, to_stage, actor, note, created_at
                FROM awaab_case_events
                WHERE case_id = :cid
                ORDER BY created_at ASC
                """
            ),
            {"cid": case_id},
        ).fetchall()

        return {
            **{k: (v.isoformat() if hasattr(v, "isoformat") else (str(v) if k == "id" or k.endswith("_id") else v)) for k, v in row.items()},
            "events": [
                {
                    "id": str(e[0]), "event_type": e[1],
                    "from_stage": e[2], "to_stage": e[3],
                    "actor": e[4], "note": e[5],
                    "created_at": e[6].isoformat() if e[6] else None,
                }
                for e in events
            ],
        }

    # ── Writes ────────────────────────────────────────────────

    @staticmethod
    def open_case(
        db: Session,
        property_id: str,
        severity: str = "standard",
        reporter_channel: str | None = None,
        description: str | None = None,
        actor: str = "system",
    ) -> dict[str, Any]:
        """Open a new case from a tenant report (or sensor signal)."""
        if severity not in VALID_SEVERITIES:
            raise ValueError(f"severity must be one of {VALID_SEVERITIES}")

        now = datetime.now(timezone.utc)
        inv_due = now + timedelta(days=INVESTIGATION_SLA_DAYS[severity])
        rep_due = now + timedelta(days=REPAIR_SLA_DAYS[severity])

        row = db.execute(
            text(
                """
                INSERT INTO awaab_cases
                  (property_id, severity, reporter_channel, description,
                   investigation_due_at, repair_due_at, stage, reported_at)
                VALUES (:pid, :sev, :chan, :desc, :inv_due, :rep_due, 'reported', NOW())
                RETURNING id, reported_at
                """
            ),
            {"pid": property_id, "sev": severity, "chan": reporter_channel,
             "desc": description, "inv_due": inv_due, "rep_due": rep_due},
        ).first()

        case_id = row[0]
        db.execute(
            text(
                """
                INSERT INTO awaab_case_events (case_id, event_type, to_stage, actor, note)
                VALUES (:cid, 'stage_change', 'reported', :actor, :note)
                """
            ),
            {"cid": case_id, "actor": actor,
             "note": f"Case opened ({severity}) via {reporter_channel or 'unknown channel'}"},
        )
        db.commit()
        return {"id": str(case_id), "stage": "reported", "reported_at": row[1].isoformat()}

    @staticmethod
    def transition(
        db: Session,
        case_id: str,
        to_stage: str,
        actor: str = "system",
        note: str | None = None,
    ) -> dict[str, Any]:
        """Move a case to a new stage with an audit event."""
        if to_stage not in VALID_STAGES:
            raise ValueError(f"to_stage must be one of {VALID_STAGES}")

        cur = db.execute(
            text("SELECT stage, severity, reported_at FROM awaab_cases WHERE id = :cid"),
            {"cid": case_id},
        ).first()
        if not cur:
            raise ValueError(f"Case {case_id} not found")
        from_stage, severity, reported_at = cur

        # Compute timestamp updates per target stage
        ts_col = {
            "investigated": "investigated_at",
            "repair_scheduled": "repair_scheduled_at",
            "repaired": "repaired_at",
            "closed": "closed_at",
        }.get(to_stage)

        if ts_col:
            db.execute(
                text(
                    f"UPDATE awaab_cases SET stage = :s, {ts_col} = NOW(), updated_at = NOW() WHERE id = :cid"
                ),
                {"s": to_stage, "cid": case_id},
            )
        else:
            db.execute(
                text("UPDATE awaab_cases SET stage = :s, updated_at = NOW() WHERE id = :cid"),
                {"s": to_stage, "cid": case_id},
            )

        db.execute(
            text(
                """
                INSERT INTO awaab_case_events (case_id, event_type, from_stage, to_stage, actor, note)
                VALUES (:cid, 'stage_change', :fr, :to, :actor, :note)
                """
            ),
            {"cid": case_id, "fr": from_stage, "to": to_stage, "actor": actor, "note": note},
        )
        db.commit()
        return {"id": case_id, "from_stage": from_stage, "to_stage": to_stage}


def _hours_until(target: datetime | None, now: datetime) -> float | None:
    if target is None:
        return None
    delta = target - now
    return round(delta.total_seconds() / 3600.0, 1)
