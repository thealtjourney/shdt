-- Migration 009: Add weather forecast and predictive flood risk columns
-- These columns store 7-day weather forecast data combined with existing
-- flood zone data to produce dynamic risk scores per property.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_risk_score FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_risk_level VARCHAR(20);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_rainfall_48h_mm FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_rainfall_7day_mm FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_peak_day VARCHAR(20);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_peak_rainfall_mm FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_nearby_river_level VARCHAR(20);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS forecast_updated_at TIMESTAMP;

-- Index for quick filtering by risk level
CREATE INDEX IF NOT EXISTS idx_properties_forecast_risk ON properties(forecast_risk_level)
  WHERE forecast_risk_level IS NOT NULL;

-- Index for sorting by risk score
CREATE INDEX IF NOT EXISTS idx_properties_forecast_score ON properties(forecast_risk_score DESC)
  WHERE forecast_risk_score IS NOT NULL;
