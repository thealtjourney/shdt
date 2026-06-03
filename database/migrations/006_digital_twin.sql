-- Migration 006: Digital Twin Core
-- Creates tables for component lifecycle management, inspections, maintenance tracking, and scenario analysis

-- Create ENUM types for component_types
CREATE TYPE component_category AS ENUM ('structure', 'envelope', 'services', 'internal');
CREATE TYPE criticality_level AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE condition_confidence AS ENUM ('high', 'medium', 'low', 'estimated');
CREATE TYPE component_status AS ENUM ('active', 'failed', 'replaced', 'removed');
CREATE TYPE maintenance_priority AS ENUM ('emergency', 'urgent', 'normal', 'planned', 'deferred');
CREATE TYPE maintenance_status AS ENUM ('reported', 'scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE scenario_status AS ENUM ('draft', 'running', 'completed', 'failed');

-- Component Types table - defines the universe of possible components
CREATE TABLE component_types (
    id SERIAL PRIMARY KEY,
    category component_category NOT NULL,
    name VARCHAR(255) NOT NULL UNIQUE,
    expected_lifespan_years INT NOT NULL,
    criticality criticality_level NOT NULL,
    replacement_cost_low INT NOT NULL,
    replacement_cost_mid INT NOT NULL,
    replacement_cost_high INT NOT NULL,
    maintenance_interval_months INT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Property Components table - instances of components at specific properties
CREATE TABLE property_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    component_type_id INT NOT NULL REFERENCES component_types(id),
    installation_date DATE,
    installation_date_confidence condition_confidence,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    specification JSONB,
    condition_score SMALLINT CHECK (condition_score >= 1 AND condition_score <= 5),
    condition_last_assessed TIMESTAMP,
    condition_notes TEXT,
    remaining_life_years FLOAT,
    predicted_failure_date DATE,
    predicted_failure_confidence FLOAT CHECK (predicted_failure_confidence >= 0 AND predicted_failure_confidence <= 1),
    replacement_priority_score FLOAT,
    last_maintained TIMESTAMP,
    next_maintenance_due DATE,
    status component_status DEFAULT 'active',
    replaced_by_id UUID REFERENCES property_components(id),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_components_property_id ON property_components(property_id);
CREATE INDEX idx_property_components_component_type_id ON property_components(component_type_id);
CREATE INDEX idx_property_components_organisation_id ON property_components(organisation_id);
CREATE INDEX idx_property_components_status ON property_components(status);
CREATE INDEX idx_property_components_predicted_failure_date ON property_components(predicted_failure_date);

-- Component Inspections table - historical inspection records
CREATE TABLE component_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id UUID NOT NULL REFERENCES property_components(id) ON DELETE CASCADE,
    inspection_date TIMESTAMP NOT NULL,
    inspector VARCHAR(255),
    condition_score SMALLINT CHECK (condition_score >= 1 AND condition_score <= 5),
    notes TEXT,
    photos TEXT[],
    defects_found JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_component_inspections_component_id ON component_inspections(component_id);
CREATE INDEX idx_component_inspections_inspection_date ON component_inspections(inspection_date);

-- Maintenance Records table - logs of all maintenance work
CREATE TABLE maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    component_id UUID REFERENCES property_components(id) ON DELETE SET NULL,
    work_order_ref VARCHAR(255),
    reported_date TIMESTAMP NOT NULL,
    completed_date TIMESTAMP,
    category VARCHAR(100),
    priority maintenance_priority DEFAULT 'normal',
    description TEXT,
    trade VARCHAR(100),
    cost NUMERIC(10, 2),
    contractor VARCHAR(255),
    status maintenance_status DEFAULT 'reported',
    repeat_visit BOOLEAN DEFAULT FALSE,
    source VARCHAR(100),
    raw_data JSONB,
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_maintenance_records_property_id ON maintenance_records(property_id);
CREATE INDEX idx_maintenance_records_component_id ON maintenance_records(component_id);
CREATE INDEX idx_maintenance_records_organisation_id ON maintenance_records(organisation_id);
CREATE INDEX idx_maintenance_records_reported_date ON maintenance_records(reported_date);
CREATE INDEX idx_maintenance_records_status ON maintenance_records(status);

-- Scenarios table - what-if analysis for interventions
CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    status scenario_status DEFAULT 'draft',
    target_filter JSONB,
    interventions JSONB NOT NULL,
    timeframe_years INT DEFAULT 10,
    results JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_scenarios_organisation_id ON scenarios(organisation_id);
CREATE INDEX idx_scenarios_status ON scenarios(status);
CREATE INDEX idx_scenarios_created_at ON scenarios(created_at);

-- Seed component types with UK social housing components
INSERT INTO component_types (category, name, expected_lifespan_years, criticality, replacement_cost_low, replacement_cost_mid, replacement_cost_high, maintenance_interval_months, description) VALUES
('services', 'Boiler', 15, 'critical', 1500, 2500, 4000, 12, 'Gas, oil or electric central heating boiler'),
('envelope', 'Roof Covering', 25, 'critical', 3000, 6000, 12000, 36, 'Roof tiles, slate, or felt covering'),
('envelope', 'External Walls', 50, 'critical', 5000, 15000, 40000, 60, 'Brick, stone, timber, or rendered external walls'),
('envelope', 'Windows', 30, 'high', 200, 500, 1200, 60, 'Single, double or triple glazed windows'),
('services', 'Electrics', 40, 'critical', 800, 2000, 5000, 120, 'Electrical wiring, consumer unit and distribution'),
('services', 'Plumbing', 40, 'critical', 500, 1500, 3500, 120, 'Water pipes, drainage and fittings'),
('internal', 'Kitchen', 20, 'high', 800, 3000, 8000, 60, 'Kitchen units, worktops and appliances'),
('internal', 'Bathroom', 20, 'high', 600, 2500, 6000, 60, 'Bathroom suite, tiling and fixtures'),
('envelope', 'Front Door', 30, 'high', 300, 800, 2000, 60, 'External entrance door and frame'),
('envelope', 'Rainwater Goods', 30, 'high', 200, 600, 1500, 36, 'Guttering, downpipes and accessories'),
('envelope', 'Roof Insulation', 40, 'high', 500, 1500, 4000, 120, 'Loft insulation, attic access'),
('envelope', 'Wall Insulation', 50, 'high', 1000, 4000, 12000, 120, 'Cavity fill, external render or internal dry-line'),
('services', 'Hot Water System', 15, 'critical', 800, 2000, 4500, 12, 'Cylinder, immersion heater or heat exchanger'),
('services', 'Storage Heaters', 15, 'high', 300, 800, 2000, 24, 'Electric storage heaters'),
('services', 'Ventilation', 20, 'high', 300, 1000, 2500, 24, 'Mechanical ventilation, extractor fans'),
('internal', 'Flooring', 25, 'medium', 200, 800, 2000, 60, 'Carpet, vinyl, wooden or tiled flooring'),
('structure', 'Staircase', 50, 'high', 400, 1500, 4000, 120, 'Internal or external stairs and balustrades'),
('structure', 'Fencing', 25, 'medium', 300, 1000, 2500, 36, 'Boundary fencing and gates'),
('internal', 'Communal Areas', 30, 'medium', 500, 2000, 5000, 60, 'Common parts decoration and maintenance'),
('services', 'Fire Safety Systems', 15, 'critical', 500, 1500, 3000, 12, 'Fire extinguishers, alarms, emergency lighting');

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_component_types_updated_at
BEFORE UPDATE ON component_types
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_components_updated_at
BEFORE UPDATE ON property_components
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
