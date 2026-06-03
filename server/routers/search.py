"""
Search Router — property search and autocomplete endpoints.
"""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from services.search_service import search_properties, autocomplete_properties

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Search properties by address, postcode, ward, LSOA, local authority, or region.

    Examples:
      /api/search?q=SW1A 1AA       → exact postcode match
      /api/search?q=SW1A           → postcode prefix match
      /api/search?q=High Street    → address text search
      /api/search?q=Westminster    → ward/LA/region match
    """
    try:
        return search_properties(query=q, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=1, max_length=100, description="Autocomplete query"),
    limit: int = Query(8, ge=1, le=20),
):
    """
    Fast autocomplete suggestions for the search bar.
    Returns up to 8 property suggestions matching the query.
    """
    try:
        return autocomplete_properties(query=q, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autocomplete failed: {str(e)}")
