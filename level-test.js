/**
 * SpeakLab level test — client.
 *
 * The browser never sees the answer key: questions come from GET /api/level-test
 * with `answer` stripped, and POST /api/level-test does the grading.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'speaklab_level_test_progress';

  var state = {
    student: { name: '', email: '', whatsapp: '' },
    test: null,          // { grammar[], speaking[], meta }
    grammarIndex: 0,
    grammarAnswers: {},  // questionId -> option index
    speakingIndex: 0,
    speakingAnswers: {}, // promptId -> transcript
    startedAt: null,
  };

  var recognition = null;
  var isRecording = false;
  var timerId = null;
  var elapsed = 0;
  var finalTranscript = '';   // committed speech for the current prompt
  var stoppedByUser = false;

  // Chrome hands the same result back more than once, so the recogniser's
  // output is rebuilt from its results array on every event instead of being
  // appended to. sessionFinal holds the finals for the *current* recognition
  // session only; resultOffset marks how much of that array has already been
  // folded into finalTranscript and must not be counted again.
  var sessionFinal = '';
  var resultOffset = 0;
  var lastResultCount = 0;

  var $ = function (id) { return document.getElementById(id); };

  /** Join transcript fragments with single spaces, dropping empty ones. */
  function joinParts(parts) {
    return parts
      .map(function (p) { return (p || '').trim(); })
      .filter(Boolean)
      .join(' ');
  }

  /** Forget the recogniser's buffered results; the box is now the base text. */
  function resetSpeechBuffer(offset) {
    sessionFinal = '';
    resultOffset = offset || 0;
  }

  // ── Screens ───────────────────────────────────────────────────────────
  function show(screenId) {
    var screens = document.querySelectorAll('.lt-screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('is-active');
    $(screenId).classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function init() {
    prefillIdentity();
    restoreProgress();
    $('identity-form').addEventListener('submit', onStart);
    $('grammar-prev').addEventListener('click', grammarPrev);
    $('grammar-next').addEventListener('click', grammarNext);
    $('speaking-prev').addEventListener('click', speakingPrev);
    $('speaking-next').addEventListener('click', speakingNext);
    $('mic-btn').addEventListener('click', toggleRecording);
    $('retry-btn').addEventListener('click', submit);
    $('transcript').addEventListener('input', onTranscriptInput);
    document.addEventListener('keydown', onKeydown);
    setupRecognition();
  }

  /** Identity can arrive from the enroll redirect (?name=&email=) or storage. */
  function prefillIdentity() {
    var params = new URLSearchParams(window.location.search);
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem('speaklab_student') || '{}'); } catch (e) {}

    var name = params.get('name') || stored.name || '';
    var email = params.get('email') || stored.email || '';
    var whatsapp = params.get('whatsapp') || stored.whatsapp || '';

    if (name) $('f-name').value = name;
    if (email) $('f-email').value = email;
    if (whatsapp) $('f-whatsapp').value = whatsapp;
  }

  function restoreProgress() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.grammarAnswers) {
        state.grammarAnswers = saved.grammarAnswers || {};
        state.speakingAnswers = saved.speakingAnswers || {};
        state.grammarIndex = saved.grammarIndex || 0;
        state.speakingIndex = saved.speakingIndex || 0;
      }
    } catch (e) { /* a corrupt cache just means a fresh start */ }
  }

  function saveProgress() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        grammarAnswers: state.grammarAnswers,
        speakingAnswers: state.speakingAnswers,
        grammarIndex: state.grammarIndex,
        speakingIndex: state.speakingIndex,
      }));
    } catch (e) { /* private mode — progress just won't survive a reload */ }
  }

  // ── Screen 1: identity ────────────────────────────────────────────────
  function onStart(e) {
    e.preventDefault();
    clearErrors();

    var name = $('f-name').value.trim();
    var email = $('f-email').value.trim();
    var ok = true;

    if (name.length < 2) { fieldError('f-name', 'Please enter your full name.'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError('f-email', 'Please enter a valid email address.'); ok = false; }
    if (!ok) return;

    state.student = { name: name, email: email, whatsapp: $('f-whatsapp').value.trim() };
    try { localStorage.setItem('speaklab_student', JSON.stringify(state.student)); } catch (err) {}

    var btn = $('start-btn');
    btn.disabled = true;
    btn.textContent = 'LOADING QUESTIONS…';

    fetch('/api/level-test')
      .then(function (r) {
        if (!r.ok) throw new Error('Could not load the test questions (HTTP ' + r.status + ').');
        return r.json();
      })
      .then(function (test) {
        if (!test || !test.grammar || !test.grammar.length) throw new Error('The question bank came back empty.');
        state.test = test;
        state.startedAt = Date.now();
        if (state.grammarIndex >= test.grammar.length) state.grammarIndex = 0;
        show('screen-grammar');
        renderGrammar();
      })
      .catch(function (err) {
        fieldError('f-email', err.message);
        btn.disabled = false;
        btn.textContent = 'START THE TEST';
      });
  }

  function fieldError(id, msg) {
    $(id).classList.add('has-error');
    var span = document.querySelector('.lt-error[data-for="' + id + '"]');
    if (span) span.textContent = msg;
  }
  function clearErrors() {
    var inputs = document.querySelectorAll('.lt-field input');
    for (var i = 0; i < inputs.length; i++) inputs[i].classList.remove('has-error');
    var spans = document.querySelectorAll('.lt-error');
    for (var j = 0; j < spans.length; j++) spans[j].textContent = '';
  }

  // ── Screen 2: grammar ─────────────────────────────────────────────────
  function renderGrammar() {
    var qs = state.test.grammar;
    var q = qs[state.grammarIndex];
    var total = qs.length;

    $('grammar-counter').textContent = 'Question ' + (state.grammarIndex + 1) + ' of ' + total;
    $('grammar-progress').style.width = ((state.grammarIndex) / total * 100) + '%';
    $('grammar-question').textContent = q.question;

    var box = $('grammar-options');
    box.innerHTML = '';
    var keys = ['A', 'B', 'C', 'D'];

    q.options.forEach(function (opt, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lt-option' + (state.grammarAnswers[q.id] === i ? ' is-selected' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', state.grammarAnswers[q.id] === i ? 'true' : 'false');

      var key = document.createElement('span');
      key.className = 'lt-option-key';
      key.textContent = keys[i] || String(i + 1);

      var label = document.createElement('span');
      label.textContent = opt;

      btn.appendChild(key);
      btn.appendChild(label);
      btn.addEventListener('click', function () { selectOption(q.id, i); });
      box.appendChild(btn);
    });

    $('grammar-prev').disabled = state.grammarIndex === 0;
    $('grammar-next').disabled = state.grammarAnswers[q.id] === undefined;
    $('grammar-next').textContent = state.grammarIndex === total - 1 ? 'GO TO SPEAKING' : 'Next';
  }

  function selectOption(qid, index) {
    state.grammarAnswers[qid] = index;
    saveProgress();
    renderGrammar();
  }

  function grammarNext() {
    if (state.grammarIndex < state.test.grammar.length - 1) {
      state.grammarIndex++;
      saveProgress();
      renderGrammar();
    } else {
      $('grammar-progress').style.width = '100%';
      show('screen-speaking');
      renderSpeaking();
    }
  }

  function grammarPrev() {
    if (state.grammarIndex > 0) {
      state.grammarIndex--;
      saveProgress();
      renderGrammar();
    }
  }

  /** A/B/C/D and 1-4 pick an option; Enter advances. */
  function onKeydown(e) {
    if (!$('screen-grammar').classList.contains('is-active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    var q = state.test && state.test.grammar[state.grammarIndex];
    if (!q) return;

    var key = e.key.toUpperCase();
    var index = ['A', 'B', 'C', 'D'].indexOf(key);
    if (index === -1 && /^[1-4]$/.test(key)) index = parseInt(key, 10) - 1;

    if (index > -1 && index < q.options.length) {
      e.preventDefault();
      selectOption(q.id, index);
    } else if (e.key === 'Enter' && state.grammarAnswers[q.id] !== undefined) {
      e.preventDefault();
      grammarNext();
    }
  }

  // ── Screen 3: speaking ────────────────────────────────────────────────
  function renderSpeaking() {
    var prompts = state.test.speaking;
    var p = prompts[state.speakingIndex];

    $('speaking-counter').textContent = 'Prompt ' + (state.speakingIndex + 1) + ' of ' + prompts.length;
    $('speaking-progress').style.width = (state.speakingIndex / prompts.length * 100) + '%';
    $('speaking-prompt').textContent = p.prompt;
    $('speaking-hint').textContent = p.hint;

    finalTranscript = state.speakingAnswers[p.id] || '';
    resetSpeechBuffer(0);
    $('transcript').value = finalTranscript;
    updateWordCount();

    resetTimer();
    $('speaking-prev').disabled = false;
    $('speaking-next').textContent = state.speakingIndex === prompts.length - 1 ? 'FINISH & GET MY LEVEL' : 'Next';
  }

  function speakingNext() {
    stopRecording();
    var prompts = state.test.speaking;
    state.speakingAnswers[prompts[state.speakingIndex].id] = $('transcript').value.trim();
    saveProgress();

    if (state.speakingIndex < prompts.length - 1) {
      state.speakingIndex++;
      renderSpeaking();
    } else {
      $('speaking-progress').style.width = '100%';
      submit();
    }
  }

  function speakingPrev() {
    stopRecording();
    var prompts = state.test.speaking;
    state.speakingAnswers[prompts[state.speakingIndex].id] = $('transcript').value.trim();
    saveProgress();

    if (state.speakingIndex > 0) {
      state.speakingIndex--;
      renderSpeaking();
    } else {
      // Back from the first prompt returns to the last grammar question.
      state.grammarIndex = state.test.grammar.length - 1;
      show('screen-grammar');
      renderGrammar();
    }
  }

  function onTranscriptInput() {
    // Typing wins over the recogniser: keep them in sync so a restart of the
    // mic doesn't clobber hand-written edits. The box already contains this
    // session's speech, so skip past those results rather than re-adding them.
    finalTranscript = $('transcript').value;
    resetSpeechBuffer(lastResultCount);
    updateWordCount();
  }

  function updateWordCount() {
    var text = $('transcript').value.trim();
    var words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    var target = state.test ? state.test.speaking[state.speakingIndex].minWords : 0;
    var el = $('word-count');
    el.textContent = words + (words === 1 ? ' word' : ' words');
    if (target) {
      if (words >= target) {
        el.textContent += ' · good length';
        el.classList.add('is-ok');
      } else {
        el.textContent += ' · aim for ' + target + '+';
        el.classList.remove('is-ok');
      }
    }
  }

  // ── Speech recognition ────────────────────────────────────────────────
  function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $('mic-btn').disabled = true;
      $('mic-status').textContent = 'Voice input unavailable';
      $('mic-unsupported').hidden = false;
      $('transcript-label-text').textContent = 'Type your answer';
      return;
    }

    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = function (event) {
      // Rebuilt from scratch, never appended to: Chrome fires onresult again
      // over ranges that include results it has already marked final, and
      // appending those a second or third time is what wrote the spoken text
      // into the box twice. Recomputing makes a repeat event a no-op.
      var finals = '';
      var interim = '';
      for (var i = resultOffset; i < event.results.length; i++) {
        var chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finals = joinParts([finals, chunk]);
        } else {
          interim += chunk;
        }
      }
      sessionFinal = finals;
      lastResultCount = event.results.length;
      $('transcript').value = joinParts([finalTranscript, sessionFinal, interim]);
      updateWordCount();
    };

    recognition.onerror = function (event) {
      if (event.error === 'no-speech') {
        $('mic-status').textContent = "Didn't catch that — try again";
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        $('mic-status').textContent = 'Mic blocked — type your answer instead';
        $('mic-unsupported').hidden = false;
        $('mic-unsupported').textContent = 'We could not access your microphone. Allow mic access in your browser, or simply type your answer — it is graded the same way.';
        stopRecording();
        return;
      }
      if (event.error === 'aborted') return;
      $('mic-status').textContent = 'Voice error — you can type instead';
      stopRecording();
    };

    recognition.onend = function () {
      // The results array resets when recognition restarts, so this segment's
      // finals have to be folded into the committed text first — otherwise the
      // restart would drop everything said before the pause.
      finalTranscript = joinParts([finalTranscript, sessionFinal]);
      resetSpeechBuffer(0);
      lastResultCount = 0;

      // Chrome stops recognition after a pause; restart unless the user stopped.
      if (isRecording && !stoppedByUser) {
        try { recognition.start(); } catch (e) { stopRecording(); }
      }
    };
  }

  function toggleRecording() {
    if (isRecording) stopRecording();
    else startRecording();
  }

  function startRecording() {
    if (!recognition) return;
    // Keep whatever is in the box (typed or previously spoken) as the base.
    finalTranscript = $('transcript').value.trim();
    resetSpeechBuffer(0);
    lastResultCount = 0;
    stoppedByUser = false;
    try {
      recognition.start();
    } catch (e) {
      return; // already running
    }
    isRecording = true;
    $('mic-btn').classList.add('is-recording');
    $('mic-btn').setAttribute('aria-label', 'Stop recording');
    $('mic-status').textContent = 'Listening… speak now';
    $('mic-status').classList.add('is-live');
    startTimer();
  }

  function stopRecording() {
    if (recognition && isRecording) {
      stoppedByUser = true;
      try { recognition.stop(); } catch (e) {}
    }
    isRecording = false;
    $('mic-btn').classList.remove('is-recording');
    $('mic-btn').setAttribute('aria-label', 'Start recording');
    $('mic-status').classList.remove('is-live');
    if (!$('mic-status').textContent.match(/blocked|error|catch/i)) {
      $('mic-status').textContent = $('transcript').value.trim() ? 'Tap to add more' : 'Tap to start speaking';
    }
    stopTimer();
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      elapsed++;
      renderTimer();
      var limit = state.test.speaking[state.speakingIndex].seconds;
      if (elapsed >= limit) {
        // Suggested length only — we never cut a student off mid-sentence.
        $('speaking-timer').classList.add('is-over');
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function resetTimer() {
    stopTimer();
    elapsed = 0;
    $('speaking-timer').classList.remove('is-over');
    renderTimer();
  }
  function renderTimer() {
    var limit = state.test ? state.test.speaking[state.speakingIndex].seconds : 0;
    var m = Math.floor(elapsed / 60);
    var s = elapsed % 60;
    $('speaking-timer').textContent = m + ':' + (s < 10 ? '0' : '') + s +
      (limit ? ' / suggested ' + Math.floor(limit / 60) + ':' + (limit % 60 < 10 ? '0' : '') + (limit % 60) : '');
  }

  // ── Submit + grade ────────────────────────────────────────────────────
  function submit() {
    stopRecording();
    show('screen-grading');

    var statusEl = $('grading-status');
    var messages = [
      'Checking your grammar answers',
      'Listening to your speaking responses',
      'Working out your CEFR level',
      'Writing your personalised report',
    ];
    var step = 0;
    var rotator = setInterval(function () {
      step = (step + 1) % messages.length;
      statusEl.textContent = messages[step];
    }, 1800);

    var payload = {
      student: state.student,
      grammar: state.grammarAnswers,
      speaking: state.test.speaking.map(function (p) {
        return { id: p.id, transcript: state.speakingAnswers[p.id] || '' };
      }),
      durationSeconds: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : null,
    };

    // Backstop: the server bounds its own work, but a dead connection or a
    // platform hiccup must never leave a student on a spinner forever.
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var abortTimer = controller && setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, 45000);

    fetch('/api/level-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (r) {
        if (abortTimer) clearTimeout(abortTimer);
        // A 500/504 from the platform is an HTML page, not JSON — reading it as
        // JSON would surface "Unexpected token '<'" to the student.
        return r.text().then(function (text) {
          var body;
          try {
            body = JSON.parse(text);
          } catch (e) {
            throw new Error(
              r.ok
                ? 'The server sent a response we could not read. Please try again.'
                : 'The grading service is unavailable right now (HTTP ' + r.status + '). Your answers are saved — please try again in a moment.'
            );
          }
          if (!r.ok) throw new Error(body.message || 'Grading failed (HTTP ' + r.status + ').');
          return body;
        });
      })
      .then(function (data) {
        clearInterval(rotator);
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
        renderResult(data);
      })
      .catch(function (err) {
        clearInterval(rotator);
        if (abortTimer) clearTimeout(abortTimer);
        $('error-message').textContent = timedOut
          ? 'Grading is taking longer than expected and timed out. Your answers are still here — press Try Again.'
          : err.message;
        show('screen-error');
      });
  }

  function renderResult(data) {
    var r = data.result;
    var report = r.report || {};

    // The level test is the main free lure into the funnel — knowing how many
    // finish it, and at what level, is what makes it measurable as one.
    if (window.slTrack) {
      window.slTrack('level_test_complete', {
        cefr_level: r.cefr_level,
        overall_percent: Math.round(r.overall_percent),
        saved: data.saved === true,
      });
    }

    $('result-level').textContent = r.cefr_level;
    $('result-label').textContent = r.level_label;
    $('result-summary').textContent = report.summary || '';
    $('result-overall').textContent = Math.round(r.overall_percent) + '%';
    $('result-grammar').textContent = Math.round((report.grammar && report.grammar.percent) || 0) + '%';
    $('result-speaking').textContent = Math.round((report.speaking && report.speaking.percent) || 0) + '%';
    $('result-placement').textContent = r.placement || '';

    fillList('result-strengths', report.strengths, 'You finished the whole test.');
    fillList('result-focus', report.focus_areas, 'Nothing major — keep practising to hold your level.');

    var feedback = report.speaking && report.speaking.feedback;
    if (feedback) {
      $('result-speaking-feedback').textContent = feedback;
      $('speaking-feedback-block').hidden = false;
    }

    // Don't quietly show a capped level as if it were the full picture.
    if (report.capped_reason) {
      $('cap-note').textContent = report.capped_reason;
      $('cap-note').hidden = false;
    }

    // Position the marker on the A1–C2 track. Labels are evenly spaced, so map
    // the level's index rather than the raw percentage.
    var levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    var idx = levels.indexOf(r.cefr_level);
    if (idx > -1) {
      setTimeout(function () {
        $('scale-marker').style.left = ((idx / (levels.length - 1)) * 100) + '%';
      }, 250);
    }

    // A student arriving from the enroll form has already registered — sending
    // them back to that form would be a dead end.
    if (new URLSearchParams(window.location.search).get('from') === 'enroll') {
      var cta = $('result-cta');
      cta.href = 'thank-you.html';
      cta.textContent = 'WHAT HAPPENS NEXT';
    }

    // Be honest if the score didn't reach the database.
    if (data.saved === false) {
      var warn = $('save-warning');
      warn.textContent = 'Heads up: your result is shown here but we could not save it to your profile. Please screenshot this page and send it to us on WhatsApp so we can place you correctly.';
      warn.hidden = false;
    }

    show('screen-result');
  }

  function fillList(id, items, fallback) {
    var ul = $(id);
    ul.innerHTML = '';
    var list = (items && items.length) ? items : [fallback];
    list.forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
