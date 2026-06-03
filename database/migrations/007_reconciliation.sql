-- Migration 007: Data Reconciliation Tables
-- Tracks data imports, snapshots, and change history with conflict detection

CREATE TABLE data_snapshots (
    id BIGSERIAL PRIMARY KEY,
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('properties', 'components', 'maintenance', 'tenants')),
    file_name VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    record_count INTEGER NOT NULL,
    imported_by UUID NOT NULL REFERENCES users(id),
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    import_mode VARCHAR(20) NOT NULL CHECK (import_mode IN ('upsert', 'append', 'replace')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'preview', 'applied', 'rolled_back')),
    diff_summary JSONB NOT NULL DEFAULT '{}',
    manual_overrides JSONB NOT NULL DEFAULT '{}',
    data_source VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organisation_id, file_hash, import_mode)
);

CREATE INDEX idx_data_snapshots_org_type ON data_snapshots(organisation_id, data_type, imported_at DESC);
CREATE INDEX idx_data_snapshots_status ON data_snapshots(status, organisation_id);

CREATE TABLE data_changes (
    id BIGSERIAL PRIMARY KEY,
    snapshot_id BIGINT NOT NULL REFERENCES data_snapshots(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('insert', 'update', 'delete')),
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    is_conflict BOOLEAN NOT NULL DEFAULT FALSE,
    is_enriched_field BOOLEAN NOT NULL DEFAULT FALSE,
    resolution VARCHAR(20) CHECK (resolution IN ('accept_import', 'keep_current', 'manual_override', 'pending')),
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_resolution_when_conflict CHECK (
        (is_conflict = TRUE AND resolution IS NOT NULL) OR
        (is_conflict = FALSE)
    )
);

CREATE INDEX idx_data_changes_snapshot ON data_changes(snapshot_id);
CREATE INDEX idx_data_changes_entity ON data_changes(entity_type, entity_id, snapshot_id);
CREATE INDEX idx_data_changes_conflict ON data_changes(snapshot_id) WHERE is_conflict = TRUE;
CREATE INDEX idx_data_changes_enriched ON data_changes(snapshot_id) WHERE is_enriched_field = TRUE;

-- Enable audit logging
ALTER TABLE data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY snapshots_org_isolation ON data_snapshots
    USING (organisation_id = current_setting('app.organisation_id')::UUID);

CREATE POLICY changes_org_isolation ON data_changes
    USING (snapshot_id IN (
        SELECT id FROM data_snapshots
        WHERE organisation_id = current_setting('app.organisation_id')::UUID
    ));
