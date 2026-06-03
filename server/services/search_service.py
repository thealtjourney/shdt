"""
Property Search Service.

Provides search across properties by address, postcode, LSOA, ward,
local authority, and region using PostgreSQL ILIKE and full-text matching.
"""

import re
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from database import engine

logger = logging.getLogger(__name__)

# UK postcode regex (full or partial)
POSTCODE_FULL_RE = re.compile(r'^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$', re.IGNORECASE)
POSTCODE_PREFIX_RE = re.compile(r'^[A-Z]{1,2}\d{1,2}[A-Z]?\s?$', re.IGNORECASE)


def detect_query_type(query: str) -> str:
    """Detect whether query is a postcode, partial postcode, or text search."""
    q = query.strip()
    if POSTCODE_FULL_RE.match(q):
        return "postcode_full"
    if POSTCODE_PREFIX_RE.match(q):
        return "postcode_prefix"
    if q.isdigit() and len(q) >= 5:
        return "id"
    return "text"


def search_properties(
    query: str,
    limit: int = 30,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Search properties by address, postcode, ward, LSOA, local authority, or region.

    Returns dict with: query, total, results[]
    Each result has: id, address, postcode, property_type, epc_rating, bedrooms,
                     ward_name, local_authority_name, region, lat, lng, match_type
    """
    q = query.strip()
    if len(q) < 2:
        return {"query": q, "total": 0, "results": []}

    query_type = detect_query_type(q)
    logger.info(f"Search: '{q}' → type={query_type}")

    results = []
    total = 0

    with engine.connect() as conn:
        if query_type == "postcode_full":
            results, total = _search_by_postcode(conn, q, exact=True, limit=limit, offset=offset)
        elif query_type == "postcode_prefix":
            results, total = _search_by_postcode(conn, q, exact=False, limit=limit, offset=offset)
        elif query_type == "id":
            results, total = _search_by_id(conn, q, limit=limit)
        else:
            results, total = _search_text(conn, q, limit=limit, offset=offset)

    return {"query": q, "total": total, "results": results}


def autocomplete_properties(
    query: str,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """
    Fast autocomplete for the search bar.
    Returns address + postcode suggestions matching the query prefix.
    """
    q = query.strip()
    if len(q) < 1:
        return []

    query_type = detect_query_type(q)

    with engine.connect() as conn:
        if query_type in ("postcode_full", "postcode_prefix"):
            # Autocomplete by postcode
            normalised = q.upper().replace(" ", "")
            rows = conn.execute(text("""
                SELECT id, address, postcode, epc_rating, property_type
                FROM properties
                WHERE REPLACE(UPPER(postcode), ' ', '') LIKE :pattern
                ORDER BY postcode, address
                LIMIT :limit
            """), {"pattern": f"{normalised}%", "limit": limit}).fetchall()
        else:
            # Autocomplete by address, ward, or local authority
            pattern = f"%{q}%"
            rows = conn.execute(text("""
                SELECT id, address, postcode, epc_rating, property_type
                FROM properties
                WHERE address ILIKE :pattern
                   OR ward_name ILIKE :pattern
                   OR local_authority_name ILIKE :pattern
                   OR lsoa_name ILIKE :pattern
                   OR region ILIKE :pattern
                ORDER BY
                    CASE WHEN address ILIKE :start_pattern THEN 0 ELSE 1 END,
                    address
                LIMIT :limit
            """), {"pattern": pattern, "start_pattern": f"{q}%", "limit": limit}).fetchall()

    return [
        {
            "id": row[0],
            "address": row[1],
            "postcode": row[2],
            "epc_rating": row[3],
            "property_type": row[4],
        }
        for row in rows
    ]


def _search_by_postcode(conn, postcode: str, exact: bool, limit: int, offset: int):
    """Search by full or partial postcode."""
    normalised = postcode.upper().replace(" ", "")

    if exact:
        where = "REPLACE(UPPER(postcode), ' ', '') = :postcode"
        params = {"postcode": normalised}
    else:
        where = "REPLACE(UPPER(postcode), ' ', '') LIKE :pattern"
        params = {"pattern": f"{normalised}%"}

    count_row = conn.execute(text(f"""
        SELECT COUNT(*) FROM properties WHERE {where}
    """), params).fetchone()
    total = count_row[0] if count_row else 0

    rows = conn.execute(text(f"""
        SELECT id, address, postcode, property_type, epc_rating, bedrooms,
               ward_name, local_authority_name, region,
               ST_Y(geometry) as lat, ST_X(geometry) as lng
        FROM properties
        WHERE {where}
        ORDER BY address
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": offset}).fetchall()

    match_type = "postcode" if exact else "postcode_prefix"
    results = [_row_to_result(row, match_type) for row in rows]
    return results, total


def _search_by_id(conn, id_str: str, limit: int):
    """Search by property ID (UUID or integer)."""
    rows = conn.execute(text("""
        SELECT id, address, postcode, property_type, epc_rating, bedrooms,
               ward_name, local_authority_name, region,
               ST_Y(geometry) as lat, ST_X(geometry) as lng
        FROM properties
        WHERE id::text = :id
    """), {"id": id_str}).fetchall()

    results = [_row_to_result(row, "id") for row in rows]
    return results, len(results)


def _search_text(conn, query: str, limit: int, offset: int):
    """Full text search across address, ward, LA, LSOA, region."""
    pattern = f"%{query}%"

    # Count total matches
    count_row = conn.execute(text("""
        SELECT COUNT(*) FROM properties
        WHERE address ILIKE :pattern
           OR ward_name ILIKE :pattern
           OR local_authority_name ILIKE :pattern
           OR lsoa_name ILIKE :pattern
           OR region ILIKE :pattern
           OR postcode ILIKE :pattern
    """), {"pattern": pattern}).fetchone()
    total = count_row[0] if count_row else 0

    # Fetch results with relevance ordering:
    # exact address start > address contains > ward/LA match > other
    rows = conn.execute(text("""
        SELECT id, address, postcode, property_type, epc_rating, bedrooms,
               ward_name, local_authority_name, region,
               ST_Y(geometry) as lat, ST_X(geometry) as lng,
               CASE
                   WHEN address ILIKE :start_pattern THEN 'address'
                   WHEN address ILIKE :pattern THEN 'address'
                   WHEN postcode ILIKE :pattern THEN 'postcode'
                   WHEN ward_name ILIKE :pattern THEN 'ward'
                   WHEN local_authority_name ILIKE :pattern THEN 'local_authority'
                   WHEN lsoa_name ILIKE :pattern THEN 'lsoa'
                   WHEN region ILIKE :pattern THEN 'region'
                   ELSE 'other'
               END as match_type
        FROM properties
        WHERE address ILIKE :pattern
           OR ward_name ILIKE :pattern
           OR local_authority_name ILIKE :pattern
           OR lsoa_name ILIKE :pattern
           OR region ILIKE :pattern
           OR postcode ILIKE :pattern
        ORDER BY
            CASE WHEN address ILIKE :start_pattern THEN 0
                 WHEN address ILIKE :pattern THEN 1
                 WHEN postcode ILIKE :pattern THEN 2
                 WHEN ward_name ILIKE :pattern THEN 3
                 ELSE 4
            END,
            address
        LIMIT :limit OFFSET :offset
    """), {
        "pattern": pattern,
        "start_pattern": f"{query}%",
        "limit": limit,
        "offset": offset,
    }).fetchall()

    results = [_row_to_result(row, row[11] if len(row) > 11 else "text") for row in rows]
    return results, total


def _row_to_result(row, match_type: str) -> Dict[str, Any]:
    """Convert a DB row to a search result dict."""
    return {
        "id": row[0],
        "address": row[1],
        "postcode": row[2],
        "property_type": row[3],
        "epc_rating": row[4],
        "bedrooms": row[5],
        "ward_name": row[6],
        "local_authority_name": row[7],
        "region": row[8],
        "lat": float(row[9]) if row[9] else None,
        "lng": float(row[10]) if row[10] else None,
        "match_type": match_type,
    }
