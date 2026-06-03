"""
Damp & Mould risk service.

Wraps the score (already computed in the Phase 3 Alembic migration) with
the per-property explanation panel and the rescore endpoint.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# Same weights as the Alembic seed query — kept in sync so a rescore
# produces the same numbers as the initial seed.
def _score_components(
    epc_rating: str | None,
    overcrowded_pct: float | None,
    no_heating_pct: float | None,
    year_built: int | None,
    flood: str | None,
    fttp: bool | None,
    superfast: bool | None,
) -> dict[str, Any]:
    """Return component contributions and total. Pure function — easy to test."""
    components: list[dict[str, Any]] = []

    components.append({
        "factor": "Base risk",
        "value": 15,
        "explanation": "Every property starts with a baseline residual risk.",
    })

    epc_pen = {"G": 40, "F": 30, "E": 20, "D": 10}.get(epc_rating or "", 0)
    components.append({
        "factor": "EPC rating",
        "value": epc_pen,
        "explanation": f"Rating {epc_rating or 'unknown'}: lower-rated homes lose more heat and condense moisture inside, raising mould risk.",
    })

    over_pen = 0
    if overcrowded_pct and overcrowded_pct > 6:
        over_pen = min(15, round((overcrowded_pct - 6) * 1.5))
    components.append({
        "factor": "Overcrowding (LSOA)",
        "value": over_pen,
        "explanation": f"LSOA overcrowded rate {overcrowded_pct or 0:.1f}%. More occupants per room → more moisture from breathing, washing and cooking.",
    })

    heat_pen = 0
    if no_heating_pct and no_heating_pct > 5:
        heat_pen = min(10, round((no_heating_pct - 5) * 1.0))
    components.append({
        "factor": "Heating reliability",
        "value": heat_pen,
        "explanation": f"LSOA without central heating {no_heating_pct or 0:.1f}%. Inadequate heating → cold surfaces → condensation.",
    })

    age_pen = 0
    if year_built is None:
        age_pen = 5
    elif year_built < 1945:
        age_pen = 10
    elif year_built < 1980:
        age_pen = 5
    components.append({
        "factor": "Property age",
        "value": age_pen,
        "explanation": f"Built {year_built or 'unknown'}: older fabric typically has poorer thermal envelope and ventilation.",
    })

    flood_pen = {"High": 8, "Medium": 4}.get(flood or "", 0)
    components.append({
        "factor": "Flood risk",
        "value": flood_pen,
        "explanation": f"River/sea flood risk {flood or 'Very Low'}: standing water + slow drying out raises persistent damp risk.",
    })

    bb_bonus = -3 if (fttp and superfast) else 0
    components.append({
        "factor": "Connectivity bonus",
        "value": bb_bonus,
        "explanation": "Full-fibre + superfast broadband enables IoT damp/humidity sensors and remote heating control. Slight risk reduction.",
    })

    raw = sum(c["value"] for c in components)
    score = max(0, min(100, raw))
    band = (
        "Critical" if score >= 70
        else "High" if score >= 50
        else "Medium" if score >= 30
        else "Low"
    )
    return {"components": components, "total": score, "band": band}


class DampMouldService:
    @staticmethod
    def explain(db: Session, property_id: str) -> dict[str, Any] | None:
        """Per-property risk score with full explanation panel."""
        row = db.execute(
            text(
                """
                SELECT id, address, postcode, ward_name, local_authority_name,
                       epc_rating, year_built, flood_risk_rivers_seas,
                       census_overcrowded_pct, census_no_central_heating_pct,
                       broadband_fttp_available, broadband_superfast_available,
                       damp_mould_risk_score, damp_mould_risk_band, damp_mould_assessed_at
                FROM properties
                WHERE id = :pid
                """
            ),
            {"pid": property_id},
        ).first()
        if not row:
            return None
        (pid, address, postcode, ward, la,
         epc, year_built, flood,
         overcrowded, no_heating, fttp, superfast,
         score, band, assessed_at) = row

        breakdown = _score_components(
            epc_rating=epc,
            overcrowded_pct=float(overcrowded) if overcrowded is not None else None,
            no_heating_pct=float(no_heating) if no_heating is not None else None,
            year_built=year_built,
            flood=flood,
            fttp=fttp, superfast=superfast,
        )

        # Open Awaab cases on this property
        cases = db.execute(
            text(
                """
                SELECT id, stage, severity, reported_at
                FROM awaab_cases
                WHERE property_id = :pid AND stage NOT IN ('repaired','closed')
                ORDER BY reported_at DESC
                """
            ),
            {"pid": property_id},
        ).fetchall()

        return {
            "property": {
                "id": str(pid),
                "address": address,
                "postcode": postcode,
                "ward_name": ward,
                "local_authority_name": la,
            },
            "score": float(score) if score is not None else None,
            "band": band,
            "assessed_at": assessed_at.isoformat() if assessed_at else None,
            "explanation": breakdown,
            "open_cases": [
                {"id": str(c[0]), "stage": c[1], "severity": c[2],
                 "reported_at": c[3].isoformat() if c[3] else None}
                for c in cases
            ],
        }

    @staticmethod
    def heatmap(db: Session) -> list[dict[str, Any]]:
        """Per-ward summary for the map heatmap layer."""
        rows = db.execute(
            text(
                """
                SELECT ward_code, ward_name, local_authority_name,
                       COUNT(*) AS properties,
                       AVG(damp_mould_risk_score)::numeric(5,2) AS avg_score,
                       COUNT(*) FILTER (WHERE damp_mould_risk_band IN ('High','Critical')) AS at_risk
                FROM properties
                WHERE damp_mould_risk_score IS NOT NULL AND ward_code IS NOT NULL
                GROUP BY ward_code, ward_name, local_authority_name
                ORDER BY avg_score DESC
                """
            )
        ).fetchall()
        return [
            {
                "ward_code": r[0], "ward_name": r[1], "local_authority_name": r[2],
                "properties": int(r[3]),
                "avg_score": float(r[4]),
                "at_risk": int(r[5]),
            }
            for r in rows
        ]

    @staticmethod
    def top_at_risk(db: Session, limit: int = 25) -> list[dict[str, Any]]:
        rows = db.execute(
            text(
                """
                SELECT id, address, postcode, ward_name,
                       damp_mould_risk_score, damp_mould_risk_band
                FROM properties
                WHERE damp_mould_risk_score IS NOT NULL
                ORDER BY damp_mould_risk_score DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).fetchall()
        return [
            {
                "id": str(r[0]), "address": r[1], "postcode": r[2], "ward_name": r[3],
                "score": float(r[4]), "band": r[5],
            }
            for r in rows
        ]
