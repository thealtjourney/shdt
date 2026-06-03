"""
Component Seeder Service
Populates property components from EPC data and property information.
Maps EPC data to standard component types and estimates installation dates.
"""

from datetime import datetime, date
from typing import Optional, Dict, Any
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text


class ComponentSeeder:
    """Seeds components into the digital twin from EPC and property data."""

    # Mapping of EPC data to component types
    EPC_TO_COMPONENTS = {
        'wall': [
            ('External Walls', 'structure'),
            ('Wall Insulation', 'envelope')
        ],
        'roof': [
            ('Roof Covering', 'envelope'),
            ('Roof Insulation', 'envelope')
        ],
        'heating': [
            ('Boiler', 'services'),
            ('Hot Water System', 'services')
        ],
        'windows': [
            ('Windows', 'envelope')
        ],
        'lighting': [
            ('Electrics', 'services')
        ],
    }

    STANDARD_COMPONENTS = [
        'Kitchen',
        'Bathroom',
        'Front Door',
        'Plumbing',
        'Rainwater Goods',
    ]

    def __init__(self, db: Session):
        """Initialize the component seeder."""
        self.db = db

    def seed_property_components(self, property_id: str, epc_data: Dict[str, Any], property_data: Dict[str, Any], organisation_id: str) -> Dict[str, int]:
        """
        Seed components for a property based on EPC and property data.

        Args:
            property_id: UUID of the property
            epc_data: EPC certificate data with features/characteristics
            property_data: Property metadata (construction_age_band, etc.)
            organisation_id: UUID of the owning organisation

        Returns:
            Dictionary with count of created components by type
        """
        created = {'epc_based': 0, 'standard': 0, 'total': 0}

        try:
            # Extract construction age band to estimate installation dates
            construction_age_band = property_data.get('construction_age_band', 'Unknown')
            base_install_date = self._estimate_base_install_date(construction_age_band)

            # Process EPC-based components
            created['epc_based'] = self._seed_epc_components(
                property_id, epc_data, base_install_date, organisation_id
            )

            # Add standard components (always present in social housing)
            created['standard'] = self._seed_standard_components(
                property_id, base_install_date, organisation_id
            )

            created['total'] = created['epc_based'] + created['standard']

        except Exception as e:
            print(f"Error seeding components for property {property_id}: {str(e)}")
            raise

        return created

    def _seed_epc_components(self, property_id: str, epc_data: Dict[str, Any],
                            base_install_date: date, organisation_id: str) -> int:
        """Seed components extracted from EPC data."""
        count = 0

        # Extract relevant features from EPC
        epc_features = epc_data.get('features', {})

        # Walls
        if epc_features.get('walls'):
            for component_name, category in self.EPC_TO_COMPONENTS['wall']:
                if self._create_component(property_id, component_name,
                                        base_install_date, organisation_id,
                                        specification={'source': 'EPC', 'data': epc_features['walls']}):
                    count += 1

        # Roof
        if epc_features.get('roof_type'):
            for component_name, category in self.EPC_TO_COMPONENTS['roof']:
                if self._create_component(property_id, component_name,
                                        base_install_date, organisation_id,
                                        specification={'source': 'EPC', 'type': epc_features.get('roof_type')}):
                    count += 1

        # Heating system
        if epc_features.get('main_fuel_type') or epc_features.get('heating_system'):
            for component_name, category in self.EPC_TO_COMPONENTS['heating']:
                if component_name == 'Boiler':
                    if self._create_component(property_id, 'Boiler',
                                            self._adjust_install_date(base_install_date, 15),
                                            organisation_id,
                                            specification={'source': 'EPC', 'fuel': epc_features.get('main_fuel_type')}):
                        count += 1
                elif self._create_component(property_id, component_name,
                                           self._adjust_install_date(base_install_date, 15),
                                           organisation_id,
                                           specification={'source': 'EPC'}):
                    count += 1

        # Windows
        if epc_features.get('windows_glazing_type'):
            if self._create_component(property_id, 'Windows',
                                     self._adjust_install_date(base_install_date, 10),
                                     organisation_id,
                                     specification={'source': 'EPC', 'glazing': epc_features.get('windows_glazing_type')}):
                count += 1

        # Electrics (from lighting/ventilation info)
        if epc_features.get('ventilation') or epc_features.get('lighting'):
            if self._create_component(property_id, 'Electrics',
                                     base_install_date, organisation_id,
                                     specification={'source': 'EPC'}):
                count += 1

        return count

    def _seed_standard_components(self, property_id: str,
                                 base_install_date: date, organisation_id: str) -> int:
        """Seed standard components present in all social housing."""
        count = 0

        # These components are assumed present in all properties
        component_age_adjustments = {
            'Kitchen': 5,
            'Bathroom': 5,
            'Front Door': 3,
            'Plumbing': 0,
            'Rainwater Goods': 0,
        }

        for component_name, age_adjustment in component_age_adjustments.items():
            install_date = self._adjust_install_date(base_install_date, age_adjustment)
            if self._create_component(property_id, component_name,
                                     install_date, organisation_id,
                                     specification={'source': 'standard'}):
                count += 1

        return count

    def _create_component(self, property_id: str, component_name: str,
                         installation_date: date, organisation_id: str,
                         specification: Optional[Dict] = None) -> bool:
        """
        Create a property component record.

        Returns:
            True if created successfully, False if component already exists
        """
        try:
            # Get component type
            component_type = self.db.execute(
                text("SELECT id FROM component_types WHERE name = :name"),
                {"name": component_name}
            ).first()

            if not component_type:
                return False

            # Check if already exists
            existing = self.db.execute(
                text("""
                    SELECT id FROM property_components
                    WHERE property_id = :prop_id AND component_type_id = :comp_id
                """),
                {"prop_id": property_id, "comp_id": component_type[0]}
            ).first()

            if existing:
                return False

            # Insert component
            component_id = str(uuid.uuid4())
            self.db.execute(
                text("""
                    INSERT INTO property_components
                    (id, property_id, component_type_id, installation_date,
                     installation_date_confidence, specification, status, organisation_id)
                    VALUES (:id, :prop_id, :comp_id, :inst_date, :confidence,
                            :spec::jsonb, 'active', :org_id)
                """),
                {
                    "id": component_id,
                    "prop_id": property_id,
                    "comp_id": component_type[0],
                    "inst_date": installation_date,
                    "confidence": "estimated",
                    "spec": specification or {},
                    "org_id": organisation_id
                }
            )

            self.db.commit()
            return True

        except Exception as e:
            self.db.rollback()
            print(f"Error creating component {component_name}: {str(e)}")
            return False

    def _estimate_base_install_date(self, construction_age_band: str) -> date:
        """
        Estimate the installation date based on construction age band.
        Uses midpoint of the age band range.
        """
        age_band_years = {
            'Before 1900': 1850,
            '1900-1929': 1915,
            '1930-1949': 1940,
            '1950-1966': 1958,
            '1967-1975': 1971,
            '1976-1982': 1979,
            '1983-1990': 1987,
            '1991-1995': 1993,
            '1996-2002': 1999,
            '2003-2006': 2005,
            '2007-2011': 2009,
            '2012-2015': 2014,
            '2016-2020': 2018,
            '2021-2026': 2024,
            'Unknown': 1990
        }

        year = age_band_years.get(construction_age_band, 1990)
        return date(year, 1, 1)

    def _adjust_install_date(self, base_date: date, years_younger: int) -> date:
        """Adjust installation date by specified years (e.g., kitchen replaced more recently)."""
        year = base_date.year + years_younger
        return date(year, base_date.month, base_date.day)
