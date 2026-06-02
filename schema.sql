-- ============================================================
-- DocuSort AI — Neon (Postgres) Schema
-- Run this ONCE in your Neon project's SQL editor:
--   neon.tech → your project → SQL Editor → paste & run
-- ============================================================

CREATE TABLE IF NOT EXISTS forms (
  id                       SERIAL       PRIMARY KEY,

  -- File & classification
  filename                 TEXT         NOT NULL,
  department               TEXT         NOT NULL DEFAULT 'UNKNOWN',
  confidence               INTEGER      DEFAULT 0,

  -- OCR content
  transcription            TEXT         DEFAULT '',
  extracted_fields         JSONB        DEFAULT '{}',
  summary                  TEXT         DEFAULT '',
  classification_reasoning TEXT         DEFAULT '',
  key_terms                JSONB        DEFAULT '[]',

  -- Who submitted
  agent_id                 TEXT         DEFAULT '',   -- login username
  agent_name               TEXT         DEFAULT '',   -- display name

  -- Review workflow
  status                   TEXT         DEFAULT 'pending',   -- pending | approved | changes_requested | rejected
  review_action            TEXT,                             -- mirrors status when reviewed
  review_comment           TEXT,
  review_reviewer          TEXT,
  review_ts                BIGINT,                           -- Unix seconds

  -- Timestamps
  created_at               TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes for the three query patterns used by api/forms.js
CREATE INDEX IF NOT EXISTS idx_forms_department ON forms (department);
CREATE INDEX IF NOT EXISTS idx_forms_agent_id   ON forms (agent_id);
CREATE INDEX IF NOT EXISTS idx_forms_status     ON forms (status);
CREATE INDEX IF NOT EXISTS idx_forms_created_at ON forms (created_at DESC);
