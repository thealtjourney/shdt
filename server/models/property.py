from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class Property(BaseModel):
    """Property model representing a housing unit."""

    id: str = Field(..., description="Unique identifier for the property")
    uprn: Optional[str] = Field(None, description="Unique Property Reference Number")
    address: str = Field(..., description="Full address of the property")
    postcode: str = Field(..., description="UK postcode")
    latitude: float = Field(..., description="Latitude coordinate")
    longitude: float = Field(..., description="Longitude coordinate")
    epc_rating: Optional[str] = Field(None, description="Energy Performance Certificate rating (A-G)")
    property_type: Optional[str] = Field(None, description="Type of property (e.g., house, flat, bungalow)")
    bedrooms: Optional[int] = Field(None, description="Number of bedrooms")
    year_built: Optional[int] = Field(None, description="Year the property was built")
    heating_type: Optional[str] = Field(None, description="Primary heating system type")
    stock_condition_score: Optional[float] = Field(None, description="Property condition score")
    last_inspection_date: Optional[date] = Field(None, description="Date of last inspection")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "prop_001",
                "uprn": "12345678901",
                "address": "123 High Street, London",
                "postcode": "SW1A 1AA",
                "latitude": 51.5074,
                "longitude": -0.1278,
                "epc_rating": "D",
                "property_type": "Semi-detached",
                "bedrooms": 3,
                "year_built": 1960,
                "heating_type": "Gas boiler",
                "stock_condition_score": 75.5,
                "last_inspection_date": "2024-01-15"
            }
        }
