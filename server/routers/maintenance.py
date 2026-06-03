"""
Maintenance Router
API endpoints for maintenance history, imports, and analytics.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from sqlalchemy import text

from database import get_db
from services.digital_twin import MaintenanceIngestionService

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.get("/history/property/{property_id}")
def get_property_maintenance_history(property_id: str,
                                     status: Optional[str] = Query(None),
                                     limit: int = Query(50, ge=1, le=500),
                                     offset: int = Query(0, ge=0),
                                     db: Session = Depends(get_db)):
    """Get maintenance history for a property."""
    try:
        query = """
            SELECT
                id, component_id, work_order_ref, reported_date, completed_date,
                category, priority, description, trade, cost, contractor, status
            FROM maintenance_records
            WHERE property_id = :prop_id
        """

        params = {"prop_id": property_id}

        if status:
            query += " AND status = :status"
            params["status"] = status

        query += " ORDER BY reported_date DESC LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset

        records = db.execute(text(query), params).fetchall()

        result = []
        for row in records:
            result.append({
                'id': row[0],
                'component_id': row[1],
                'work_order_ref': row[2],
                'reported_date': row[3].isoformat() if row[3] else None,
                'completed_date': row[4].isoformat() if row[4] else None,
                'category': row[5],
                'priority': row[6],
                'description': row[7],
                'trade': row[8],
                'cost': float(row[9]) if row[9] else None,
                'contractor': row[10],
                'status': row[11]
            })

        return {'data': result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/component/{component_id}")
def get_component_maintenance_history(component_id: str,
                                     limit: int = Query(50, ge=1, le=500),
                                     db: Session = Depends(get_db)):
    """Get maintenance history for a specific component."""
    try:
        records = db.execute(
            text("""
                SELECT
                    id, property_id, reported_date, completed_date,
                    category, priority, description, trade, cost, contractor, status
                FROM maintenance_records
                WHERE component_id = :comp_id
                ORDER BY reported_date DESC
                LIMIT :limit
            """),
            {"comp_id": component_id, "limit": limit}
        ).fetchall()

        result = []
        for row in records:
            result.append({
                'id': row[0],
                'property_id': row[1],
                'reported_date': row[2].isoformat() if row[2] else None,
                'completed_date': row[3].isoformat() if row[3] else None,
                'category': row[4],
                'priority': row[5],
                'description': row[6],
                'trade': row[7],
                'cost': float(row[8]) if row[8] else None,
                'contractor': row[9],
                'status': row[10]
            })

        return {'data': result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-csv")
async def import_maintenance_csv(file: UploadFile = File(...),
                                organisation_id: str = Query(...),
                                uprn_column: str = Query('UPRN'),
                                address_column: str = Query('address'),
                                description_column: str = Query('description'),
                                date_column: str = Query('reported_date'),
                                cost_column: str = Query('cost'),
                                status_column: str = Query('status'),
                                contractor_column: str = Query('contractor'),
                                db: Session = Depends(get_db)):
    """Import maintenance records from CSV file."""
    try:
        # Read CSV content
        content = await file.read()
        csv_content = content.decode('utf-8')

        # Import using service
        service = MaintenanceIngestionService(db)
        result = service.import_csv(
            csv_content,
            organisation_id,
            uprn_column=uprn_column,
            address_column=address_column,
            description_column=description_column,
            date_column=date_column,
            cost_column=cost_column,
            status_column=status_column,
            contractor_column=contractor_column
        )

        return {
            'filename': file.filename,
            'total_rows': result['total'],
            'imported': result['imported'],
            'skipped': result['skipped'],
            'errors': result['errors'],
            'message': f"Imported {result['imported']} maintenance records"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record")
def record_maintenance(property_id: str = Body(..., embed=True),
                      component_id: Optional[str] = Body(None, embed=True),
                      description: str = Body(..., embed=True),
                      category: str = Body('maintenance', embed=True),
                      priority: str = Body('normal', embed=True),
                      cost: Optional[float] = Body(None, embed=True),
                      contractor: Optional[str] = Body(None, embed=True),
                      trade: Optional[str] = Body(None, embed=True),
                      organisation_id: str = Body(..., embed=True),
                      db: Session = Depends(get_db)):
    """Record a new maintenance work item."""
    try:
        record_id = str(uuid.uuid4())

        db.execute(
            text("""
                INSERT INTO maintenance_records
                (id, property_id, component_id, reported_date, category, priority,
                 description, cost, contractor, trade, status, organisation_id)
                VALUES (:id, :prop_id, :comp_id, CURRENT_TIMESTAMP, :cat, :prio,
                        :desc, :cost, :contractor, :trade, 'reported', :org_id)
            """),
            {
                "id": record_id,
                "prop_id": property_id,
                "comp_id": component_id,
                "cat": category,
                "prio": priority,
                "desc": description,
                "cost": cost,
                "contractor": contractor,
                "trade": trade,
                "org_id": organisation_id
            }
        )

        db.commit()

        return {
            'id': record_id,
            'property_id': property_id,
            'description': description,
            'priority': priority,
            'reported_date': datetime.utcnow().isoformat(),
            'message': 'Maintenance record created'
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{record_id}/status")
def update_maintenance_status(record_id: str,
                             status: str = Body(..., embed=True),
                             completed_date: Optional[str] = Body(None, embed=True),
                             notes: Optional[str] = Body(None, embed=True),
                             db: Session = Depends(get_db)):
    """Update maintenance record status."""
    try:
        valid_statuses = ['reported', 'scheduled', 'in_progress', 'completed', 'cancelled']
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

        parsed_completed_date = None
        if completed_date and status == 'completed':
            try:
                parsed_completed_date = datetime.fromisoformat(completed_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format")

        db.execute(
            text("""
                UPDATE maintenance_records
                SET status = :status,
                    completed_date = :comp_date
                WHERE id = :record_id
            """),
            {
                "status": status,
                "comp_date": parsed_completed_date,
                "record_id": record_id
            }
        )

        db.commit()

        return {
            'id': record_id,
            'status': status,
            'message': 'Maintenance status updated'
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# MAINTENANCE ANALYTICS

@router.get("/stats/organisation")
def get_organisation_maintenance_stats(organisation_id: str = Query(...),
                                      db: Session = Depends(get_db)):
    """Get maintenance statistics for an organisation."""
    try:
        # Overall stats
        stats = db.execute(
            text("""
                SELECT
                    COUNT(*) as total_records,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN status IN ('reported', 'scheduled') THEN 1 END) as pending,
                    COUNT(CASE WHEN priority = 'emergency' THEN 1 END) as emergency_count,
                    COUNT(CASE WHEN priority IN ('emergency', 'urgent') THEN 1 END) as urgent_count,
                    SUM(cost) as total_cost,
                    AVG(cost) as avg_cost
                FROM maintenance_records
                WHERE organisation_id = :org_id
            """),
            {"org_id": organisation_id}
        ).first()

        # By category
        by_category = db.execute(
            text("""
                SELECT
                    category,
                    COUNT(*) as count,
                    SUM(cost) as total_cost,
                    AVG(cost) as avg_cost
                FROM maintenance_records
                WHERE organisation_id = :org_id
                GROUP BY category
            """),
            {"org_id": organisation_id}
        ).fetchall()

        # By priority
        by_priority = db.execute(
            text("""
                SELECT
                    priority,
                    COUNT(*) as count,
                    SUM(cost) as total_cost
                FROM maintenance_records
                WHERE organisation_id = :org_id
                GROUP BY priority
            """),
            {"org_id": organisation_id}
        ).fetchall()

        # By trade
        by_trade = db.execute(
            text("""
                SELECT
                    trade,
                    COUNT(*) as count,
                    SUM(cost) as total_cost,
                    AVG(EXTRACT(EPOCH FROM (completed_date - reported_date))/86400)::INT as avg_days
                FROM maintenance_records
                WHERE organisation_id = :org_id AND trade IS NOT NULL
                GROUP BY trade
                ORDER BY count DESC
                LIMIT 10
            """),
            {"org_id": organisation_id}
        ).fetchall()

        return {
            'overall': {
                'total_records': stats[0],
                'completed': stats[1],
                'pending': stats[2],
                'emergency_count': stats[3],
                'urgent_count': stats[4],
                'total_cost': float(stats[5] or 0),
                'average_cost': float(stats[6] or 0)
            },
            'by_category': [
                {
                    'category': row[0],
                    'count': row[1],
                    'total_cost': float(row[2] or 0),
                    'average_cost': float(row[3] or 0)
                }
                for row in by_category
            ],
            'by_priority': [
                {
                    'priority': row[0],
                    'count': row[1],
                    'total_cost': float(row[2] or 0)
                }
                for row in by_priority
            ],
            'by_trade': [
                {
                    'trade': row[0],
                    'count': row[1],
                    'total_cost': float(row[2] or 0),
                    'average_days_to_complete': row[3]
                }
                for row in by_trade
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/property/{property_id}")
def get_property_maintenance_stats(property_id: str,
                                  db: Session = Depends(get_db)):
    """Get maintenance statistics for a property."""
    try:
        stats = db.execute(
            text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN priority IN ('emergency', 'urgent') THEN 1 END) as urgent_count,
                    SUM(cost) as total_cost,
                    AVG(cost) as avg_cost,
                    COUNT(CASE WHEN category = 'repair' THEN 1 END) as repairs,
                    COUNT(CASE WHEN category = 'replacement' THEN 1 END) as replacements
                FROM maintenance_records
                WHERE property_id = :prop_id
            """),
            {"prop_id": property_id}
        ).first()

        return {
            'property_id': property_id,
            'total_records': stats[0],
            'completed': stats[1],
            'urgent_count': stats[2],
            'total_cost': float(stats[3] or 0),
            'average_cost': float(stats[4] or 0),
            'repairs': stats[5],
            'replacements': stats[6]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
