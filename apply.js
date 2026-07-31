/**
 * SpeakLab entry test — client for apply.html.
 *
 * Public, no login: the whole page is one four-step form that POSTs to
 * /api/apply. Scoring happens on the server and is never shown here — the
 * applicant sees a thank-you, the team sees the score in admin.html.
 *
 * Written in the same ES5-flavoured style as level-test.js so both pages work
 * on the older Android browsers a lot of the ad traffic arrives on.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'speaklab_application_draft';
  var TOTAL_STEPS = 4;

  var STEP_TAGS = [
    '', // 1-based
    'Step 1 · About you',
    'Step 2 · Education',
    'Step 3 · English',
    'Step 4 · Commitment',
  ];

  var step = 1;
  var submitting = false;

  var $ = function (id) { return document.getElementById(id); };

  // ── Screens ───────────────────────────────────────────────────────────
  function show(screenId) {
    var screens = document.querySelectorAll('.lt-screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('is-active');
    $(screenId).classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  function init() {
    $('begin-btn').addEventListener('click', function () {
      show('screen-form');
      renderStep();
      track('StartApplication');
    });
    $('step-next').addEventListener('click', next);
    $('step-prev').addEventListener('click', prev);
    $('apply-form').addEventListener('submit', onSubmit);
    $('retry-btn').addEventListener('click', function () {
      show('screen-form');
      renderStep();
      submit();
    });

    $('f-writing').addEventListener('input', updateWordCount);

    // Mirror radio state onto the label for browsers without :has().
    var radios = document.querySelectorAll('.ap-choice input');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', syncChoices);
    }

    // Clear a field's error the moment the applicant starts fixing it.
    var fields = document.querySelectorAll('#apply-form input, #apply-form select, #apply-form textarea');
    for (var j = 0; j < fields.length; j++) {
      fields[j].addEventListener('input', function (e) { clearError(e.target); });
      fields[j].addEventListener('change', function (e) { clearError(e.target); });
    }

    restoreDraft();
    document.addEventListener('input', saveDraft);
    document.addEventListener('change', saveDraft);

    loadTasks();
    renderStep();
  }

  /**
   * Pull the task text from the server so the sentence shown here can never
   * drift from the one the grader scores against. The HTML already carries a
   * copy, so a failed fetch changes nothing.
   */
  function loadTasks() {
    fetch('/api/apply')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.translation) return;
        if (data.translation.urdu) $('translate-urdu').textContent = data.translation.urdu;
        if (data.translation.roman) $('translate-roman').textContent = data.translation.roman;
        if (data.writing && data.writing.prompt) {
          var label = document.querySelector('label[for="f-writing"]');
          if (label) label.textContent = data.writing.prompt;
        }
      })
      .catch(function () { /* the baked-in copy stands */ });
  }

  // ── Steps ─────────────────────────────────────────────────────────────
  function renderStep() {
    var panes = document.querySelectorAll('.ap-step');
    for (var i = 0; i < panes.length; i++) {
      panes[i].hidden = Number(panes[i].getAttribute('data-step')) !== step;
    }

    $('step-tag').textContent = STEP_TAGS[step];
    $('step-counter').textContent = 'Step ' + step + ' of ' + TOTAL_STEPS;
    // Show progress for the step you are *working on*, not the one you finished.
    $('form-progress').style.width = Math.round(((step - 1) / TOTAL_STEPS) * 100) + '%';

    $('step-prev').hidden = step === 1;
    $('step-next').hidden = step === TOTAL_STEPS;
    $('step-submit').hidden = step !== TOTAL_STEPS;

    hideFormError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next() {
    if (!validateStep(step)) return;
    if (step < TOTAL_STEPS) { step++; renderStep(); }
  }

  function prev() {
    if (step > 1) { step--; renderStep(); }
  }

  // ── Validation ────────────────────────────────────────────────────────
  var STEP_FIELDS = {
    1: ['f-name', 'f-whatsapp', 'f-age', 'f-city'],
    2: ['f-education', 'f-grades', 'f-occupation'],
    3: ['f-translation', 'f-writing'],
    4: ['f-motivation'],
  };

  function validateStep(n) {
    var ok = true;
    var ids = STEP_FIELDS[n] || [];

    for (var i = 0; i < ids.length; i++) {
      if (!validateField(ids[i])) ok = false;
    }

    if (n === 3 && !checkedValue('self_rating')) {
      setRadioError('self_rating', 'Please choose the option closest to your English.');
      ok = false;
    }
    if (n === 4 && !checkedValue('fee_ready')) {
      setRadioError('fee_ready', 'Please answer yes or no.');
      ok = false;
    }

    if (!ok) {
      var firstError = document.querySelector('#apply-form .has-error');
      if (firstError) firstError.focus({ preventScroll: false });
    }
    return ok;
  }

  function validateField(id) {
    var el = $(id);
    var value = (el.value || '').trim();

    if (!value) {
      setError(el, requiredMessage(id));
      return false;
    }

    if (id === 'f-whatsapp') {
      // Same 10–15 digit rule the API enforces, so nothing passes here and
      // fails there.
      var digits = value.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) {
        setError(el, 'Please enter a valid WhatsApp number, e.g. 0301 2345678.');
        return false;
      }
    }

    if (id === 'f-writing' && wordCount(value) < 15) {
      setError(el, 'Please write at least 3 lines — about 15 words or more.');
      return false;
    }

    if (id === 'f-motivation' && value.length < 20) {
      setError(el, 'Please write a sentence or two, not just a word.');
      return false;
    }

    clearError(el);
    return true;
  }

  function requiredMessage(id) {
    var messages = {
      'f-name': 'Please enter your full name.',
      'f-whatsapp': 'Please enter your WhatsApp number.',
      'f-age': 'Please select your age group.',
      'f-city': 'Please enter your city or area.',
      'f-education': 'Please select your highest education.',
      'f-grades': 'Please enter your marks or grade.',
      'f-occupation': 'Please select what you do.',
      'f-translation': 'Please translate the sentence into English.',
      'f-writing': 'Please describe your daily routine in English.',
      'f-motivation': 'Please tell us why you want to improve.',
    };
    return messages[id] || 'This field is required.';
  }

  function setError(el, message) {
    el.classList.add('has-error');
    var slot = document.querySelector('.lt-error[data-for="' + el.id + '"]');
    if (slot) slot.textContent = message;
  }

  function clearError(el) {
    if (!el || !el.id) return;
    el.classList.remove('has-error');
    var slot = document.querySelector('.lt-error[data-for="' + el.id + '"]');
    if (slot) slot.textContent = '';
    if (el.name === 'self_rating' || el.name === 'fee_ready') {
      var group = document.querySelector('.lt-error[data-for="' + el.name + '"]');
      if (group) group.textContent = '';
    }
  }

  function setRadioError(name, message) {
    var slot = document.querySelector('.lt-error[data-for="' + name + '"]');
    if (slot) slot.textContent = message;
  }

  function checkedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  // ── Small UI helpers ──────────────────────────────────────────────────
  function wordCount(text) {
    var t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function updateWordCount() {
    var n = wordCount($('f-writing').value);
    var el = $('writing-count');
    el.textContent = n + (n === 1 ? ' word' : ' words');
    el.className = 'ap-counter' + (n >= 25 ? ' is-ok' : '');
  }

  function syncChoices() {
    var labels = document.querySelectorAll('.ap-choice');
    for (var i = 0; i < labels.length; i++) {
      var input = labels[i].querySelector('input');
      labels[i].classList.toggle('is-selected', !!(input && input.checked));
    }
  }

  function showFormError(message) {
    var box = $('form-error');
    box.textContent = message;
    box.hidden = false;
  }

  function hideFormError() { $('form-error').hidden = true; }

  /** Meta Pixel / GTM, both optional — never let analytics break the form. */
  function track(event) {
    try { if (window.fbq) window.fbq('trackCustom', event); } catch (e) {}
    try { if (window.dataLayer) window.dataLayer.push({ event: 'speaklab_' + event }); } catch (e) {}
  }

  // ── Draft ─────────────────────────────────────────────────────────────
  // Phones lose pages to backgrounding and stray taps. Losing four steps of
  // typed English is the fastest way to lose an applicant.
  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collect()));
    } catch (e) { /* private mode / quota — the form still works */ }
  }

  function restoreDraft() {
    var draft = {};
    try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return; }
    if (!draft || typeof draft !== 'object') return;

    var map = {
      full_name: 'f-name', whatsapp: 'f-whatsapp', age_group: 'f-age', city: 'f-city',
      education: 'f-education', grades: 'f-grades', occupation: 'f-occupation',
      translation_answer: 'f-translation', writing_answer: 'f-writing',
      motivation: 'f-motivation',
    };
    for (var key in map) {
      if (draft[key]) {
        var el = $(map[key]);
        if (el) el.value = draft[key];
      }
    }
    checkRadio('self_rating', draft.self_rating);
    if (draft.fee_ready === true) checkRadio('fee_ready', 'yes');
    if (draft.fee_ready === false) checkRadio('fee_ready', 'no');

    syncChoices();
    updateWordCount();
  }

  function checkRadio(name, value) {
    if (!value) return;
    var el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  function clearDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Submit ────────────────────────────────────────────────────────────
  function collect() {
    var feeReady = checkedValue('fee_ready');
    return {
      full_name: $('f-name').value.trim(),
      whatsapp: $('f-whatsapp').value.trim(),
      age_group: $('f-age').value,
      city: $('f-city').value.trim(),
      education: $('f-education').value,
      grades: $('f-grades').value.trim(),
      occupation: $('f-occupation').value,
      translation_answer: $('f-translation').value.trim(),
      writing_answer: $('f-writing').value.trim(),
      self_rating: checkedValue('self_rating'),
      motivation: $('f-motivation').value.trim(),
      fee_ready: feeReady === 'yes' ? true : (feeReady === 'no' ? false : null),
      source: sourceTag(),
    };
  }

  /** Where the click came from, so ad spend stays attributable in the panel. */
  function sourceTag() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('utm_source') || params.get('source') || 'apply-page').slice(0, 60);
  }

  function onSubmit(e) {
    e.preventDefault();
    // Re-check every step: someone can reach step 4 and then clear step 1.
    for (var n = 1; n <= TOTAL_STEPS; n++) {
      if (!validateStep(n)) {
        step = n;
        renderStep();
        showFormError('Please complete this step before submitting.');
        return;
      }
    }
    submit();
  }

  function submit() {
    if (submitting) return;
    submitting = true;
    show('screen-sending');

    fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        submitting = false;
        if (!res.ok) {
          fail(res.data.message || 'Please check your answers and try again.');
          return;
        }
        clearDraft();
        track('SubmitApplication');
        try { if (window.fbq) window.fbq('track', 'Lead'); } catch (e) {}
        show('screen-thanks');
      })
      .catch(function () {
        submitting = false;
        fail('We could not reach our server. Check your internet connection and try again.');
      });
  }

  function fail(message) {
    $('error-message').textContent = message;
    show('screen-error');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
