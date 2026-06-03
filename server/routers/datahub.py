"""
CSV upload and import endpoints for SHDT data hub.

Provides:
1. POST /api/data-hub/upload - Accept CSV file upload
2. GET /api/data-hub/preview - Get preview of uploaded CSV (headers + first 5 rows)
3. POST /api/data-hub/import - Actually import the data with column mapping
4. GET /api/data-hub/template - Download CSV template

No background tasks or auth required. Synchronous processing.
Uses postcodes.io for geocoding and raw SQL via SQLAlchemy text().
"""

import re
import csv
import json
import uuid
import logging
import subprocess
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from database import engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data-hub", tags=["data-hub"])

# In-memory storage for uploaded file (simple approach for MVP)
# In production, store in temp directory or database
uploaded_files: Dict[str, Dict[str, Any]] = {}

# UK postcode regex pattern (from import_property_data.py)
UK_POSTCODE_RE = re.compile(
    r'([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$',
    re.IGNORECASE
)

# postcodes.io batch size
GEOCODE_BATCH_SIZE = 100


class UploadResponse(BaseModel):
    """Response from file upload"""
    upload_id: str
    filename: str
    rows_count: int
    headers: List[str]


class PreviewResponse(BaseModel):
    """CSV preview response"""
    upload_id: str
    filename: str
    headers: List[str]
    rows: List[List[str]]
    total_rows: int


class ImportRequest(BaseModel):
    """Request body for import endpoint"""
    upload_id: str
    column_mapping: Dict[str, str]  # Maps DB column -> CSV column header
    import_mode: str  # "add" or "replace"


class ImportResponse(BaseModel):
    """Response from import endpoint"""
    status: str
    total: int
    imported: int
    failed: int
    errors: List[str]


def extract_postcode(address: str) -> Optional[str]:
    """
    Extract UK postcode from the end of an address string.
    From import_property_data.py
    """
    match = UK_POSTCODE_RE.search(address.strip())
    if match:
        pc = match.group(1).upper().strip()
        # Normalize spacing: ensure single space before last 3 chars
        if " " not in pc:
            pc = pc[:-3] + " " + pc[-3:]
        return pc
    return None


def batch_geocode(postcodes: List[str]) -> Dict[str, Tuple[float, float]]:
    """
    Geocode a batch of postcodes using postcodes.io bulk lookup.
    Uses subprocess+curl to avoid LibreSSL issues on macOS Python 3.9.

    Returns dict of postcode -> (latitude, longitude)
    """
    results = {}

    for i in range(0, len(postcodes), GEOCODE_BATCH_SIZE):
        batch = postcodes[i:i + GEOCODE_BATCH_SIZE]

        try:
            payload = json.dumps({"postcodes": batch})
            result = subprocess.run(
                ["curl", "-s", "-X", "POST",
                 "https://api.postcodes.io/postcodes",
                 "-H", "Content-Type: application/json",
                 "-d", payload,
                 "--max-time", "30"],
                capture_output=True, text=True, timeout=35,
            )
            if result.returncode == 0 and result.stdout:
                data = json.loads(result.stdout)
                for item in data.get("result", []):
                    query_pc = item.get("query", "")
                    res = item.get("result")
                    if res and res.get("latitude") and res.get("longitude"):
                        results[query_pc.upper().replace(" ", "")] = (
                            res["latitude"],
                            res["longitude"],
                        )
        except Exception as e:
            logger.warning(f"Geocode batch failed (batch {i//GEOCODE_BATCH_SIZE}): {e}")
            time.sleep(1)

        # Rate limit
        if i + GEOCODE_BATCH_SIZE < len(postcodes):
            time.sleep(0.3)

    return results


def parse_csv_content(file_content: str) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Parse CSV content into headers and rows.

    Returns: (headers, rows)
    """
    csv_reader = csv.DictReader(StringIO(file_content))
    headers = csv_reader.fieldnames or []
    rows = list(csv_reader)
    return headers, rows


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file for preview and import.

    Returns upload_id to use in subsequent preview/import calls.
    """
    # Validate file
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        # Read file content
        file_content = (await file.read()).decode('utf-8')

        # Parse CSV
        headers, rows = parse_csv_content(file_content)

        if not headers:
            raise HTTPException(status_code=400, detail="CSV has no headers")

        # Store in memory with unique ID
        upload_id = str(uuid.uuid4())
        uploaded_files[upload_id] = {
            "filename": file.filename,
            "content": file_content,
            "headers": headers,
            "rows": rows,
        }

        return UploadResponse(
            upload_id=upload_id,
            filename=file.filename,
            rows_count=len(rows),
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/preview/{upload_id}", response_model=PreviewResponse)
async def preview_upload(upload_id: str, limit: int = 5):
    """
    Get preview of uploaded CSV: headers and first N rows.
    """
    if upload_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="Upload not found")

    file_data = uploaded_files[upload_id]
    headers = file_data["headers"]
    # Convert dict rows to arrays (frontend expects string[][])
    rows_as_arrays = [
        [row.get(h, "") for h in headers]
        for row in file_data["rows"][:limit]
    ]

    return PreviewResponse(
        upload_id=upload_id,
        filename=file_data["filename"],
        headers=headers,
        rows=rows_as_arrays,
        total_rows=len(file_data["rows"]),
    )


@router.post("/import", response_model=ImportResponse)
async def import_data(request: ImportRequest):
    """
    Import CSV data into the properties table.

    Args:
        request.upload_id: ID from upload endpoint
        request.column_mapping: Dict mapping expected DB columns to CSV headers
                              e.g., {"address": "Address", "postcode": "Postcode"}
        request.import_mode: "add" (insert new) or "replace" (truncate first)

    Supported DB columns:
    - address (required)
    - postcode (optional, will try to extract from address if not mapped)
    - property_type
    - bedrooms
    - year_built
    - heating_type
    - epc_rating
    - floor_area (alias for floor_area_sqm in CSV)
    - tenure_type
    - local_authority
    - ward
    - construction_type
    - wall_insulation
    - roof_type
    """
    if request.upload_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="Upload not found")

    if request.import_mode not in ["add", "replace"]:
        raise HTTPException(status_code=400, detail="import_mode must be 'add' or 'replace'")

    file_data = uploaded_files[request.upload_id]
    rows = file_data["rows"]
    headers = file_data["headers"]

    # Validate column mapping
    for db_col, csv_col in request.column_mapping.items():
        if csv_col not in headers:
            raise HTTPException(
                status_code=400,
                detail=f"CSV does not have column '{csv_col}' for '{db_col}'"
            )

    # Must have address
    if "address" not in request.column_mapping:
        raise HTTPException(status_code=400, detail="column_mapping must include 'address'")

    total = len(rows)
    imported = 0
    failed = 0
    errors: List[str] = []

    try:
        # Step 1: Extract postcodes and geocode
        postcodes_needed = set()
        parsed_rows = []

        for i, row in enumerate(rows):
            try:
                parsed = {}

                # Map columns from CSV to DB schema
                for db_col, csv_col in request.column_mapping.items():
                    value = row.get(csv_col, "").strip()
                    if value:
                        # Type conversion for known integer fields
                        if db_col in ["bedrooms", "year_built"]:
                            try:
                                parsed[db_col] = int(value)
                            except ValueError:
                                parsed[db_col] = None
                        elif db_col == "floor_area":
                            try:
                                parsed[db_col] = float(value)
                            except ValueError:
                                parsed[db_col] = None
                        else:
                            parsed[db_col] = value

                # Validate address
                if "address" not in parsed or not parsed["address"]:
                    raise ValueError("address is required")

                # Extract postcode if not provided
                if "postcode" not in parsed or not parsed["postcode"]:
                    postcode = extract_postcode(parsed["address"])
                    if postcode:
                        parsed["postcode"] = postcode

                if "postcode" in parsed:
                    postcodes_needed.add(parsed["postcode"])

                parsed_rows.append(parsed)

            except Exception as e:
                failed += 1
                errors.append(f"Row {i + 1}: {str(e)}")
                continue

        logger.info(f"Parsed {len(parsed_rows)} rows, {len(postcodes_needed)} unique postcodes to geocode")

        # Step 2: Geocode postcodes
        geocode_cache: Dict[str, Tuple[float, float]] = {}
        if postcodes_needed:
            postcodes_list = list(postcodes_needed)
            logger.info(f"Geocoding {len(postcodes_list)} postcodes via postcodes.io...")
            geocode_cache = batch_geocode(postcodes_list)
            logger.info(f"Geocoded {len(geocode_cache)}/{len(postcodes_list)} postcodes")

        # Step 3: Insert into database
        logger.info("Inserting properties into database...")

        with engine.begin() as conn:
            # Optionally truncate if replace mode
            if request.import_mode == "replace":
                conn.execute(text("TRUNCATE TABLE properties RESTART IDENTITY CASCADE"))
                logger.info("Truncated properties table")

            for parsed in parsed_rows:
                try:
                    postcode = parsed.get("postcode")
                    address = parsed.get("address")

                    # Get coordinates if we have a postcode
                    latitude = None
                    longitude = None

                    if postcode:
                        pc_key = postcode.upper().replace(" ", "")
                        coords = geocode_cache.get(pc_key)
                        if coords:
                            latitude, longitude = coords

                    # Build insert statement
                    # Only include non-None, non-empty values
                    insert_data = {"address": address, "postcode": postcode}

                    # Map frontend column keys to actual DB column names
                    COLUMN_ALIASES = {
                        "floor_area": "floor_area_m2",
                        "local_authority": "local_authority_name",
                        "ward": "ward_name",
                    }

                    # Add optional fields if present
                    for field in [
                        "property_type", "bedrooms", "year_built", "heating_type",
                        "epc_rating", "floor_area", "tenure_type", "local_authority",
                        "ward", "construction_type", "wall_insulation", "roof_type"
                    ]:
                        if field in parsed and parsed[field] is not None:
                            db_field = COLUMN_ALIASES.get(field, field)
                            insert_data[db_field] = parsed[field]

                    # Build column list and values
                    columns = list(insert_data.keys())
                    placeholders = [f":{col}" for col in columns]

                    # Add geometry if we have coordinates
                    if latitude is not None and longitude is not None:
                        columns.extend(["latitude", "longitude", "geometry"])
                        placeholders.extend(
                            [":latitude", ":longitude",
                             "ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)"]
                        )
                        insert_data["latitude"] = latitude
                        insert_data["longitude"] = longitude

                    sql = text(f"""
                        INSERT INTO properties ({', '.join(columns)})
                        VALUES ({', '.join(placeholders)})
                    """)

                    conn.execute(sql, insert_data)
                    imported += 1

                except Exception as e:
                    failed += 1
                    errors.append(f"Insert failed: {str(e)}")
                    logger.warning(f"Insert error: {e}")

        logger.info(f"Import complete: {imported} imported, {failed} failed")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import process failed: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

    return ImportResponse(
        status="success" if failed == 0 else "partial",
        total=total,
        imported=imported,
        failed=failed,
        errors=errors[:20],  # Limit error list
    )


@router.get("/template")
async def download_template():
    """
    Download CSV template for property import.

    Includes example headers and one sample row.
    """
    headers = [
        "address",
        "postcode",
        "property_type",
        "bedrooms",
        "year_built",
        "heating_type",
        "epc_rating",
        "floor_area",
        "tenure_type",
        "local_authority",
        "ward",
        "construction_type",
        "wall_insulation",
        "roof_type",
    ]

    example_row = [
        "123 Main Street, London",
        "SW1A 1AA",
        "House",
        "3",
        "1995",
        "Gas boiler",
        "D",
        "120.5",
        "Rented",
        "Westminster",
        "St James's",
        "Brick",
        "Cavity insulation",
        "Slate",
    ]

    csv_content = ",".join(headers) + "\n" + ",".join(example_row) + "\n"

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=properties_template.csv"},
    )

