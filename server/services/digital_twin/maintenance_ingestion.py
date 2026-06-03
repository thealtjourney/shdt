"""
Maintenance Ingestion Service
Imports maintenance records from CSV and matches them to properties and components.
Uses UPRN/address matching and NLP keyword matching for component identification.
"""

import csv
import uuid
from io import StringIO
from typing import Dict, List, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
import re


class MaintenanceIngestionService:
    """Handles importing maintenance records and matching them to properties and components."""

    # Keywords for component type matching
    COMPONENT_KEYWORDS = {
        'Boiler': ['boiler', 'heating', 'furnace', 'heat'],
        'Electrics': ['electric', 'wiring', 'circuit', 'fuse', 'consumer unit', 'rewire'],
        'Plumbing': ['plumbing', 'pipe', 'leak', 'drainage', 'water', 'drain'],
        'Windows': ['window', 'glazing', 'glass', 'frame'],
        'Roof Covering': ['roof', 'tile', 'slate', 'covering'],
        'External Walls': ['wall', 'cavity', 'render', 'brick', 'exterior', 'external'],
        'Kitchen': ['kitchen', 'cabinet', 'worktop', 'sink'],
        'Bathroom': ['bathroom', 'toilet', 'shower', 'bath', 'suite'],
        'Front Door': ['door', 'entrance', 'frame', 'lock'],
        'Rainwater Goods': ['gutter', 'downpipe', 'rainwater'],
        'Hot Water System': ['hot water', 'cylinder', 'immersion', 'tank'],
        'Ventilation': ['vent', 'extractor', 'extraction', 'fan'],
        'Fire Safety Systems': ['fire', 'alarm', 'extinguisher', 'safety'],
    }

    def __init__(self, db: Session):
        """Initialize the maintenance ingestion service."""
        self.db = db

    def import_csv(self, csv_content: str, organisation_id: str,
                   uprn_column: str = 'UPRN',
                   address_column: str = 'address',
                   description_column: str = 'description',
                   date_column: str = 'reported_date',
                   cost_column: str = 'cost',
                   status_column: str = 'status',
                   contractor_column: str = 'contractor') -> Dict[str, int]:
        """
        Import maintenance records from CSV content.

        Args:
            csv_content: CSV text content
            organisation_id: UUID of organisation
            uprn_column: Name of UPRN column
            address_column: Name of address column
            description_column: Name of description/work description column
            date_column: Name of date column
            cost_column: Name of cost column
            status_column: Name of status column
            contractor_column: Name of contractor column

        Returns:
            Dictionary with import statistics
        """
        stats = {'total': 0, 'imported': 0, 'skipped': 0, 'errors': 0}

        try:
            reader = csv.DictReader(StringIO(csv_content))

            for row in reader:
                stats['total'] += 1

                try:
                    # Extract fields
                    uprn = row.get(uprn_column, '').strip()
                    address = row.get(address_column, '').strip()
                    description = row.get(description_column, '').strip()
                    date_str = row.get(date_column, '').strip()
                    cost_str = row.get(cost_column, '').strip()
                    status = row.get(status_column, 'reported').strip()
                    contractor = row.get(contractor_column, '').strip()

                    # Validate minimum required fields
                    if not description:
                        stats['skipped'] += 1
                        continue

                    # Parse date
                    reported_date = self._parse_date(date_str) if date_str else datetime.utcnow()

                    # Parse cost
                    cost = self._parse_cost(cost_str) if cost_str else None

                    # Find property by UPRN or address
                    property_id = self._find_property(uprn, address, organisation_id)

                    if not property_id:
                        stats['skipped'] += 1
                        continue

                    # Match component from description
                    component_id = self._match_component(property_id, description)

                    # Extract category from description
                    category = self._extract_category(description)

                    # Extract priority
                    priority = self._extract_priority(description, status)

                    # Create maintenance record
                    record_id = str(uuid.uuid4())
                    self.db.execute(
                        text("""
                            INSERT INTO maintenance_records
                            (id, property_id, component_id, reported_date, description,
                             category, priority, cost, contractor, status, raw_data, organisation_id)
                            VALUES (:id, :prop_id, :comp_id, :rep_date, :desc,
                                    :cat, :prio, :cost, :contractor, :status, :raw_data, :org_id)
                        """),
                        {
                            "id": record_id,
                            "prop_id": property_id,
                            "comp_id": component_id,
                            "rep_date": reported_date,
                            "desc": description,
                            "cat": category,
                            "prio": priority,
                            "cost": cost,
                            "contractor": contractor if contractor else None,
                            "status": status,
                            "raw_data": row,
                            "org_id": organisation_id
                        }
                    )

                    stats['imported'] += 1

                except Exception as e:
                    stats['errors'] += 1
                    print(f"Error importing row {stats['total']}: {str(e)}")

            self.db.commit()

        except Exception as e:
            self.db.rollback()
            stats['errors'] += 1
            print(f"Error parsing CSV: {str(e)}")

        return stats

    def _find_property(self, uprn: str, address: str, organisation_id: str) -> Optional[str]:
        """
        Find property by UPRN or address.

        Returns:
            Property ID (UUID) or None
        """
        try:
            # Try UPRN first (more reliable)
            if uprn:
                result = self.db.execute(
                    text("""
                        SELECT id FROM properties
                        WHERE uprn = :uprn AND organisation_id = :org_id
                    """),
                    {"uprn": uprn, "org_id": organisation_id}
                ).first()
                if result:
                    return result[0]

            # Try address (fuzzy match)
            if address:
                result = self.db.execute(
                    text("""
                        SELECT id FROM properties
                        WHERE (address ILIKE :addr OR address_full ILIKE :addr)
                        AND organisation_id = :org_id
                        LIMIT 1
                    """),
                    {"addr": f"%{address}%", "org_id": organisation_id}
                ).first()
                if result:
                    return result[0]

        except Exception as e:
            print(f"Error finding property: {str(e)}")

        return None

    def _match_component(self, property_id: str, description: str) -> Optional[str]:
        """
        Match maintenance description to a component using keyword matching.

        Returns:
            Component ID (UUID) or None
        """
        try:
            description_lower = description.lower()

            # Find best matching component type
            best_match = None
            best_score = 0

            for component_name, keywords in self.COMPONENT_KEYWORDS.items():
                score = 0
                for keyword in keywords:
                    if keyword in description_lower:
                        score += 1

                if score > best_score:
                    best_score = score
                    best_match = component_name

            if best_score == 0:
                return None

            # Find component of this type for this property
            result = self.db.execute(
                text("""
                    SELECT pc.id FROM property_components pc
                    JOIN component_types ct ON pc.component_type_id = ct.id
                    WHERE pc.property_id = :prop_id
                    AND ct.name = :comp_name
                    AND pc.status = 'active'
                    LIMIT 1
                """),
                {"prop_id": property_id, "comp_name": best_match}
            ).first()

            if result:
                return result[0]

        except Exception as e:
            print(f"Error matching component: {str(e)}")

        return None

    def _extract_category(self, description: str) -> str:
        """Extract work category from description."""
        description_lower = description.lower()

        if any(word in description_lower for word in ['repair', 'fix', 'mend']):
            return 'repair'
        elif any(word in description_lower for word in ['replacement', 'replace', 'new']):
            return 'replacement'
        elif any(word in description_lower for word in ['upgrade', 'improve', 'enhancement']):
            return 'upgrade'
        elif any(word in description_lower for word in ['inspect', 'check', 'survey']):
            return 'inspection'
        else:
            return 'maintenance'

    def _extract_priority(self, description: str, status: str) -> str:
        """Extract priority from description and status."""
        description_lower = description.lower()
        status_lower = status.lower() if status else ''

        if any(word in description_lower for word in ['emergency', 'urgent', 'critical', 'dangerous']):
            return 'emergency'
        elif any(word in description_lower for word in ['urgent']) or 'urgent' in status_lower:
            return 'urgent'
        elif any(word in description_lower for word in ['scheduled', 'planned']):
            return 'planned'
        else:
            return 'normal'

    def _parse_date(self, date_str: str) -> datetime:
        """Parse date string in various formats."""
        formats = [
            '%Y-%m-%d',
            '%d/%m/%Y',
            '%d-%m-%Y',
            '%Y/%m/%d',
            '%d %b %Y',
            '%d %B %Y',
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt)
            except ValueError:
                continue

        # Default to today
        return datetime.utcnow()

    def _parse_cost(self, cost_str: str) -> Optional[float]:
        """Parse cost string to float."""
        try:
            # Remove currency symbols and whitespace
            cleaned = re.sub(r'[£$€,\s]', '', cost_str.strip())
            return float(cleaned)
        except (ValueError, AttributeError):
            return None
