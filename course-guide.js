/**
 * SpeakLab — Course guide (course-details.html)
 *
 * Drives three things, all off one IntersectionObserver pattern:
 *   1. the guide character's speech bubble, which changes per week card
 *   2. the timeline rail that fills as you move through the weeks
 *   3. scroll reveals and the count-up numbers
 *
 * Written in the same ES5-flavoured style as level-test.js and apply.js so it
 * runs on the older Android browsers a lot of this traffic arrives on. No
 * dependencies — the page's CSP only allows self-hosted scripts anyway.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // IntersectionObserver is missing on some old Androids. Rather than leave the
  // page half-built, show everything immediately and skip the choreography.
  var canObserve = 'IntersectionObserver' in window;

  var coach  = document.querySelector('.sl-coach');
  var bubble = document.getElementById('sl-line');
  var weeks  = Array.prototype.slice.call(document.querySelectorAll('.sl-week'));
  var fill   = document.querySelector('.sl-rail-fill');

  var INTRO_LINE = bubble ? bubble.textContent : '';
  var talkTimer = null;

  // ── Voice ─────────────────────────────────────────────────────────────────
  // The browser's own speech synthesis: no audio files to host, no CDN, and
  // nothing for the CSP to block. It is a synthetic voice rather than a real
  // recording — swap speak() for an <audio> element per line if you record one.
  var synth = window.speechSynthesis || null;
  var soundBtn = document.getElementById('sl-sound');
  var soundLabel = document.getElementById('sl-sound-label');
  var voiceOn = false;

  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    // Prefer a natural-sounding English voice, then any English one.
    for (var i = 0; i < voices.length; i++) {
      if (/en[-_](GB|US|IN)/i.test(voices[i].lang) && /natural|google|premium/i.test(voices[i].name)) return voices[i];
    }
    for (var j = 0; j < voices.length; j++) {
      if (/^en/i.test(voices[j].lang)) return voices[j];
    }
    return null;
  }

  /**
   * Speak a line, and drive the mouth from the speech itself rather than a
   * fixed timer — so the mouth stops exactly when the sentence does.
   */
  function speak(line) {
    if (!synth || !voiceOn || !line) return false;

    synth.cancel(); // never let two lines overlap
    var utterance = new SpeechSynthesisUtterance(line);
    var voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice ? voice.lang : 'en-GB';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = function () { if (coach) coach.classList.add('is-talking'); };
    utterance.onend = function () { if (coach) coach.classList.remove('is-talking'); };
    utterance.onerror = function () { if (coach) coach.classList.remove('is-talking'); };

    synth.speak(utterance);
    return true;
  }

  function setupSound() {
    // No speech support (older Android WebViews, some in-app browsers) — leave
    // the button hidden rather than offering a control that does nothing.
    if (!synth || !soundBtn || typeof window.SpeechSynthesisUtterance !== 'function') return;

    soundBtn.hidden = false;

    soundBtn.addEventListener('click', function () {
      voiceOn = !voiceOn;
      soundBtn.classList.toggle('is-on', voiceOn);
      soundBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
      soundBtn.firstElementChild.textContent = voiceOn ? '🔊' : '🔈';
      if (soundLabel) soundLabel.textContent = voiceOn ? 'Voice on' : 'Turn on voice';

      if (voiceOn) {
        // The click is the user gesture browsers require before audio, so read
        // the line that is on screen right now.
        speak(bubble ? bubble.textContent : INTRO_LINE);
      } else {
        synth.cancel();
        if (coach) coach.classList.remove('is-talking');
      }
    });

    // Chrome populates getVoices() asynchronously.
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = pickVoice;
    }

    // Leaving the page mid-sentence otherwise keeps talking in some browsers.
    window.addEventListener('pagehide', function () { synth.cancel(); });
  }

  // ── The bubble ────────────────────────────────────────────────────────────
  /** Fade the old line out, swap the text, fade in, and move the mouth. */
  function say(line) {
    if (!bubble || line === bubble.textContent) return;

    if (reduceMotion) {
      bubble.textContent = line;
      speak(line);
      return;
    }

    bubble.classList.add('is-swapping');
    window.setTimeout(function () {
      bubble.textContent = line;
      bubble.classList.remove('is-swapping');
      // When the voice is on it drives the mouth itself, and for exactly the
      // right length; the timer version is only for the silent case.
      if (!speak(line)) talk();
    }, 220);
  }

  /** Mouth moves for roughly as long as the line would take to say. */
  function talk() {
    if (!coach || reduceMotion) return;
    coach.classList.add('is-talking');
    window.clearTimeout(talkTimer);
    talkTimer = window.setTimeout(function () {
      coach.classList.remove('is-talking');
    }, 1400);
  }

  // ── Weeks: activate the nearest one and fill the rail ─────────────────────
  function activate(index) {
    weeks.forEach(function (el, i) {
      el.classList.toggle('is-active', i === index);
    });

    var line = weeks[index] && weeks[index].getAttribute('data-line');
    say(line || INTRO_LINE);

    if (fill && weeks.length) {
      // Fill to the middle of the active card, so the line always points at
      // what the guide is currently talking about.
      var last = weeks[weeks.length - 1];
      var total = last.offsetTop + last.offsetHeight - weeks[0].offsetTop;
      var upto = weeks[index].offsetTop - weeks[0].offsetTop + weeks[index].offsetHeight / 2;
      fill.style.height = total > 0 ? Math.min(100, (upto / total) * 100) + '%' : '0';
    }
  }

  function setupWeeks() {
    if (!weeks.length) return;

    if (!canObserve) {
      weeks.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    // Reveal each card once, on the way in.
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });

    // Separately, track which card is nearest the middle of the screen — that
    // is the one the guide should be talking about. A plain "is it visible"
    // test would fire for two cards at once on a tall screen.
    var activeObserver = new IntersectionObserver(function () {
      var middle = window.innerHeight / 2;
      var best = -1;
      var bestDistance = Infinity;

      weeks.forEach(function (el, i) {
        var box = el.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return;
        var distance = Math.abs(box.top + box.height / 2 - middle);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      });

      if (best >= 0) activate(best);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

    weeks.forEach(function (el) {
      revealObserver.observe(el);
      activeObserver.observe(el);
    });
  }

  // ── Count-up numbers ──────────────────────────────────────────────────────
  function countUp(el) {
    var target = Number(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';

    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }

    var duration = 1100;
    var started = null;

    function step(now) {
      if (started === null) started = now;
      var progress = Math.min(1, (now - started) / duration);
      // Ease-out, so it decelerates into the final number instead of stopping dead.
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  }

  function setupCounters() {
    var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!counters.length) return;

    if (!canObserve) {
      counters.forEach(countUp);
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          countUp(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) { observer.observe(el); });
  }

  // ── Generic reveals for the existing cards further down the page ──────────
  function setupReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.sl-reveal'));
    if (!items.length) return;

    if (!canObserve) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    items.forEach(function (el) { observer.observe(el); });
  }

  function init() {
    setupSound();
    setupWeeks();
    setupCounters();
    setupReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
