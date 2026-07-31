/**
 * SpeakLab entry test — the public application form behind the Meta ads.
 *
 * Server-only, like lib/level-test.js. It holds the prompt content, the
 * grading prompt for the LLM, and a heuristic fallback so an application is
 * never lost because a provider had a bad minute.
 *
 * Levels come from lib/level-test.js so an "A2" here means the same thing as
 * an "A2" on the placement test — two scales would be worse than none.
 */

const { CEFR } = require('./level-test.js');

// The one sentence every applicant translates. Shown in Urdu script with a
// Roman transliteration underneath, because a good share of the ad audience
// reads Roman more comfortably than Nastaliq. Everything around it is English.
const TRANSLATION_TASK = {
  urdu: 'میں روز صبح جلدی اٹھتا ہوں اور اپنے دفتر وقت پر پہنچتا ہوں۔',
  roman: 'Main roz subah jaldi uthta hoon aur apne daftar waqt par pohanchta hoon.',
  // Not shown to the applicant — the grader uses it as the reference reading.
  meaning: 'I wake up early every morning and reach my office on time.',
};

const WRITING_TASK = {
  prompt: 'Describe your daily routine in English.',
  hint: 'Write 3–4 lines. Simple sentences are fine — we are looking at your English, not your day.',
  minWords: 25,
};

// Translation is a narrower task than free writing, so it carries less weight.
const TRANSLATION_MAX = 40;
const WRITING_MAX = 60;
const ENGLISH_TOTAL = TRANSLATION_MAX + WRITING_MAX;

const AGE_GROUPS   = ['18-25', '26-35', '36-45', '45+'];
const EDUCATION    = ['matric', 'intermediate', 'bachelors', 'masters', 'other'];
const OCCUPATIONS  = ['student', 'job', 'business', 'other'];
const SELF_RATINGS = ['beginner', 'basic', 'good', 'fluent'];

// The best score the LLM-free fallback may award, on the 0–100 scale. 54 is the
// top of B1: an application nobody has actually read must never present as B2+.
const HEURISTIC_CEILING = 54;

/** The task text the browser is allowed to see — no reference translation. */
function getPublicTasks() {
  return {
    translation: { urdu: TRANSLATION_TASK.urdu, roman: TRANSLATION_TASK.roman },
    writing: WRITING_TASK,
    options: {
      age_group: AGE_GROUPS,
      education: EDUCATION,
      occupation: OCCUPATIONS,
      self_rating: SELF_RATINGS,
    },
  };
}

/** The messages array for the grader. Kept here so the prompt is versioned with the tasks. */
function buildGradingMessages({ translation, writing, selfRating }) {
  const system = 'You are a CEFR-certified English examiner assessing written English from Pakistani applicants to a premium spoken-English program. You grade strictly and consistently, and you reply with JSON only.';

  const user = `Assess this applicant's written English.

TASK 1 — Translation (score 0-${TRANSLATION_MAX})
Urdu sentence: ${TRANSLATION_TASK.urdu}
Roman Urdu: ${TRANSLATION_TASK.roman}
Reference meaning: ${TRANSLATION_TASK.meaning}
Applicant wrote: ${translation || '[left blank]'}

TASK 2 — Free writing (score 0-${WRITING_MAX})
Prompt: ${WRITING_TASK.prompt}
Applicant wrote: ${writing || '[left blank]'}

Applicant's own rating of their English: ${selfRating || 'not given'} (context only — do not let it change the score).

Judge accuracy of meaning, grammar, vocabulary range and sentence construction. Ignore capitalisation and typing slips. A blank or copied-back answer scores 0 for that task. Do not be generous: this score decides whether they are called for an interview.

Reply with ONLY this JSON, no markdown fence:
{"translation":0,"writing":0,"grammar":0,"vocabulary":0,"coherence":0,"cefr":"A1|A2|B1|B2|C1|C2","feedback":"2-3 sentences for the SpeakLab team describing this applicant's real English level and what they would need from the program"}
where grammar, vocabulary and coherence are each 0-100 sub-ratings across both tasks.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Turn a parsed LLM reply into a score object.
 * Returns null if the reply is unusable, which sends the caller to the heuristic.
 */
function scoreFromLLM(parsed, { translation, writing }) {
  if (!parsed || typeof parsed !== 'object') return null;

  const translationScore = clamp(Number(parsed.translation) || 0, 0, TRANSLATION_MAX);
  const writingScore = clamp(Number(parsed.writing) || 0, 0, WRITING_MAX);

  // An empty answer cannot earn marks even if the model is feeling kind.
  const t = String(translation || '').trim() ? translationScore : 0;
  const w = String(writing || '').trim() ? writingScore : 0;

  return {
    score: round1(t + w),
    total: ENGLISH_TOTAL,
    method: 'ai',
    criteria: [
      { name: 'Translation', score: round1(t), max: TRANSLATION_MAX },
      { name: 'Writing',     score: round1(w), max: WRITING_MAX },
      { name: 'Grammar',     score: clamp(Number(parsed.grammar) || 0, 0, 100),    max: 100 },
      { name: 'Vocabulary',  score: clamp(Number(parsed.vocabulary) || 0, 0, 100), max: 100 },
      { name: 'Coherence',   score: clamp(Number(parsed.coherence) || 0, 0, 100),  max: 100 },
    ],
    examiner_cefr: typeof parsed.cefr === 'string' ? parsed.cefr : null,
    feedback: String(parsed.feedback || '').slice(0, 800),
  };
}

/**
 * Fallback score, used when no LLM is reachable.
 *
 * It cannot judge meaning, only shape — so it measures what is countable and
 * caps at 54, the top of B1. An ungraded application must never look like a
 * B2+ one on the admin's screen: the card flags it as auto-scored and a human
 * still has to read the answers.
 */
function heuristicScore({ translation, writing }) {
  const t = measure(String(translation || ''));
  const w = measure(String(writing || ''));

  // Translation: one sentence, so reading as English matters far more than length.
  const translationScore = t.words
    ? TRANSLATION_MAX * (Math.min(1, t.words / 8) * 0.35 + t.englishness * 0.65)
    : 0;

  // Writing: length against the target, variety and sentence development — but
  // englishness carries the largest single share, because a long answer in
  // Roman Urdu is not a good answer.
  const writingScore = w.words
    ? WRITING_MAX * (
        Math.min(1, w.words / WRITING_TASK.minWords) * 0.30 +
        w.variety * 0.15 +
        Math.min(1, w.avgSentence / 11) * 0.15 +
        w.englishness * 0.40
      )
    : 0;

  // Scale rather than clamp. A hard cap would flatten every decent answer onto
  // the same number and destroy the ranking that makes the list useful; scaling
  // keeps the ordering intact while holding the ceiling at B1.
  const k = HEURISTIC_CEILING / 100;

  return {
    score: round1((translationScore + writingScore) * k),
    total: ENGLISH_TOTAL,
    method: 'heuristic',
    criteria: [
      { name: 'Translation', score: round1(translationScore * k), max: round1(TRANSLATION_MAX * k) },
      { name: 'Writing',     score: round1(writingScore * k),     max: round1(WRITING_MAX * k) },
    ],
    examiner_cefr: null,
    feedback: 'Scored automatically on length, vocabulary range and how much of the answer reads as English — the AI examiner was unavailable, so this score is capped at B1 and is a rough sort order, not a grade. Read the written answers below before deciding.',
  };
}

/**
 * The commonest English function words. An applicant who answers in Roman Urdu
 * ("main roz subah jaldi uthta hoon") produces Latin script but almost none of
 * these, so this is what stops transliteration from scoring like English —
 * which is the single most likely way to fool a shape-only scorer here.
 */
const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'because',
  'i', 'my', 'me', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'his', 'her',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'after',
  'this', 'that', 'there', 'when', 'every', 'all', 'not', 'up', 'out', 'go',
]);

/**
 * Rough "does this read as English" signal for the fallback. Two parts: the
 * share of plain Latin-script words of a believable length, and the share of
 * English function words. Neither alone is enough — the first passes Roman
 * Urdu, the second punishes a short but correct sentence.
 */
function measure(text) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const sentences = trimmed.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const cleaned = words.map(x => x.toLowerCase().replace(/[^a-z']/g, ''));
  const latin = cleaned.filter(x => x.length >= 2 && x.length <= 14);
  const unique = new Set(cleaned.filter(Boolean)).size;

  // Natural English runs 30-45% function words; 22% is a generous floor.
  const functionShare = words.length
    ? cleaned.filter(x => FUNCTION_WORDS.has(x)).length / words.length
    : 0;

  return {
    words: words.length,
    variety: words.length ? Math.min(1, unique / words.length / 0.6) : 0,
    avgSentence: sentences.length ? words.length / sentences.length : 0,
    englishness: words.length
      ? (latin.length / words.length) * 0.4 + Math.min(1, functionShare / 0.22) * 0.6
      : 0,
  };
}

/** Map a 0–100 English score onto the same CEFR ladder the level test uses. */
function bandFor(percent) {
  return [...CEFR].reverse().find(b => percent >= b.min) || CEFR[0];
}

/** Assemble the row-shaped result the API stores and the admin panel renders. */
function buildApplicationResult({ english, answers }) {
  const percent = english.total ? round1((english.score / english.total) * 100) : 0;
  const band = bandFor(percent);

  return {
    english_score: percent,
    english_band: band.level,
    english_label: band.label,
    scored_by: english.method === 'ai' ? 'ai' : 'auto',
    score_report: {
      method: english.method,
      raw_score: round1(english.score),
      raw_total: english.total,
      summary: band.blurb,
      criteria: english.criteria || [],
      examiner_cefr: english.examiner_cefr || null,
      feedback: english.feedback || '',
      tasks: {
        translation: { urdu: TRANSLATION_TASK.urdu, roman: TRANSLATION_TASK.roman },
        writing: WRITING_TASK.prompt,
      },
      answers,
    },
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = {
  TRANSLATION_TASK,
  WRITING_TASK,
  TRANSLATION_MAX,
  WRITING_MAX,
  ENGLISH_TOTAL,
  AGE_GROUPS,
  EDUCATION,
  OCCUPATIONS,
  SELF_RATINGS,
  getPublicTasks,
  buildGradingMessages,
  scoreFromLLM,
  heuristicScore,
  bandFor,
  buildApplicationResult,
};
