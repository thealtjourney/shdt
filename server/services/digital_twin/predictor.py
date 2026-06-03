"""
Component Predictor Service
Predicts component failures and maintenance needs using rule-based models.
Generates portfolio-level predictions and failure probability estimates.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
import math


class ComponentPredictor:
    """Predicts component failures and maintenance needs."""

    def __init__(self, db: Session):
        """Initialize the predictor."""
        self.db = db

    def predict_component(self, component_id: str) -> Dict[str, any]:
        """
        Predict failure probability and timing for a single component.

        Uses rule-based sigmoid model:
        - Base failure probability from age ratio
        - Adjusted by condition score, maintenance frequency, repair history

        Returns:
            Dictionary with prediction data
        """
        try:
            # Get component data
            result = self.db.execute(
                text("""
                    SELECT
                        pc.id, pc.installation_date, pc.condition_score,
                        pc.last_maintained, ct.expected_lifespan_years,
                        ct.criticality, ct.replacement_cost_mid
                    FROM property_components pc
                    JOIN component_types ct ON pc.component_type_id = ct.id
                    WHERE pc.id = :comp_id
                """),
                {"comp_id": component_id}
            ).first()

            if not result:
                return {'error': 'Component not found'}

            comp_id, inst_date, cond_score, last_maintained, lifespan, criticality, cost = result

            # Calculate age and age ratio
            if inst_date:
                age_days = (datetime.utcnow() - inst_date).days if isinstance(inst_date, datetime) else 0
                age_years = age_days / 365.25
                age_ratio = age_years / lifespan if lifespan > 0 else 0
            else:
                age_ratio = 0.5
                age_years = 0

            # Count repairs and maintenance
            maint_result = self.db.execute(
                text("""
                    SELECT COUNT(*) as repair_count,
                           MAX(completed_date) as last_repair,
                           AVG(EXTRACT(EPOCH FROM (completed_date - reported_date))/86400)::INT as avg_repair_days
                    FROM maintenance_records
                    WHERE component_id = :comp_id AND status IN ('completed', 'in_progress')
                """),
                {"comp_id": component_id}
            ).first()

            repair_count = maint_result[0] if maint_result[0] else 0
            last_repair = maint_result[1]
            avg_repair_days = maint_result[2] or 0

            # Base failure probability from age using sigmoid
            base_probability = self._sigmoid(age_ratio * 3 - 0.5)

            # Adjustment factors
            condition_factor = (6 - (cond_score or 3)) / 5.0  # Poor condition increases probability
            repair_factor = 1.0 + (repair_count * 0.05)  # Frequent repairs increase probability
            maintenance_boost = 1.0 - (min(repair_count, 5) * 0.1)  # Good maintenance reduces probability

            # Combined failure probability
            failure_probability = base_probability * condition_factor * repair_factor * maintenance_boost
            failure_probability = max(0, min(1.0, failure_probability))

            # Estimate time to failure (years)
            if failure_probability > 0.95:
                time_to_failure = max(0.1, (1 - age_ratio) * lifespan * 0.25)
            elif failure_probability > 0.8:
                time_to_failure = (1 - age_ratio) * lifespan * 0.5
            elif failure_probability > 0.5:
                time_to_failure = (1 - age_ratio) * lifespan * 0.75
            else:
                time_to_failure = (1 - age_ratio) * lifespan

            predicted_failure_date = datetime.utcnow() + timedelta(days=time_to_failure * 365.25)

            # Urgency classification
            if failure_probability > 0.8 or time_to_failure < 1:
                urgency = 'CRITICAL'
            elif failure_probability > 0.6 or time_to_failure < 2:
                urgency = 'HIGH'
            elif failure_probability > 0.4 or time_to_failure < 5:
                urgency = 'MEDIUM'
            else:
                urgency = 'LOW'

            return {
                'component_id': comp_id,
                'age_years': round(age_years, 1),
                'expected_lifespan_years': lifespan,
                'condition_score': cond_score,
                'repair_history': {
                    'total_repairs': repair_count,
                    'last_repair_date': last_repair.isoformat() if last_repair else None,
                    'avg_days_to_repair': avg_repair_days
                },
                'failure_probability': round(failure_probability, 3),
                'time_to_failure_years': round(time_to_failure, 1),
                'predicted_failure_date': predicted_failure_date.isoformat(),
                'urgency': urgency,
                'estimated_cost': float(cost) if cost else None
            }

        except Exception as e:
            print(f"Error predicting component {component_id}: {str(e)}")
            return {'error': str(e)}

    def predict_property(self, property_id: str) -> Dict[str, any]:
        """
        Predict failures and maintenance needs for all components at a property.

        Returns:
            Dictionary with property-level predictions
        """
        try:
            # Get all components for property
            components = self.db.execute(
                text("""
                    SELECT id FROM property_components
                    WHERE property_id = :prop_id AND status = 'active'
                """),
                {"prop_id": property_id}
            ).fetchall()

            predictions = []
            total_cost_risk = 0
            critical_count = 0
            high_count = 0

            for (comp_id,) in components:
                pred = self.predict_component(comp_id)
                if 'error' not in pred:
                    predictions.append(pred)
                    if pred['estimated_cost']:
                        total_cost_risk += pred['estimated_cost'] * pred['failure_probability']
                    if pred['urgency'] == 'CRITICAL':
                        critical_count += 1
                    elif pred['urgency'] == 'HIGH':
                        high_count += 1

            # Calculate average failure probability
            avg_failure_probability = 0
            if predictions:
                avg_failure_probability = sum(p['failure_probability'] for p in predictions) / len(predictions)

            return {
                'property_id': property_id,
                'total_components': len(predictions),
                'components_at_risk': sum(1 for p in predictions if p['failure_probability'] > 0.5),
                'critical_components': critical_count,
                'high_priority_components': high_count,
                'average_failure_probability': round(avg_failure_probability, 3),
                'estimated_cost_at_risk': round(total_cost_risk, 2),
                'predictions': predictions
            }

        except Exception as e:
            print(f"Error predicting property {property_id}: {str(e)}")
            return {'error': str(e)}

    def predict_portfolio(self, organisation_id: str, limit: int = 100) -> Dict[str, any]:
        """
        Generate portfolio-level predictions across all properties.
        Aggregates risk and prioritizes high-risk properties.

        Args:
            organisation_id: UUID of organisation
            limit: Maximum number of properties to include in detail

        Returns:
            Dictionary with portfolio predictions
        """
        try:
            # Get all properties for organisation
            properties = self.db.execute(
                text("""
                    SELECT id FROM properties
                    WHERE organisation_id = :org_id
                    LIMIT :limit
                """),
                {"org_id": organisation_id, "limit": limit}
            ).fetchall()

            portfolio_data = {
                'total_properties': 0,
                'total_components': 0,
                'total_cost_at_risk': 0,
                'critical_components': 0,
                'high_priority_components': 0,
                'properties_with_critical_issues': 0,
                'property_predictions': []
            }

            for (prop_id,) in properties:
                prop_pred = self.predict_property(prop_id)
                if 'error' not in prop_pred and prop_pred['components_at_risk'] > 0:
                    portfolio_data['property_predictions'].append({
                        'property_id': prop_pred['property_id'],
                        'total_components': prop_pred['total_components'],
                        'components_at_risk': prop_pred['components_at_risk'],
                        'critical_components': prop_pred['critical_components'],
                        'estimated_cost_at_risk': prop_pred['estimated_cost_at_risk']
                    })

                portfolio_data['total_components'] += prop_pred.get('total_components', 0)
                portfolio_data['total_cost_at_risk'] += prop_pred.get('estimated_cost_at_risk', 0)
                portfolio_data['critical_components'] += prop_pred.get('critical_components', 0)
                portfolio_data['high_priority_components'] += prop_pred.get('high_priority_components', 0)

                if prop_pred.get('critical_components', 0) > 0:
                    portfolio_data['properties_with_critical_issues'] += 1

            portfolio_data['total_properties'] = len(properties)

            # Sort by cost at risk
            portfolio_data['property_predictions'] = sorted(
                portfolio_data['property_predictions'],
                key=lambda x: x['estimated_cost_at_risk'],
                reverse=True
            )[:limit]

            return portfolio_data

        except Exception as e:
            print(f"Error predicting portfolio: {str(e)}")
            return {'error': str(e)}

    def refresh_predictions(self, organisation_id: str, batch_size: int = 100) -> Dict[str, int]:
        """
        Refresh all predictions and update component records with latest predictions.

        Returns:
            Dictionary with update statistics
        """
        stats = {'processed': 0, 'updated': 0, 'errors': 0}

        try:
            # Get all components for organisation
            components = self.db.execute(
                text("""
                    SELECT id FROM property_components
                    WHERE organisation_id = :org_id AND status = 'active'
                """),
                {"org_id": organisation_id}
            ).fetchall()

            for (comp_id,) in components:
                try:
                    pred = self.predict_component(comp_id)

                    if 'error' not in pred:
                        # Update component with prediction data
                        self.db.execute(
                            text("""
                                UPDATE property_components
                                SET predicted_failure_date = :failure_date,
                                    predicted_failure_confidence = :confidence,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = :comp_id
                            """),
                            {
                                "comp_id": comp_id,
                                "failure_date": pred.get('predicted_failure_date'),
                                "confidence": pred.get('failure_probability', 0.5)
                            }
                        )
                        stats['updated'] += 1

                except Exception as e:
                    stats['errors'] += 1
                    print(f"Error updating component {comp_id}: {str(e)}")

                stats['processed'] += 1

            self.db.commit()

        except Exception as e:
            self.db.rollback()
            stats['errors'] += 1
            print(f"Error refreshing predictions: {str(e)}")

        return stats

    def _sigmoid(self, x: float) -> float:
        """Sigmoid function for probability calculation."""
        try:
            return 1 / (1 + math.exp(-x))
        except OverflowError:
            return 1.0 if x > 0 else 0.0
