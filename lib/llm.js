/**
 * Shared LLM provider config for the serverless functions.
 *
 * This module exists because the model name used to be declared separately in
 * api/chat.js and api/level-test.js. When 'gemini-3.5-flash' turned out not to
 * resolve, only the level test got fixed; chat kept the dead model for months
 * and hung on every message. One declaration, one place to fix it.
 */

// 'gemini-3.5-flash' does not resolve — the endpoint accepts the request and
// then never responds. 'gemini-2.0-flash' later lost its free-tier quota on
// this key (HTTP 429, "limit: 0"), which left every chat/level-test call to
// fall through to the fallback and return 502. The evergreen alias
// 'gemini-flash-latest' still has quota and answers in well under a second.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Groq (the fast-inference platform, gsk_ keys) is the fallback provider,
// replacing NVIDIA — NVIDIA's OpenAI-compatible endpoint never returned on
// this account (every completion hung past the timeout). Groq answers in
// well under a second. The env var is named GROK_* to match how the key was
// stored; the service is Groq, not xAI's Grok. Override GROK_MODEL if Groq
// retires the model.
const GROK_MODEL = process.env.GROK_MODEL || 'llama-3.3-70b-versatile';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GROK_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * fetch with a hard deadline.
 *
 * Without this a provider that accepts the connection and never replies pins
 * the function until the platform kills it — which is exactly what left the
 * level test stuck on "Grading your test…" and the AI tutor hanging on every
 * message.
 */
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  GEMINI_MODEL,
  GROK_MODEL,
  GEMINI_URL,
  GROK_URL,
  fetchWithTimeout,
};
