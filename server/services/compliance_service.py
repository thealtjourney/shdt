"""
Compliance service — statutory regimes for English social housing.

Five regimes tracked per property:

  * gas         — annual gas safety check (Gas Safety (Installation and Use)
                  Regulations 1998). Renewed every 12 months. Failure is the
                  highest-profile compliance gap.
  * electrical  — Electrical Installation Condition Report (EICR). Renewed
                  every 5 years (Electrical Safety Standards in the Private
                  Rented Sector Regs apply equivalently in social housing).
  * fra         — Fire Risk Assessment, mandated by the Regulatory Reform
                  (Fire Safety) Order 2005 and tightened post-Grenfell.
                  Reviewed at least annually for higher-risk buildings.
  * asbestos    — Asbestos Management Survey + reinspection register. Refresh
                  every 5 years for non-domestic-style stock under CAR 2012;
                  social housing aligns to the same cadence.
  * legionella  — Water hygiene risk assessment under L8 ACOP. Reviewed at
                  least every 2 years.

Status semantics (matches DB CHECK constraint):
  compliant       — current certificate, expiry > 30 days away
  due_soon        — current certificate, expiry within 30 days
  overdue         — certificate expired or missing
  not_applicable  — regime does not apply (e.g. all-electric flat for "gas")
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


REGIME_LABELS = {
    "gas": "Gas Safety (CP12)",
    "electrical": "Electrical (EICR)",
    "fra": "Fire Risk Assessment",
    "asbestos": "Asbestos Register",
    "legionella": "Water Hygiene / Legionella",
}

REGIME_ICONS = {
    "gas": "🔥",
    "electrical": "⚡",
    "fra": "🔥",
    "asbestos": "⚠️",
    "legionella": "💧",
}

REGIME_CADENCE_MONTHS = {
    "gas": 12,
    "electrical": 60,
    "fra": 12,
    "asbestos": 60,
    "legionella": 24,
}


class ComplianceService:
    """Read-side helpers for the compliance dashboard."""

    @staticmethod
    def portfolio_summary(db: Session) -> dict[str, Any]:
        """
        Per-regime portfolio totals for the five RAG tiles.

        Returns:
            {
              "regimes": [
                {"regime": "gas", "label": "Gas Safety (CP12)", "icon": "🔥",
                 "compliant": 19400, "due_soon": 850, "overdue": 450,
                 "not_applicable": 0, "rag_status": "amber"},
                ...
              ],
              "total_properties": int,
              "overall_compliance_pct": float,
              "open_breaches": int,
            }
        """
        total_props = db.execute(
            text("SELECT COUNT(*) FROM properties")
        ).scalar_one()

        rows = db.execute(
            text(
                """
                SELECT regime,
                       COUNT(*) FILTER (WHERE status = 'compliant')      AS compliant,
                       COUNT(*) FILTER (WHERE status = 'due_soon')       AS due_soon,
                       COUNT(*) FILTER (WHERE status = 'overdue')        AS overdue,
                       COUNT(*) FILTER (WHERE status = 'not_applicable') AS not_applicable
                FROM compliance_certificates
                GROUP BY regime
                ORDER BY regime
                """
            )
        ).fetchall()

        regime_summary: list[dict[str, Any]] = []
        total_compliant = 0
        total_overdue = 0
        total_certs = 0
        for r in rows:
            regime, compliant, due_soon, overdue, not_app = r
            covered = (compliant or 0) + (due_soon or 0) + (overdue or 0) + (not_app or 0)
            rag = (
                "red" if (overdue or 0) > 0 and (overdue / max(covered, 1)) > 0.05
                else "amber" if (due_soon or 0) > 0 or (overdue or 0) > 0
                else "green"
            )
            total_compliant += compliant or 0
            total_overdue += overdue or 0
            total_certs += covered
            regime_summary.append({
                "regime": regime,
                "label": REGIME_LABELS.get(regime, regime),
                "icon": REGIME_ICONS.get(regime, "📋"),
                "cadence_months": REGIME_CADENCE_MONTHS.get(regime),
                "compliant": compliant or 0,
                "due_soon": due_soon or 0,
                "overdue": overdue or 0,
                "not_applicable": not_app or 0,
                "rag_status": rag,
            })

        overall_pct = (total_compliant / total_certs * 100) if total_certs else 0.0
        return {
            "regimes": regime_summary,
            "total_properties": total_props,
            "overall_compliance_pct": round(overall_pct, 1),
            "open_breaches": total_overdue,
        }

    @staticmethod
    def list_breaches(db: Session, regime: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """
        List properties currently in breach (overdue) — optionally for a single regime.
        """
        params: dict[str, Any] = {"limit": limit}
        regime_clause = ""
        if regime:
            regime_clause = "AND cc.regime = :regime"
            params["regime"] = regime

        rows = db.execute(
            text(
                f"""
                SELECT cc.id, cc.regime, cc.status, cc.expires_at, cc.certificate_ref, cc.issued_by,
                       p.id AS property_id, p.uprn, p.address, p.postcode, p.ward_name, p.local_authority_name
                FROM compliance_certificates cc
                JOIN properties p ON p.id = cc.property_id
                WHERE cc.status = 'overdue' {regime_clause}
                ORDER BY cc.expires_at ASC NULLS LAST
                LIMIT :limit
                """
            ),
            params,
        ).fetchall()

        return [
            {
                "certificate_id": str(r[0]),
                "regime": r[1],
                "status": r[2],
                "expires_at": r[3].isoformat() if r[3] else None,
                "certificate_ref": r[4],
                "issued_by": r[5],
                "property_id": str(r[6]),
                "uprn": r[7],
                "address": r[8],
                "postcode": r[9],
                "ward_name": r[10],
                "local_authority_name": r[11],
            }
            for r in rows
        ]

    @staticmethod
    def property_certificates(db: Session, property_id: str) -> list[dict[str, Any]]:
        """All certificates (one per regime) for a single property."""
        rows = db.execute(
            text(
                """
                SELECT regime, issued_at, expires_at, status, certificate_ref, issued_by, notes
                FROM compliance_certificates
                WHERE property_id = :pid
                ORDER BY regime
                """
            ),
            {"pid": property_id},
        ).fetchall()
        return [
            {
                "regime": r[0],
                "label": REGIME_LABELS.get(r[0], r[0]),
                "icon": REGIME_ICONS.get(r[0], "📋"),
                "issued_at": r[1].isoformat() if r[1] else None,
                "expires_at": r[2].isoformat() if r[2] else None,
                "status": r[3],
                "certificate_ref": r[4],
                "issued_by": r[5],
                "notes": r[6],
            }
            for r in rows
        ]
