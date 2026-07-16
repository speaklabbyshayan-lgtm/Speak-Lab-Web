const {
  GEMINI_MODEL,
  NVIDIA_MODEL,
  GEMINI_URL,
  NVIDIA_URL,
  fetchWithTimeout,
} = require('../lib/llm.js');

// Total wall-clock either provider may spend before we give up on it. Gemini
// answers in well under a second; anything approaching this means it is hung,
// and the student is better served by falling through to NVIDIA than by
// waiting for the platform to kill the function.
const LLM_TIMEOUT_MS = Number(process.env.CHAT_LLM_TIMEOUT_MS || 8000);

// Vercel's default is 10s. Two providers at 8s each can exceed that.
export const config = { maxDuration: 30 };

// ── Rate limiting ────────────────────────────────────────────────────────
// /api/chat is unauthenticated and spends real money on every call, so an
// open endpoint is a standing invitation to drain the Gemini and NVIDIA
// quota. This is per-instance memory, so it is a speed bump rather than a
// lock — Vercel may run several instances and will evict this on cold start.
// It stops casual abuse at zero cost and with no new dependency. If the
// tutor ever gets seriously targeted, move this to Upstash Redis or require
// a Supabase session the way enroll.html already does.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);

  // Keep the map from growing without bound across a warm instance's life.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }

  return seen.length > RATE_LIMIT_MAX;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || 'unknown';
}

/** Ask one OpenAI-compatible provider. Returns the parsed body or throws. */
async function askProvider({ url, key, model, messages }) {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false,
      }),
    },
    LLM_TIMEOUT_MS
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`${model} error: ${response.status} - ${errText}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!NVIDIA_API_KEY && !GEMINI_API_KEY) {
    return res.status(500).json({ message: 'API keys not configured on server' });
  }

  if (rateLimited(clientIp(req))) {
    return res
      .status(429)
      .json({ message: 'Too many messages. Please wait a moment and try again.' });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'messages must be a non-empty array' });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ message: 'Conversation too long. Please start a new chat.' });
  }
  if (JSON.stringify(messages).length > MAX_CHARS) {
    return res.status(400).json({ message: 'Message too long.' });
  }

  const providers = [];
  if (GEMINI_API_KEY) {
    providers.push({ url: GEMINI_URL, key: GEMINI_API_KEY, model: GEMINI_MODEL });
  }
  if (NVIDIA_API_KEY) {
    providers.push({ url: NVIDIA_URL, key: NVIDIA_API_KEY, model: NVIDIA_MODEL });
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const data = await askProvider({ ...provider, messages });
      return res.status(200).json(data);
    } catch (err) {
      // A bounded failure here is normal — fall through to the next provider.
      console.error(`Chat provider ${provider.model} failed:`, err.message);
      lastError = err;
    }
  }

  console.error('Chat API Error: all providers failed:', lastError?.message);
  return res.status(502).json({ message: 'Sara is unavailable right now. Please try again.' });
}
