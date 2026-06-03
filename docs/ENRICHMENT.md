# SHDT Enrichment System Documentation

## Overview

The SHDT (Strategic Heat Decarbonization Toolkit) enrichment system provides automated data enrichment, quality monitoring, and advanced analytics for property portfolios. It integrates multiple data sources to create comprehensive property profiles and enable data-driven retrofit decision-making.

## Architecture

### Core Components

1. **Enrichment Providers**: Modular providers for each data source
2. **Scheduler**: APScheduler-based task orchestration with incremental enrichment
3. **Quality Monitor**: Real-time data quality metrics and alerting
4. **Analytics Service**: Retrofit prioritization, portfolio analysis, and scenario modeling
5. **Dashboard UI**: Real-time monitoring and manual control interface

### Data Flow

```
Data Sources → Enrichment Providers → Property Model
                                          ↓
                                    Quality Monitor
                                          ↓
                                    Analytics Engine
                                          ↓
                                    Dashboard & APIs
```

## Enrichment Providers

### EPC (Energy Performance Certificate)

- **Schedule**: Monthly (1st of month, 02:00 UTC)
- **Match Rate**: ~85% for active properties
- **Key Fields**:
  - `epc_rating`: A-G energy efficiency rating
  - `current_energy_consumption`: kWh/m2/year
  - `potential_energy_consumption`: Post-retrofit estimate
  - `co2_emissions`: Current carbon footprint
  - `match_confidence`: Match quality (0-1)
- **Matching**: Postcode + house number or approximate matching
- **Quality Alert Threshold**: Match rate < 80%

### Postcodes

- **Schedule**: Quarterly (1st Jan, Apr, Jul, Oct at 03:00 UTC)
- **Match Rate**: ~98%
- **Key Fields**:
  - `postcode`: Validated UK postcode
  - `lsoa`: Lower Super Output Area
  - `region`: Regional classification
  - `latitude`/`longitude`: Geocoding
- **Matching**: Direct postcode match
- **Data Freshness**: Updates when ONS publishes changes

### Flood Risk

- **Schedule**: Twice daily (00:00, 12:00 UTC) + monthly warnings
- **Match Rate**: ~100%
- **Key Fields**:
  - `flood_risk_surface`: River/coastal flood probability
  - `flood_risk_groundwater`: Groundwater flood probability
  - `flood_risk_history`: Past flood records
  - `flood_risk_level`: Low/Medium/High classification
- **Matching**: Direct postcode + coordinates
- **Priority**: High due to property risk implications

### Crime Data

- **Schedule**: Monthly (15th of month, 04:00 UTC)
- **Match Rate**: ~90%
- **Key Fields**:
  - `crime_rate_annual`: Crimes per 1000 residents
  - `crime_categories`: Breakdown by type
  - `local_authority`: Police region
- **Matching**: Postcode-level aggregation
- **Data Lag**: 30-60 days behind current date

### IMD (Index of Multiple Deprivation)

- **Schedule**: Annually (Jan 1, 05:00 UTC)
- **Match Rate**: ~100%
- **Key Fields**:
  - `imd_rank`: 1-32,844 (1 = most deprived)
  - `imd_decile`: 1-10 grouping
  - `imd_score`: Continuous deprivation score
- **Matching**: LSOA-level data
- **Stability**: Static annual updates

### Census

- **Schedule**: As needed (Jan 15, 06:00 UTC)
- **Match Rate**: ~95%
- **Key Fields**:
  - `household_composition`: Family types
  - `age_distribution`: Age demographics
  - `ethnic_diversity`: Cultural composition
- **Matching**: LSOA-level aggregation
- **Update Frequency**: Decennial + mid-term updates

### Land Registry

- **Schedule**: Monthly (1st of month, 07:00 UTC)
- **Match Rate**: ~80%
- **Key Fields**:
  - `sale_price`: Last transaction price
  - `sale_date`: When property last sold
  - `property_type`: Terraced/Semi/Detached/Flat
  - `build_year`: Estimated construction date
- **Matching**: Complex algorithm using title deeds
- **Quality Note**: Retrospective (past 6 months) and forward-looking sales

## Scheduling System

### APScheduler Configuration

Default schedules are defined in `EnrichmentScheduler.DEFAULT_SCHEDULES`:

```python
{
    'epc': {'day': 1, 'hour': 2, 'minute': 0},           # First of month
    'postcodes': {'day': 1, 'month': '1,4,7,10'},        # Quarterly
    'flood': {'hour': '0,12'},                           # Twice daily
    'crime': {'day': 15, 'hour': 4},                     # Mid-month
    'imd': {'month': 1, 'day': 1, 'hour': 5},           # January 1st
    'census': {'month': 1, 'day': 15, 'hour': 6},       # January 15th
    'land_registry': {'day': 1, 'hour': 7}               # First of month
}
```

### Incremental Enrichment Strategy

Properties are prioritized for enrichment in this order:

1. **New Properties** (first 33%): Never enriched for this provider
2. **Stale Properties** (next 33%): High `staleness_score` (> 0.5)
3. **Failed Retries** (final 33%): Previous errors with `error_count > 2`

Staleness score is calculated as:

```
staleness_score = (days_since_last_run / average_schedule_interval) * 
                  (error_count / 5)  # Weight by recent errors
```

### Configuration Management

Schedules are stored in `enrichment_config` table:

```sql
CREATE TABLE enrichment_config (
    id INTEGER PRIMARY KEY,
    provider VARCHAR(50),
    trigger_type VARCHAR(20),      -- 'cron' or 'interval'
    trigger_config JSONB,           -- CronTrigger or interval params
    batch_size INTEGER DEFAULT 1000,
    enabled BOOLEAN DEFAULT TRUE,
    last_run TIMESTAMP,
    last_run_count INTEGER,
    last_run_success INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Runtime Management

**API Endpoints**:

- `GET /api/scheduler/status` - Current schedule and next runs
- `POST /api/scheduler/trigger/{provider}` - Manual trigger
- `PATCH /api/scheduler/config` - Update schedule
- `GET /api/scheduler/history` - View enrichment history
- `GET /api/scheduler/next-runs` - Upcoming scheduled runs

**Example: Manual Trigger**

```bash
curl -X POST http://localhost:8000/api/scheduler/trigger/epc
```

**Example: Update Configuration**

```bash
curl -X PATCH http://localhost:8000/api/scheduler/config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "epc",
    "trigger_type": "cron",
    "trigger_config": {
      "day": 1,
      "hour": 3,
      "minute": 0
    },
    "enabled": true
  }'
```

## Quality Monitoring

### Quality Metrics

Quality is measured across multiple dimensions:

#### 1. Completeness (40% of score)

Field-level coverage percentage:

```
completeness = (non_null_values / total_properties) * 100
```

Target: > 70% overall completeness

#### 2. Freshness (35% of score)

Data age with scoring function:

```
if days_old <= 7:
    score = 100
elif days_old <= 90:
    score = 100 - (days_old - 7) * (100/83)
else:
    score = 0
```

Target: > 80% freshness (data < 7 days old)

#### 3. Accuracy (25% of score)

Provider health based on recent run success rates:

```
health_score = success_rate * 100

if health_score >= 95:
    score = 100
elif health_score >= 85:
    score = 80
elif health_score >= 70:
    score = 60
else:
    score = 40
```

Target: > 85% success rate

### Alert Thresholds

Alerts trigger when:

- **EPC match rate** < 80%
- **Overall completeness** < 70%
- **Data freshness** > 30 days old
- **Error rate** > 5%
- **Provider coverage** < 60%

**API Endpoint**:

```
GET /api/enrichment/quality
```

Returns comprehensive quality metrics and active alerts.

### Quality Report Components

```json
{
  "overall_score": 78,
  "completeness": {
    "epc_rating": 85.2,
    "heating_type": 72.1,
    "property_age": 91.5
  },
  "freshness": {
    "epc": {
      "last_update": "2025-03-10T02:00:00Z",
      "days_old": 7,
      "score": 100,
      "status": "fresh"
    },
    "postcodes": {
      "last_update": "2025-01-01T03:00:00Z",
      "days_old": 75,
      "score": 29,
      "status": "stale"
    }
  },
  "provider_health": {
    "epc": {
      "health_score": 92,
      "status": "healthy",
      "recent_success_rate": 92.5,
      "recent_error_rate": 2.1
    }
  },
  "alerts": [
    "postcodes data stale: last updated 75 days ago",
    "EPC match rate low: 78.5% < 80.0%"
  ]
}
```

## Analytics & Retrofit Prioritization

### Retrofit Priority Score (0-100)

Priority score combines multiple factors:

```
priority = (
    epc_gap * 0.40 +
    fuel_poverty * 0.20 +
    imd * 0.10 +
    property_age * 0.10 +
    heating_type * 0.10 +
    co2_impact * 0.10
)
```

#### Component Scoring

**EPC Gap (40%)**
- A = 0 (no retrofit needed)
- B = 10
- C = 20
- D = 40
- E = 70
- F = 85
- G = 100 (highest priority)

**Fuel Poverty Risk (20%)**
- Base: 80 if fuel-poor flag, 30 otherwise
- Adjusted by: energy consumption, household size

**IMD Deprivation (10%)**
- Score: (10,000 - imd_rank) / 100
- Higher IMD rank (more deprived) = higher priority

**Property Age (10%)**
- Score: (build_year - 1850) / 17
- Older properties prioritized

**Heating Type (10%)**
- Solid fuel: 90
- Electric: 80
- Oil: 70
- LPG: 65
- Gas: 60
- Renewable: 20

**CO2 Impact (10%)**
- Score: (emissions / 30) * 100
- Normalized to ~30 tonnes baseline

### Portfolio Insights

Provides portfolio-level metrics:

```json
{
  "total_properties": 5000,
  "energy_metrics": {
    "total_consumption_kwh": 4200000,
    "total_co2_tonnes": 1200,
    "avg_consumption_per_property": 840,
    "avg_co2_per_property": 0.24
  },
  "energy_spend": {
    "estimated_annual_spend": 1008000,
    "spend_per_property": 201.60
  },
  "epc_distribution": {
    "A": 50, "B": 300, "C": 800, "D": 1500, "E": 1200, "F": 950, "G": 200
  },
  "epc_c_rate": {
    "properties_at_c": 1150,
    "percentage": 23.0
  },
  "retrofit_potential": {
    "potential_consumption_kwh": 3000000,
    "potential_annual_spend": 720000,
    "potential_savings_if_all_c": 288000,
    "estimated_retrofit_cost": 25000000,
    "payback_years": 86.8
  }
}
```

### Fuel Poverty Analysis

Risk scoring combines:
- Fuel poverty flag status
- Energy consumption levels
- Household composition
- Income demographics (IMD proxy)

Scale: 1-10 risk level

### Geographic Risk Analysis

Identifies LSOAs with compound risks:

```json
{
  "high_risk_lsoas": [
    {
      "lsoa": "E01",
      "properties": 45,
      "avg_co2": 12.5,
      "fuel_poverty_rate": 35.2,
      "compound_risk_score": 78.3
    }
  ]
}
```

### Investment Scenario Modeling

Greedy algorithm allocates budget for maximum impact:

```
1. Sort properties by retrofit priority (highest first)
2. Allocate retrofit cost (£5,000/property) while budget available
3. Calculate annual savings (£200/property average)
4. Project payback period and ROI
```

**Example Output**:

```json
{
  "scenario": "greedy_highest_priority",
  "budget": 100000,
  "properties_retrofitted": 20,
  "cost_per_property": 5000,
  "total_cost": 100000,
  "annual_savings": 4000,
  "payback_period_years": 25.0,
  "top_retrofitted": [
    {
      "property_id": 1234,
      "address": "123 High Street",
      "priority_score": 95.2,
      "epc_rating": "G",
      "fuel_poor": true
    }
  ]
}
```

## Dashboard Interface

### Overview Section

- **Total Properties**: Count of active properties
- **Enriched Count**: Number with complete enrichment data + percentage
- **Last Run**: Most recent enrichment completion timestamp
- **Data Freshness**: Overall freshness percentage

### Provider Status Table

Per-provider metrics with health color-coding:

- **Green** (>=90% match rate): Healthy
- **Amber** (70-90%): Warning
- **Red** (<70%): Critical

Columns:
- Provider name
- Enabled toggle
- Match count
- Match rate %
- Error rate %
- Last run timestamp
- Health status badge

### Data Quality Charts

**Coverage by Source**: Bar chart of completeness per provider

**EPC Match Confidence**: Distribution of confidence levels (high/medium/low/very_low)

**Data Freshness Timeline**: Line chart showing freshness % over time

**Overall Quality Gauge**: Circular progress indicator (0-100)

### Scheduling Panel

Per-provider schedule visualization:

- Provider name
- Current interval (e.g., "Monthly first day")
- Next run countdown
- Last run timestamp
- Enable/disable toggle
- Manual trigger button

### Enrichment Operations

**Enrich All Properties** button:

- Initiates POST /api/enrichment/all
- Streams progress updates via Server-Sent Events
- Shows real-time progress bar
- Displays completion message

### Quality Alerts

Active alert banner displaying:
- Alert icon and severity
- Alert message per issue
- Suggested remediation if applicable

## API Reference

### Enrichment Status

```
GET /api/enrichment/provider-status
```

Returns provider status and metrics.

### Quality Metrics

```
GET /api/enrichment/quality
```

Returns comprehensive quality report.

### Scheduler Status

```
GET /api/scheduler/status
```

Returns schedule information and next run times.

### Analytics

```
GET /api/analytics/portfolio
GET /api/analytics/retrofit-priorities
GET /api/analytics/geographic-risks
GET /api/analytics/scenario/{budget}
```

## Database Schema

### Core Tables

**enrichment_config**
- `id`: Primary key
- `provider`: Provider name
- `trigger_type`: 'cron' or 'interval'
- `trigger_config`: JSONB configuration
- `batch_size`: Records per run
- `enabled`: Schedule active flag
- `last_run`: Timestamp of last execution
- `last_run_count`: Properties processed
- `last_run_success`: Successful enrichments

**enrichment_log**
- `id`: Primary key
- `provider`: Provider name
- `run_timestamp`: When run started
- `total_count`: Properties attempted
- `success_count`: Successful enrichments
- `error_count`: Failed enrichments
- `skip_count`: Skipped (already enriched)
- `duration_seconds`: Execution time
- `data`: JSONB details/errors

**enrichment_data**
- `id`: Primary key
- `property_id`: Foreign key
- `provider`: Data source
- `data`: JSONB enrichment data
- `match_confidence`: 0-1 match quality
- `error_message`: Error details if failed
- `created_at`: When enriched
- `updated_at`: Last refresh

**property**
- All core property fields
- `staleness_score`: Enrichment priority indicator
- `enrichment_timestamp`: Last enrichment update
- `active`: Property active flag

**quality_alert**
- `id`: Primary key
- `alert_type`: Alert category
- `severity`: 'critical', 'warning', 'info'
- `message`: Alert description
- `created_at`: When generated
- `resolved_at`: When acknowledged

## Troubleshooting

### High Staleness Scores

Indicates enrichment is falling behind schedule:

1. Check scheduler status: `GET /api/scheduler/status`
2. Verify provider is enabled
3. Check for persistent errors in enrichment logs
4. Manually trigger: `POST /api/scheduler/trigger/{provider}`

### Low Match Rates

Data provider connection issues:

1. Test provider: `POST /api/scheduler/test/{provider}`
2. Check provider credentials/API keys
3. Review error details in enrichment logs
4. Check data provider status page

### Quality Score Declining

Multi-factor issue:

1. Check freshness: `GET /api/enrichment/quality`
2. Run manual enrichments for stale providers
3. Verify data completeness by field
4. Check recent error rates

## Performance Considerations

### Batch Sizing

Default batch size: 1,000 properties per run

Adjust based on:
- API rate limits
- Network bandwidth
- Database write performance

### Database Indexes

Key indexes for performance:

```sql
CREATE INDEX idx_property_active ON property(active);
CREATE INDEX idx_enrichment_provider_run ON enrichment_log(provider, run_timestamp);
CREATE INDEX idx_enrichment_data_property ON enrichment_data(property_id, provider);
CREATE INDEX idx_property_staleness ON property(staleness_score) WHERE active = true;
```

### Monitoring

Key metrics to track:

- Average enrichment runtime per provider
- Match rates by provider
- Error rate trends
- Data freshness by field
- Dashboard query response times

## Future Enhancements

1. **Machine Learning**: Retrofit impact prediction models
2. **Advanced Scenario Modeling**: Budget optimization algorithms
3. **Real-time Streaming**: WebSocket updates for long-running enrichments
4. **Third-party Integrations**: Weather, solar irradiance, grid carbon intensity
5. **Predictive Maintenance**: Alert when data quality degradation expected
