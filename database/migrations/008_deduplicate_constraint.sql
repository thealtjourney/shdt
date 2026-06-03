-- 008: Deduplicate properties and add unique constraint on address + postcode
-- This prevents duplicate properties from being created by any import method.
--
-- IMPORTANT: Run deduplicate.py --execute BEFORE applying this migration
-- if you have existing duplicates, otherwise the unique index will fail.

-- Step 1: Remove duplicates, keeping the row with the most enrichment data
DELETE FROM properties
WHERE id IN (
    SELECT id FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY LOWER(TRIM(address)), TRIM(postcode)
                ORDER BY
                    (CASE WHEN lsoa_code IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN crime_last_updated IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN flood_risk_rivers_seas IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN epc_score IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN crime_risk_score IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN region IS NOT NULL THEN 1 ELSE 0 END
                     + CASE WHEN local_authority_name IS NOT NULL THEN 1 ELSE 0 END
                    ) DESC,
                    updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST
            ) as rn
        FROM properties
    ) ranked
    WHERE rn > 1
);

-- Step 2: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_addr_postcode_unique
    ON properties (LOWER(TRIM(address)), TRIM(postcode));
