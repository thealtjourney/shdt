"""
Components Router
API endpoints for component CRUD, inspections, replacements, and portfolio summaries.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

from sqlalchemy import text

from database import get_db
from services.digital_twin import (
    ComponentSeeder,
    ComponentLifecycleService,
    ComponentPredictor
)

router = APIRouter(prefix="/api/components", tags=["components"])


# COMPONENT CRUD ENDPOINTS

@router.get("/properties/{property_id}")
def get_property_components(property_id: str, db: Session = Depends(get_db)):
    """Get all components for a property."""
    try:
        components = db.execute(
            text("""
                SELECT
                    pc.id, pc.property_id, pc.component_type_id, pc.installation_date,
                    pc.condition_score, pc.condition_last_assessed, pc.remaining_life_years,
                    pc.replacement_priority_score, pc.status,
                    ct.name, ct.category, ct.criticality, ct.expected_lifespan_years
                FROM property_components pc
                JOIN component_types ct ON pc.component_type_id = ct.id
                WHERE pc.property_id = :prop_id
                ORDER BY ct.criticality DESC, pc.replacement_priority_score DESC
            """),
            {"prop_id": property_id}
        ).fetchall()

        result = []
        for row in components:
            result.append({
                'id': row[0],
                'property_id': row[1],
                'component_type_id': row[2],
                'installation_date': row[3].isoformat() if row[3] else None,
                'condition_score': row[4],
                'condition_last_assessed': row[5].isoformat() if row[5] else None,
                'remaining_life_years': round(row[6], 1) if row[6] else None,
                'replacement_priority_score': round(row[7], 1) if row[7] else None,
                'status': row[8],
                'component_name': row[9],
                'category': row[10],
                'criticality': row[11],
                'expected_lifespan_years': row[12]
            })

        return {'data': result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{component_id}")
def get_component(component_id: str, db: Session = Depends(get_db)):
    """Get single component details."""
    try:
        component = db.execute(
            text("""
                SELECT
                    pc.id, pc.property_id, pc.component_type_id, pc.installation_date,
                    pc.installation_date_confidence, pc.manufacturer, pc.model,
                    pc.condition_score, pc.condition_last_assessed, pc.condition_notes,
                    pc.remaining_life_years, pc.predicted_failure_date,
                    pc.predicted_failure_confidence, pc.replacement_priority_score,
                    pc.last_maintained, pc.next_maintenance_due, pc.status,
                    pc.specification,
                    ct.name, ct.category, ct.criticality, ct.expected_lifespan_years,
                    ct.replacement_cost_low, ct.replacement_cost_mid, ct.replacement_cost_high
                FROM property_components pc
                JOIN component_types ct ON pc.component_type_id = ct.id
                WHERE pc.id = :comp_id
            """),
            {"comp_id": component_id}
        ).first()

        if not component:
            raise HTTPException(status_code=404, detail="Component not found")

        return {
            'data': {
                'id': component[0],
                'property_id': component[1],
                'component_type_id': component[2],
                'installation_date': component[3].isoformat() if component[3] else None,
                'installation_date_confidence': component[4],
                'manufacturer': component[5],
                'model': component[6],
                'condition_score': component[7],
                'condition_last_assessed': component[8].isoformat() if component[8] else None,
                'condition_notes': component[9],
                'remaining_life_years': round(component[10], 1) if component[10] else None,
                'predicted_failure_date': component[11].isoformat() if component[11] else None,
                'predicted_failure_confidence': round(component[12], 3) if component[12] else None,
                'replacement_priority_score': round(component[13], 1) if component[13] else None,
                'last_maintained': component[14].isoformat() if component[14] else None,
                'next_maintenance_due': component[15].isoformat() if component[15] else None,
                'status': component[16],
                'specification': component[17] or {},
                'component_name': component[18],
                'category': component[19],
                'criticality': component[20],
                'expected_lifespan_years': component[21],
                'replacement_costs': {
                    'low': component[22],
                    'mid': component[23],
                    'high': component[24]
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{component_id}/inspections")
def record_inspection(component_id: str,
                     condition_score: int = Body(..., embed=True),
                     notes: Optional[str] = Body(None, embed=True),
                     photos: Optional[List[str]] = Body(None, embed=True),
                     defects: Optional[Dict] = Body(None, embed=True),
                     inspector: Optional[str] = Body(None, embed=True),
                     db: Session = Depends(get_db)):
    """Record a new component inspection."""
    try:
        if condition_score < 1 or condition_score > 5:
            raise HTTPException(status_code=400, detail="Condition score must be 1-5")

        inspection_id = str(uuid.uuid4())

        db.execute(
            text("""
                INSERT INTO component_inspections
                (id, component_id, inspection_date, inspector, condition_score, notes, photos, defects_found)
                VALUES (:id, :comp_id, CURRENT_TIMESTAMP, :inspector, :score, :notes, :photos::text[], :defects::jsonb)
            """),
            {
                "id": inspection_id,
                "comp_id": component_id,
                "inspector": inspector,
                "score": condition_score,
                "notes": notes,
                "photos": photos or [],
                "defects": defects or {}
            }
        )

        # Update component condition
        db.execute(
            text("""
                UPDATE property_components
                SET condition_score = :score,
                    condition_last_assessed = CURRENT_TIMESTAMP,
                    condition_notes = :notes,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :comp_id
            """),
            {
                "comp_id": component_id,
                "score": condition_score,
                "notes": notes
            }
        )

        db.commit()

        return {
            'id': inspection_id,
            'component_id': component_id,
            'inspection_date': datetime.utcnow().isoformat(),
            'condition_score': condition_score,
            'message': 'Inspection recorded successfully'
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{component_id}/inspections")
def get_component_inspections(component_id: str,
                             limit: int = Query(10, ge=1, le=100),
                             db: Session = Depends(get_db)):
    """Get inspection history for a component."""
    try:
        inspections = db.execute(
            text("""
                SELECT id, inspection_date, inspector, condition_score, notes, photos, defects_found
                FROM component_inspections
                WHERE component_id = :comp_id
                ORDER BY inspection_date DESC
                LIMIT :limit
            """),
            {"comp_id": component_id, "limit": limit}
        ).fetchall()

        result = []
        for row in inspections:
            result.append({
                'id': row[0],
                'inspection_date': row[1].isoformat() if row[1] else None,
                'inspector': row[2],
                'condition_score': row[3],
                'notes': row[4],
                'photos': row[5] or [],
                'defects_found': row[6] or {}
            })

        return {'data': result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{component_id}/replace")
def record_replacement(component_id: str,
                      replacement_type: str = Body(..., embed=True),
                      cost: Optional[float] = Body(None, embed=True),
                      notes: Optional[str] = Body(None, embed=True),
                      db: Session = Depends(get_db)):
    """Record component replacement and create new component instance."""
    try:
        # Get original component
        component = db.execute(
            text("""
                SELECT property_id, component_type_id, organisation_id
                FROM property_components WHERE id = :comp_id
            """),
            {"comp_id": component_id}
        ).first()

        if not component:
            raise HTTPException(status_code=404, detail="Component not found")

        prop_id, comp_type_id, org_id = component

        # Create new component instance
        new_comp_id = str(uuid.uuid4())
        db.execute(
            text("""
                INSERT INTO property_components
                (id, property_id, component_type_id, installation_date,
                 status, replaced_by_id, organisation_id)
                VALUES (:id, :prop_id, :comp_type_id, CURRENT_TIMESTAMP,
                        'active', NULL, :org_id)
            """),
            {
                "id": new_comp_id,
                "prop_id": prop_id,
                "comp_type_id": comp_type_id,
                "org_id": org_id
            }
        )

        # Update old component as replaced
        db.execute(
            text("""
                UPDATE property_components
                SET status = 'replaced', replaced_by_id = :new_comp_id,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :comp_id
            """),
            {"comp_id": component_id, "new_comp_id": new_comp_id}
        )

        # Log maintenance record if cost provided
        if cost:
            maint_id = str(uuid.uuid4())
            db.execute(
                text("""
                    INSERT INTO maintenance_records
                    (id, property_id, component_id, reported_date, completed_date,
                     category, description, cost, status, organisation_id)
                    VALUES (:id, :prop_id, :comp_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                            'replacement', :desc, :cost, 'completed', :org_id)
                """),
                {
                    "id": maint_id,
                    "prop_id": prop_id,
                    "comp_id": component_id,
                    "desc": replacement_type,
                    "cost": cost,
                    "org_id": org_id
                }
            )

        db.commit()

        return {
            'old_component_id': component_id,
            'new_component_id': new_comp_id,
            'replacement_type': replacement_type,
            'message': 'Replacement recorded successfully'
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# PORTFOLIO ENDPOINTS

@router.get("/portfolio/summary")
def portfolio_summary(organisation_id: str = Query(...),
                     db: Session = Depends(get_db)):
    """Get portfolio-level component summary."""
    try:
        # Overall stats
        stats = db.execute(
            text("""
                SELECT
                    COUNT(*) as total_components,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_components,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_components,
                    COUNT(CASE WHEN status = 'replaced' THEN 1 END) as replaced_components,
                    COUNT(CASE WHEN ct.criticality = 'critical' THEN 1 END) as critical_count,
                    COUNT(CASE WHEN ct.criticality = 'high' THEN 1 END) as high_priority_count,
                    SUM(CASE WHEN condition_score <= 2 THEN 1 ELSE 0 END) as poor_condition_count,
                    AVG(condition_score) as avg_condition_score
                FROM property_components pc
                JOIN component_types ct ON pc.component_type_id = ct.id
                WHERE pc.organisation_id = :org_id
            """),
            {"org_id": organisation_id}
        ).first()

        # Components by category
        by_category = db.execute(
            text("""
                SELECT
                    ct.category,
                    COUNT(*) as count,
                    COUNT(CASE WHEN pc.status = 'failed' THEN 1 END) as failed,
                    AVG(pc.condition_score) as avg_condition
                FROM property_components pc
                JOIN component_types ct ON pc.component_type_id = ct.id
                WHERE pc.organisation_id = :org_id AND pc.status = 'active'
                GROUP BY ct.category
            """),
            {"org_id": organisation_id}
        ).fetchall()

        # Replacement forecast
        forecast = db.execute(
            text("""
                SELECT
                    DATE_TRUNC('year', predicted_failure_date)::date as year,
                    COUNT(*) as count,
                    SUM(ct.replacement_cost_mid) as estimated_cost
                FROM property_components pc
                JOIN component_types ct ON pc.component_type_id = ct.id
                WHERE pc.organisation_id = :org_id
                    AND pc.status = 'active'
                    AND pc.predicted_failure_date > CURRENT_TIMESTAMP
                GROUP BY DATE_TRUNC('year', predicted_failure_date)
                ORDER BY year ASC
                LIMIT 10
            """),
            {"org_id": organisation_id}
        ).fetchall()

        return {
            'summary': {
                'total_components': stats[0],
                'active_components': stats[1],
                'failed_components': stats[2],
                'replaced_components': stats[3],
                'critical_count': stats[4],
                'high_priority_count': stats[5],
                'poor_condition_count': stats[6],
                'average_condition_score': round(stats[7], 2) if stats[7] else None
            },
            'by_category': [
                {
                    'category': row[0],
                    'count': row[1],
                    'failed': row[2],
                    'average_condition_score': round(row[3], 2) if row[3] else None
                }
                for row in by_category
            ],
            'replacement_forecast': [
                {
                    'year': row[0].isoformat() if row[0] else None,
                    'components_failing': row[1],
                    'estimated_cost': float(row[2] or 0)
                }
                for row in forecast
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# SEEDING ENDPOINTS

@router.post("/seed/from-epc")
def seed_components_from_epc(property_id: str = Body(..., embed=True),
                            organisation_id: str = Body(..., embed=True),
                            epc_data: Dict = Body(..., embed=True),
                            property_data: Dict = Body(..., embed=True),
                            db: Session = Depends(get_db)):
    """Seed components from EPC data for a property."""
    try:
        seeder = ComponentSeeder(db)
        result = seeder.seed_property_components(
            property_id, epc_data, property_data, organisation_id
        )

        return {
            'property_id': property_id,
            'components_created': result,
            'message': f"Created {result['total']} components"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lifecycle/refresh-calculations")
def refresh_lifecycle_calculations(organisation_id: str = Body(..., embed=True),
                                  db: Session = Depends(get_db)):
    """Recalculate remaining life and priority scores for all components."""
    try:
        service = ComponentLifecycleService(db)
        stats = service.refresh_all_calculations(organisation_id)

        return {
            'processed': stats['processed'],
            'updated': stats['updated'],
            'errors': stats['errors'],
            'message': f"Processed {stats['processed']} components"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predictions/refresh")
def refresh_predictions(organisation_id: str = Body(..., embed=True),
                       db: Session = Depends(get_db)):
    """Refresh failure predictions for all components."""
    try:
        predictor = ComponentPredictor(db)
        stats = predictor.refresh_predictions(organisation_id)

        return {
            'processed': stats['processed'],
            'updated': stats['updated'],
            'errors': stats['errors'],
            'message': f"Updated predictions for {stats['updated']} components"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
