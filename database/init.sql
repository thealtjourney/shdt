-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- Create properties table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uprn VARCHAR(12),
    address TEXT NOT NULL,
    postcode VARCHAR(10) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    epc_rating VARCHAR(1),
    property_type VARCHAR(50),
    bedrooms INTEGER,
    year_built INTEGER,
    heating_type VARCHAR(100),
    stock_condition_score FLOAT,
    last_inspection_date DATE,
    geometry GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial index on geometry column
CREATE INDEX idx_properties_geometry ON properties USING GIST(geometry);

-- Create index on postcode
CREATE INDEX idx_properties_postcode ON properties(postcode);

-- Create unique index on uprn where uprn is not null
CREATE UNIQUE INDEX idx_properties_uprn_unique ON properties(uprn) WHERE uprn IS NOT NULL;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call update_updated_at_column function
CREATE TRIGGER trigger_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions to shdt user
GRANT USAGE ON SCHEMA public TO shdt;
GRANT CREATE ON SCHEMA public TO shdt;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shdt;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shdt;
