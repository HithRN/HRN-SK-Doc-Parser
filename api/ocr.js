/**
 * DocuSort AI — Gemini OCR Proxy
 * Vercel Serverless Function  (/api/ocr)
 *
 * WHY THIS EXISTS:
 *   Calling Gemini directly from the browser exposes GEMINI_API_KEY in
 *   plain text in the source. This function keeps the key server-side
 *   (stored in Vercel environment variables) and forwards the request.
 *
 * FLOW:
 *   Browser → POST /api/ocr  { mime, b64 }
 *          → this function → Gemini API → JSON response → Browser
 *
 * ENV VARS (set in Vercel dashboard → Project → Settings → Environment Variables):
 *   GEMINI_API_KEY   your Google AI Studio API key
 */

const GEMINI_MODEL = 'gemini-2.5-pro';

export default async function handler(req, res) {
  // ── CORS: allow requests from the same origin (your deployed domain) ──
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pre-flight
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mime, b64 } = req.body;

  // ── Validate input ──
  if (!mime || !b64) {
    return res.status(400).json({ error: 'Missing mime or b64 in request body' });
  }

  const allowedMimes = [
    'image/png', 'image/jpeg', 'image/jpg',
    'image/webp', 'application/pdf'
  ];
  if (!allowedMimes.includes(mime)) {
    return res.status(400).json({ error: `Unsupported file type: ${mime}` });
  }

  // ── Build OCR prompt (same as client) ──
  const OCR_PROMPT = `You are an OCR and classification engine. Analyze this handwritten form. Respond ONLY with valid JSON:
{"department":"FINANCE"|"ADMINISTRATIVE"|"EXECUTIVE"|"UNKNOWN","confidence":<0-100>,"transcription":"<text>","extracted_fields":{"agent_name":"","date":"","reference_number":"","subject":"","amount":"","account_number":"","transaction_type":"","authorized_by":"","employee_id":"","request_type":"","approval_status":"","priority_level":"","decision_required":"","recommendation":""},"summary":"<2 sentences>","classification_reasoning":"<1 sentence>","key_terms":["<up to 5>"]}`;

  // ── Call Gemini ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
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
    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    // ── Parse and return the JSON payload ──
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('OCR proxy error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
