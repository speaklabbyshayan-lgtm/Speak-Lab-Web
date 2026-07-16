/**
 * Shared LLM provider config for the serverless functions.
 *
 * This module exists because the model name used to be declared separately in
 * api/chat.js and api/level-test.js. When 'gemini-3.5-flash' turned out not to
 * resolve, only the level test got fixed; chat kept the dead model for months
 * and hung on every message. One declaration, one place to fix it.
 */

// 'gemini-3.5-flash' does not resolve — the endpoint accepts the request and
// then never responds. 'gemini-2.0-flash' answers in well under a second.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

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
  NVIDIA_MODEL,
  GEMINI_URL,
  NVIDIA_URL,
  fetchWithTimeout,
};
