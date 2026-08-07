/**
 * SpeakLab Saturdays — landing page behaviour.
 *
 * Five independent pieces, each guarded so a failure in one never takes the
 * application form down with it: the countdown, the headline rotator, the
 * scroll reveals, the swipe deck, and the three-step form.
 *
 * Written in ES5-flavoured JS with no build step, matching apply.js — this
 * repo ships raw files to Vercel and the audience is on a wide spread of
 * Android browsers.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'speaklab_saturday_draft';
  var TOTAL_STEPS = 3;
  var ENDPOINT = '/api/saturday-apply';

  var step = 1;
  var submitting = false;

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ── Boot ───────────────────────────────────────────────────────────────
  function init() {
    safe(initProgress);
    safe(initCountdown);
    safe(initReveals);
    safe(initHstack);
    safe(initSeats);
    safe(initSticky);
    safe(initForm);
  }

  // ── Reading progress bar ─────────────────────────────────────────────────
  function initProgress() {
    var bar = $('sat-progress-top');
    if (!bar) return;

    var ticking = false;
    function draw() {
      ticking = false;
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - doc.clientHeight;
      var pct = scrollable > 0 ? (doc.scrollTop || document.body.scrollTop) / scrollable : 0;
      bar.style.width = Math.max(0, Math.min(1, pct)) * 100 + '%';
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(draw);
    }, { passive: true });
    window.addEventListener('resize', draw, { passive: true });
    draw();
  }

  /** One broken widget must never cost us the application form. */
  function safe(fn) {
    try { fn(); } catch (e) { /* non-fatal by design */ }
  }

  // ── Countdown ──────────────────────────────────────────────────────────
  // The target date lives on the element as data-sat-date so updating next
  // week's session is a one-line HTML edit, not a code change.
  function initCountdown() {
    var box = $('sat-countdown');
    if (!box) return;

    var cells = {
      d: $('cd-days'), h: $('cd-hours'), m: $('cd-mins'), s: $('cd-secs'),
    };

    function target() {
      var configured = new Date(box.getAttribute('data-sat-date'));
      if (!isNaN(configured) && configured > new Date()) return configured;
      // The configured date has passed and nobody updated the page. Rather
      // than show a dead 00:00:00, roll forward to the next Saturday at the
      // same time of day so the page always looks live.
      return nextSaturday(configured);
    }

    function nextSaturday(from) {
      var base = isNaN(from) ? new Date() : from;
      var next = new Date();
      next.setHours(base.getHours(), base.getMinutes(), 0, 0);
      var ahead = (6 - next.getDay() + 7) % 7; // 6 = Saturday
      if (ahead === 0 && next <= new Date()) ahead = 7;
      next.setDate(next.getDate() + ahead);
      return next;
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function tick() {
      var left = target() - new Date();
      if (left < 0) left = 0;
      var secs = Math.floor(left / 1000);
      cells.d.textContent = pad(Math.floor(secs / 86400));
      cells.h.textContent = pad(Math.floor(secs / 3600) % 24);
      cells.m.textContent = pad(Math.floor(secs / 60) % 60);
      cells.s.textContent = pad(secs % 60);
    }

    tick();
    setInterval(tick, 1000);
  }

  // ── Reveal on scroll ───────────────────────────────────────────────────
  function initReveals() {
    // Both the plain reveals and the stagger rows share one observer — a
    // .sat-stagger animates its children off its own .is-in class.
    var items = all('.sat-reveal').concat(all('.sat-stagger'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        // Toggle, not add-once: the reveal replays every time the element
        // scrolls back into view, so scrolling up and down keeps animating.
        entry.target.classList.toggle('is-in', entry.isIntersecting);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  // ── Seats meter ────────────────────────────────────────────────────────
  // Builds the 12 seat squares from data attributes, so "3 seats left" and
  // the number of filled squares can never disagree.
  function initSeats() {
    var row = $('sat-seat-row');
    if (!row) return;

    var total = parseInt(row.getAttribute('data-total'), 10) || 12;
    var left = parseInt(row.getAttribute('data-left'), 10);
    if (isNaN(left) || left > total) left = total;

    var taken = total - left;
    var frag = document.createDocumentFragment();

    for (var i = 0; i < total; i++) {
      var seat = document.createElement('span');
      seat.className = 'sat-seat' + (i < taken ? ' is-taken' : '');
      seat.style.transitionDelay = (i * 0.035) + 's';
      frag.appendChild(seat);
    }
    row.appendChild(frag);

    var label = $('sat-seats-left');
    if (label) label.textContent = left + (left === 1 ? ' seat left' : ' seats left');
  }

  // ── Experience stack — deal cards in from the right ──────────────────────
  // The section pins to the viewport; the page's scroll through it deals each
  // card in from the right onto a pile. The card being placed is on top; the
  // ones already placed drift left, scale down and dim behind it. Falls back
  // to the plain CSS column under reduced motion or without the room to run.
  function initHstack() {
    var outer = $('sat-hstack');
    var pin = $('sat-hstack-pin');
    var stage = $('sat-hstack-stage');
    if (!outer || !pin || !stage) return;

    var cards = all('.sat-xp', stage);
    var N = cards.length;
    if (N < 2) return;

    // Progress dots.
    var dotsBox = $('sat-deck-dots');
    var dots = [];
    if (dotsBox && !dotsBox.children.length) {
      cards.forEach(function () {
        var b = document.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.setAttribute('aria-hidden', 'true');
        dotsBox.appendChild(b);
      });
      dots = all('button', dotsBox);
    }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var enabled = false;
    var step = 0;
    var centers = [];  // per-card vertical offset to centre it in the stage

    // Measure natural card heights, size the stage and the scroll length, then
    // switch on the pinned stack. Re-run on resize.
    function measure() {
      outer.classList.remove('is-hstack');
      outer.style.height = '';
      stage.style.height = '';
      cards.forEach(function (c) { c.style.transform = ''; c.style.opacity = ''; c.style.zIndex = ''; });

      if (reduce) { enabled = false; render(); return; }

      var maxH = 0;
      var hs = [];
      cards.forEach(function (c) { var h = c.offsetHeight; hs.push(h); if (h > maxH) maxH = h; });
      centers = hs.map(function (h) { return (maxH - h) / 2; });

      enabled = true;
      outer.classList.add('is-hstack');
      stage.style.height = maxH + 'px';
      // Scroll length per card hand-off; the pin holds for this long each time.
      step = Math.max(320, Math.round(window.innerHeight * 0.55));
      outer.style.height = (window.innerHeight + step * (N - 1)) + 'px';
      render();
    }

    function render() {
      if (!enabled) return;
      var total = outer.offsetHeight - window.innerHeight;
      var top = outer.getBoundingClientRect().top;
      var p = total > 0 ? Math.min(1, Math.max(0, -top / total)) : 0;
      var active = p * (N - 1); // which card is currently landing

      for (var i = 0; i < N; i++) {
        var d = i - active;   // >0 still to the right, <=0 placed / behind
        var x, sc, op;
        if (d > 0) {
          // Waiting off to the right, sliding in as its turn approaches.
          x = Math.min(d, 1.5) * 104;
          sc = 1 - Math.min(d, 1) * 0.02;
          op = 1;
        } else {
          // Placed, now receding behind the newer cards.
          var dd = Math.max(d, -3);
          x = dd * 7;
          sc = 1 + dd * 0.05;
          op = 1 + dd * 0.2;
        }
        cards[i].style.transform =
          'translate3d(' + x.toFixed(2) + '%,' + centers[i].toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
        cards[i].style.opacity = Math.max(0, Math.min(1, op)).toFixed(3);
        cards[i].style.zIndex = String(i + 1); // later cards land on top
      }
      setActiveDot(Math.round(active));
    }

    function setActiveDot(idx) {
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-active', i === idx);
    }

    var scheduled = false;
    function onScroll() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; render(); });
    }

    var rt;
    function onResize() {
      clearTimeout(rt);
      rt = setTimeout(measure, 150);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('load', measure);
    measure();
  }

  // ── Sticky mobile CTA ──────────────────────────────────────────────────
  // Appears once the hero button has scrolled away, hides again once the
  // form itself is on screen — a sticky "apply" bar over the apply form is
  // just a button covering its own destination.
  function initSticky() {
    var bar = $('sat-sticky');
    var hero = $('sat-hero-cta');
    var form = $('apply');
    if (!bar || !hero || !form || !('IntersectionObserver' in window)) return;

    var heroVisible = true;
    var formVisible = false;

    function update() {
      bar.classList.toggle('is-on', !heroVisible && !formVisible);
    }

    new IntersectionObserver(function (e) {
      heroVisible = e[0].isIntersecting;
      update();
    }).observe(hero);

    new IntersectionObserver(function (e) {
      formVisible = e[0].isIntersecting;
      update();
    }, { rootMargin: '-10% 0px -25% 0px' }).observe(form);
  }

  // ── Form ───────────────────────────────────────────────────────────────
  function initForm() {
    var form = $('sat-form');
    if (!form) return;

    $('sat-next').addEventListener('click', function () {
      if (!validateStep(step)) return;
      hideFormError();
      step++;
      renderStep(true);
    });

    $('sat-prev').addEventListener('click', function () {
      hideFormError();
      step--;
      renderStep(true);
    });

    form.addEventListener('submit', onSubmit);

    // Clearing the error the moment someone starts fixing it keeps the form
    // from shouting at people who are already complying.
    form.addEventListener('input', function (e) {
      clearFieldError(e.target);
      saveDraft();
    });
    form.addEventListener('change', function (e) {
      clearFieldError(e.target);
      syncChoices();
      saveDraft();
    });

    var why = $('f-why');
    if (why) why.addEventListener('input', updateWordCount);

    var retry = $('sat-retry');
    if (retry) retry.addEventListener('click', function () { show('screen-form'); });

    restoreDraft();
    syncChoices();
    updateWordCount();
    renderStep();
  }

  function renderStep(doScroll) {
    all('.sat-step').forEach(function (el) {
      el.hidden = parseInt(el.getAttribute('data-step'), 10) !== step;
    });

    var names = ['About you', 'What you do', 'Why you'];
    $('sat-step-tag').textContent = 'Step ' + step + ' · ' + names[step - 1];
    $('sat-step-counter').textContent = step + ' of ' + TOTAL_STEPS;
    $('sat-progress-bar').style.width = ((step / TOTAL_STEPS) * 100) + '%';

    $('sat-prev').hidden = step === 1;
    $('sat-next').hidden = step === TOTAL_STEPS;
    $('sat-submit').hidden = step !== TOTAL_STEPS;

    // Only when the user actively moves between steps — never on the initial
    // render, which would otherwise yank a freshly-loaded page straight down
    // to the form instead of leaving them at the top.
    if (doScroll) {
      var card = $('sat-form-card');
      if (card) {
        var top = card.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.5) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────
  var RULES = {
    1: [
      { id: 'f-name', msg: 'Please tell us your name.', test: function (v) { return v.trim().length >= 2; } },
      { id: 'f-age', msg: 'Please select your age group.', test: function (v) { return !!v; } },
      {
        id: 'f-whatsapp',
        msg: 'Please enter a WhatsApp number we can reach you on.',
        // Digits only after stripping spaces, dashes and a leading +, so
        // 0320 430 7432 and +92 320 4307432 both pass.
        test: function (v) { return v.replace(/[\s\-()+]/g, '').length >= 10; },
      },
      {
        id: 'f-email',
        msg: 'That email address does not look right.',
        optional: true,
        test: function (v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
      },
    ],
    2: [
      { id: 'f-occupation', msg: 'Please tell us what you do.', test: function (v) { return v.trim().length >= 2; } },
      { radio: 'describes_you', msg: 'Please pick the one that fits you best.' },
    ],
    3: [
      {
        id: 'f-why',
        msg: 'A line or two is enough — we do read these.',
        test: function (v) { return v.trim().length >= 15; },
      },
      { radio: 'sounds_like', msg: 'Please choose the statement closest to you.' },
    ],
  };

  function validateStep(n) {
    var ok = true;
    (RULES[n] || []).forEach(function (rule) {
      if (rule.radio) {
        if (!checkedValue(rule.radio)) { setRadioError(rule.radio, rule.msg); ok = false; }
        return;
      }
      var el = $(rule.id);
      if (!el) return;
      if (!rule.test(el.value)) { setFieldError(el, rule.msg); ok = false; }
    });
    if (!ok) showFormError('Please fix the highlighted answers.');
    return ok;
  }

  function setFieldError(el, message) {
    var field = el.closest('.sat-field');
    if (field) field.classList.add('has-error');
    var box = document.querySelector('.sat-error[data-for="' + el.id + '"]');
    if (box) { box.textContent = message; box.classList.add('is-on'); }
  }

  function setRadioError(name, message) {
    var box = document.querySelector('.sat-error[data-for="' + name + '"]');
    if (box) { box.textContent = message; box.classList.add('is-on'); }
  }

  function clearFieldError(el) {
    if (!el) return;
    var key = el.type === 'radio' ? el.name : el.id;
    var field = el.closest && el.closest('.sat-field');
    if (field) field.classList.remove('has-error');
    var box = document.querySelector('.sat-error[data-for="' + key + '"]');
    if (box) box.classList.remove('is-on');
  }

  function checkedValue(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  /** The visible selected state lives on the label, not the hidden radio. */
  function syncChoices() {
    all('.sat-choice').forEach(function (label) {
      var input = label.querySelector('input');
      label.classList.toggle('is-selected', !!(input && input.checked));
    });
  }

  function updateWordCount() {
    var why = $('f-why');
    var out = $('sat-why-count');
    if (!why || !out) return;
    var words = why.value.trim() ? why.value.trim().split(/\s+/).length : 0;
    out.textContent = words + (words === 1 ? ' word' : ' words');
  }

  function showFormError(message) {
    var box = $('sat-form-error');
    box.textContent = message;
    box.hidden = false;
  }

  function hideFormError() { $('sat-form-error').hidden = true; }

  function show(id) {
    all('.sat-screen').forEach(function (s) { s.classList.toggle('is-active', s.id === id); });
    var apply = $('apply');
    if (apply) apply.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Draft ──────────────────────────────────────────────────────────────
  // Phones lose pages to backgrounding and stray taps. Losing three steps of
  // typed answers is the fastest way to lose an applicant.
  var DRAFT_MAP = {
    full_name: 'f-name', age: 'f-age', whatsapp: 'f-whatsapp', instagram: 'f-instagram',
    email: 'f-email', occupation: 'f-occupation', institute: 'f-institute',
    why: 'f-why', anything_else: 'f-else',
  };

  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collect())); } catch (e) { /* private mode */ }
  }

  function restoreDraft() {
    var draft = {};
    try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return; }
    if (!draft || typeof draft !== 'object') return;

    for (var key in DRAFT_MAP) {
      if (draft[key]) {
        var el = $(DRAFT_MAP[key]);
        if (el) el.value = draft[key];
      }
    }
    checkRadio('describes_you', draft.describes_you);
    checkRadio('sounds_like', draft.sounds_like);
  }

  function checkRadio(name, value) {
    if (!value) return;
    var el = document.querySelector('input[name="' + name + '"][value="' + cssEscape(value) + '"]');
    if (el) el.checked = true;
  }

  /** Draft values come back from localStorage, so quote them before they go
      into a selector — a stray quote would otherwise throw. */
  function cssEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function clearDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  function collect() {
    return {
      full_name: val('f-name'),
      age: val('f-age'),
      whatsapp: val('f-whatsapp'),
      instagram: val('f-instagram'),
      email: val('f-email'),
      occupation: val('f-occupation'),
      institute: val('f-institute'),
      describes_you: checkedValue('describes_you'),
      why: val('f-why'),
      sounds_like: checkedValue('sounds_like'),
      anything_else: val('f-else'),
      session: sessionLabel(),
      source: sourceTag(),
    };
  }

  function val(id) {
    var el = $(id);
    return el ? el.value.trim() : '';
  }

  /** Which Saturday they applied for, read off the page so the notification
      email says "Think on Your Feet — 16 Aug" without a second config. */
  function sessionLabel() {
    var title = $('sat-session-title');
    var date = $('sat-session-date');
    return [(title && title.textContent) || '', (date && date.textContent) || '']
      .filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  /** Where the click came from, so ad spend stays attributable. */
  function sourceTag() {
    var params = new URLSearchParams(window.location.search);
    return (params.get('utm_source') || params.get('source') || 'saturdays-page').slice(0, 60);
  }

  function onSubmit(e) {
    e.preventDefault();
    // Re-check every step: someone can reach step 3 and then clear step 1.
    for (var n = 1; n <= TOTAL_STEPS; n++) {
      if (!validateStep(n)) {
        step = n;
        renderStep();
        return;
      }
    }
    submit();
  }

  function submit() {
    if (submitting) return;
    submitting = true;
    show('screen-sending');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        submitting = false;
        if (!res.ok) {
          fail(res.data.message || 'Please check your answers and try again.');
          return;
        }
        clearDraft();
        track('SaturdayApplication');
        show('screen-done');
      })
      .catch(function () {
        submitting = false;
        fail('We could not reach our server. Check your connection and try again.');
      });
  }

  function fail(message) {
    $('sat-error-message').textContent = message;
    show('screen-error');
    submitting = false;
  }

  /** Analytics is optional on every page here — never let it break a form. */
  function track(event) {
    try { if (window.slTrack) window.slTrack('saturday_apply'); } catch (e) {}
    try { if (window.fbq) { window.fbq('trackCustom', event); window.fbq('track', 'Lead'); } } catch (e) {}
    try { if (window.dataLayer) window.dataLayer.push({ event: 'speaklab_' + event }); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
