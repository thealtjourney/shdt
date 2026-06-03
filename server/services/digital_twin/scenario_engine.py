"""
Scenario Engine Service
Enables what-if analysis for interventions and retrofits.
Simulates impact on component lifecycles, costs, and carbon emissions.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid
import json


class ScenarioEngine:
    """Executes and compares retrofit and maintenance scenarios."""

    # Intervention types and their effects
    INTERVENTIONS = {
        'boiler_replacement': {
            'target_component': 'Boiler',
            'cost_low': 1500,
            'cost_mid': 2500,
            'cost_high': 4000,
            'carbon_reduction': 0.35,  # % reduction in heating emissions
            'remaining_life_boost': 15,  # Sets remaining life to 15 years
            'description': 'Replace boiler with modern efficient model'
        },
        'wall_insulation': {
            'target_components': ['External Walls', 'Wall Insulation'],
            'cost_low': 1000,
            'cost_mid': 4000,
            'cost_high': 12000,
            'carbon_reduction': 0.25,
            'heating_efficiency_gain': 0.20,
            'description': 'Install wall insulation (cavity, external render or internal dry-line)'
        },
        'roof_insulation': {
            'target_components': ['Roof Insulation'],
            'cost_low': 500,
            'cost_mid': 1500,
            'cost_high': 4000,
            'carbon_reduction': 0.15,
            'heating_efficiency_gain': 0.10,
            'description': 'Upgrade loft insulation'
        },
        'window_replacement': {
            'target_component': 'Windows',
            'cost_low': 200,
            'cost_mid': 500,
            'cost_high': 1200,
            'carbon_reduction': 0.08,
            'heating_efficiency_gain': 0.15,
            'remaining_life_boost': 30,
            'description': 'Replace windows with high-performance double or triple glazing'
        },
        'solar_pv': {
            'target_component': 'Roof Covering',
            'cost_low': 5000,
            'cost_mid': 8000,
            'cost_high': 15000,
            'carbon_reduction': 0.40,
            'renewable_generation_kwh': 3000,
            'remaining_life_modifier': 0.9,
            'description': 'Install solar PV panels'
        },
        'kitchen_replacement': {
            'target_component': 'Kitchen',
            'cost_low': 800,
            'cost_mid': 3000,
            'cost_high': 8000,
            'remaining_life_boost': 20,
            'description': 'Replace kitchen units and appliances'
        },
        'bathroom_replacement': {
            'target_component': 'Bathroom',
            'cost_low': 600,
            'cost_mid': 2500,
            'cost_high': 6000,
            'water_efficiency_gain': 0.30,
            'remaining_life_boost': 20,
            'description': 'Replace bathroom suite with modern fixtures'
        },
        'full_retrofit': {
            'target_components': ['Boiler', 'Wall Insulation', 'Roof Insulation', 'Windows'],
            'cost_low': 15000,
            'cost_mid': 35000,
            'cost_high': 70000,
            'carbon_reduction': 0.65,
            'heating_efficiency_gain': 0.45,
            'description': 'Comprehensive retrofit including heating, insulation, and windows'
        }
    }

    def __init__(self, db: Session):
        """Initialize the scenario engine."""
        self.db = db

    def create_scenario(self, organisation_id: str, name: str,
                       description: str, interventions: List[Dict],
                       target_filter: Optional[Dict] = None,
                       timeframe_years: int = 10,
                       created_by: Optional[str] = None) -> str:
        """
        Create a new scenario.

        Args:
            organisation_id: UUID of organisation
            name: Scenario name
            description: Scenario description
            interventions: List of intervention dicts with 'type' and optional 'property_id'
            target_filter: Optional filter criteria (e.g., {'priority': 'CRITICAL'})
            timeframe_years: Analysis timeframe
            created_by: UUID of creating user

        Returns:
            Scenario ID
        """
        try:
            scenario_id = str(uuid.uuid4())

            self.db.execute(
                text("""
                    INSERT INTO scenarios
                    (id, organisation_id, name, description, created_by, status,
                     target_filter, interventions, timeframe_years)
                    VALUES (:id, :org_id, :name, :desc, :created_by, :status,
                            :target_filter::jsonb, :interventions::jsonb, :timeframe)
                """),
                {
                    "id": scenario_id,
                    "org_id": organisation_id,
                    "name": name,
                    "desc": description,
                    "created_by": created_by,
                    "status": "draft",
                    "target_filter": json.dumps(target_filter or {}),
                    "interventions": json.dumps(interventions),
                    "timeframe": timeframe_years
                }
            )

            self.db.commit()
            return scenario_id

        except Exception as e:
            self.db.rollback()
            print(f"Error creating scenario: {str(e)}")
            raise

    def run_scenario(self, scenario_id: str) -> Dict[str, Any]:
        """
        Execute a scenario and calculate results.

        Returns:
            Scenario results including costs, carbon, and outcomes
        """
        try:
            # Get scenario
            result = self.db.execute(
                text("""
                    SELECT organisation_id, interventions, target_filter, timeframe_years
                    FROM scenarios WHERE id = :scenario_id
                """),
                {"scenario_id": scenario_id}
            ).first()

            if not result:
                return {'error': 'Scenario not found'}

            org_id, interventions_json, target_filter_json, timeframe = result
            interventions = json.loads(interventions_json)
            target_filter = json.loads(target_filter_json) if target_filter_json else {}

            # Find target properties
            if 'property_id' in interventions[0]:
                # Specific properties
                property_ids = [interv.get('property_id') for interv in interventions]
            else:
                # Use filter
                property_ids = self._find_properties_by_filter(org_id, target_filter)

            results = {
                'scenario_id': scenario_id,
                'total_properties': len(property_ids),
                'interventions': interventions,
                'timeframe_years': timeframe,
                'total_cost': 0,
                'total_carbon_reduction_tonnes': 0,
                'properties': []
            }

            # Simulate intervention for each property
            for prop_id in property_ids:
                prop_results = self._simulate_interventions(prop_id, interventions, timeframe)
                results['properties'].append(prop_results)
                results['total_cost'] += prop_results['total_cost']
                results['total_carbon_reduction_tonnes'] += prop_results['carbon_reduction_tonnes']

            # Calculate metrics
            if results['properties']:
                avg_cost = results['total_cost'] / len(property_ids)
                results['average_cost_per_property'] = round(avg_cost, 2)
                results['cost_per_tonne_carbon_saved'] = (
                    results['total_cost'] / results['total_carbon_reduction_tonnes']
                    if results['total_carbon_reduction_tonnes'] > 0 else 0
                )

            # Update scenario status and results
            self.db.execute(
                text("""
                    UPDATE scenarios
                    SET status = :status, results = :results::jsonb, completed_at = CURRENT_TIMESTAMP
                    WHERE id = :scenario_id
                """),
                {
                    "scenario_id": scenario_id,
                    "status": "completed",
                    "results": json.dumps(results)
                }
            )

            self.db.commit()
            return results

        except Exception as e:
            self.db.rollback()
            print(f"Error running scenario: {str(e)}")
            return {'error': str(e)}

    def compare_scenarios(self, scenario_ids: List[str]) -> Dict[str, Any]:
        """
        Compare multiple scenarios side-by-side.

        Returns:
            Comparison data showing costs, benefits, and relative performance
        """
        try:
            comparison = {
                'scenarios': [],
                'total_properties': 0,
                'cost_range': {'min': float('inf'), 'max': 0},
                'carbon_reduction_range': {'min': float('inf'), 'max': 0},
                'best_cost_efficiency': None
            }

            for scenario_id in scenario_ids:
                result = self.db.execute(
                    text("""
                        SELECT name, description, results FROM scenarios WHERE id = :id
                    """),
                    {"id": scenario_id}
                ).first()

                if result:
                    name, description, results_json = result
                    results = json.loads(results_json) if results_json else {}

                    scenario_data = {
                        'id': scenario_id,
                        'name': name,
                        'description': description,
                        'total_cost': results.get('total_cost', 0),
                        'carbon_reduction_tonnes': results.get('total_carbon_reduction_tonnes', 0),
                        'properties_affected': results.get('total_properties', 0),
                        'cost_per_tonne': results.get('cost_per_tonne_carbon_saved', 0)
                    }

                    comparison['scenarios'].append(scenario_data)

                    # Update ranges
                    cost = scenario_data['total_cost']
                    carbon = scenario_data['carbon_reduction_tonnes']

                    comparison['cost_range']['min'] = min(comparison['cost_range']['min'], cost)
                    comparison['cost_range']['max'] = max(comparison['cost_range']['max'], cost)
                    comparison['carbon_reduction_range']['min'] = min(comparison['carbon_reduction_range']['min'], carbon)
                    comparison['carbon_reduction_range']['max'] = max(comparison['carbon_reduction_range']['max'], carbon)

            # Identify best cost efficiency
            valid_scenarios = [s for s in comparison['scenarios'] if s['cost_per_tonne'] > 0]
            if valid_scenarios:
                comparison['best_cost_efficiency'] = min(valid_scenarios, key=lambda x: x['cost_per_tonne'])

            return comparison

        except Exception as e:
            print(f"Error comparing scenarios: {str(e)}")
            return {'error': str(e)}

    def carbon_trajectory(self, organisation_id: str, scenario_id: Optional[str] = None,
                         years_ahead: int = 10) -> Dict[str, Any]:
        """
        Calculate carbon emissions trajectory with and without intervention.

        Returns:
            Annual carbon emissions projection data
        """
        try:
            trajectory = {
                'baseline': [],
                'with_scenario': [] if scenario_id else None,
                'years': []
            }

            # Current baseline carbon estimate
            baseline_carbon = self._estimate_baseline_carbon(organisation_id)

            # Project forward
            for year in range(years_ahead + 1):
                current_year = datetime.utcnow().year + year
                trajectory['years'].append(current_year)

                # Baseline (includes natural degradation)
                trajectory['baseline'].append({
                    'year': current_year,
                    'estimated_emissions_tonnes': baseline_carbon * (1 - year * 0.02)  # 2% annual efficiency gain
                })

            # With scenario intervention
            if scenario_id:
                result = self.db.execute(
                    text("""
                        SELECT results FROM scenarios WHERE id = :scenario_id
                    """),
                    {"scenario_id": scenario_id}
                ).first()

                if result:
                    results = json.loads(result[0]) if result[0] else {}
                    carbon_reduction = results.get('total_carbon_reduction_tonnes', 0)

                    for year in range(years_ahead + 1):
                        # Reduced baseline (intervention applied at year 0)
                        current_emissions = baseline_carbon * (1 - year * 0.02) - carbon_reduction
                        trajectory['with_scenario'].append({
                            'year': trajectory['years'][year],
                            'estimated_emissions_tonnes': max(0, current_emissions)
                        })

            return trajectory

        except Exception as e:
            print(f"Error calculating carbon trajectory: {str(e)}")
            return {'error': str(e)}

    def _simulate_interventions(self, property_id: str, interventions: List[Dict],
                               timeframe_years: int) -> Dict[str, Any]:
        """Simulate interventions for a property."""
        results = {
            'property_id': property_id,
            'interventions_applied': [],
            'total_cost': 0,
            'carbon_reduction_tonnes': 0,
            'components_affected': 0,
            'lifecycle_years_extended': 0
        }

        for intervention in interventions:
            interv_type = intervention.get('type')
            if interv_type not in self.INTERVENTIONS:
                continue

            interv_def = self.INTERVENTIONS[interv_type]

            # Find affected components
            target_comps = interv_def.get('target_components', [interv_def.get('target_component')])
            if isinstance(target_comps, str):
                target_comps = [target_comps]

            for comp_name in target_comps:
                # Check if component exists
                comp = self.db.execute(
                    text("""
                        SELECT pc.id, pc.remaining_life_years FROM property_components pc
                        JOIN component_types ct ON pc.component_type_id = ct.id
                        WHERE pc.property_id = :prop_id AND ct.name = :comp_name
                    """),
                    {"prop_id": property_id, "comp_name": comp_name}
                ).first()

                if comp:
                    results['interventions_applied'].append(interv_type)
                    results['total_cost'] += interv_def.get('cost_mid', 0)
                    results['carbon_reduction_tonnes'] += interv_def.get('carbon_reduction', 0) * 10  # Estimate
                    results['components_affected'] += 1

                    if 'remaining_life_boost' in interv_def:
                        results['lifecycle_years_extended'] += interv_def['remaining_life_boost']

        return results

    def _find_properties_by_filter(self, organisation_id: str, target_filter: Dict) -> List[str]:
        """Find properties matching filter criteria."""
        # Simple implementation - can be extended
        try:
            # Default: all properties
            result = self.db.execute(
                text("""
                    SELECT id FROM properties WHERE organisation_id = :org_id LIMIT 100
                """),
                {"org_id": organisation_id}
            ).fetchall()

            return [row[0] for row in result]
        except Exception as e:
            print(f"Error finding properties: {str(e)}")
            return []

    def _estimate_baseline_carbon(self, organisation_id: str) -> float:
        """Estimate baseline annual carbon emissions for organisation."""
        try:
            # Count properties
            count = self.db.execute(
                text("""
                    SELECT COUNT(*) FROM properties WHERE organisation_id = :org_id
                """),
                {"org_id": organisation_id}
            ).scalar()

            # Rough estimate: average UK home ~5 tonnes CO2e/year
            return (count or 0) * 5.0

        except Exception as e:
            print(f"Error estimating baseline carbon: {str(e)}")
            return 0
