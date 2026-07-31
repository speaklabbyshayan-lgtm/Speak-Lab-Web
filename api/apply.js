/**
 * POST /api/apply — the public entry test behind the Meta ads.
 *
 * No login: anyone who clicks the ad lands on apply.html and submits here. The
 * written English answers go through the same Gemini→Groq path the level test
 * uses, so a score is on the admin's screen before anyone picks up the phone.
 *
 * GET returns the task text, so apply.html and the grader can never drift apart
 * on what was actually asked.
 */
const {
  getPublicTasks,
  buildGradingMessages,
  scoreFromLLM,
  heuristicScore,
  buildApplicationResult,
  AGE_GROUPS,
  EDUCATION,
  OCCUPATIONS,
  SELF_RATINGS,
} = require('../lib/entry-test.js');
const {
  GEMINI_MODEL,
  GROK_MODEL,
  GEMINI_URL,
  GROK_URL,
  fetchWithTimeout,
} = require('../lib/llm.js');
const { rateLimited, clientIp, cleanText } = require('../lib/api-utils.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';

// Same anon key the browser already downloads in supabase-config.js — see the
// note in api/level-test.js. RLS limits it to insert on entry_applications.
const SUPABASE_ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_FALLBACK;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROK_API_KEY = process.env.GROK_API_KEY;

// Shared wall-clock budget for both providers. An applicant waiting on the
// thank-you screen should never wait longer than this for a grade.
const LLM_BUDGET_MS = Number(process.env.APPLY_LLM_BUDGET_MS || 8000);
const SUPABASE_TIMEOUT_MS = 6000;

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(getPublicTasks());
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // This endpoint spends LLM budget on unauthenticated input, so it needs the
  // same speed bump as the other public forms.
  if (rateLimited(`apply:${clientIp(req)}`, { windowMs: 60_000, max: 5 })) {
    return res.status(429).json({ message: 'Too many submissions. Please wait a minute and try again.' });
  }

  try {
    const b = req.body || {};

    const fullName = cleanText(b.full_name, 120);
    const whatsapp = cleanText(b.whatsapp, 30);
    const translation = cleanText(b.translation_answer, 1000);
    const writing = cleanText(b.writing_answer, 2000);

    if (!fullName) {
      return res.status(400).json({ message: 'Please enter your full name.' });
    }
    // 10–15 digits covers 03xx-xxxxxxx, +92 3xx… and the international forms.
    const digits = whatsapp.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return res.status(400).json({ message: 'Please enter a valid WhatsApp number.' });
    }
    if (!translation) {
      return res.status(400).json({ message: 'Please translate the sentence into English.' });
    }
    if (!writing) {
      return res.status(400).json({ message: 'Please describe your daily routine in English.' });
    }

    const answers = {
      translation_answer: translation,
      writing_answer: writing,
    };

    const english = await gradeEnglish({
      translation,
      writing,
      selfRating: oneOf(b.self_rating, SELF_RATINGS),
    });

    const scored = buildApplicationResult({ english, answers });

    const row = {
      full_name: fullName,
      whatsapp,
      age_group: oneOf(b.age_group, AGE_GROUPS),
      city: cleanText(b.city, 120) || null,
      education: oneOf(b.education, EDUCATION),
      grades: cleanText(b.grades, 120) || null,
      occupation: oneOf(b.occupation, OCCUPATIONS),
      translation_answer: translation,
      writing_answer: writing,
      self_rating: oneOf(b.self_rating, SELF_RATINGS),
      motivation: cleanText(b.motivation, 2000) || null,
      // Tri-state on purpose: null means the applicant never answered, which is
      // different from answering "No".
      fee_ready: typeof b.fee_ready === 'boolean' ? b.fee_ready : null,
      ...scored,
      application_status: 'pending',
      source: cleanText(b.source, 60) || 'apply-page',
    };

    // A storage failure must not show the applicant an error — they have done
    // their part. Log it loudly and still thank them.
    const saved = await persist(row);
    if (!saved.ok) console.error('Application not saved:', saved.error);

    // Deliberately no score in the response: the applicant is told a human will
    // review it, and nothing about fee or batch is revealed here.
    return res.status(200).json({ status: 'success', saved: saved.ok });
  } catch (error) {
    console.error('Application error:', error);
    return res.status(500).json({ status: 'error', message: 'Something went wrong on our side. Please try again.' });
  }
}

/** LLM first, countable heuristics if it is unreachable. */
async function gradeEnglish({ translation, writing, selfRating }) {
  const raw = await callLLM(buildGradingMessages({ translation, writing, selfRating }));
  if (!raw) return heuristicScore({ translation, writing });

  const parsed = parseJSON(raw);
  const scored = parsed ? scoreFromLLM(parsed, { translation, writing }) : null;
  if (!scored) {
    console.warn('Entry-test grader returned unusable output; using heuristic.');
    return heuristicScore({ translation, writing });
  }
  return scored;
}

/**
 * Gemini first, Groq second, one shared deadline. Returns null when both fail,
 * which sends the caller to the heuristic scorer.
 */
async function callLLM(messages) {
  const deadline = Date.now() + LLM_BUDGET_MS;

  const providers = [
    { name: 'Gemini', key: GEMINI_API_KEY, url: GEMINI_URL, model: GEMINI_MODEL },
    { name: 'Groq',   key: GROK_API_KEY,   url: GROK_URL,   model: GROK_MODEL },
  ];

  for (const p of providers) {
    if (!p.key) continue;

    const remaining = deadline - Date.now();
    if (remaining < 1200) {
      console.warn(`${p.name}: skipped, LLM budget exhausted.`);
      break;
    }

    try {
      const r = await fetchWithTimeout(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, messages, temperature: 0.2, max_tokens: 600 }),
      }, remaining);

      if (r.ok) {
        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;
        console.error(`${p.name}: 200 but no content in the response.`);
      } else {
        console.error(`${p.name} grading error:`, r.status, (await r.text()).slice(0, 300));
      }
    } catch (err) {
      const hung = err.name === 'AbortError';
      console.error(`${p.name} grading ${hung ? `timed out after ${remaining}ms` : 'failed'}:`, err.message);
    }
  }

  return null;
}

/** LLMs like to wrap JSON in prose or fences; dig it out. */
function parseJSON(text) {
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/** Accept a value only if it is one of the options we published. */
function oneOf(value, allowed) {
  const v = String(value ?? '').trim().toLowerCase();
  return allowed.includes(v) ? v : null;
}

async function persist(row) {
  if (!SUPABASE_KEY) {
    return { ok: false, error: 'Supabase key not configured on the server.' };
  }

  try {
    const r = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/entry_applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    }, SUPABASE_TIMEOUT_MS);

    if (!r.ok) {
      const body = await r.text();
      // A missing table is the likely cause on a fresh deploy.
      console.error('Supabase insert failed:', r.status, body);
      return { ok: false, error: `Supabase ${r.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Supabase insert threw:', err);
    return { ok: false, error: err.message };
  }
}
