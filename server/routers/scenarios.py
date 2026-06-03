"""
Scenario Planner Router — STATUS: PENDING DECISION (April 2026)

API endpoints for retrofit scenario planning and analysis.

This module provides endpoints to model retrofit interventions, estimate costs,
and project carbon/energy savings for social housing properties.

⚠️  DEPRECATION NOTICE
The Scenarios feature was removed from the navigation in March 2026 but the
backend router and the ScenarioPlanner.tsx page were left in place. The
SHDT_Build_Order.docx (Phase 1, item #4) flags this as needing a deliberate
decision: either reinstate Scenarios as a first-class feature, or remove it.

This file is intentionally kept untouched until that decision is made.

Reasons to KEEP/REINSTATE:
  - The cost-tier intervention catalogue in services/digital_twin/scenario_engine.py
    is real engineering work and would feed an SHDF Wave 4 case generator nicely.
  - "What-if" retrofit planning is genuinely useful for capital programmes.

Reasons to REMOVE:
  - Untested, no users, no UX surface in nav.
  - The Phase 5 hero feature list (build order item #24, "board pack PDF") may
    cover the same ground more credibly.

Action: review with the product owner before Phase 2 deployment so we are not
shipping dead code paths to Azure.
"""

from fastapi import APIRouter, HTTPException, Body
from sqlalchemy import text
from typing import List, Optional, Dict, Any
import math

from database import engine

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


# ============================================================================
# COST AND CARBON MODELS
# ============================================================================

class RetrofitCostModel:
    """Realistic UK retrofit cost estimates by intervention and property type."""

    # Cost ranges in GBP by intervention type
    INTERVENTION_COSTS = {
        "insulation": {
            "Flat": {"min": 4000, "max": 8000},
            "House": {"min": 5000, "max": 12000},
            "Bungalow": {"min": 4500, "max": 10000},
            "Terrace": {"min": 5000, "max": 11000},
            "Semi": {"min": 5500, "max": 12000},
        },
        "heating": {
            "Flat": {"min": 8000, "max": 12000},
            "House": {"min": 10000, "max": 15000},
            "Bungalow": {"min": 8500, "max": 13000},
            "Terrace": {"min": 9000, "max": 14000},
            "Semi": {"min": 9500, "max": 14500},
        },
        "windows": {
            "Flat": {"min": 3000, "max": 6000},
            "House": {"min": 4000, "max": 8000},
            "Bungalow": {"min": 3500, "max": 7000},
            "Terrace": {"min": 3500, "max": 7500},
            "Semi": {"min": 4000, "max": 8000},
        },
        "solar": {
            "Flat": {"min": 5000, "max": 7000},
            "House": {"min": 6000, "max": 8000},
            "Bungalow": {"min": 5500, "max": 7500},
            "Terrace": {"min": 5500, "max": 7500},
            "Semi": {"min": 6000, "max": 8000},
        },
    }

    # EPC bands: A=1, B=2, C=3, D=4, E=5, F=6, G=7
    EPC_BANDS = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7}

    # CO2 savings per intervention type (tonnes/year)
    CO2_SAVINGS = {
        "insulation": 1.2,
        "heating": 2.5,
        "windows": 0.4,
        "solar": 1.8,
    }

    # Energy bill savings per intervention type (£/year)
    ENERGY_BILL_SAVINGS = {
        "insulation": 400,
        "heating": 600,
        "windows": 150,
        "solar": 300,
    }

    @staticmethod
    def get_cost_for_property(
        property_type: str,
        bedrooms: int,
        current_epc: str,
        target_epc: str,
        interventions: List[str],
    ) -> Dict[str, Any]:
        """
        Calculate retrofit cost for a property.

        Args:
            property_type: Type of property (Flat, House, etc.)
            bedrooms: Number of bedrooms
            current_epc: Current EPC rating (A-G)
            target_epc: Target EPC rating (A-G)
            interventions: List of intervention types to apply

        Returns:
            Dict with total_cost, cost_breakdown, and savings estimates
        """
        # Normalize property type
        prop_type = property_type.strip().title() if property_type else "House"

        # Get EPC band distance (number of bands to improve)
        current_band = RetrofitCostModel.EPC_BANDS.get(current_epc, 7)
        target_band = RetrofitCostModel.EPC_BANDS.get(target_epc, 1)
        bands_to_improve = max(0, current_band - target_band)

        cost_breakdown = {}
        total_cost = 0
        co2_savings = 0
        energy_savings = 0

        for intervention in interventions:
            if intervention not in RetrofitCostModel.INTERVENTION_COSTS:
                continue

            # Get cost range for this intervention
            cost_data = RetrofitCostModel.INTERVENTION_COSTS.get(intervention, {})
            cost_range = cost_data.get(prop_type, cost_data.get("House", {}))

            min_cost = cost_range.get("min", 5000)
            max_cost = cost_range.get("max", 10000)

            # Calculate cost based on property size (bedrooms as proxy)
            # More bedrooms = higher cost
            bedroom_multiplier = 1.0 + ((bedrooms - 2) * 0.1) if bedrooms else 1.0
            bedroom_multiplier = max(0.8, min(1.5, bedroom_multiplier))

            # Calculate cost based on EPC band distance
            # More bands to improve = higher cost
            band_multiplier = 1.0 + ((bands_to_improve - 1) * 0.15) if bands_to_improve > 0 else 1.0
            band_multiplier = max(1.0, min(1.6, band_multiplier))

            # Base cost (midpoint of range)
            base_cost = (min_cost + max_cost) / 2
            intervention_cost = int(base_cost * bedroom_multiplier * band_multiplier)

            cost_breakdown[intervention] = intervention_cost
            total_cost += intervention_cost

            # Add savings
            co2_savings += RetrofitCostModel.CO2_SAVINGS.get(intervention, 0)
            energy_savings += RetrofitCostModel.ENERGY_BILL_SAVINGS.get(intervention, 0)

        return {
            "total_cost": total_cost,
            "cost_breakdown": cost_breakdown,
            "co2_savings_tonnes_year": round(co2_savings, 2),
            "energy_savings_year": energy_savings,
        }


# ============================================================================
# FILTER HELPER FUNCTIONS
# ============================================================================

def build_where_clause(filters: Dict[str, Any]) -> tuple:
    """
    Build WHERE clause and parameters for property filtering.

    Args:
        filters: Dict with optional keys: epc_ratings, ward_name, local_authority_name, property_type

    Returns:
        Tuple of (where_clause_string, parameters_dict)
    """
    conditions = []
    params = {}

    if filters.get("epc_ratings"):
        epc_list = filters["epc_ratings"]
        if isinstance(epc_list, list) and epc_list:
            placeholders = ", ".join([f":epc_{i}" for i in range(len(epc_list))])
            conditions.append(f"epc_rating IN ({placeholders})")
            for i, rating in enumerate(epc_list):
                params[f"epc_{i}"] = rating

    if filters.get("ward_name"):
        conditions.append("ward = :ward_name")
        params["ward_name"] = filters["ward_name"]

    if filters.get("local_authority_name"):
        conditions.append("local_authority = :local_authority_name")
        params["local_authority_name"] = filters["local_authority_name"]

    if filters.get("property_type"):
        conditions.append("property_type = :property_type")
        params["property_type"] = filters["property_type"]

    where_clause = " AND ".join(conditions) if conditions else "TRUE"
    return where_clause, params


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/run")
def run_scenario(
    name: str = Body(..., embed=True),
    filters: Dict[str, Any] = Body(default={}, embed=True),
    target_epc: str = Body("C", embed=True),
    interventions: List[str] = Body(default=["insulation", "heating"], embed=True),
):
    """
    Run a retrofit scenario and calculate impacts.

    This endpoint queries properties matching the given filters and calculates
    the total cost, carbon savings, and energy bill savings of applying the
    specified interventions to bring all properties to the target EPC rating.

    Args:
        name: Scenario name (e.g., "Upgrade E/F/G to C")
        filters: Optional filter dict with:
            - epc_ratings: List of current EPC ratings to target (e.g., ["E", "F", "G"])
            - ward_name: Ward name to filter by
            - local_authority_name: Local authority name to filter by
            - property_type: Property type to filter by (e.g., "Flat", "House")
        target_epc: Target EPC rating (A-G)
        interventions: List of intervention types to apply
                      (insulation, heating, windows, solar)

    Returns:
        Scenario results with cost estimates, CO2/energy savings, and impact analysis.
    """
    try:
        # Validate target EPC
        if target_epc not in RetrofitCostModel.EPC_BANDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target_epc '{target_epc}'. Must be A-G."
            )

        # Validate interventions
        valid_interventions = set(RetrofitCostModel.INTERVENTION_COSTS.keys())
        for intervention in interventions:
            if intervention not in valid_interventions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid intervention '{intervention}'. Valid options: {valid_interventions}"
                )

        # Build WHERE clause
        where_clause, params = build_where_clause(filters)

        # Query matching properties
        query = f"""
            SELECT
                id,
                epc_rating,
                property_type,
                bedrooms,
                floor_area,
                ward,
                local_authority
            FROM properties
            WHERE {where_clause}
            ORDER BY ward, local_authority
        """

        with engine.connect() as conn:
            rows = conn.execute(text(query), params).fetchall()

        if not rows:
            return {
                "scenario_name": name,
                "properties_affected": 0,
                "current_epc_distribution": {},
                "projected_epc_distribution": {},
                "total_cost_estimate": 0,
                "avg_cost_per_property": 0,
                "total_co2_savings_tonnes_year": 0,
                "total_energy_savings_year": 0,
                "cost_breakdown": {},
                "top_areas": [],
                "payback_years": 0,
            }

        # Process each property
        current_epc_dist = {}
        projected_epc_dist = {}
        total_cost = 0
        total_co2_savings = 0
        total_energy_savings = 0
        cost_breakdown = {intervention: 0 for intervention in interventions}

        # Track costs by ward/LA for top_areas
        area_costs = {}

        properties_data = []

        for row in rows:
            prop_id, current_epc, prop_type, bedrooms, floor_area, ward, local_authority = row

            # Count current EPC distribution
            current_epc_dist[current_epc] = current_epc_dist.get(current_epc, 0) + 1

            # Count projected EPC distribution (all will be target_epc)
            projected_epc_dist[target_epc] = projected_epc_dist.get(target_epc, 0) + 1

            # Calculate retrofit cost for this property
            cost_info = RetrofitCostModel.get_cost_for_property(
                property_type=prop_type,
                bedrooms=bedrooms or 2,
                current_epc=current_epc,
                target_epc=target_epc,
                interventions=interventions,
            )

            total_cost += cost_info["total_cost"]
            total_co2_savings += cost_info["co2_savings_tonnes_year"]
            total_energy_savings += cost_info["energy_savings_year"]

            # Accumulate cost breakdown
            for intervention, cost in cost_info["cost_breakdown"].items():
                cost_breakdown[intervention] += cost

            # Track by area
            area_key = f"{ward or 'Unknown'} / {local_authority or 'Unknown'}"
            if area_key not in area_costs:
                area_costs[area_key] = {"count": 0, "cost": 0}
            area_costs[area_key]["count"] += 1
            area_costs[area_key]["cost"] += cost_info["total_cost"]

            properties_data.append({
                "id": str(prop_id),
                "current_epc": current_epc,
                "cost": cost_info["total_cost"],
            })

        num_properties = len(rows)
        avg_cost_per_property = int(total_cost / num_properties) if num_properties > 0 else 0

        # Calculate payback period (years)
        payback_years = 0.0
        if total_energy_savings > 0 and total_cost > 0:
            payback_years = round(total_cost / total_energy_savings, 1)

        # Get top 10 areas by cost
        top_areas = sorted(
            [
                {
                    "area": key,
                    "count": data["count"],
                    "cost": data["cost"],
                    "avg_cost": int(data["cost"] / data["count"]),
                }
                for key, data in area_costs.items()
            ],
            key=lambda x: x["cost"],
            reverse=True
        )[:10]

        return {
            "scenario_name": name,
            "properties_affected": num_properties,
            "current_epc_distribution": current_epc_dist,
            "projected_epc_distribution": projected_epc_dist,
            "total_cost_estimate": total_cost,
            "avg_cost_per_property": avg_cost_per_property,
            "total_co2_savings_tonnes_year": round(total_co2_savings, 2),
            "total_energy_savings_year": total_energy_savings,
            "cost_breakdown": cost_breakdown,
            "top_areas": top_areas,
            "payback_years": payback_years,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scenario execution failed: {str(e)}")


@router.get("/options")
def get_scenario_options():
    """
    Get available filter options for scenario planning.

    Returns available:
    - EPC ratings in the database
    - Ward names
    - Local authority names
    - Property types
    - Intervention types with descriptions and cost ranges
    """
    try:
        with engine.connect() as conn:
            # Get distinct EPC ratings
            epc_result = conn.execute(
                text("""
                    SELECT DISTINCT epc_rating
                    FROM properties
                    WHERE epc_rating IS NOT NULL
                    ORDER BY epc_rating
                """)
            ).fetchall()
            epc_ratings = [row[0] for row in epc_result if row[0]]

            # Get distinct wards
            wards_result = conn.execute(
                text("""
                    SELECT DISTINCT ward_name
                    FROM properties
                    WHERE ward_name IS NOT NULL
                    ORDER BY ward_name
                """)
            ).fetchall()
            wards = [row[0] for row in wards_result if row[0]]

            # Get distinct local authorities
            la_result = conn.execute(
                text("""
                    SELECT DISTINCT local_authority_name
                    FROM properties
                    WHERE local_authority_name IS NOT NULL
                    ORDER BY local_authority_name
                """)
            ).fetchall()
            local_authorities = [row[0] for row in la_result if row[0]]

            # Get distinct property types
            proptype_result = conn.execute(
                text("""
                    SELECT DISTINCT property_type
                    FROM properties
                    WHERE property_type IS NOT NULL
                    ORDER BY property_type
                """)
            ).fetchall()
            property_types = [row[0] for row in proptype_result if row[0]]

        return {
            "epc_ratings": epc_ratings,
            "ward_names": wards,
            "local_authority_names": local_authorities,
            "property_types": property_types,
            "interventions": [
                {
                    "id": "insulation",
                    "name": "Insulation Upgrade",
                    "description": "Wall and loft insulation upgrade",
                    "cost_range": {
                        "min": 4000,
                        "max": 12000,
                    },
                    "co2_savings_tonnes_year": 1.2,
                    "energy_savings_year": 400,
                },
                {
                    "id": "heating",
                    "name": "Heat Pump Installation",
                    "description": "Replace boiler with modern heat pump system",
                    "cost_range": {
                        "min": 8000,
                        "max": 15000,
                    },
                    "co2_savings_tonnes_year": 2.5,
                    "energy_savings_year": 600,
                },
                {
                    "id": "windows",
                    "name": "Windows Replacement",
                    "description": "Double or triple glazing window replacement",
                    "cost_range": {
                        "min": 3000,
                        "max": 8000,
                    },
                    "co2_savings_tonnes_year": 0.4,
                    "energy_savings_year": 150,
                },
                {
                    "id": "solar",
                    "name": "Solar Panels",
                    "description": "Photovoltaic solar panel installation",
                    "cost_range": {
                        "min": 5000,
                        "max": 8000,
                    },
                    "co2_savings_tonnes_year": 1.8,
                    "energy_savings_year": 300,
                },
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch options: {str(e)}")


@router.get("/epc-upgrade-costs")
def get_epc_upgrade_costs():
    """
    Get the cost model being used for EPC upgrades.

    Returns detailed cost matrices for each intervention type and property type,
    allowing the frontend to display and understand the cost model.
    """
    return {
        "cost_model": "UK 2026 Retrofit Cost Estimates",
        "epc_bands": RetrofitCostModel.EPC_BANDS,
        "intervention_costs": RetrofitCostModel.INTERVENTION_COSTS,
        "co2_savings_per_intervention": RetrofitCostModel.CO2_SAVINGS,
        "energy_bill_savings_per_intervention": RetrofitCostModel.ENERGY_BILL_SAVINGS,
        "notes": [
            "Costs vary by property type (Flat, House, Bungalow, Terrace, Semi)",
            "Costs adjusted by number of bedrooms (larger properties cost more)",
            "Costs adjusted by EPC band distance (more bands to improve = higher cost)",
            "All costs are estimates and should be validated with local contractors",
            "Costs exclude VAT and labor for owner-occupier properties",
        ],
    }
