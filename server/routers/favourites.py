"""
Favourites Router
Endpoints for managing user favourite properties.
"""

from typing import List, Optional
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models import User, UserFavourite, Property


router = APIRouter(prefix="/api/favourites", tags=["favourites"])


class PropertyDto:
    """Property data transfer object"""

    id: str
    address: str
    postcode: str
    uprn: str
    epc_rating: Optional[str] = None
    health_score: Optional[float] = None
    last_surveyed: Optional[str] = None
    components_count: Optional[int] = None
    active_maintenance: Optional[int] = None


class FavouriteDto:
    """Favourite data transfer object"""

    id: str
    property_id: str
    property: PropertyDto
    added_at: datetime


@router.get("", response_model=List[FavouriteDto])
async def get_favourites(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[FavouriteDto]:
    """
    Get all favourite properties for current user.
    Ordered by most recently added.
    """
    favourites = (
        db.query(UserFavourite)
        .filter_by(user_id=current_user.id)
        .order_by(UserFavourite.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results = []
    for fav in favourites:
        prop = db.query(Property).filter_by(id=fav.property_id).first()
        if prop:
            # Calculate stats
            components_count = db.query(Component).filter_by(
                property_id=prop.id
            ).count()
            active_maintenance = (
                db.query(MaintenanceRecord)
                .filter(
                    MaintenanceRecord.property_id == prop.id,
                    MaintenanceRecord.status.in_(["pending", "in_progress"]),
                )
                .count()
            )

            results.append(
                FavouriteDto(
                    id=str(fav.id),
                    property_id=str(prop.id),
                    property=PropertyDto(
                        id=str(prop.id),
                        address=prop.address,
                        postcode=prop.postcode,
                        uprn=prop.uprn,
                        epc_rating=prop.epc_rating,
                        health_score=prop.health_score,
                        last_surveyed=prop.last_surveyed.isoformat()
                        if prop.last_surveyed
                        else None,
                        components_count=components_count,
                        active_maintenance=active_maintenance,
                    ),
                    added_at=fav.created_at,
                )
            )

    return results


@router.post("/{property_id}", response_model=FavouriteDto)
async def add_favourite(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FavouriteDto:
    """
    Add property to user's favourites.
    Idempotent - adding same property twice is safe.
    """
    # Verify property exists
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    if prop.organisation_id != current_user.organisation_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Check if already favourite
    existing = db.query(UserFavourite).filter_by(
        user_id=current_user.id, property_id=property_id
    ).first()

    if existing:
        return FavouriteDto(
            id=str(existing.id),
            property_id=str(prop.id),
            property=_property_to_dto(prop, db),
            added_at=existing.created_at,
        )

    # Create new favourite
    favourite = UserFavourite(
        user_id=current_user.id,
        property_id=property_id,
    )
    db.add(favourite)
    db.commit()

    return FavouriteDto(
        id=str(favourite.id),
        property_id=str(prop.id),
        property=_property_to_dto(prop, db),
        added_at=favourite.created_at,
    )


@router.delete("/{property_id}", response_model=dict)
async def remove_favourite(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Remove property from user's favourites.
    """
    favourite = db.query(UserFavourite).filter_by(
        user_id=current_user.id, property_id=property_id
    ).first()

    if not favourite:
        raise HTTPException(status_code=404, detail="Favourite not found")

    db.delete(favourite)
    db.commit()

    return {
        "message": "Favourite removed",
        "property_id": property_id,
    }


@router.get("/check/{property_id}", response_model=dict)
async def check_favourite(
    property_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Check if property is in user's favourites.
    Used by UI to show star state.
    """
    favourite = db.query(UserFavourite).filter_by(
        user_id=current_user.id, property_id=property_id
    ).first()

    return {
        "is_favourite": favourite is not None,
        "property_id": property_id,
    }


@router.delete("", response_model=dict)
async def clear_favourites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Remove all favourites for current user.
    """
    count = db.query(UserFavourite).filter_by(user_id=current_user.id).delete()
    db.commit()

    return {
        "message": f"Cleared {count} favourites",
        "count": count,
    }


# Helper functions


def _property_to_dto(prop: Property, db: Session) -> PropertyDto:
    """Convert Property model to DTO with computed stats"""
    from app.models import Component, MaintenanceRecord

    components_count = db.query(Component).filter_by(property_id=prop.id).count()
    active_maintenance = (
        db.query(MaintenanceRecord)
        .filter(
            MaintenanceRecord.property_id == prop.id,
            MaintenanceRecord.status.in_(["pending", "in_progress"]),
        )
        .count()
    )

    return PropertyDto(
        id=str(prop.id),
        address=prop.address,
        postcode=prop.postcode,
        uprn=prop.uprn,
        epc_rating=prop.epc_rating,
        health_score=prop.health_score,
        last_surveyed=prop.last_surveyed.isoformat() if prop.last_surveyed else None,
        components_count=components_count,
        active_maintenance=active_maintenance,
    )
