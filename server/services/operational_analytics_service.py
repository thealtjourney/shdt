"""
Operational analytics service for complaints and repairs data.
Reads Excel files and returns pre-computed analytics summaries.
Caches loaded DataFrames in memory to avoid re-parsing on every request.

File resolution order:
  1. The Storage abstraction (key = "operational/<filename>"). When
     STORAGE_BACKEND=azure_blob this is where production files live.
  2. The legacy local-filesystem search path, kept for backward compatibility
     with the existing local development workflow.

This means existing local installs keep working unchanged; deploying to Azure
just requires putting the same Excel files in the configured Blob container
under the ``operational/`` prefix.
"""

import io
import os
import logging
import time
from typing import Optional, Dict, Tuple
from datetime import datetime

import pandas as pd
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── In-memory DataFrame cache ──────────────────────
# Caches Excel DataFrames for 5 minutes to avoid re-parsing 88K+ rows on every request
_df_cache: Dict[str, Tuple[pd.DataFrame, float]] = {}
_CACHE_TTL = 300  # 5 minutes

# Storage prefix under which operational Excel files live (Blob container path)
_STORAGE_PREFIX = "operational"


def _load_df_cached(filename: str) -> Optional[pd.DataFrame]:
    """
    Load an Excel file into a DataFrame, caching the result for 5 minutes.

    Tries the Storage abstraction first (works for both local FS and Azure
    Blob), then falls back to the legacy local-filesystem search.
    """
    now = time.time()
    if filename in _df_cache:
        df, loaded_at = _df_cache[filename]
        if now - loaded_at < _CACHE_TTL:
            return df.copy()  # Return copy to prevent mutation

    df: Optional[pd.DataFrame] = None

    # 1. Try the configured Storage backend (LocalFilesystem or AzureBlob)
    try:
        from storage import get_storage  # type: ignore

        storage = get_storage()
        key = f"{_STORAGE_PREFIX}/{filename}"
        if storage.exists(key):
            df = pd.read_excel(io.BytesIO(storage.get_bytes(key)))
            logger.info("operational.loaded_from_storage", extra={"data_filename": filename, "rows": len(df), "key": key})
    except Exception as e:
        logger.debug("operational.storage_lookup_skipped", extra={"data_filename": filename, "error": str(e)})

    # 2. Fall back to legacy filesystem search
    if df is None:
        filepath = _find_file(filename)
        if not filepath:
            return None
        try:
            df = pd.read_excel(filepath)
            logger.info("operational.loaded_from_disk", extra={"data_filename": filename, "rows": len(df), "path": filepath})
        except Exception as e:
            logger.error(f"Failed to read {filename}: {e}")
            return None

    _df_cache[filename] = (df, now)
    return df.copy()


def _find_file(filename: str) -> Optional[str]:
    """Search common locations for data files (legacy local-FS fallback)."""
    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    shdt_dir = os.path.dirname(server_dir)
    project_root = os.path.dirname(shdt_dir)
    candidates = [
        os.path.join(project_root, filename),
        os.path.join(shdt_dir, filename),
        os.path.join(server_dir, filename),
        os.path.join(server_dir, 'data', filename),
        os.path.join('/app', filename),
        os.path.join('/app/data', filename),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


class OperationalAnalyticsService:

    @staticmethod
    def get_complaints_summary() -> dict:
        df = _load_df_cached('Complaints Data 1.xlsx')
        if df is None:
            return {"status": "error", "message": "Complaints data file not found"}

        total = len(df)
        stage2_count = int((df['Stage'] == 'Stage 2').sum())
        stage1_count = int((df['Stage'] == 'Stage 1').sum())
        escalation_rate = round(stage2_count / total * 100, 1) if total > 0 else 0

        avg_days = round(float(df['Total Days'].mean()), 1) if 'Total Days' in df.columns else 0

        # Category breakdown
        cat_counts = df['Category'].value_counts()
        top_category = str(cat_counts.index[0]) if len(cat_counts) > 0 else 'N/A'
        by_category = [{"category": str(k), "count": int(v)} for k, v in cat_counts.items()]

        # Area breakdown
        area_counts = df['Area'].value_counts()
        by_area = [{"area": str(k), "count": int(v)} for k, v in area_counts.items()]

        # Type breakdown
        type_counts = df['Type'].value_counts()
        by_type = [{"type": str(k), "count": int(v)} for k, v in type_counts.items()]

        # Stage breakdown
        by_stage = [
            {"stage": "Stage 1", "count": stage1_count},
            {"stage": "Stage 2", "count": stage2_count},
        ]

        # Recent complaints (last 20)
        recent = df.sort_values('Logged Date', ascending=False).head(20)
        recent_list = []
        for _, row in recent.iterrows():
            recent_list.append({
                "case_id": int(row['Case ID']),
                "stage": str(row['Stage']),
                "category": str(row['Category']),
                "address": str(row['Address']),
                "postcode": str(row['Post Code']),
                "logged_date": row['Logged Date'].strftime('%Y-%m-%d') if pd.notna(row['Logged Date']) else None,
                "area": str(row['Area']),
                "total_days": int(row['Total Days']) if pd.notna(row['Total Days']) else None,
                "type": str(row['Type']),
            })

        # Extensions analysis
        ext_counts = df['Extensions'].value_counts().sort_index()
        extensions = [{"extensions": int(k), "count": int(v)} for k, v in ext_counts.items()]

        return {
            "status": "success",
            "data": {
                "summary": {
                    "total_complaints": total,
                    "stage_1_count": stage1_count,
                    "stage_2_count": stage2_count,
                    "escalation_rate_pct": escalation_rate,
                    "avg_response_days": avg_days,
                    "top_category": top_category,
                },
                "by_category": by_category,
                "by_area": by_area,
                "by_type": by_type,
                "by_stage": by_stage,
                "extensions": extensions,
                "recent": recent_list,
            }
        }

    @staticmethod
    def get_repairs_summary() -> dict:
        df = _load_df_cached('Repairs by Contractor.xlsx')
        if df is None:
            return {"status": "error", "message": "Repairs data file not found"}

        total_orders = len(df)
        total_cost = float(df['TotalCost'].sum()) if 'TotalCost' in df.columns else 0
        avg_cost = float(df['TotalCost'].mean()) if 'TotalCost' in df.columns else 0
        median_cost = float(df['TotalCost'].median()) if 'TotalCost' in df.columns else 0

        on_time_yes = int((df['Attended On Time'] == 'Yes').sum())
        on_time_no = int((df['Attended On Time'] == 'No').sum())
        on_time_pct = round(on_time_yes / (on_time_yes + on_time_no) * 100, 1) if (on_time_yes + on_time_no) > 0 else 0

        # Unique properties
        unique_properties = int(df['AddressId'].nunique()) if 'AddressId' in df.columns else 0

        # Contractor performance
        contractor_agg = df.groupby('SupplierName').agg(
            total_spend=('TotalCost', 'sum'),
            order_count=('OrderId', 'count'),
            avg_cost=('TotalCost', 'mean'),
        ).sort_values('total_spend', ascending=False)

        # Contractor on-time rates
        contractor_ontime = df.groupby('SupplierName')['Attended On Time'].apply(
            lambda x: round((x == 'Yes').sum() / len(x) * 100, 1) if len(x) > 0 else 0
        )

        top_contractors = []
        for name, row in contractor_agg.head(20).iterrows():
            top_contractors.append({
                "contractor": str(name),
                "total_spend": round(float(row['total_spend']), 2),
                "order_count": int(row['order_count']),
                "avg_cost": round(float(row['avg_cost']), 2),
                "on_time_pct": float(contractor_ontime.get(name, 0)),
            })

        # Top repair types
        if 'CodeTemplateName' in df.columns:
            repair_types = df['CodeTemplateName'].value_counts().head(15)
            by_repair_type = [{"type": str(k), "count": int(v)} for k, v in repair_types.items()]
        else:
            by_repair_type = []

        # Priority breakdown
        priority_counts = df['Priority'].value_counts()
        by_priority = [{"priority": str(k), "count": int(v)} for k, v in priority_counts.items()]

        # Trade breakdown
        trade_counts = df['Trade'].dropna().value_counts()
        by_trade = [{"trade": str(k), "count": int(v)} for k, v in trade_counts.items()]

        # Owning category
        cat_counts = df['Owning_Category'].value_counts()
        by_owning_category = [{"category": str(k), "count": int(v)} for k, v in cat_counts.items()]

        # First time fix analysis
        if 'FirstTimeFix' in df.columns:
            ftf_counts = df['FirstTimeFix'].value_counts()
            ftf_yes = int(ftf_counts.get(1, 0))
            ftf_no = int(ftf_counts.get(2, 0))
            ftf_na = int(ftf_counts.get(0, 0))
            ftf_rate = round(ftf_yes / (ftf_yes + ftf_no) * 100, 1) if (ftf_yes + ftf_no) > 0 else 0
        else:
            ftf_rate = 0
            ftf_yes = ftf_no = ftf_na = 0

        # Monthly trend (by inception date)
        if 'InceptionUtc' in df.columns:
            df_dated = df.dropna(subset=['InceptionUtc']).copy()
            df_dated['month'] = df_dated['InceptionUtc'].dt.to_period('M')
            monthly = df_dated.groupby('month').agg(
                orders=('OrderId', 'count'),
                spend=('TotalCost', 'sum'),
            ).sort_index()
            monthly_trend = [
                {"month": str(idx), "orders": int(row['orders']), "spend": round(float(row['spend']), 2)}
                for idx, row in monthly.iterrows()
            ]
        else:
            monthly_trend = []

        return {
            "status": "success",
            "data": {
                "summary": {
                    "total_orders": total_orders,
                    "total_cost": round(total_cost, 2),
                    "avg_cost": round(avg_cost, 2),
                    "median_cost": round(median_cost, 2),
                    "on_time_pct": on_time_pct,
                    "on_time_yes": on_time_yes,
                    "on_time_no": on_time_no,
                    "unique_properties": unique_properties,
                    "first_time_fix_rate": ftf_rate,
                    "ftf_yes": ftf_yes,
                    "ftf_no": ftf_no,
                },
                "top_contractors": top_contractors,
                "by_repair_type": by_repair_type,
                "by_priority": by_priority,
                "by_trade": by_trade,
                "by_owning_category": by_owning_category,
                "monthly_trend": monthly_trend,
            }
        }

    @staticmethod
    def get_property_operations(uprn: str, postcode: str, address: str = None) -> dict:
        """
        Returns repair and complaint counts for a specific property.

        Args:
            uprn: The UPRN as a string
            postcode: The postcode of the property
            address: Optional address for repairs matching

        Returns:
            dict with complaints and repairs data
        """
        result = {
            "status": "success",
            "data": {
                "complaints": {
                    "count": 0,
                    "categories": [],
                    "stages": {"stage_1": 0, "stage_2": 0},
                    "avg_response_days": None,
                },
                "repairs": {
                    "count": 0,
                    "total_cost": 0.0,
                    "avg_cost": 0.0,
                    "top_trades": [],
                    "on_time_pct": 0.0,
                }
            }
        }

        # Load complaints data
        df_complaints = _load_df_cached('Complaints Data 1.xlsx')
        if df_complaints is not None:
            try:
                # Convert UPRN to int for matching
                try:
                    uprn_int = int(uprn)
                except (ValueError, TypeError):
                    uprn_int = None

                if uprn_int is not None:
                    # Filter by idUPRN
                    filtered = df_complaints[df_complaints['idUPRN'] == uprn_int]

                    if len(filtered) > 0:
                        result["data"]["complaints"]["count"] = len(filtered)

                        # Categories
                        cat_counts = filtered['Category'].value_counts()
                        result["data"]["complaints"]["categories"] = [
                            {"category": str(k), "count": int(v)}
                            for k, v in cat_counts.items()
                        ]

                        # Stages
                        stage1 = int((filtered['Stage'] == 'Stage 1').sum())
                        stage2 = int((filtered['Stage'] == 'Stage 2').sum())
                        result["data"]["complaints"]["stages"] = {
                            "stage_1": stage1,
                            "stage_2": stage2
                        }

                        # Average response days
                        if 'Total Days' in filtered.columns:
                            avg_days = filtered['Total Days'].mean()
                            result["data"]["complaints"]["avg_response_days"] = (
                                float(avg_days) if pd.notna(avg_days) else None
                            )
            except Exception as e:
                logger.error(f"Failed to load complaints data: {e}")

        # Load repairs data
        if address:
            df_repairs = _load_df_cached('Repairs by Contractor.xlsx')
            if df_repairs is not None:
                try:
                    # DB address: "FLAT 5 Critchley Street, ILKESTON, , DE7 8GD"
                    # Repairs address: "FLAT 5 Critchley Street" (street part only)
                    # Extract street part from DB address for matching
                    address_street = address.split(',')[0].lower().strip()

                    # Match by Address1 (vectorized match on street part)
                    if 'Address1' in df_repairs.columns:
                        df_repairs['_addr_norm'] = df_repairs['Address1'].astype(str).str.lower().str.strip()
                        df_matched = df_repairs[df_repairs['_addr_norm'] == address_street]

                        if len(df_matched) > 0:
                            result["data"]["repairs"]["count"] = len(df_matched)

                            # Total and average cost
                            if 'TotalCost' in df_matched.columns:
                                total_cost = float(df_matched['TotalCost'].sum())
                                avg_cost = float(df_matched['TotalCost'].mean())
                                result["data"]["repairs"]["total_cost"] = total_cost
                                result["data"]["repairs"]["avg_cost"] = avg_cost

                            # Top trades
                            if 'Trade' in df_matched.columns:
                                trade_counts = df_matched['Trade'].dropna().value_counts()
                                result["data"]["repairs"]["top_trades"] = [
                                    {"trade": str(k), "count": int(v)}
                                    for k, v in trade_counts.items()
                                ]

                            # On-time percentage
                            if 'Attended On Time' in df_matched.columns:
                                on_time_yes = int((df_matched['Attended On Time'] == 'Yes').sum())
                                on_time_no = int((df_matched['Attended On Time'] == 'No').sum())
                                total_on_time = on_time_yes + on_time_no
                                if total_on_time > 0:
                                    on_time_pct = round(on_time_yes / total_on_time * 100, 1)
                                    result["data"]["repairs"]["on_time_pct"] = float(on_time_pct)
                except Exception as e:
                    logger.error(f"Failed to load repairs data: {e}")

        return result

    @staticmethod
    def get_postcode_hotspots(db) -> dict:
        """
        Builds a postcode-level aggregation of repairs and complaints.

        Args:
            db: SQLAlchemy database session

        Returns:
            dict with hotspots and summary data
        """
        result = {
            "status": "success",
            "data": {
                "hotspots": [],
                "summary": {
                    "total_postcodes": 0,
                    "total_repairs_mapped": 0,
                    "total_complaints_mapped": 0,
                }
            }
        }

        # Load complaints data
        complaints_by_postcode = {}
        df_complaints = _load_df_cached('Complaints Data 1.xlsx')
        if df_complaints is not None:
            try:
                complaints_counts = df_complaints['Post Code'].value_counts()
                complaints_by_postcode = {
                    str(k): int(v) for k, v in complaints_counts.items()
                }
            except Exception as e:
                logger.error(f"Failed to load complaints data: {e}")

        # Build address to postcode mapping from database
        # DB addresses are like: "FLAT 5 Critchley Street, ILKESTON, , DE7 8GD"
        # Repairs addresses are like: "FLAT 5 Critchley Street" (first part only)
        # So we extract the part before the first comma for matching
        address_to_postcode = {}
        try:
            query = text(
                "SELECT DISTINCT address, postcode FROM properties "
                "WHERE postcode IS NOT NULL AND address IS NOT NULL"
            )
            rows = db.execute(query).fetchall()
            for row in rows:
                full_address = str(row.address).strip()
                postcode_val = str(row.postcode).strip()
                if full_address and postcode_val:
                    # Extract street part (before first comma) for matching
                    street_part = full_address.split(',')[0].lower().strip()
                    address_to_postcode[street_part] = postcode_val
        except Exception as e:
            logger.error(f"Failed to query properties from database: {e}")

        # Load repairs data
        repairs_by_postcode = {}
        df_repairs = _load_df_cached('Repairs by Contractor.xlsx')
        if df_repairs is not None:
            try:
                if 'Address1' in df_repairs.columns:
                    # Vectorized address→postcode mapping
                    df_repairs['_addr_norm'] = df_repairs['Address1'].astype(str).str.lower().str.strip()
                    df_repairs['_postcode'] = df_repairs['_addr_norm'].map(address_to_postcode)
                    df_matched = df_repairs.dropna(subset=['_postcode'])

                    if len(df_matched) > 0:
                        grouped = df_matched.groupby('_postcode').agg(
                            count=('_postcode', 'size'),
                            total_cost=('TotalCost', lambda x: float(x.fillna(0).sum())),
                        )
                        repairs_by_postcode = {
                            str(pc): {"count": int(row['count']), "total_cost": round(float(row['total_cost']), 2)}
                            for pc, row in grouped.iterrows()
                        }
            except Exception as e:
                logger.error(f"Failed to load repairs data: {e}")

        # Query database for postcode centroids
        postcode_centroids = {}
        try:
            query = text(
                "SELECT postcode, AVG(latitude) as lat, AVG(longitude) as lng, "
                "COUNT(*) as property_count FROM properties "
                "WHERE latitude IS NOT NULL GROUP BY postcode"
            )
            rows = db.execute(query).fetchall()
            for row in rows:
                postcode_centroids[str(row.postcode)] = {
                    "lat": float(row.lat),
                    "lng": float(row.lng),
                    "property_count": int(row.property_count)
                }
        except Exception as e:
            logger.error(f"Failed to query postcode centroids: {e}")

        # Merge all datasets by postcode
        all_postcodes = set(
            list(complaints_by_postcode.keys()) +
            list(repairs_by_postcode.keys()) +
            list(postcode_centroids.keys())
        )

        hotspots = []
        total_repairs_mapped = 0
        total_complaints_mapped = 0

        for postcode in sorted(all_postcodes):
            centroid = postcode_centroids.get(postcode, {})
            repair_data = repairs_by_postcode.get(postcode, {"count": 0, "total_cost": 0.0})
            complaint_count = complaints_by_postcode.get(postcode, 0)

            repair_count = repair_data["count"]
            total_repair_cost = repair_data["total_cost"]
            combined_count = repair_count + complaint_count

            hotspot = {
                "postcode": postcode,
                "lat": centroid.get("lat"),
                "lng": centroid.get("lng"),
                "property_count": centroid.get("property_count", 0),
                "repair_count": repair_count,
                "complaint_count": complaint_count,
                "total_repair_cost": total_repair_cost,
                "combined_count": combined_count,
            }
            hotspots.append(hotspot)

            total_repairs_mapped += repair_count
            total_complaints_mapped += complaint_count

        result["data"]["hotspots"] = hotspots
        result["data"]["summary"] = {
            "total_postcodes": len(all_postcodes),
            "total_repairs_mapped": total_repairs_mapped,
            "total_complaints_mapped": total_complaints_mapped,
        }

        return result
