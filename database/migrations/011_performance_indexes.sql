-- ─────────────────────────────────────────────────────
-- Migration 011: Performance indexes for analytics queries
-- ─────────────────────────────────────────────────────
-- These indexes target the columns most heavily used in
-- GROUP BY, WHERE, and ORDER BY clauses across the
-- analytics dashboard, insights page, and map views.
-- ─────────────────────────────────────────────────────

-- EPC rating: used in overview, retrofit priorities, fuel poverty, EPC distribution
CREATE INDEX IF NOT EXISTS idx_properties_epc_rating ON properties(epc_rating)
    WHERE epc_rating IS NOT NULL;

-- Property type: used in overview, property filters, retrofit priorities
CREATE INDEX IF NOT EXISTS idx_properties_property_type ON properties(property_type)
    WHERE property_type IS NOT NULL;

-- Heating type: used in overview, fuel poverty analysis
CREATE INDEX IF NOT EXISTS idx_properties_heating_type ON properties(heating_type)
    WHERE heating_type IS NOT NULL;

-- Year built: used in retrofit priorities, age bracket analysis
CREATE INDEX IF NOT EXISTS idx_properties_year_built ON properties(year_built)
    WHERE year_built IS NOT NULL;

-- Ward name: used in area risk heatmap, fuel poverty, geographic summaries
CREATE INDEX IF NOT EXISTS idx_properties_ward_name ON properties(ward_name)
    WHERE ward_name IS NOT NULL;

-- Local authority: used in region summary, geographic summaries, heatmap
CREATE INDEX IF NOT EXISTS idx_properties_local_authority_name ON properties(local_authority_name)
    WHERE local_authority_name IS NOT NULL;

-- Latitude/longitude: used in bbox queries, map views, clustering
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng ON properties(latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Composite index for common dashboard queries (EPC + deprivation)
CREATE INDEX IF NOT EXISTS idx_properties_epc_imd ON properties(epc_rating, imd_decile)
    WHERE epc_rating IS NOT NULL AND imd_decile IS NOT NULL;

-- Address: used for repairs matching (operational analytics)
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties USING hash(address);

-- Enrichment timestamps: used in enrichment summary counts
CREATE INDEX IF NOT EXISTS idx_properties_crime_updated ON properties(crime_last_updated)
    WHERE crime_last_updated IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_flood_risk ON properties(flood_risk_rivers_seas)
    WHERE flood_risk_rivers_seas IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_utilities_enriched ON properties(utilities_enriched_at)
    WHERE utilities_enriched_at IS NOT NULL;
