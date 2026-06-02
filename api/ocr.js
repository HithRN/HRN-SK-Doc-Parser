/**
 * api/ocr.js — Gemini OCR Proxy  (updated: now saves to Neon DB)
 *
 * CHANGES FROM ORIGINAL:
 *  1. Accepts filename, agent_id, agent_name in request body
 *  2. Merges agent_name from login session when OCR doesn't extract it
 *     (same logic as the frontend fix in handleFiles)
 *  3. Saves OCR result to Postgres after successful parse
 *  4. Returns the saved DB row (with real id + ts) instead of raw Gemini JSON
 *
 * FLOW:
 *  Browser → POST /api/ocr  { mime, b64, filename, agent_id, agent_name }
 *         → Gemini OCR
 *         → INSERT INTO forms
 *         → returns formatForm(savedRow)   ← frontend stores this in S.forms
 *
 * NEW ENV VAR (add alongside GEMINI_API_KEY):
 *  POSTGRES_URL   — auto-set by Vercel ↔ Neon integration
 */

import { sql, formatForm } from '../lib/db.js';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── CHANGE 1: destructure new fields from body ────────────────────────────
  // filename, agent_id, agent_name are now sent by the frontend's runOCR().
  // They default to '' so the existing API contract isn't broken.
  const {
    mime,
    b64,
    filename   = 'unnamed',
    agent_id   = '',
    agent_name = '',
  } = req.body;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!mime || !b64) {
    return res.status(400).json({ error: 'Missing mime or b64 in request body' });
  }
  const allowedMimes = ['image/png','image/jpeg','image/jpg','image/webp','application/pdf'];
  if (!allowedMimes.includes(mime)) {
    return res.status(400).json({ error: `Unsupported file type: ${mime}` });
  }

  // ── OCR prompt (unchanged) ─────────────────────────────────────────────────
  const OCR_PROMPT = `You are an OCR and classification engine. Analyze this handwritten form. Respond ONLY with valid JSON:
{"department":"FINANCE"|"ADMINISTRATIVE"|"EXECUTIVE"|"UNKNOWN","confidence":<0-100>,"transcription":"<text>","extracted_fields":{"agent_name":"","date":"","reference_number":"","subject":"","amount":"","account_number":"","transaction_type":"","authorized_by":"","employee_id":"","request_type":"","approval_status":"","priority_level":"","decision_required":"","recommendation":""},"summary":"<2 sentences>","classification_reasoning":"<1 sentence>","key_terms":["<up to 5>"]}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // ── Call Gemini (unchanged) ───────────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mime, data: b64 } },
              { text: OCR_PROMPT }
            ]
          }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.1 }
        })
      }
    );

    const data = await geminiRes.json();
    if (data.error) {
      console.error('Gemini API error:', data.error);
      return res.status(502).json({ error: data.error.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini' });

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // ── CHANGE 2: guarantee agent_name is populated ───────────────────────────
    // Gemini often returns agent_name:'' on real uploads because the form
    // doesn't explicitly label it. We fill from the login session passed
    // in the request body. Same fix applied on the client side.
    const ef = { ...(parsed.extracted_fields || {}) };
    if (!ef.agent_name && agent_name) ef.agent_name = agent_name;
    const finalAgentName = ef.agent_name || agent_name || '';

    // ── CHANGE 3: persist to Postgres ────────────────────────────────────────
    // JSONB fields must be stringified; Postgres casts with ::jsonb.
    const { rows: [saved] } = await sql`
      INSERT INTO forms (
        filename,
        department,
        confidence,
        transcription,
        extracted_fields,
        summary,
        classification_reasoning,
        key_terms,
        agent_id,
        agent_name,
        status
      )
      VALUES (
        ${filename},
        ${parsed.department  || 'UNKNOWN'},
        ${parsed.confidence  || 0},
        ${parsed.transcription || ''},
        ${JSON.stringify(ef)}::jsonb,
        ${parsed.summary     || ''},
        ${parsed.classification_reasoning || ''},
        ${JSON.stringify(parsed.key_terms || [])}::jsonb,
        ${agent_id},
        ${finalAgentName},
        'pending'
      )
      RETURNING *
    `;

    // ── CHANGE 4: return the saved row formatted for the frontend ─────────────
    // The DB row has a real auto-incremented id and created_at timestamp,
    // which the frontend uses as f.id and f.ts respectively.
    return res.status(200).json(formatForm(saved));

  } catch (err) {
    console.error('OCR proxy error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
