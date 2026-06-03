"""Phase 3 — compliance, TSMs, Awaab's Law cases, damp & mould risk

Adds the schema (and synthetic seed data) for the Phase 3 features:

  * compliance_certificates — per-property × per-regime (gas / EICR / FRA / asbestos / Legionella)
  * tsm_responses — synthetic Tenant Satisfaction survey responses
  * awaab_cases + awaab_case_events — damp/mould caseload with SLA tracking
  * properties.damp_mould_risk_score — 0–100 portfolio-wide score
  * properties.damp_mould_risk_factors — JSONB explanation panel data

The same revision seeds synthetic data for every existing property so the
new pages immediately render meaningful values. Seeding is deterministic
(seeded random, MD5 of UUID for tie-breaks).

Revision ID: 20260430_p3
Revises:
Create Date: 2026-04-30
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260430_p3'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ───────────────────────────────────────────────────────────
    # 1. Damp & mould columns on properties
    # ───────────────────────────────────────────────────────────
    op.execute(
        """
        ALTER TABLE properties
            ADD COLUMN IF NOT EXISTS damp_mould_risk_score    NUMERIC(5,2),
            ADD COLUMN IF NOT EXISTS damp_mould_risk_band     VARCHAR(16),
            ADD COLUMN IF NOT EXISTS damp_mould_risk_factors  JSONB,
            ADD COLUMN IF NOT EXISTS damp_mould_assessed_at   TIMESTAMPTZ;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_properties_dampmould_score
            ON properties(damp_mould_risk_score DESC NULLS LAST)
            WHERE damp_mould_risk_score IS NOT NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_properties_dampmould_band
            ON properties(damp_mould_risk_band)
            WHERE damp_mould_risk_band IS NOT NULL;
        """
    )

    # ───────────────────────────────────────────────────────────
    # 2. Compliance certificates table
    # ───────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS compliance_certificates (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id        UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
            regime             VARCHAR(32) NOT NULL,
                -- gas | electrical | fra | asbestos | legionella
            issued_at          DATE,
            expires_at         DATE,
            certificate_ref    VARCHAR(64),
            issued_by          VARCHAR(255),
            status             VARCHAR(16) NOT NULL DEFAULT 'compliant',
                -- compliant | due_soon | overdue | not_applicable
            notes              TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT compliance_certificates_regime_chk
                CHECK (regime IN ('gas','electrical','fra','asbestos','legionella')),
            CONSTRAINT compliance_certificates_status_chk
                CHECK (status IN ('compliant','due_soon','overdue','not_applicable'))
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_compliance_property_regime
            ON compliance_certificates(property_id, regime);
        CREATE INDEX IF NOT EXISTS idx_compliance_status_expires
            ON compliance_certificates(status, expires_at)
            WHERE status IN ('due_soon','overdue');
        CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_active
            ON compliance_certificates(property_id, regime);
        """
    )

    # ───────────────────────────────────────────────────────────
    # 3. Tenant Satisfaction Measures responses
    # ───────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tsm_responses (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            measure_code  VARCHAR(8) NOT NULL,
                -- TP01–TP12, RP01–RP02, BP01, CH01–CH02, NM01, AS01
            survey_year   INTEGER NOT NULL,
            response_value NUMERIC(5,2) NOT NULL,
                -- percentage 0–100 for satisfaction measures, count for management measures
            response_count INTEGER NOT NULL DEFAULT 0,
            ward_code     VARCHAR(16),
            ward_name     VARCHAR(255),
            local_authority_name VARCHAR(255),
            captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT tsm_response_value_range CHECK (response_value >= 0)
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_tsm_measure_year
            ON tsm_responses(measure_code, survey_year);
        CREATE INDEX IF NOT EXISTS idx_tsm_ward
            ON tsm_responses(ward_code) WHERE ward_code IS NOT NULL;
        """
    )

    # ───────────────────────────────────────────────────────────
    # 4. Awaab's Law caseload
    # ───────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS awaab_cases (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
            reported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reporter            VARCHAR(255),
            reporter_channel    VARCHAR(32),
                -- phone | portal | email | inspection | sensor
            stage               VARCHAR(32) NOT NULL DEFAULT 'reported',
                -- reported | investigated | repair_scheduled | repaired | closed
            severity            VARCHAR(16) NOT NULL DEFAULT 'standard',
                -- emergency | urgent | standard
            description         TEXT,
            assigned_to         VARCHAR(255),
            investigation_due_at TIMESTAMPTZ,
                -- 14 days from reported_at by default; 24h if emergency
            repair_due_at       TIMESTAMPTZ,
                -- 7 days from investigated_at; sooner for emergencies
            investigated_at     TIMESTAMPTZ,
            repair_scheduled_at TIMESTAMPTZ,
            repaired_at         TIMESTAMPTZ,
            closed_at           TIMESTAMPTZ,
            sla_breached        BOOLEAN NOT NULL DEFAULT FALSE,
            sla_breach_reason   TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT awaab_stage_chk
                CHECK (stage IN ('reported','investigated','repair_scheduled','repaired','closed')),
            CONSTRAINT awaab_severity_chk
                CHECK (severity IN ('emergency','urgent','standard')),
            CONSTRAINT awaab_channel_chk
                CHECK (reporter_channel IS NULL OR reporter_channel IN ('phone','portal','email','inspection','sensor'))
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_awaab_property
            ON awaab_cases(property_id);
        CREATE INDEX IF NOT EXISTS idx_awaab_stage_breach
            ON awaab_cases(stage, sla_breached);
        CREATE INDEX IF NOT EXISTS idx_awaab_open
            ON awaab_cases(reported_at DESC)
            WHERE stage NOT IN ('repaired','closed');
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS awaab_case_events (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            case_id     UUID NOT NULL REFERENCES awaab_cases(id) ON DELETE CASCADE,
            event_type  VARCHAR(32) NOT NULL,
                -- stage_change | note | sla_breach | sensor_alert | escalation
            from_stage  VARCHAR(32),
            to_stage    VARCHAR(32),
            actor       VARCHAR(255),
            note        TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_awaab_events_case
            ON awaab_case_events(case_id, created_at);
        """
    )

    # ───────────────────────────────────────────────────────────
    # 5. Synthetic seed data — DISABLED
    #
    # Synthetic complaints, TSM, AWAAB, and damp/mould seed data has been
    # removed for the demo build. The schema above is still created so a
    # live deployment can populate real data via the import pipelines.
    # ───────────────────────────────────────────────────────────
    return  # noqa: E501 — skip all synthetic seed blocks below

    # 5a. Damp & mould risk scoring  (DISABLED)
    # Glass-box formula using only data we already have:
    #   base                                         15
    #   + EPC penalty (D=10, E=20, F=30, G=40)       0–40
    #   + overcrowded_pct above 6%                   0–15
    #   + no_central_heating_pct above 5%            0–10
    #   + age penalty (pre-1945=10, pre-1980=5)      0–10
    #   + flood-risk penalty (high=8, medium=4)      0–8
    #   - broadband bonus (FTTP & superfast = -3)    0 to -3
    #   = clamped to 0–100
    op.execute("SELECT setseed(0.4242);")
    op.execute(
        """
        WITH scored AS (
            SELECT
                p.id,
                LEAST(100, GREATEST(0,
                    15
                  + CASE
                        WHEN p.epc_rating = 'G' THEN 40
                        WHEN p.epc_rating = 'F' THEN 30
                        WHEN p.epc_rating = 'E' THEN 20
                        WHEN p.epc_rating = 'D' THEN 10
                        ELSE 0
                    END
                  + CASE
                        WHEN COALESCE(p.census_overcrowded_pct, 0) > 6
                            THEN LEAST(15, ROUND((p.census_overcrowded_pct - 6) * 1.5)::int)
                        ELSE 0
                    END
                  + CASE
                        WHEN COALESCE(p.census_no_central_heating_pct, 0) > 5
                            THEN LEAST(10, ROUND((p.census_no_central_heating_pct - 5) * 1.0)::int)
                        ELSE 0
                    END
                  + CASE
                        WHEN p.year_built IS NULL THEN 5
                        WHEN p.year_built < 1945 THEN 10
                        WHEN p.year_built < 1980 THEN 5
                        ELSE 0
                    END
                  + CASE
                        WHEN p.flood_risk_rivers_seas = 'High'   THEN 8
                        WHEN p.flood_risk_rivers_seas = 'Medium' THEN 4
                        ELSE 0
                    END
                  + (random() * 4 - 2)::int
                  - CASE
                        WHEN p.broadband_fttp_available = TRUE
                          AND p.broadband_superfast_available = TRUE THEN 3
                        ELSE 0
                    END
                ))::numeric(5,2) AS score
            FROM properties p
        )
        UPDATE properties p
        SET damp_mould_risk_score = scored.score,
            damp_mould_risk_band  = CASE
                WHEN scored.score >= 70 THEN 'Critical'
                WHEN scored.score >= 50 THEN 'High'
                WHEN scored.score >= 30 THEN 'Medium'
                ELSE 'Low'
            END,
            damp_mould_risk_factors = jsonb_build_object(
                'epc',          COALESCE(p.epc_rating, 'Unknown'),
                'overcrowded',  COALESCE(p.census_overcrowded_pct, 0),
                'no_heating',   COALESCE(p.census_no_central_heating_pct, 0),
                'year_built',   p.year_built,
                'flood',        COALESCE(p.flood_risk_rivers_seas, 'Very Low'),
                'broadband',    COALESCE(p.broadband_max_download, 0)
            ),
            damp_mould_assessed_at = NOW()
        FROM scored
        WHERE p.id = scored.id;
        """
    )

    # 5b. Compliance certificates — one row per (property × regime).
    # Distribution across each regime: ~75% compliant, ~15% due_soon, ~10% overdue.
    op.execute("SELECT setseed(0.7171);")
    op.execute(
        """
        INSERT INTO compliance_certificates (property_id, regime, issued_at, expires_at, status, certificate_ref, issued_by)
        SELECT
            p.id,
            r.regime,
            -- issued sometime in the last 0–24 months. Cast to int so
            -- random() can never produce scientific notation that the
            -- interval parser rejects (e.g. 3.27e-05 days).
            (NOW() - ((random() * 720)::int || ' days')::interval)::date AS issued_at,
            -- expires_at depends on regime cadence
            ((NOW() - ((random() * 720)::int || ' days')::interval) + (r.cadence_days || ' days')::interval)::date AS expires_at,
            CASE
                WHEN random() < 0.10 THEN 'overdue'
                WHEN random() < 0.25 THEN 'due_soon'
                ELSE 'compliant'
            END AS status,
            'CERT-' || UPPER(SUBSTR(MD5(p.id::text || r.regime), 1, 8)) AS certificate_ref,
            r.issuer
        FROM properties p
        CROSS JOIN (VALUES
            ('gas',        365,  'British Gas Engineers Ltd'),
            ('electrical', 1825, 'Approved EICR Contractors'),
            ('fra',        365,  'FireSafe FRA Services'),
            ('asbestos',   1825, 'AsbestosSurveyors UK'),
            ('legionella', 730,  'Water Hygiene Specialists')
        ) AS r(regime, cadence_days, issuer)
        ON CONFLICT (property_id, regime) DO NOTHING;
        """
    )

    # 5c. Tenant Satisfaction Measures — one row per measure for the most recent year,
    # plus a synthetic prior-year baseline so trends render.
    op.execute("SELECT setseed(0.3535);")
    op.execute(
        """
        INSERT INTO tsm_responses (measure_code, survey_year, response_value, response_count, ward_code, ward_name, local_authority_name)
        SELECT
            m.code,
            y.year,
            -- Random plausible value within a reasonable band per measure
            (m.baseline + (random() * m.spread - m.spread/2))::numeric(5,2),
            500 + (random() * 1500)::int,
            NULL, NULL, NULL
        FROM (VALUES
            -- Tenant Perception (TP01–TP12) — % satisfaction (higher = better)
            ('TP01', 75.0, 10.0),  -- Overall satisfaction
            ('TP02', 70.0, 12.0),  -- Repairs
            ('TP03', 68.0, 14.0),  -- Time taken to complete repairs
            ('TP04', 75.0,  8.0),  -- Well-maintained home
            ('TP05', 82.0,  6.0),  -- Home is safe
            ('TP06', 70.0, 10.0),  -- Listens and acts
            ('TP07', 75.0,  8.0),  -- Keeps me informed
            ('TP08', 80.0,  6.0),  -- Treats fairly and with respect
            ('TP09', 65.0, 15.0),  -- Approach to complaints handling
            ('TP10', 70.0, 10.0),  -- Communal areas clean and well-maintained
            ('TP11', 65.0, 12.0),  -- Positive contribution to neighbourhood
            ('TP12', 60.0, 14.0),  -- Approach to anti-social behaviour
            -- Repairs Performance (RP01–RP02) — % within target time (higher = better)
            ('RP01', 88.0,  6.0),  -- Non-emergency repairs in target time
            ('RP02', 92.0,  4.0),  -- Emergency repairs in target time
            -- Building Safety (BP01) — % safety checks completed (higher = better)
            ('BP01', 96.0,  3.0),  -- Gas safety checks
            -- Decent Homes (CH01) — % meeting standard (higher = better)
            ('CH01', 94.0,  4.0),  -- Homes meet Decent Homes Standard
            ('CH02', 12.0,  5.0),  -- Homes failing Decent Homes Standard (lower = better)
            -- Neighbourhood Management (NM01) — count per 1,000 homes
            ('NM01',  5.5,  3.0),  -- ASB cases per 1,000 homes
            -- Anti-Social behaviour (AS01) — count per 1,000 homes
            ('AS01',  4.0,  2.0)   -- ASB cases involving hate per 1,000 homes
        ) AS m(code, baseline, spread)
        CROSS JOIN (VALUES (2025), (2024)) AS y(year);
        """
    )

    # 5d. Awaab's Law cases — seed for ~1% of properties, weighted toward high-risk ones.
    # State distribution: ~30% reported, ~25% investigated, ~25% repair_scheduled,
    # ~15% repaired, ~5% closed. ~12% of open cases breach SLA.
    op.execute("SELECT setseed(0.5959);")
    op.execute(
        """
        WITH candidate_props AS (
            SELECT id, damp_mould_risk_score
            FROM properties
            WHERE damp_mould_risk_score IS NOT NULL
            ORDER BY (damp_mould_risk_score / 100.0) * (1.0 - random()) DESC
            LIMIT GREATEST(40, (SELECT COUNT(*) / 100 FROM properties))
        ),
        seeded AS (
            SELECT
                cp.id AS property_id,
                NOW() - ((random() * 60)::int || ' days')::interval AS reported_at,
                CASE
                    WHEN random() < 0.05 THEN 'emergency'
                    WHEN random() < 0.30 THEN 'urgent'
                    ELSE 'standard'
                END AS severity,
                CASE
                    WHEN random() < 0.30 THEN 'reported'
                    WHEN random() < 0.55 THEN 'investigated'
                    WHEN random() < 0.80 THEN 'repair_scheduled'
                    WHEN random() < 0.95 THEN 'repaired'
                    ELSE 'closed'
                END AS stage,
                (ARRAY['phone','portal','email','inspection','sensor'])[
                    1 + (random() * 4)::int
                ] AS reporter_channel
            FROM candidate_props cp
        )
        INSERT INTO awaab_cases (
            property_id, reported_at, severity, stage, reporter_channel, description,
            investigation_due_at, repair_due_at, investigated_at, repair_scheduled_at, repaired_at,
            sla_breached
        )
        SELECT
            s.property_id,
            s.reported_at,
            s.severity,
            s.stage,
            s.reporter_channel,
            CASE
                WHEN s.severity = 'emergency' THEN 'Tenant reports widespread black mould in bedroom + bathroom; child with respiratory condition.'
                WHEN s.severity = 'urgent'    THEN 'Significant damp on living-room wall; tenant escalating from prior repair request.'
                ELSE 'Damp / condensation reported on wall behind kitchen units.'
            END AS description,
            s.reported_at + CASE WHEN s.severity = 'emergency' THEN '1 day'::interval ELSE '14 days'::interval END AS investigation_due_at,
            s.reported_at + CASE WHEN s.severity = 'emergency' THEN '7 days'::interval ELSE '21 days'::interval END AS repair_due_at,
            CASE WHEN s.stage IN ('investigated','repair_scheduled','repaired','closed')
                THEN s.reported_at + ((random() * 12)::int || ' days')::interval
                ELSE NULL END AS investigated_at,
            CASE WHEN s.stage IN ('repair_scheduled','repaired','closed')
                THEN s.reported_at + ((random() * 18 + 2)::int || ' days')::interval
                ELSE NULL END AS repair_scheduled_at,
            CASE WHEN s.stage IN ('repaired','closed')
                THEN s.reported_at + ((random() * 30 + 7)::int || ' days')::interval
                ELSE NULL END AS repaired_at,
            random() < 0.12 AS sla_breached
        FROM seeded s;
        """
    )

    # Seed initial 'reported' event for every case
    op.execute(
        """
        INSERT INTO awaab_case_events (case_id, event_type, to_stage, actor, note, created_at)
        SELECT
            ac.id,
            'stage_change',
            'reported',
            'system',
            'Case opened from ' || COALESCE(ac.reporter_channel, 'unknown') || ' channel.',
            ac.reported_at
        FROM awaab_cases ac;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS awaab_case_events;")
    op.execute("DROP TABLE IF EXISTS awaab_cases;")
    op.execute("DROP TABLE IF EXISTS tsm_responses;")
    op.execute("DROP TABLE IF EXISTS compliance_certificates;")
    op.execute(
        """
        ALTER TABLE properties
            DROP COLUMN IF EXISTS damp_mould_risk_score,
            DROP COLUMN IF EXISTS damp_mould_risk_band,
            DROP COLUMN IF EXISTS damp_mould_risk_factors,
            DROP COLUMN IF EXISTS damp_mould_assessed_at;
        """
    )
