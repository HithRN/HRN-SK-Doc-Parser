/**
 * api/forms/[id]/review.js — Review submission endpoint
 * Route: PATCH /api/forms/:id/review
 *
 * Called when a department head clicks "Submit Decision" in the review modal.
 *
 * Body: { action, comment, reviewer }
 *   action   — 'approved' | 'changes_requested' | 'rejected'
 *   comment  — optional remark string
 *   reviewer — head's display name (e.g. "Anita Verma")
 *
 * Returns: { success: true, form: <updated form object> }
 */

import { sql, formatForm } from '../../../lib/db.js';

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  // req.query.id comes from the [id] filename segment
  const formId = parseInt(req.query.id, 10);
  if (!formId || isNaN(formId)) {
    return res.status(400).json({ error: 'Invalid form id' });
  }

  const { action, comment = '', reviewer } = req.body;

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!reviewer) {
    return res.status(400).json({ error: 'reviewer is required' });
  }

  const validActions = ['approved', 'changes_requested', 'rejected'];
  if (!validActions.includes(action)) {
    return res.status(400).json({
      error: `Invalid action "${action}". Must be one of: ${validActions.join(', ')}`
    });
  }

  try {
    const { rows: [updated] } = await sql`
      UPDATE forms
      SET
        status           = ${action},
        review_action    = ${action},
        review_comment   = ${comment},
        review_reviewer  = ${reviewer},
        -- store as Unix seconds; formatForm converts to ms for the frontend
        review_ts        = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${formId}
      RETURNING *
    `;

    if (!updated) {
      return res.status(404).json({ error: `Form ${formId} not found` });
    }

    return res.status(200).json({ success: true, form: formatForm(updated) });

  } catch (err) {
    console.error('Review API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
