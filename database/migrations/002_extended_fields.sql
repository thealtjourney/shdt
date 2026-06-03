-- Migration: Add extended fields for social housing properties
-- Version: 002
-- Created: 2026-03-17
-- Description: Adds commonly found CSV fields for detailed property information

BEGIN;

-- Add new columns to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenure_type VARCHAR(50);
COMMENT ON COLUMN properties.tenure_type IS 'Tenure type: owned, rented, shared, leaseholder, freeholder';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS local_authority VARCHAR(100);
COMMENT ON COLUMN properties.local_authority IS 'Local authority name';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS ward VARCHAR(100);
COMMENT ON COLUMN properties.ward IS 'Electoral ward name';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS construction_type VARCHAR(100);
COMMENT ON COLUMN properties.construction_type IS 'Construction/building type (e.g., brick, stone, timber frame)';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS wall_insulation VARCHAR(100);
COMMENT ON COLUMN properties.wall_insulation IS 'Wall insulation type and material';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS roof_type VARCHAR(100);
COMMENT ON COLUMN properties.roof_type IS 'Roof type and material';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_area FLOAT;
COMMENT ON COLUMN properties.floor_area IS 'Total floor area in square meters';

ALTER TABLE properties ADD COLUMN IF NOT EXISTS organisation_id UUID;
COMMENT ON COLUMN properties.organisation_id IS 'Foreign key for multi-tenancy support';

-- Create indexes for better query performance on new columns
CREATE INDEX IF NOT EXISTS idx_properties_tenure_type ON properties(tenure_type);
CREATE INDEX IF NOT EXISTS idx_properties_local_authority ON properties(local_authority);
CREATE INDEX IF NOT EXISTS idx_properties_ward ON properties(ward);
CREATE INDEX IF NOT EXISTS idx_properties_organisation_id ON properties(organisation_id);

-- Add check constraint for floor_area to ensure positive values
ALTER TABLE properties ADD CONSTRAINT check_floor_area_positive
    CHECK (floor_area IS NULL OR floor_area > 0);

COMMIT;
