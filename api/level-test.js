const {
  getPublicTest,
  gradeGrammar,
  heuristicSpeakingScore,
  buildResult,
  SPEAKING_PROMPTS,
  SPEAKING_TOTAL,
} = require('../lib/level-test.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwyowayzhdnmueferjpn.supabase.co';

// Same anon key the browser already downloads in supabase-config.js, so keeping
// a copy here leaks nothing new and the endpoint works with no env setup. RLS
// limits it to insert/select on level_tests. Set SUPABASE_SERVICE_ROLE_KEY in
// the Vercel dashboard to upgrade — never commit that one, it bypasses RLS.
const SUPABASE_ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eW93YXl6aGRubXVlZmVyanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjg1OTEsImV4cCI6MjA5ODc0NDU5MX0.mnGOG4aINIEToivKCcNWXlSlKaI9WzaOQBBBukNc5E0';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_FALLBACK;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(getPublicTest());
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { student = {}, grammar = {}, speaking = [], durationSeconds } = req.body || {};

    const name = String(student.name || '').trim();
    const email = String(student.email || '').trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required to grade a test.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'That email address does not look valid.' });
    }

    // ── Section 1: deterministic, server-side. The answer key never ships. ──
    const grammarResult = gradeGrammar(grammar);

    // ── Section 2: AI-graded, with a heuristic fallback that always answers. ──
    const speakingResult = await gradeSpeaking(speaking);

    const result = buildResult({
      grammar: grammarResult,
      speaking: speakingResult,
      student: { name, email, whatsapp: student.whatsapp || null },
      durationSeconds,
      answers: { grammar, speaking },
      gradedBy: speakingResult.method === 'ai' ? 'ai' : 'auto',
    });

    // Persisting must not cost the student their result — report failures but
    // still return the grade.
    const saved = await persist(result, student);

    return res.status(200).json({
      status: 'success',
      saved: saved.ok,
      save_error: saved.ok ? undefined : saved.error,
      result: {
        student_name: name,
        student_email: email,
        grammar_score: result.grammar_score,
        grammar_total: result.grammar_total,
        speaking_score: result.speaking_score,
        speaking_total: result.speaking_total,
        overall_percent: result.overall_percent,
        cefr_level: result.cefr_level,
        level_label: result.level_label,
        placement: result.placement,
        report: result.report,
      },
    });
  } catch (error) {
    console.error('Level test error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

/**
 * Score spoken transcripts with the LLM, falling back to countable heuristics.
 * The fallback matters: a student mid-test should never see an error screen
 * because a third-party API had a bad minute.
 */
async function gradeSpeaking(responses) {
  const answered = (responses || []).filter(r => String(r?.transcript || '').trim().length > 0);
  if (answered.length === 0) {
    return { score: 0, total: SPEAKING_TOTAL, method: 'heuristic', criteria: [],
      feedback: 'No spoken answers were recorded, so the speaking section scored zero.' };
  }

  const transcriptBlock = SPEAKING_PROMPTS.map(p => {
    const given = answered.find(r => r.id === p.id);
    return `Prompt (${p.band}): ${p.prompt}\nStudent said: ${given ? given.transcript : '[no answer given]'}`;
  }).join('\n\n');

  const system = 'You are a CEFR-certified English speaking examiner. You grade strictly and consistently, and you reply with JSON only.';
  const user = `Grade this student's spoken English. The answers are speech-to-text transcripts, so ignore punctuation, capitalisation and obvious transcription noise — judge only language ability.

${transcriptBlock}

Score each criterion 0-25 (integers):
- fluency: flow, length of run, hesitation
- vocabulary: range and precision
- grammar: accuracy and range of structures
- coherence: organisation, linking, task achievement

Reply with ONLY this JSON, no markdown fence:
{"fluency":0,"vocabulary":0,"grammar":0,"coherence":0,"cefr":"A1|A2|B1|B2|C1|C2","feedback":"2-3 sentences addressed to the student, specific and encouraging"}`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const raw = await callLLM(messages);
  if (!raw) return heuristicSpeakingScore(responses);

  const parsed = parseJSON(raw);
  if (!parsed) {
    console.warn('Speaking grader returned unparseable output; using heuristic.');
    return heuristicSpeakingScore(responses);
  }

  const band = k => clamp(Number(parsed[k]) || 0, 0, 25);
  const fluency = band('fluency');
  const vocabulary = band('vocabulary');
  const grammar = band('grammar');
  const coherence = band('coherence');
  const score = fluency + vocabulary + grammar + coherence;

  // A prompt left blank cannot be worth full marks even if the LLM is generous.
  const coverage = answered.length / SPEAKING_PROMPTS.length;

  return {
    score: clamp(score * coverage, 0, SPEAKING_TOTAL),
    total: SPEAKING_TOTAL,
    method: 'ai',
    criteria: [
      { name: 'Fluency',    score: fluency,    max: 25 },
      { name: 'Vocabulary', score: vocabulary, max: 25 },
      { name: 'Grammar',    score: grammar,    max: 25 },
      { name: 'Coherence',  score: coherence,  max: 25 },
    ],
    examiner_cefr: typeof parsed.cefr === 'string' ? parsed.cefr : null,
    feedback: String(parsed.feedback || '').slice(0, 800),
  };
}

/** Gemini first, NVIDIA second — mirrors api/chat.js. Returns null if both fail. */
async function callLLM(messages) {
  if (GEMINI_API_KEY) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_API_KEY}` },
        body: JSON.stringify({ model: GEMINI_MODEL, messages, temperature: 0.2, max_tokens: 600 }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        console.error('Gemini grading error:', r.status, await r.text());
      }
    } catch (err) {
      console.error('Gemini grading fetch failed:', err.message);
    }
  }

  if (NVIDIA_API_KEY) {
    try {
      const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: NVIDIA_MODEL, messages, temperature: 0.2, max_tokens: 600 }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        console.error('NVIDIA grading error:', r.status, await r.text());
      }
    } catch (err) {
      console.error('NVIDIA grading fetch failed:', err.message);
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

async function persist(result, student) {
  if (!SUPABASE_KEY) {
    return { ok: false, error: 'Supabase key not configured on the server.' };
  }

  // enrollment_id is filled in by the level_tests_link_enrollment trigger
  // (see supabase-admin-auth.sql). Doing the lookup here would mean reading
  // the enrollments table, which is admin-only now — and rightly so.
  const row = {
    student_name: result.student.name,
    student_email: result.student.email,
    whatsapp: result.student.whatsapp || student.whatsapp || null,
    grammar_score: result.grammar_score,
    grammar_total: result.grammar_total,
    speaking_score: result.speaking_score,
    speaking_total: result.speaking_total,
    overall_percent: result.overall_percent,
    cefr_level: result.cefr_level,
    level_label: result.level_label,
    placement: result.placement,
    report: result.report,
    answers: result.answers,
    duration_seconds: result.duration_seconds,
    graded_by: result.graded_by,
    status: 'completed',
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/level_tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error('Supabase insert failed:', r.status, body);
      return { ok: false, error: `Supabase ${r.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Supabase insert threw:', err);
    return { ok: false, error: err.message };
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
