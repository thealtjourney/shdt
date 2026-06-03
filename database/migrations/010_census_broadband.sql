-- Migration 010: Census 2021, UPRN Coordinates & Broadband/Utilities columns
-- Adds columns for ONS Census demographic data (LSOA-level),
-- OS Open UPRN exact building coordinates, and Ofcom broadband/utility data.

-- ─── Census 2021 (LSOA-level demographic indicators) ───
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_population_density FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_age_0_15_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_age_16_64_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_age_65_plus_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_single_person_hh_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_overcrowded_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_no_central_heating_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_disability_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_non_english_speaker_pct FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_deprivation_dims FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS census_enriched_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_properties_census_elderly ON properties(census_age_65_plus_pct DESC)
  WHERE census_age_65_plus_pct IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_census_enriched ON properties(census_enriched_at)
  WHERE census_enriched_at IS NOT NULL;

-- ─── UPRN Exact Coordinates (OS Open UPRN) ───
ALTER TABLE properties ADD COLUMN IF NOT EXISTS uprn_latitude FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS uprn_longitude FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS uprn_easting FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS uprn_northing FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS uprn_matched BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_properties_uprn_matched ON properties(uprn_matched)
  WHERE uprn_matched = TRUE;

-- ─── Broadband & Utilities ───
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_max_download FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_max_upload FLOAT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_superfast_available BOOLEAN;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_ultrafast_available BOOLEAN;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broadband_fttp_available BOOLEAN;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS electricity_dno VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS electricity_dno_code VARCHAR(10);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gas_gdn VARCHAR(100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS utilities_enriched_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_properties_broadband ON properties(broadband_max_download)
  WHERE broadband_max_download IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_properties_dno ON properties(electricity_dno)
  WHERE electricity_dno IS NOT NULL;
