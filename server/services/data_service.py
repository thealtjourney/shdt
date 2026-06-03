"""
Data service for loading and managing property data.
"""
from typing import List, Optional, Dict, Any
from models.property import Property


class DataService:
    """Service for managing property data operations."""

    def __init__(self):
        """Initialize the data service."""
        self.properties: List[Property] = []
        self._loaded = False

    async def load_data(self) -> None:
        """
        Load property data from data sources.
        This is a placeholder - implement actual data loading logic here.
        """
        if self._loaded:
            return

        # TODO: Implement data loading from:
        # - Database (SQLAlchemy with GeoAlchemy2)
        # - CSV/Excel files (pandas)
        # - External APIs

        self._loaded = True

    async def get_properties_in_bbox(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        limit: int = 100,
        offset: int = 0
    ) -> List[Property]:
        """
        Get properties within a bounding box.

        Args:
            min_lon: Minimum longitude
            min_lat: Minimum latitude
            max_lon: Maximum longitude
            max_lat: Maximum latitude
            limit: Maximum number of results
            offset: Result offset for pagination

        Returns:
            List of properties within the bounding box
        """
        await self.load_data()

        # TODO: Filter properties by bounding box coordinates
        filtered = [
            p for p in self.properties
            if (min_lon <= p.longitude <= max_lon and
                min_lat <= p.latitude <= max_lat)
        ]

        return filtered[offset:offset + limit]

    async def search_properties(
        self,
        query: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Property]:
        """
        Search properties by address or postcode.

        Args:
            query: Search query string
            limit: Maximum number of results
            offset: Result offset for pagination

        Returns:
            List of matching properties
        """
        await self.load_data()

        query_lower = query.lower()

        # TODO: Implement more sophisticated search (fuzzy matching, etc.)
        filtered = [
            p for p in self.properties
            if (query_lower in p.address.lower() or
                query_lower in p.postcode.lower())
        ]

        return filtered[offset:offset + limit]

    async def get_property_by_id(self, property_id: str) -> Optional[Property]:
        """
        Get a single property by ID.

        Args:
            property_id: Property ID

        Returns:
            Property object or None if not found
        """
        await self.load_data()

        for prop in self.properties:
            if prop.id == property_id:
                return prop

        return None

    def to_geojson_feature(self, prop: Property) -> Dict[str, Any]:
        """
        Convert a Property object to GeoJSON Feature format.

        Args:
            prop: Property object

        Returns:
            GeoJSON Feature dictionary
        """
        return {
            "type": "Feature",
            "id": prop.id,
            "geometry": {
                "type": "Point",
                "coordinates": [prop.longitude, prop.latitude]
            },
            "properties": {
                "id": prop.id,
                "uprn": prop.uprn,
                "address": prop.address,
                "postcode": prop.postcode,
                "epc_rating": prop.epc_rating,
                "property_type": prop.property_type,
                "bedrooms": prop.bedrooms,
                "year_built": prop.year_built,
                "heating_type": prop.heating_type,
                "stock_condition_score": prop.stock_condition_score,
                "last_inspection_date": prop.last_inspection_date.isoformat() if prop.last_inspection_date else None
            }
        }

    def to_geojson_feature_collection(self, properties: List[Property]) -> Dict[str, Any]:
        """
        Convert a list of Property objects to GeoJSON FeatureCollection format.

        Args:
            properties: List of Property objects

        Returns:
            GeoJSON FeatureCollection dictionary
        """
        return {
            "type": "FeatureCollection",
            "features": [self.to_geojson_feature(p) for p in properties]
        }


# Global instance
_data_service: Optional[DataService] = None


def get_data_service() -> DataService:
    """Get or create the global data service instance."""
    global _data_service
    if _data_service is None:
        _data_service = DataService()
    return _data_service
