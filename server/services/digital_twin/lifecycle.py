"""
Component Lifecycle Service
Manages component lifecycle calculations including remaining life,
replacement priority scoring, and maintenance forecasting.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
import math


class ComponentLifecycleService:
    """Manages lifecycle calculations for building components."""

    def __init__(self, db: Session):
        """Initialize the lifecycle service."""
        self.db = db

    def calculate_remaining_life(self, component_id: str, component_type_id: int,
                                installation_date: Optional[str],
                                condition_score: int,
                                maintenance_records_count: int) -> float:
        """
        Calculate remaining life in years.
        Factors: age, condition score, maintenance history

        Args:
            component_id: UUID of component
            component_type_id: Reference to component type
            installation_date: ISO date string or None
            condition_score: 1-5 scale (1=poor, 5=excellent)
            maintenance_records_count: Number of maintenance events

        Returns:
            Estimated remaining years
        """
        # Get expected lifespan from component type
        result = self.db.execute(
            text("SELECT expected_lifespan_years FROM component_types WHERE id = :id"),
            {"id": component_type_id}
        ).first()

        if not result:
            return 5.0  # Default conservative estimate

        expected_lifespan = result[0]

        # Calculate age if installation date known
        if installation_date:
            try:
                inst_date = datetime.fromisoformat(installation_date.replace('Z', '+00:00'))
                age_years = (datetime.utcnow() - inst_date).days / 365.25
                age_ratio = age_years / expected_lifespan
            except (ValueError, AttributeError):
                age_ratio = 0.5  # Assume half-life
        else:
            age_ratio = 0.5

        # Base remaining life
        remaining = expected_lifespan * (1.0 - age_ratio)

        # Adjust based on condition score (1-5, where 5 is excellent)
        condition_multiplier = condition_score / 5.0
        remaining *= condition_multiplier

        # Maintenance boost: well-maintained components last longer
        maintenance_boost = min(maintenance_records_count * 0.1, 0.5)
        remaining *= (1.0 + maintenance_boost)

        # Ensure minimum 0 and reasonable upper bound
        return max(0.0, min(remaining, expected_lifespan * 1.5))

    def calculate_replacement_priority(self, component_id: str,
                                      remaining_life_years: float,
                                      condition_score: int,
                                      criticality: str,
                                      replacement_cost_mid: float,
                                      maintenance_cost_annual: float = 0.0,
                                      tenant_impact_score: float = 1.0) -> Tuple[float, str]:
        """
        Calculate replacement priority score (0-100) and recommendation.

        Scoring formula:
        - Remaining Life (30%): Lower remaining life = higher priority
        - Condition Score (25%): Lower condition = higher priority
        - Criticality (20%): Critical/high components get higher priority
        - Tenant Impact (15%): Impact on tenants
        - Cost Efficiency (10%): Cost vs remaining life

        Args:
            component_id: UUID of component
            remaining_life_years: From calculate_remaining_life
            condition_score: 1-5 scale
            criticality: 'critical', 'high', 'medium', 'low'
            replacement_cost_mid: Expected cost in GBP
            maintenance_cost_annual: Annual maintenance cost
            tenant_impact_score: 0-1 scale (higher = more impact)

        Returns:
            Tuple of (priority_score: 0-100, recommendation: string)
        """
        score = 0.0

        # 1. Remaining Life component (30%)
        # Less than 2 years = high priority
        remaining_life_score = max(0, (2.0 - remaining_life_years) / 2.0) * 100
        score += remaining_life_score * 0.30

        # 2. Condition component (25%)
        # Poor condition (1) = 100, excellent (5) = 0
        condition_score_component = (5 - condition_score) / 4.0 * 100
        score += condition_score_component * 0.25

        # 3. Criticality component (20%)
        criticality_scores = {
            'critical': 100,
            'high': 75,
            'medium': 50,
            'low': 25
        }
        score += criticality_scores.get(criticality, 50) * 0.20

        # 4. Tenant Impact component (15%)
        score += tenant_impact_score * 100 * 0.15

        # 5. Cost Efficiency component (10%)
        # Higher cost relative to remaining life = higher priority (need to replace soon)
        if remaining_life_years > 0:
            cost_per_year = replacement_cost_mid / remaining_life_years
            cost_efficiency = min(cost_per_year / 1000, 1.0) * 100
        else:
            cost_efficiency = 100
        score += cost_efficiency * 0.10

        # Normalize to 0-100
        score = max(0, min(100, score))

        # Determine recommendation
        if score >= 80:
            recommendation = "URGENT: Replace within 6 months"
        elif score >= 60:
            recommendation = "HIGH: Plan replacement within 12-18 months"
        elif score >= 40:
            recommendation = "MEDIUM: Monitor, plan for next 2-3 years"
        elif score >= 20:
            recommendation = "LOW: Plan for replacement in 3+ years"
        else:
            recommendation = "DEFERRED: Monitor, no urgent action needed"

        return score, recommendation

    def refresh_all_calculations(self, organisation_id: str, batch_size: int = 100) -> Dict[str, int]:
        """
        Recalculate remaining life and priority scores for all components.
        Updates database in batches.

        Returns:
            Dictionary with update statistics
        """
        stats = {'processed': 0, 'updated': 0, 'errors': 0}

        try:
            # Get all active components for organisation
            components = self.db.execute(
                text("""
                    SELECT pc.id, pc.component_type_id, pc.installation_date,
                           pc.condition_score, ct.criticality, ct.replacement_cost_mid,
                           ct.expected_lifespan_years
                    FROM property_components pc
                    JOIN component_types ct ON pc.component_type_id = ct.id
                    WHERE pc.organisation_id = :org_id AND pc.status = 'active'
                """),
                {"org_id": organisation_id}
            ).fetchall()

            for component in components:
                try:
                    comp_id, comp_type_id, inst_date, cond_score, criticality, cost_mid, lifespan = component

                    # Count maintenance records
                    maint_count = self.db.execute(
                        text("""
                            SELECT COUNT(*) FROM maintenance_records
                            WHERE component_id = :comp_id AND status != 'cancelled'
                        """),
                        {"comp_id": comp_id}
                    ).scalar()

                    # Calculate remaining life
                    remaining_life = self.calculate_remaining_life(
                        comp_id, comp_type_id, inst_date, cond_score or 3, maint_count or 0
                    )

                    # Calculate priority
                    priority_score, _ = self.calculate_replacement_priority(
                        comp_id, remaining_life, cond_score or 3,
                        criticality, cost_mid
                    )

                    # Estimate failure date
                    failure_date = None
                    if remaining_life > 0:
                        failure_date = datetime.utcnow() + timedelta(days=remaining_life * 365.25)

                    # Update component
                    self.db.execute(
                        text("""
                            UPDATE property_components
                            SET remaining_life_years = :remaining_life,
                                replacement_priority_score = :priority_score,
                                predicted_failure_date = :failure_date,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = :comp_id
                        """),
                        {
                            "comp_id": comp_id,
                            "remaining_life": remaining_life,
                            "priority_score": priority_score,
                            "failure_date": failure_date
                        }
                    )

                    stats['updated'] += 1

                except Exception as e:
                    stats['errors'] += 1
                    print(f"Error processing component {component[0]}: {str(e)}")

                stats['processed'] += 1

            self.db.commit()

        except Exception as e:
            self.db.rollback()
            stats['errors'] += 1
            print(f"Error in refresh_all_calculations: {str(e)}")

        return stats

    def get_replacement_forecast(self, organisation_id: str,
                                years_ahead: int = 10) -> Dict[str, any]:
        """
        Generate replacement forecast for next N years.
        Groups components by predicted failure date and cost.

        Args:
            organisation_id: UUID of organisation
            years_ahead: Number of years to forecast

        Returns:
            Dictionary with forecast data
        """
        forecast_end = datetime.utcnow() + timedelta(days=years_ahead * 365.25)

        try:
            # Get components grouped by predicted failure quarter
            results = self.db.execute(
                text("""
                    SELECT
                        DATE_TRUNC('quarter', predicted_failure_date) as quarter,
                        COUNT(*) as count,
                        SUM(ct.replacement_cost_mid) as total_cost,
                        COUNT(CASE WHEN ct.criticality = 'critical' THEN 1 END) as critical_count,
                        ARRAY_AGG(DISTINCT ct.name) as component_types
                    FROM property_components pc
                    JOIN component_types ct ON pc.component_type_id = ct.id
                    WHERE pc.organisation_id = :org_id
                        AND pc.status = 'active'
                        AND pc.predicted_failure_date > CURRENT_TIMESTAMP
                        AND pc.predicted_failure_date <= :forecast_end
                    GROUP BY DATE_TRUNC('quarter', predicted_failure_date)
                    ORDER BY quarter ASC
                """),
                {"org_id": organisation_id, "forecast_end": forecast_end}
            ).fetchall()

            forecast = {
                'periods': [],
                'total_components': 0,
                'total_cost': 0,
                'critical_replacements': 0
            }

            for row in results:
                quarter, count, total_cost, critical_count, component_types = row
                forecast['periods'].append({
                    'quarter': quarter.isoformat() if quarter else None,
                    'component_count': count,
                    'estimated_cost': float(total_cost or 0),
                    'critical_components': critical_count,
                    'component_types': component_types or []
                })
                forecast['total_components'] += count
                forecast['total_cost'] += float(total_cost or 0)
                forecast['critical_replacements'] += critical_count

            return forecast

        except Exception as e:
            print(f"Error generating replacement forecast: {str(e)}")
            return {'periods': [], 'total_components': 0, 'total_cost': 0, 'critical_replacements': 0}
