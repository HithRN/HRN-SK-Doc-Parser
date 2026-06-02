/**
 * api/forms.js — Forms data endpoint
 * Route: /api/forms
 *
 * GET  /api/forms                  → all forms, newest first
 * GET  /api/forms?agent_id=x       → only forms for that agent (agent view)
 * GET  /api/forms?department=x     → only forms for one department (head view)
 * DELETE /api/forms                → wipe all forms (Reset Demo button)
 *
 * All responses use formatForm() so the shape exactly matches what
 * S.forms in index.html expects.
 */

import { sql, formatForm } from '../lib/db.js';

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {

    // ── GET /api/forms ────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { agent_id, department } = req.query;

      let rows;

      if (agent_id && department) {
        // Both filters (unused now but useful for future)
        ({ rows } = await sql`
          SELECT * FROM forms
          WHERE agent_id   = ${agent_id}
            AND department = ${department.toUpperCase()}
          ORDER BY created_at DESC
        `);

      } else if (agent_id) {
        // Agent logs in → sees only their own forms
        ({ rows } = await sql`
          SELECT * FROM forms
          WHERE agent_id = ${agent_id}
          ORDER BY created_at DESC
        `);

      } else if (department) {
        // Dept head logs in → sees only their department
        ({ rows } = await sql`
          SELECT * FROM forms
          WHERE department = ${department.toUpperCase()}
          ORDER BY created_at DESC
        `);

      } else {
        // Admin → all forms
        ({ rows } = await sql`
          SELECT * FROM forms
          ORDER BY created_at DESC
        `);
      }

      return res.status(200).json(rows.map(formatForm));
    }

    // ── DELETE /api/forms ─────────────────────────────────────────────────────
    // Called by the Reset Demo button in the admin dashboard.
    if (req.method === 'DELETE') {
      await sql`DELETE FROM forms`;
      return res.status(200).json({ success: true, message: 'All forms cleared' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Forms API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
