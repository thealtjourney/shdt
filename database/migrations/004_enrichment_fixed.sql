-- Migration 004: Add enrichment columns to properties table
-- Adds columns for Crime, Flood, EPC, Postcode, IMD, Census, Land Registry data

-- Enrichment tracking
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP NULL;

-- EPC fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS epc_score INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS epc_potential_rating VARCHAR(1) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS epc_potential_score INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS epc_lodgement_date DATE NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS epc_inspection_date DATE NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_area_m2 FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS wall_type VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS wall_insulation VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS roof_insulation VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS main_heating VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS main_fuel VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS hot_water VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lighting VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS windows VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS co2_emissions FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS co2_potential FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS energy_cost_current INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS energy_cost_potential INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS construction_age_band VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS built_form VARCHAR(255) NULL;

-- Postcode/Geographic fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lsoa_code VARCHAR(9) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lsoa_name VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS msoa_code VARCHAR(9) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS msoa_name VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ward_code VARCHAR(9) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ward_name VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parish VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parliamentary_constituency VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS local_authority_code VARCHAR(9) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS local_authority_name VARCHAR(255) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS region VARCHAR(255) NULL;

-- Flood Risk fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS flood_risk_rivers_seas VARCHAR(50) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS flood_risk_surface_water VARCHAR(50) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS flood_zone VARCHAR(50) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS active_flood_warnings INT NULL;

-- Crime Statistics fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_total_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_burglary_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_antisocial_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_criminal_damage_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_violence_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_robbery_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_other_3months INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_risk_score FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS crime_last_updated DATE NULL;

-- IMD fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_rank INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_income_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_employment_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_health_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_education_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_crime_decile INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS imd_housing_decile INT NULL;

-- Census fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_population INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_households INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_tenure_owned_pct FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_tenure_social_pct FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_tenure_private_pct FLOAT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_fuel_poverty_pct FLOAT NULL;

-- Land Registry fields
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_sale_price INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_sale_date DATE NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenure_type VARCHAR(50) NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS estimated_current_value INT NULL;

-- Indexes on commonly queried enrichment fields
CREATE INDEX IF NOT EXISTS idx_properties_epc_score ON properties(epc_score) WHERE epc_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_imd_decile ON properties(imd_decile) WHERE imd_decile IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_flood_zone ON properties(flood_zone) WHERE flood_zone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_crime_risk ON properties(crime_risk_score) WHERE crime_risk_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_lsoa ON properties(lsoa_code) WHERE lsoa_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_last_enriched ON properties(last_enriched_at) WHERE last_enriched_at IS NOT NULL;
