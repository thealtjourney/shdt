# SHDT Data Import and Format Guide

## Overview

This guide provides comprehensive information about data formats, import procedures, and data quality standards for SHDT (Supportive Housing Data Tracker).

## CSV Import Format Specification

### Required Columns

The following columns are required for basic housing unit imports. All CSV files must include headers in the first row.

| Column Name | Data Type | Required | Max Length | Format/Notes |
|-------------|-----------|----------|-----------|-------------|
| unit_id | String | Yes | 50 | Unique identifier; alphanumeric with dashes allowed |
| unit_name | String | Yes | 255 | Name/label of the unit |
| address | String | Yes | 255 | Full street address |
| city | String | Yes | 100 | City name |
| state | String | Yes | 2 | US state abbreviation (e.g., CA, NY) |
| zip_code | String | Yes | 10 | 5 or 9 digit ZIP code |
| country | String | No | 50 | Default: "USA" |
| bed_count | Integer | Yes | N/A | Number of bedrooms (0-999) |
| bath_count | Decimal | Yes | N/A | Number of bathrooms (0-999.5) |
| unit_type | String | Yes | 50 | Type: studio, 1br, 2br, 3br+, shared, group |
| property_type | String | No | 50 | Type: house, apartment, condo, hotel, shelter |
| status | String | Yes | 50 | Active, inactive, under_renovation, planned |
| capacity | Integer | Yes | N/A | Max occupancy (residents) |
| current_occupancy | Integer | No | N/A | Current number of residents (0 to capacity) |
| rent_amount | Decimal | No | N/A | Monthly rent (dollars) |
| subsidy_amount | Decimal | No | N/A | Monthly subsidy (dollars) |
| program_type | String | No | 50 | PSH, RRH, IH, transitional, emergency |
| operator_name | String | No | 255 | Name of operating organization |
| phone | String | No | 20 | Contact phone number |
| email | String | No | 255 | Contact email address |
| notes | String | No | 1000 | Additional notes/comments |

### Optional Columns

Additional columns for enhanced data capture:

| Column Name | Data Type | Notes |
|-------------|-----------|-------|
| accessibility_features | String | Comma-separated: wheelchair_accessible, elevator, ramp, etc. |
| pet_friendly | Boolean | true/false or yes/no |
| kitchen_facilities | String | full, kitchenette, shared, none |
| laundry_facilities | String | in_unit, on_site, off_site |
| parking_available | Boolean | true/false |
| parking_cost | Decimal | Monthly parking cost if available |
| internet_available | Boolean | true/false |
| utilities_included | String | Comma-separated: water, gas, electric, internet, etc. |
| accessibility_notes | String | Detailed accessibility information |
| building_year | Integer | Year of construction or renovation |
| district_or_zone | String | City district or geographic zone |
| latitude | Decimal | Geographic latitude (WGS84, -90 to 90) |
| longitude | Decimal | Geographic longitude (WGS84, -180 to 180) |
| geocoding_confidence | String | high, medium, low (if manually geocoded) |

## CSV Example

Here is a minimal valid CSV example:

```csv
unit_id,unit_name,address,city,state,zip_code,bed_count,bath_count,unit_type,status,capacity
HU-001,Downtown Studio,123 Main St,Springfield,IL,62701,0,1,studio,active,1
HU-002,Oak Park 1BR,456 Oak Ave,Springfield,IL,62702,1,1,1br,active,2
HU-003,Riverside 2BR,789 River Rd,Springfield,IL,62703,2,1.5,2br,active,4
```

Extended example with optional fields:

```csv
unit_id,unit_name,address,city,state,zip_code,bed_count,bath_count,unit_type,status,capacity,program_type,operator_name,rent_amount,subsidy_amount,pet_friendly,accessibility_features,current_occupancy
HU-001,Downtown Studio,123 Main St,Springfield,IL,62701,0,1,studio,active,1,PSH,Hope Housing,500,400,true,wheelchair_accessible,1
HU-002,Oak Park 1BR,456 Oak Ave,Springfield,IL,62702,1,1,1br,active,2,RRH,Community Services,800,200,false,elevator,1
HU-003,Riverside 2BR,789 River Rd,Springfield,IL,62703,2,1.5,2br,active,4,IH,Care Alliance,1200,600,true,wheelchair_accessible;ramp,3
```

## Common Housing System Exports

### Coordinated Entry / HMIS Systems

**Common export formats:**

1. **HUD HMIS Standard Export**
   - File: Enrollment.csv, Services.csv, Exit.csv
   - Contains: HMISParticipationID, HouseholdID, EntryDate, ExitDate
   - Mapping: Enroll entry → unit_id, EntryDate → created_at

2. **ServicePoint Export**
   - File: Clients.csv, Units.csv, Availability.csv
   - Contains: ClientID, InventoryID, AvailabilityDate
   - Mapping: InventoryID → unit_id, AvailabilityDate → status_updated_at

3. **OrgCode or Clarity Housing Export**
   - File: HousingInventory.csv, Occupancy.csv
   - Contains: ResidenceCode, BedCount, OccupancyCount
   - Mapping: ResidenceCode → unit_id, OccupancyCount → current_occupancy

### Generic Housing Database Export

Many housing systems can export via standard SQL queries. Use these column mappings:

```
Source Field          → SHDT Field
---
ResidenceID          → unit_id
ResidenceName        → unit_name
StreetAddress        → address
CityName             → city
StateCode            → state
ZIPCode              → zip_code
BedroomCount         → bed_count
BathroomCount        → bath_count
MaxCapacity          → capacity
CurrentOccupancy     → current_occupancy
Status               → status
RentAmount           → rent_amount
SubsidyAmount        → subsidy_amount
OperatorCompany      → operator_name
ContactPhone         → phone
ContactEmail         → email
```

### Real Estate / Property Management Systems

**Common systems:**
- **Zillow/Trulia**: Export property listings as CSV
- **Zillow for Work**: API export with full property details
- **MLS (Multiple Listing Service)**: CSV download with area information
- **CoStar**: Commercial real estate data export

**Import mapping from real estate systems:**
```
Property ID          → unit_id
Property Address     → address / city / state / zip_code
Bedrooms            → bed_count
Bathrooms           → bath_count
Unit Type           → property_type
Market Rent         → rent_amount
Latitude/Longitude  → geocoding (lat/long columns)
```

## Data Geocoding

### Automatic Geocoding

SHDT can automatically geocode addresses during import:

```bash
# Import with geocoding enabled
make import CSV_PATH=/path/to/data.csv GEOCODE=true

# Batch geocode existing units
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/geocode_units.py --batch-size 100
```

**Supported Geocoding Providers:**
- Nominatim (OpenStreetMap) - free, no key required
- Google Maps Geocoding - requires API key
- Mapbox - requires access token

### Manual Geocoding Entry

If automatic geocoding fails or you prefer manual entry, include latitude and longitude in CSV:

```csv
unit_id,unit_name,address,city,state,zip_code,...,latitude,longitude,geocoding_confidence
HU-001,Downtown,123 Main St,Springfield,IL,62701,...,39.7817,-89.6501,high
```

**Acceptable Confidence Levels:**
- `high`: Manually verified or from authoritative source
- `medium`: Geocoded automatically, checked
- `low`: Geocoded automatically, unverified

### Geocoding Troubleshooting

**Address not found:**
- Verify spelling and formatting
- Include full address with city/state
- Check for non-ASCII characters

**Incorrect location:**
- Try more specific address (add street number/direction)
- Use nearby cross-streets as reference
- Manually enter coordinates if needed

## Data Quality Standards

### Validation Rules

Each import is validated against these rules:

| Rule | Severity | Description |
|------|----------|-------------|
| Required fields present | Error | All required columns must have values |
| Unique unit_id | Error | No duplicate unit IDs across system |
| Valid state code | Error | Must be 2-letter US state abbreviation |
| Valid zip code | Warning | Should be 5 or 9 digits |
| Numeric bed/bath count | Error | Must be numbers (0-999) |
| Valid bed_count range | Warning | Should be 0-20 (check if >20) |
| Valid occupancy | Warning | Current_occupancy <= capacity |
| Valid coordinates | Warning | Latitude (-90 to 90), Longitude (-180 to 180) |
| Phone format | Warning | Should contain only digits and common separators |
| Email format | Warning | Should match standard email pattern |

### Data Quality Recommendations

1. **Address Standardization**
   - Use USPS address standardization
   - Include street direction and type (St, Ave, etc.)
   - Separate number/street/direction consistently

2. **Consistency**
   - Use same unit naming convention across all records
   - Consistent status values (case-insensitive in system)
   - Consistent program types from predefined list

3. **Completeness**
   - Fill in as many optional fields as available
   - Current occupancy helps with utilization reporting
   - Contact info enables outreach/surveys

4. **Accuracy**
   - Verify addresses before import
   - Check capacity matches actual unit layout
   - Confirm program types with operators

5. **Currency**
   - Update imports on regular schedule (monthly/quarterly)
   - Mark inactive/closed units with appropriate status
   - Update rent amounts when subsidies change

## Import Procedures

### Web UI Import

1. Navigate to Admin → Data Import
2. Click "Choose File" and select CSV
3. Review field mapping (auto-detected)
4. Preview first 5 rows
5. Click "Validate" to check for errors
6. Review validation results
7. Click "Import" to process
8. Monitor progress bar
9. Review import summary report

### Command Line Import

```bash
# Basic import
make import CSV_PATH=/data/housing.csv

# With geocoding
make import CSV_PATH=/data/housing.csv GEOCODE=true

# Dry run (validate without importing)
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/import_data.py \
  --file /data/housing.csv \
  --dry-run

# Verbose output with detailed logging
make import CSV_PATH=/data/housing.csv VERBOSE=true
```

### Bulk Update

Update existing records with new data:

```bash
# Update mode (match by unit_id, update other fields)
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/import_data.py \
  --file /data/updates.csv \
  --mode update
```

### Handling Import Errors

**Check import log for specific errors:**

```bash
# View import logs
make logs-backend | grep "import"

# View detailed error report
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/show_import_status.py --latest
```

**Common import errors and solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| "Duplicate unit_id" | ID already exists | Use unique IDs or use update mode |
| "Invalid state code" | Wrong format | Use 2-letter abbreviation (CA, NY, etc.) |
| "Missing required field" | Column missing or empty | Include all required columns with values |
| "Invalid coordinates" | Out of valid range | Check latitude (-90 to 90) and longitude (-180 to 180) |
| "Cannot geocode address" | Address not found | Verify address format and spelling |

## Data Export

### Export Existing Data

```bash
# Export all housing units
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/export_data.py --entity housing_units --format csv

# Export with filters
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/export_data.py \
  --entity housing_units \
  --filter "status=active" \
  --format csv

# Export to specific location
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/export_data.py \
  --entity housing_units \
  --output /backups/housing_export.csv
```

### Database Backup/Restore

```bash
# Full database backup (includes all data)
make backup

# Restore database from backup
make restore BACKUP_FILE=server/db/backup/shdt_20240101_020000.sql
```

## Data Privacy and Security

### Sensitive Information Handling
- Personal identifiable information (PII): name, SSN, DOB
- Financial data: income, rent amounts, subsidy amounts
- Health information: special needs, disabilities
- Access control: Only authorized staff can view/edit

### Data Encryption
- Data at rest: Encrypted PostgreSQL volumes
- Data in transit: HTTPS/SSL encryption
- Backups: Encrypted and stored securely

### Data Retention
- Active records: Retained indefinitely (with updates)
- Inactive records: Retained for 7 years (compliance)
- System logs: Retained for 90 days
- Backups: Retained for 30 days

### Audit Logging
All data modifications are logged with:
- User who made change
- Timestamp
- Field changed
- Old and new values

## Troubleshooting

### Import Fails at Database Insert

**Symptom:** Validation passes but import fails during database operation

```bash
# Check PostgreSQL logs
make logs-postgres

# Verify database connectivity
make shell-postgres
SELECT version();
```

**Solution:**
- Ensure database is running
- Check database credentials in .env
- Verify sufficient disk space

### Geocoding Timeout

**Symptom:** Import hangs during geocoding step

```bash
# Check for geocoding service errors
make logs-backend | grep geocod
```

**Solution:**
- Reduce batch size: `--batch-size 25`
- Use pre-geocoded coordinates in CSV
- Skip geocoding: omit `GEOCODE=true`

### Duplicate Key Violations

**Symptom:** Error "duplicate key value violates unique constraint"

```bash
# Check for duplicates in CSV
awk -F, '{print $1}' data.csv | sort | uniq -d
```

**Solution:**
- Remove duplicate rows from CSV
- Use update mode instead of insert
- Add suffix to unit_ids to make unique

### Special Character Issues

**Symptom:** Characters appear corrupted in database

**Solution:**
```bash
# Ensure CSV is UTF-8 encoded
file -i data.csv
# If not UTF-8, convert:
iconv -f ISO-8859-1 -t UTF-8 data.csv > data_utf8.csv
```

## Performance Tips

### Large Imports

For imports > 100,000 records:

```bash
# Increase batch size (default 100)
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/import_data.py \
  --file /data/large_import.csv \
  --batch-size 500

# Skip validation for pre-validated data
python scripts/import_data.py \
  --file /data/large_import.csv \
  --skip-validation
```

### Optimize Before Import

```bash
# Disable triggers temporarily (caution!)
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres shdt_db << EOF
ALTER TABLE housing_units DISABLE TRIGGER ALL;
-- Run import
ALTER TABLE housing_units ENABLE TRIGGER ALL;
EOF
```

## Related Documentation

- **ARCHITECTURE.md**: System technical architecture
- **DEPLOYMENT.md**: Production deployment procedures
- **USER_GUIDE.md**: End-user feature documentation
