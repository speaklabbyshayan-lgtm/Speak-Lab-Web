/**
 * SpeakLab level test — question bank, grading and CEFR mapping.
 *
 * This module is server-only. The answer key must never reach the browser:
 * api/level-test.js calls getPublicTest() to strip it before responding.
 */

// Each question carries the CEFR band it discriminates at. Harder bands are
// worth more so a student who only clears A1/A2 cannot reach a B2 score by
// volume alone.
const BAND_WEIGHT = { A1: 1, A2: 1, B1: 2, B2: 2, C1: 3, C2: 3 };

const GRAMMAR_QUESTIONS = [
  // ── A1 ──────────────────────────────────────────────────────────────────
  { id: 'g1',  band: 'A1', question: 'She ___ from Pakistan.',
    options: ['is', 'are', 'am', 'be'], answer: 0,
    skill: 'Present tense of "to be"' },
  { id: 'g2',  band: 'A1', question: 'I ___ coffee every morning.',
    options: ['drinks', 'drink', 'drinking', 'am drink'], answer: 1,
    skill: 'Present simple' },
  { id: 'g3',  band: 'A1', question: 'There ___ three books on the table.',
    options: ['is', 'am', 'are', 'be'], answer: 2,
    skill: 'There is / there are' },
  { id: 'g4',  band: 'A1', question: '___ you speak English?',
    options: ['Does', 'Is', 'Do', 'Are'], answer: 2,
    skill: 'Question formation' },

  // ── A2 ──────────────────────────────────────────────────────────────────
  { id: 'g5',  band: 'A2', question: 'I ___ to Islamabad last year.',
    options: ['go', 'have gone', 'went', 'am going'], answer: 2,
    skill: 'Past simple' },
  { id: 'g6',  band: 'A2', question: 'My sister is ___ than me.',
    options: ['taller', 'tallest', 'more tall', 'the tallest'], answer: 0,
    skill: 'Comparatives' },
  { id: 'g7',  band: 'A2', question: 'We ___ TV when the phone rang.',
    options: ['watched', 'were watching', 'watch', 'have watched'], answer: 1,
    skill: 'Past continuous' },
  { id: 'g8',  band: 'A2', question: 'If it rains, we ___ at home.',
    options: ['stayed', 'would stay', 'will stay', 'staying'], answer: 2,
    skill: 'First conditional' },

  // ── B1 ──────────────────────────────────────────────────────────────────
  { id: 'g9',  band: 'B1', question: "I've lived in Lahore ___ 2015.",
    options: ['for', 'since', 'from', 'during'], answer: 1,
    skill: 'since / for' },
  { id: 'g10', band: 'B1', question: 'He said he ___ tired.',
    options: ['is', 'was', 'are', 'be'], answer: 1,
    skill: 'Reported speech' },
  { id: 'g11', band: 'B1', question: 'The letter ___ yesterday.',
    options: ['sent', 'is sent', 'was sent', 'has sent'], answer: 2,
    skill: 'Passive voice' },
  { id: 'g12', band: 'B1', question: "I'd rather ___ at home tonight.",
    options: ['stay', 'to stay', 'staying', 'stayed'], answer: 0,
    skill: 'would rather' },

  // ── B2 ──────────────────────────────────────────────────────────────────
  { id: 'g13', band: 'B2', question: 'If I ___ more time, I would learn another language.',
    options: ['have', 'had', 'will have', 'would have'], answer: 1,
    skill: 'Second conditional' },
  { id: 'g14', band: 'B2', question: 'By the time we arrived, the meeting ___.',
    options: ['already ended', 'has already ended', 'had already ended', 'was already ending'], answer: 2,
    skill: 'Past perfect' },
  { id: 'g15', band: 'B2', question: "She's used to ___ up early.",
    options: ['get', 'getting', 'got', 'be get'], answer: 1,
    skill: 'be used to + gerund' },
  { id: 'g16', band: 'B2', question: "It's high time you ___ a decision.",
    options: ['make', 'made', 'making', 'will make'], answer: 1,
    skill: 'Unreal past' },

  // ── C1 ──────────────────────────────────────────────────────────────────
  { id: 'g17', band: 'C1', question: '___ had he sat down than the phone rang.',
    options: ['No sooner', 'Hardly', 'Scarcely when', 'As soon'], answer: 0,
    skill: 'Inversion' },
  { id: 'g18', band: 'C1', question: 'I object to ___ like a child.',
    options: ['be treated', 'being treated', 'treat', 'been treated'], answer: 1,
    skill: 'Passive gerund' },
  { id: 'g19', band: 'C1', question: 'Not only ___ the exam, but she also topped the class.',
    options: ['she passed', 'did she pass', 'she did pass', 'passed she'], answer: 1,
    skill: 'Negative inversion' },
  { id: 'g20', band: 'C1', question: 'Were it not for your help, I ___ failed.',
    options: ['will have', 'would have', 'had', 'would'], answer: 1,
    skill: 'Inverted conditional' },

  // ── C2 ──────────────────────────────────────────────────────────────────
  { id: 'g21', band: 'C2', question: 'Little ___ that he was being watched.',
    options: ['he realised', 'did he realise', 'he did realise', 'realised he'], answer: 1,
    skill: 'Fronted negative adverbial' },
  { id: 'g22', band: 'C2', question: 'Such ___ his influence that nobody dared object.',
    options: ['is', 'were', 'was', 'had been'], answer: 2,
    skill: 'Such + inversion' },
  { id: 'g23', band: 'C2', question: "I'd sooner you ___ mention this to anyone.",
    options: ["didn't", "don't", "wouldn't", 'not'], answer: 0,
    skill: 'would sooner + unreal past' },
  { id: 'g24', band: 'C2', question: 'The proposal, ___ merits, was rejected out of hand.',
    options: ['whatever it', 'whatever its', 'whatever are its', 'whatever is its'], answer: 1,
    skill: 'Concessive clauses' },
];

// Spoken answers are transcribed in the browser (Web Speech API) or typed as a
// fallback, then scored. Prompts ramp from personal to abstract, which is what
// separates a B1 speaker from a C1 one.
const SPEAKING_PROMPTS = [
  { id: 's1', band: 'A2', seconds: 60, minWords: 25,
    prompt: 'Introduce yourself. Tell us your name, where you are from, and what you do.',
    hint: 'Speak for about 45–60 seconds. Full sentences, not single words.' },
  { id: 's2', band: 'B1', seconds: 90, minWords: 50,
    prompt: 'Describe a memorable day in your life. What happened, and why do you still remember it?',
    hint: 'Tell it as a story: set the scene, say what happened, then how you felt.' },
  { id: 's3', band: 'B2', seconds: 120, minWords: 60,
    prompt: 'Some people believe technology is making us less social. Do you agree? Give reasons for your opinion.',
    hint: 'State your opinion, give two reasons, and consider the other side.' },
];

const SPEAKING_TOTAL = 100;

// Bands are ordered; index doubles as difficulty rank.
const CEFR = [
  { level: 'A1', label: 'Beginner',           min: 0,
    placement: 'Foundation — Spoken English Starter',
    blurb: 'You can use familiar everyday expressions and very basic phrases.' },
  { level: 'A2', label: 'Elementary',         min: 25,
    placement: 'Foundation — Communication & Confidence',
    blurb: 'You can handle simple, routine exchanges on familiar topics.' },
  { level: 'B1', label: 'Intermediate',       min: 40,
    placement: 'Core — Communication & Confidence',
    blurb: 'You can deal with most situations and explain your opinions in simple terms.' },
  { level: 'B2', label: 'Upper-Intermediate', min: 55,
    placement: 'Core — Fluency & Public Speaking',
    blurb: 'You can interact with fluency and argue a viewpoint in detail.' },
  { level: 'C1', label: 'Advanced',           min: 70,
    placement: 'Advanced — Public Speaking & Leadership',
    blurb: 'You express yourself fluently and use language flexibly for social and professional life.' },
  { level: 'C2', label: 'Proficient',         min: 85,
    placement: 'Advanced — Mastery & Executive Communication',
    blurb: 'You express yourself precisely and effortlessly, even on complex topics.' },
];

// Grammar carries more weight than speaking because it is graded objectively.
const GRAMMAR_WEIGHT = 0.6;
const SPEAKING_WEIGHT = 0.4;

/** The test as the browser is allowed to see it — no `answer` field. */
function getPublicTest() {
  return {
    grammar: GRAMMAR_QUESTIONS.map(({ id, band, question, options }) => ({
      id, band, question, options,
    })),
    speaking: SPEAKING_PROMPTS.map(({ id, band, prompt, hint, seconds, minWords }) => ({
      id, band, prompt, hint, seconds, minWords,
    })),
    meta: {
      grammarCount: GRAMMAR_QUESTIONS.length,
      speakingCount: SPEAKING_PROMPTS.length,
      grammarWeight: GRAMMAR_WEIGHT,
      speakingWeight: SPEAKING_WEIGHT,
    },
  };
}

/**
 * Grade the multiple-choice section.
 * @param {Record<string, number>} answers  question id → chosen option index
 */
function gradeGrammar(answers = {}) {
  const perBand = {};
  const details = [];
  let earned = 0;
  let possible = 0;

  for (const q of GRAMMAR_QUESTIONS) {
    const weight = BAND_WEIGHT[q.band];
    possible += weight;

    perBand[q.band] = perBand[q.band] || { correct: 0, total: 0 };
    perBand[q.band].total += 1;

    const given = answers[q.id];
    const correct = given === q.answer;
    if (correct) {
      earned += weight;
      perBand[q.band].correct += 1;
    }

    details.push({
      id: q.id,
      band: q.band,
      skill: q.skill,
      correct,
      answered: given !== undefined && given !== null,
    });
  }

  return {
    score: earned,
    total: possible,
    percent: possible ? round1((earned / possible) * 100) : 0,
    perBand,
    details,
  };
}

/**
 * Fallback speaking score, used when no LLM is reachable.
 *
 * It cannot judge meaning, so it deliberately measures only what is countable
 * and caps at B2-equivalent (78) — an unverified transcript should never
 * award a C-level result.
 */
function heuristicSpeakingScore(responses = []) {
  const criteria = [];
  let total = 0;

  for (const prompt of SPEAKING_PROMPTS) {
    const text = String(responses.find(r => r.id === prompt.id)?.transcript || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const unique = new Set(words.map(w => w.toLowerCase().replace(/[^a-z']/g, ''))).size;

    // Length against the prompt's own target, capped so rambling ≠ fluency.
    const length = Math.min(1, words.length / Math.max(prompt.minWords, 1));
    // Lexical variety: unique words as a share of total.
    const variety = words.length ? Math.min(1, unique / words.length / 0.6) : 0;
    // Sentence development: average words per sentence, target ~12.
    const avgLen = sentences.length ? words.length / sentences.length : 0;
    const development = Math.min(1, avgLen / 12);

    const promptScore = (length * 0.5 + variety * 0.25 + development * 0.25) * (SPEAKING_TOTAL / SPEAKING_PROMPTS.length);
    total += promptScore;

    criteria.push({
      id: prompt.id,
      words: words.length,
      uniqueWords: unique,
      sentences: sentences.length,
      score: round1(promptScore),
    });
  }

  return {
    score: Math.min(round1(total), 78),
    total: SPEAKING_TOTAL,
    method: 'heuristic',
    criteria,
    feedback: 'Scored automatically on length, vocabulary range and sentence development. A teacher will review your spoken answers before your first class.',
  };
}

/** Combine both sections into a level. */
function buildResult({ grammar, speaking, student, durationSeconds, answers, gradedBy }) {
  const speakingPercent = speaking.total ? (speaking.score / speaking.total) * 100 : 0;
  const overall = round1(grammar.percent * GRAMMAR_WEIGHT + speakingPercent * SPEAKING_WEIGHT);

  // Highest band whose threshold the student clears.
  let band = [...CEFR].reverse().find(b => overall >= b.min) || CEFR[0];

  // Grammar alone is 60% of the score, so a student who aces the multiple
  // choice but says nothing would otherwise be labelled B2 ("interacts with
  // fluency") — a claim the test has no evidence for. Cap the reported level
  // until there is enough speech to justify it. This is a speaking academy;
  // the level has to mean something out loud.
  let capped = null;
  if (speakingPercent < 20) {
    const ceiling = CEFR.findIndex(b => b.level === 'B1');
    const current = CEFR.findIndex(b => b.level === band.level);
    if (current > ceiling) {
      capped = band.level;
      band = CEFR[ceiling];
    }
  }

  const strongest = Object.entries(grammar.perBand)
    .filter(([, v]) => v.correct / v.total >= 0.75)
    .map(([k]) => k);
  const weakest = grammar.details
    .filter(d => !d.correct)
    .map(d => d.skill);

  return {
    student,
    grammar_score: grammar.score,
    grammar_total: grammar.total,
    speaking_score: Math.round(speaking.score),
    speaking_total: speaking.total,
    overall_percent: overall,
    cefr_level: band.level,
    level_label: band.label,
    placement: band.placement,
    graded_by: gradedBy,
    duration_seconds: durationSeconds || null,
    report: {
      summary: band.blurb,
      grammar: {
        percent: grammar.percent,
        perBand: grammar.perBand,
        correct: grammar.details.filter(d => d.correct).length,
        total: grammar.details.length,
      },
      speaking: {
        percent: round1(speakingPercent),
        method: speaking.method,
        criteria: speaking.criteria || [],
        feedback: speaking.feedback || '',
      },
      strengths: strongest.length
        ? [`Confident at ${strongest.join(', ')} level grammar`]
        : ['You completed the full assessment — that is the starting point.'],
      // De-duplicate: the same skill can appear across several missed questions.
      focus_areas: [...new Set(weakest)].slice(0, 6),
      recommended_class: band.placement,
      capped_from: capped,
      capped_reason: capped
        ? `Written grammar suggested ${capped}, but there was not enough spoken English to confirm it. Complete the speaking section for a full result.`
        : null,
    },
    answers,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = {
  GRAMMAR_QUESTIONS,
  SPEAKING_PROMPTS,
  SPEAKING_TOTAL,
  CEFR,
  getPublicTest,
  gradeGrammar,
  heuristicSpeakingScore,
  buildResult,
};
