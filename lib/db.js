/**
 * lib/db.js — Shared database utilities
 *
 * Re-exports @vercel/postgres sql tag and provides formatForm(),
 * the single source of truth for converting a DB row into the
 * shape that index.html's S.forms array expects.
 *
 * Used by: api/ocr.js, api/forms.js, api/forms/[id]/review.js
 */

export { sql } from '@vercel/postgres';

/**
 * Convert a raw Postgres row into the frontend form object.
 *
 * Why this matters:
 *  - The DB stores extracted_fields as JSONB and returns it as a JS object.
 *  - The frontend accesses both f.extracted_fields.amount AND f.amount directly.
 *  - review is stored as flat columns but the frontend expects a nested object.
 *  - created_at is a Date; the frontend expects millisecond timestamps (f.ts).
 *
 * @param {object} row - raw row from pg/vercel-postgres
 * @returns {object}   - frontend-ready form object
 */
export function formatForm(row) {
  // extracted_fields: pg returns JSONB as a JS object automatically
  const ef = row.extracted_fields || {};

  // review: stored as flat columns, surfaced as a nested object (or null)
  const review = row.review_action
    ? {
        action:   row.review_action,
        comment:  row.review_comment   || '',
        reviewer: row.review_reviewer  || '',
        // review_ts stored as Unix seconds → frontend expects ms
        ts:       row.review_ts ? Number(row.review_ts) * 1000 : 0,
      }
    : null;

  return {
    // ── Identity ──────────────────────────────────────────────
    id:         row.id,
    filename:   row.filename,
    department: row.department,
    confidence: row.confidence,
    status:     row.status || 'pending',

    // created_at is a JS Date from pg → convert to ms for frontend
    ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),

    // ── Agent ─────────────────────────────────────────────────
    agent_id:  row.agent_id  || '',
    agentId:   row.agent_id  || '',   // camelCase alias used by frontend filter
    agent_name: row.agent_name || '',

    // ── OCR Content ───────────────────────────────────────────
    transcription:            row.transcription             || '',
    summary:                  row.summary                   || '',
    classification_reasoning: row.classification_reasoning  || '',
    key_terms:                row.key_terms                 || [],

    // ── Fields (nested AND flattened for direct access) ───────
    extracted_fields: ef,
    ...ef,          // f.subject, f.amount, f.date etc. all work directly

    // ── Review ────────────────────────────────────────────────
    review,
  };
}
