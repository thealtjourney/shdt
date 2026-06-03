"""
Unified Search Service
Full-text search across properties, components, maintenance, and tenants.
Uses PostgreSQL full-text search with weighted fields and GIN indexes.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import TSVECTOR

from app.models import Property, Component, MaintenanceRecord, Tenant, User
from app.core.config import logger


class SearchResult:
    """Single search result"""

    def __init__(
        self,
        entity_type: str,
        entity_id: str,
        title: str,
        description: str,
        relevance: float,
        metadata: Dict[str, Any],
    ):
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.title = title
        self.description = description
        self.relevance = relevance
        self.metadata = metadata

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "title": self.title,
            "description": self.description,
            "relevance": round(self.relevance, 2),
            "metadata": self.metadata,
        }


class UnifiedSearchService:
    """
    Unified search service for SHDT.
    Searches across properties, components, maintenance, and tenants.
    Uses PostgreSQL full-text search with weighted vectors.
    """

    def __init__(self, db: Session, organisation_id: UUID):
        self.db = db
        self.organisation_id = organisation_id

    def search(
        self,
        query: str,
        entity_types: Optional[List[str]] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[SearchResult], int]:
        """
        Execute unified search across entity types.
        Detects query type (postcode, UPRN, work order) for smart routing.

        Args:
            query: Search query string
            entity_types: Filter to specific types or None for all
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (results, total_count)
        """
        if not query or len(query.strip()) < 2:
            return [], 0

        query = query.strip()
        entity_types = entity_types or ["property", "component", "maintenance", "tenant"]

        # Detect query type
        query_type = self._detect_query_type(query)
        logger.info(f"Search query: '{query}' type: {query_type}")

        results = []

        # Route to appropriate search method
        if query_type == "postcode":
            results.extend(self._search_by_postcode(query, limit))
        elif query_type == "uprn":
            results.extend(self._search_by_uprn(query, limit))
        elif query_type == "work_order":
            results.extend(self._search_work_orders(query, limit))
        else:
            # Full-text search across all entity types
            if "property" in entity_types:
                results.extend(self._search_properties(query, limit))
            if "component" in entity_types:
                results.extend(self._search_components(query, limit))
            if "maintenance" in entity_types:
                results.extend(self._search_maintenance(query, limit))
            if "tenant" in entity_types:
                results.extend(self._search_tenants(query, limit))

        # Sort by relevance and apply limit
        results.sort(key=lambda r: r.relevance, reverse=True)
        total = len(results)
        results = results[offset : offset + limit]

        return results, total

    def autocomplete(
        self, query: str, entity_type: Optional[str] = None, limit: int = 8
    ) -> List[Dict[str, Any]]:
        """
        Fast autocomplete for search bar.
        Returns prefix matches with minimal data.

        Args:
            query: Partial search query
            entity_type: Limit to specific type
            limit: Max suggestions

        Returns:
            List of autocomplete suggestions
        """
        if not query or len(query.strip()) < 1:
            return []

        query_prefix = query.strip().lower()
        suggestions = []

        # Property autocomplete by address
        if not entity_type or entity_type == "property":
            properties = (
                self.db.query(Property.id, Property.address, Property.postcode)
                .filter(
                    Property.organisation_id == self.organisation_id,
                    func.lower(Property.address).like(f"{query_prefix}%"),
                )
                .limit(limit)
                .all()
            )
            for prop in properties:
                suggestions.append(
                    {
                        "type": "property",
                        "id": str(prop.id),
                        "label": f"{prop.address}, {prop.postcode}",
                        "secondary": prop.postcode,
                    }
                )

        # Component autocomplete by name
        if not entity_type or entity_type == "component":
            components = (
                self.db.query(Component.id, Component.name, Component.location)
                .filter(
                    Component.organisation_id == self.organisation_id,
                    func.lower(Component.name).like(f"{query_prefix}%"),
                )
                .limit(limit)
                .all()
            )
            for comp in components:
                suggestions.append(
                    {
                        "type": "component",
                        "id": str(comp.id),
                        "label": comp.name,
                        "secondary": comp.location or "Various",
                    }
                )

        # Maintenance autocomplete by code/description
        if not entity_type or entity_type == "maintenance":
            maintenance = (
                self.db.query(MaintenanceRecord.id, MaintenanceRecord.code, MaintenanceRecord.description)
                .filter(
                    MaintenanceRecord.organisation_id == self.organisation_id,
                    or_(
                        func.lower(MaintenanceRecord.code).like(f"{query_prefix}%"),
                        func.lower(MaintenanceRecord.description).like(f"{query_prefix}%"),
                    ),
                )
                .limit(limit)
                .all()
            )
            for rec in maintenance:
                suggestions.append(
                    {
                        "type": "maintenance",
                        "id": str(rec.id),
                        "label": rec.code,
                        "secondary": rec.description or "Maintenance",
                    }
                )

        # Tenant autocomplete by name
        if not entity_type or entity_type == "tenant":
            tenants = (
                self.db.query(Tenant.id, Tenant.first_name, Tenant.last_name)
                .filter(
                    Tenant.organisation_id == self.organisation_id,
                    or_(
                        func.lower(Tenant.first_name).like(f"{query_prefix}%"),
                        func.lower(Tenant.last_name).like(f"{query_prefix}%"),
                    ),
                )
                .limit(limit)
                .all()
            )
            for tenant in tenants:
                suggestions.append(
                    {
                        "type": "tenant",
                        "id": str(tenant.id),
                        "label": f"{tenant.first_name} {tenant.last_name}",
                        "secondary": "Tenant",
                    }
                )

        return suggestions[:limit]

    def get_recent_searches(self, user_id: UUID, limit: int = 10) -> List[str]:
        """
        Get recent searches for user.
        Stored in Redis or user preferences.
        """
        # This would query a recent_searches table
        # For now, placeholder
        return []

    def save_recent_search(self, user_id: UUID, query: str) -> None:
        """Save search to user's recent history"""
        # Would store in recent_searches or cache
        pass

    # Private search methods

    def _detect_query_type(self, query: str) -> str:
        """Detect query type (postcode, UPRN, work order, text)"""
        query_upper = query.upper().strip()

        # Postcode pattern: UK postcodes
        if re.match(r"^[A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2}$", query_upper):
            return "postcode"

        # UPRN: 12 digits
        if re.match(r"^\d{12}$", query):
            return "uprn"

        # Work order: codes like WO-2024-001234
        if re.match(r"^[A-Z]+-\d{4}-\d+$", query_upper):
            return "work_order"

        return "text"

    def _search_properties(self, query: str, limit: int) -> List[SearchResult]:
        """Full-text search properties"""
        fts_query = self._make_fts_query(query)

        properties = (
            self.db.query(
                Property.id,
                Property.address,
                Property.postcode,
                Property.uprn,
                Property.description,
                func.ts_rank(
                    func.to_tsvector("english", func.coalesce(Property.address, "")),
                    fts_query,
                ).label("rank"),
            )
            .filter(
                Property.organisation_id == self.organisation_id,
                func.to_tsvector("english", func.coalesce(Property.address, "")).match(fts_query),
            )
            .order_by("rank".desc())
            .limit(limit)
            .all()
        )

        results = []
        for prop in properties:
            results.append(
                SearchResult(
                    entity_type="property",
                    entity_id=str(prop.id),
                    title=prop.address,
                    description=f"UPRN: {prop.uprn}, {prop.postcode}",
                    relevance=float(prop.rank or 0),
                    metadata={"postcode": prop.postcode, "uprn": prop.uprn},
                )
            )
        return results

    def _search_components(self, query: str, limit: int) -> List[SearchResult]:
        """Full-text search components"""
        fts_query = self._make_fts_query(query)

        components = (
            self.db.query(
                Component.id,
                Component.name,
                Component.location,
                Component.description,
                func.ts_rank(
                    func.to_tsvector("english", func.coalesce(Component.name, "")),
                    fts_query,
                ).label("rank"),
            )
            .filter(
                Component.organisation_id == self.organisation_id,
                func.to_tsvector("english", func.coalesce(Component.name, "")).match(fts_query),
            )
            .order_by("rank".desc())
            .limit(limit)
            .all()
        )

        results = []
        for comp in components:
            results.append(
                SearchResult(
                    entity_type="component",
                    entity_id=str(comp.id),
                    title=comp.name,
                    description=comp.location or "Component",
                    relevance=float(comp.rank or 0),
                    metadata={"location": comp.location},
                )
            )
        return results

    def _search_maintenance(self, query: str, limit: int) -> List[SearchResult]:
        """Full-text search maintenance records"""
        fts_query = self._make_fts_query(query)

        records = (
            self.db.query(
                MaintenanceRecord.id,
                MaintenanceRecord.code,
                MaintenanceRecord.description,
                MaintenanceRecord.status,
                func.ts_rank(
                    func.to_tsvector("english", func.coalesce(MaintenanceRecord.description, "")),
                    fts_query,
                ).label("rank"),
            )
            .filter(
                MaintenanceRecord.organisation_id == self.organisation_id,
                func.to_tsvector("english", func.coalesce(MaintenanceRecord.description, "")).match(
                    fts_query
                ),
            )
            .order_by("rank".desc())
            .limit(limit)
            .all()
        )

        results = []
        for rec in records:
            results.append(
                SearchResult(
                    entity_type="maintenance",
                    entity_id=str(rec.id),
                    title=rec.code,
                    description=rec.description or f"Status: {rec.status}",
                    relevance=float(rec.rank or 0),
                    metadata={"status": rec.status},
                )
            )
        return results

    def _search_tenants(self, query: str, limit: int) -> List[SearchResult]:
        """Full-text search tenants"""
        fts_query = self._make_fts_query(query)

        tenants = (
            self.db.query(
                Tenant.id,
                Tenant.first_name,
                Tenant.last_name,
                Tenant.email,
                func.ts_rank(
                    func.to_tsvector("english", func.concat(Tenant.first_name, " ", Tenant.last_name)),
                    fts_query,
                ).label("rank"),
            )
            .filter(
                Tenant.organisation_id == self.organisation_id,
                func.to_tsvector(
                    "english", func.concat(Tenant.first_name, " ", Tenant.last_name)
                ).match(fts_query),
            )
            .order_by("rank".desc())
            .limit(limit)
            .all()
        )

        results = []
        for tenant in tenants:
            results.append(
                SearchResult(
                    entity_type="tenant",
                    entity_id=str(tenant.id),
                    title=f"{tenant.first_name} {tenant.last_name}",
                    description=tenant.email or "Tenant",
                    relevance=float(tenant.rank or 0),
                    metadata={"email": tenant.email},
                )
            )
        return results

    def _search_by_postcode(self, postcode: str, limit: int) -> List[SearchResult]:
        """Search properties by postcode"""
        properties = (
            self.db.query(Property)
            .filter(
                Property.organisation_id == self.organisation_id,
                Property.postcode.ilike(postcode),
            )
            .limit(limit)
            .all()
        )

        return [
            SearchResult(
                entity_type="property",
                entity_id=str(p.id),
                title=p.address,
                description=f"UPRN: {p.uprn}",
                relevance=1.0,
                metadata={"postcode": p.postcode, "uprn": p.uprn},
            )
            for p in properties
        ]

    def _search_by_uprn(self, uprn: str, limit: int) -> List[SearchResult]:
        """Search properties by UPRN"""
        prop = (
            self.db.query(Property)
            .filter(
                Property.organisation_id == self.organisation_id,
                Property.uprn == uprn,
            )
            .first()
        )

        if prop:
            return [
                SearchResult(
                    entity_type="property",
                    entity_id=str(prop.id),
                    title=prop.address,
                    description=prop.postcode,
                    relevance=1.0,
                    metadata={"uprn": uprn},
                )
            ]
        return []

    def _search_work_orders(self, code: str, limit: int) -> List[SearchResult]:
        """Search maintenance records by work order code"""
        records = (
            self.db.query(MaintenanceRecord)
            .filter(
                MaintenanceRecord.organisation_id == self.organisation_id,
                MaintenanceRecord.code.ilike(code),
            )
            .limit(limit)
            .all()
        )

        return [
            SearchResult(
                entity_type="maintenance",
                entity_id=str(r.id),
                title=r.code,
                description=r.description or "Work Order",
                relevance=1.0,
                metadata={"status": r.status},
            )
            for r in records
        ]

    def _make_fts_query(self, query: str) -> str:
        """Convert user query to PostgreSQL FTS format"""
        # Simple approach: OR all terms
        terms = query.split()
        return " | ".join(terms) if terms else "a"
