"""Phase 4 — enrichment_runs table for scheduled job audit trail

Adds the table that the jobs.runner module writes to at every run start /
end. Powers the /api/enrichment/runs endpoint and the EnrichmentStatusPage.

Each row represents a single scheduled (or manual) execution of an
enrichment job:

    started_at      — when the runner acquired its lock and began work
    finished_at     — when the run ended (success or failure)
    status          — running | success | failed | cancelled
    summary         — JSON blob with whatever metrics the job emits
                      (records_updated, batch_count, errors, etc.)
    triggered_by    — schedule | manual | api | unknown
    duration_ms     — convenience field; finished_at - started_at in ms

Revision ID: 20260430_p4
Revises: 20260430_p3
"""
from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = '20260430_p4'
down_revision = '20260430_p3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS enrichment_runs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source          VARCHAR(64) NOT NULL,
                -- 'postcodes' | 'imd' | 'census' | 'broadband' | 'crime'
                -- | 'flood' | 'epc' | 'uprn' | 'forecast' | 'all'
            triggered_by    VARCHAR(32) NOT NULL DEFAULT 'unknown',
                -- schedule | manual | api | unknown
            triggered_by_user VARCHAR(255),
                -- email/identity of the person who triggered (if manual)
            status          VARCHAR(16) NOT NULL DEFAULT 'running',
                -- running | success | failed | cancelled
            started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at     TIMESTAMPTZ,
            duration_ms     INTEGER,
            host            VARCHAR(128),
                -- container app revision name / hostname for traceability
            git_commit      VARCHAR(40),
            summary         JSONB,
                -- arbitrary per-source stats (records_updated, errors, ...)
            error           TEXT,
                -- single-line error summary if status='failed'
            traceback       TEXT,
                -- full traceback for triage
            CONSTRAINT enrichment_runs_status_chk
                CHECK (status IN ('running','success','failed','cancelled')),
            CONSTRAINT enrichment_runs_trigger_chk
                CHECK (triggered_by IN ('schedule','manual','api','unknown'))
        );
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_enrichment_runs_source_started
            ON enrichment_runs(source, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_enrichment_runs_status
            ON enrichment_runs(status, started_at DESC)
            WHERE status IN ('running','failed');
        CREATE INDEX IF NOT EXISTS idx_enrichment_runs_started
            ON enrichment_runs(started_at DESC);
        """
    )

    # Convenience view: most recent run per source.
    op.execute(
        """
        CREATE OR REPLACE VIEW enrichment_latest_runs AS
        SELECT DISTINCT ON (source)
            source, id, status, started_at, finished_at, duration_ms,
            triggered_by, summary, error
        FROM enrichment_runs
        ORDER BY source, started_at DESC;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS enrichment_latest_runs;")
    op.execute("DROP TABLE IF EXISTS enrichment_runs;")
