/**
 * Live classes + recordings for the student portal.
 *
 * What this replaces: a single "JOIN ACTIVE ZOOM CLASS" button whose href was
 * filled in only while a meeting happened to be running, and which silently did
 * nothing the rest of the time. There was no schedule anywhere, so a student
 * had no way to know when class was.
 *
 * Now: the schedule comes from public.live_classes (RLS shows a student only
 * their own batch, and only if they have paid), the join door opens 15 minutes
 * early, and the meeting runs inside this page through the Zoom Meeting SDK —
 * with a link out to the Zoom app for the browsers the SDK cannot support.
 */
(function () {
  'use strict';

  // Bump both halves together when upgrading — the path repeats the version.
  const ZOOM_SDK_VERSION = '3.13.2';
  const ZOOM_SDK_SRC = `https://source.zoom.us/${ZOOM_SDK_VERSION}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`;

  // Must match EARLY_JOIN_MINUTES / LATE_JOIN_MINUTES in api/zoom-signature.js.
  // These only decide what the button looks like; the endpoint is the gate.
  const EARLY_JOIN_MS = 15 * 60 * 1000;
  const LATE_JOIN_MS  = 30 * 60 * 1000;

  const TZ = 'Asia/Karachi';
  const TICK_MS = 30_000;

  const state = {
    classes: [],
    isPaid: false,
    joining: false,
    inMeeting: false,
    zoomClient: null,
    sdkPromise: null,
  };

  // ── Small helpers ────────────────────────────────────────────────────────

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    // textContent throughout: topics come from Zoom and from the admin form,
    // and the old innerHTML template rendered them as markup.
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatWhen(date) {
    return date.toLocaleString('en-US', {
      timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const days  = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins  = Math.floor((total % 3600) / 60);

    if (days > 0)  return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0)  return `${mins}m`;
    return 'less than a minute';
  }

  /**
   * The Meeting SDK does not run on iOS (any browser there is Safari
   * underneath) and needs WebAssembly everywhere else. Where it cannot run,
   * the Zoom app link stops being a fallback and becomes the only way in.
   */
  function embedSupported() {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return !iOS && typeof WebAssembly === 'object';
  }

  function classPhase(cls, now) {
    if (cls.status === 'cancelled') return 'cancelled';

    const start  = new Date(cls.starts_at).getTime();
    const end    = start + (Number(cls.duration_minutes) || 90) * 60_000;
    const opens  = start - EARLY_JOIN_MS;
    const closes = end + LATE_JOIN_MS;

    if (now < opens)   return 'upcoming';
    if (now <= closes) return 'joinable';
    return 'past';
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  async function requireSession() {
    if (!window.supabaseClient) return null;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      window.location.replace('login.html?redirect=live-class.html');
      return null;
    }
    return session;
  }

  async function loadClasses() {
    const sb = window.supabaseClient;

    // Distinguishes "nothing scheduled yet" from "you have not enrolled" —
    // RLS returns an empty list for both, and they need different messages.
    try {
      const { data: paid } = await sb.rpc('is_paid_student');
      state.isPaid = paid === true;
    } catch (e) {
      console.warn('Paid check failed:', e.message);
    }

    // Yesterday onwards: a class that just ended should stay visible for a
    // while rather than vanish the moment it finishes.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb
      .from('live_classes')
      .select('id, topic, description, batch, starts_at, duration_minutes, status, zoom_join_url')
      .gte('starts_at', since)
      .order('starts_at', { ascending: true });

    if (error) throw error;
    state.classes = data || [];
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function renderAll() {
    // Re-rendering under a student mid-join would tear out the button they
    // just pressed.
    if (state.joining || state.inMeeting) return;
    renderNextClass();
    renderClassList();
  }

  function renderNextClass() {
    const card = document.getElementById('next-class-card');
    if (!card) return;
    card.innerHTML = '';

    const now = Date.now();
    const live = state.classes.find((c) => classPhase(c, now) === 'joinable');
    const next = state.classes.find((c) => classPhase(c, now) === 'upcoming');
    const cls  = live || next;

    if (!cls) {
      card.appendChild(el('div', 'next-class-label', 'No class scheduled'));
      card.appendChild(el('div', 'next-class-topic',
        state.isPaid ? 'Nothing on the calendar yet' : 'Enrol to unlock your classes'));
      card.appendChild(el('div', 'next-class-when',
        state.isPaid
          ? 'Your teacher has not scheduled the next session. Check back soon.'
          : 'Live classes and recordings are for enrolled students.'));
      if (!state.isPaid) {
        const cta = el('a', 'lock-cta', 'Enrol now');
        cta.href = 'enroll.html';
        card.appendChild(cta);
      }
      return;
    }

    const label = el('div', 'next-class-label');
    if (live) {
      label.appendChild(el('span', 'live-dot'));
      label.appendChild(document.createTextNode('Live now'));
    } else {
      label.textContent = 'Next class';
    }
    card.appendChild(label);

    card.appendChild(el('div', 'next-class-topic', cls.topic));

    const starts = new Date(cls.starts_at);
    card.appendChild(el('div', 'next-class-when',
      live ? formatWhen(starts) : `${formatWhen(starts)} · starts in ${formatCountdown(starts.getTime() - now)}`));

    card.appendChild(buildActions(cls, live ? 'joinable' : 'upcoming', now));
  }

  function renderClassList() {
    const grid = document.getElementById('classes-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!state.classes.length) {
      grid.appendChild(emptyState(
        state.isPaid ? 'No classes scheduled' : 'Classes are for enrolled students',
        state.isPaid
          ? 'Your upcoming sessions will appear here as soon as your teacher schedules them.'
          : 'Complete your enrollment to see your class schedule and join live sessions.',
        state.isPaid ? null : { href: 'enroll.html', text: 'Enrol now' }
      ));
      return;
    }

    const now = Date.now();
    state.classes.forEach((cls) => {
      const phase = classPhase(cls, now);
      const card = el('div', `class-card${phase === 'joinable' ? ' is-joinable' : ''}${phase === 'past' ? ' is-past' : ''}`);

      const badgeText = {
        joinable:  'Live now',
        upcoming:  'Upcoming',
        past:      'Finished',
        cancelled: 'Cancelled',
      }[phase];
      card.appendChild(el('span', `class-badge ${phase === 'joinable' ? 'live' : phase === 'cancelled' ? 'cancelled' : ''}`, badgeText));

      card.appendChild(el('div', 'class-title', cls.topic));

      const starts = new Date(cls.starts_at);
      card.appendChild(el('div', 'class-when',
        `${formatWhen(starts)} · ${cls.duration_minutes || 90} mins`));

      if (cls.description) card.appendChild(el('div', 'class-desc', cls.description));

      card.appendChild(buildActions(cls, phase, now));
      grid.appendChild(card);
    });
  }

  function buildActions(cls, phase, now) {
    const wrap = el('div', 'class-actions');
    const btn = el('button', 'join-btn');
    btn.type = 'button';
    btn.dataset.classId = cls.id;

    if (phase === 'cancelled') {
      btn.textContent = 'Cancelled';
      btn.disabled = true;
    } else if (phase === 'past') {
      btn.textContent = 'Class finished';
      btn.disabled = true;
    } else if (phase === 'upcoming') {
      const opensIn = new Date(cls.starts_at).getTime() - EARLY_JOIN_MS - now;
      btn.textContent = `Opens in ${formatCountdown(opensIn)}`;
      btn.disabled = true;
    } else if (!embedSupported() && cls.zoom_join_url) {
      // Nothing to gain from a button that will fail: send them straight out.
      const link = el('a', 'join-btn is-live', 'Open in Zoom app');
      link.href = cls.zoom_join_url;
      link.target = '_blank';
      link.rel = 'noopener';
      wrap.appendChild(link);
      return wrap;
    } else {
      btn.textContent = 'Join now';
      btn.classList.add('is-live');
    }

    wrap.appendChild(btn);

    if (cls.zoom_join_url && phase === 'joinable') {
      const fallback = el('a', 'zoom-fallback', 'Trouble joining? Open in the Zoom app');
      fallback.href = cls.zoom_join_url;
      fallback.target = '_blank';
      fallback.rel = 'noopener';
      wrap.appendChild(fallback);
    }

    return wrap;
  }

  function emptyState(title, body, cta) {
    const wrap = el('div', 'empty-state');
    wrap.appendChild(el('h3', null, title));
    wrap.appendChild(el('p', null, body));
    if (cta) {
      const link = el('a', 'lock-cta', cta.text);
      link.href = cta.href;
      wrap.appendChild(link);
    }
    return wrap;
  }

  // ── Joining ──────────────────────────────────────────────────────────────

  function loadZoomSdk() {
    if (window.ZoomMtgEmbedded) return Promise.resolve();
    if (state.sdkPromise) return state.sdkPromise;

    state.sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ZOOM_SDK_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        state.sdkPromise = null;
        reject(new Error('Could not load the Zoom player.'));
      };
      document.head.appendChild(script);
    });
    return state.sdkPromise;
  }

  async function joinClass(classId, btn) {
    if (state.joining) return;

    const cls = state.classes.find((c) => c.id === classId);
    if (!cls) return;

    state.joining = true;
    const originalLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    clearError(btn);

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        window.location.replace('login.html?redirect=live-class.html');
        return;
      }

      const res = await fetch('/api/zoom-signature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ classId }),
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.location.replace('login.html?redirect=live-class.html');
        return;
      }
      if (!res.ok || !payload.success) {
        throw new Error(payload.message || 'Could not join this class right now.');
      }

      await openMeeting(cls, payload);
    } catch (err) {
      console.error('Join failed:', err);
      showError(btn, err.message, cls.zoom_join_url);
      if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
    } finally {
      state.joining = false;
    }
  }

  async function openMeeting(cls, payload) {
    const overlay = document.getElementById('zoom-overlay');
    const root    = document.getElementById('zoom-app-root');
    const status  = document.getElementById('zoom-status');
    const title   = document.getElementById('zoom-overlay-title');

    title.textContent = cls.topic;
    overlay.hidden = false;
    state.inMeeting = true;
    status.textContent = 'Loading the Zoom player…';

    try {
      await loadZoomSdk();
      status.textContent = 'Connecting to your class…';

      const client = window.ZoomMtgEmbedded.createClient();
      state.zoomClient = client;

      // Component View needs an explicit size; fill the overlay minus its bar.
      const width  = Math.min(window.innerWidth - 24, 1280);
      const height = Math.max(360, window.innerHeight - 110);

      await client.init({
        zoomAppRoot: root,
        language: 'en-US',
        patchJsMedia: true,
        customize: {
          video: {
            isResizable: true,
            viewSizes: { default: { width, height }, ribbon: { width: 300, height: 700 } },
          },
        },
      });

      await client.join({
        sdkKey:        payload.sdkKey,
        signature:     payload.signature,
        meetingNumber: payload.meetingNumber,
        password:      payload.passcode || '',
        userName:      payload.userName || 'SpeakLab Student',
        userEmail:     payload.userEmail || '',
      });

      status.hidden = true;
    } catch (err) {
      console.error('Zoom SDK failed:', err);
      state.inMeeting = false;
      status.hidden = false;
      status.innerHTML = '';
      status.appendChild(el('p', null, 'The in-page player could not start on this browser.'));
      if (cls.zoom_join_url) {
        const link = el('a', null, 'Open this class in the Zoom app instead →');
        link.href = cls.zoom_join_url;
        link.target = '_blank';
        link.rel = 'noopener';
        status.appendChild(link);
      }
    }
  }

  function leaveMeeting() {
    try {
      if (state.zoomClient) state.zoomClient.leaveMeeting();
    } catch (e) {
      console.warn('Leave failed:', e.message);
    }
    // The SDK does not reliably survive a second init in the same document,
    // and a reload also refreshes the schedule. Cheapest correct exit.
    window.location.reload();
  }

  function showError(btn, message, joinUrl) {
    const wrap = btn && btn.parentElement;
    if (!wrap) return;
    clearError(btn);

    const err = el('div', 'class-error', message);
    if (joinUrl) {
      err.appendChild(document.createElement('br'));
      const link = el('a', null, 'Open in the Zoom app instead →');
      link.href = joinUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      err.appendChild(link);
    }
    wrap.appendChild(err);
  }

  function clearError(btn) {
    const wrap = btn && btn.parentElement;
    if (!wrap) return;
    wrap.querySelectorAll('.class-error').forEach((n) => n.remove());
  }

  // ── Recordings (unchanged feed, safer rendering) ──────────────────────────

  async function loadRecordings(session) {
    const grid = document.getElementById('recordings-grid');

    const res = await fetch('/api/zoom-recordings', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 401) {
      window.location.replace('login.html?redirect=live-class.html');
      return;
    }

    const data = await res.json().catch(() => ({}));

    // 403 means signed in but not enrolled. Bouncing them to login would just
    // loop them back here.
    if (res.status === 403) {
      grid.innerHTML = '';
      grid.appendChild(emptyState(
        'Recordings are for enrolled students',
        data.message || 'Complete your enrollment to watch past classes.',
        { href: 'enroll.html', text: 'Enrol now' }
      ));
      return;
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch recordings');
    }

    grid.innerHTML = '';

    if (!data.recordings || !data.recordings.length) {
      grid.appendChild(emptyState('No recordings yet',
        'Recordings appear here a little while after each class ends.'));
      return;
    }

    data.recordings.forEach((rec) => {
      const card = el('div', 'recording-card');

      const thumbLink = el('a', 'recording-thumbnail');
      thumbLink.href = rec.play_url;
      thumbLink.target = '_blank';
      thumbLink.rel = 'noopener';

      const img = document.createElement('img');
      img.src = rec.thumbnail_url || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=600&auto=format&fit=crop';
      img.alt = rec.topic;
      img.loading = 'lazy';
      thumbLink.appendChild(img);

      const play = el('div', 'play-icon');
      play.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      thumbLink.appendChild(play);
      card.appendChild(thumbLink);

      const info = el('div', 'recording-info');
      info.appendChild(el('span', 'recording-date', new Date(rec.start_time).toLocaleDateString('en-US', {
        timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })));
      info.appendChild(el('h3', 'recording-title', rec.topic));

      const meta = el('div', 'recording-meta');
      meta.appendChild(el('span', 'duration-tag', `${rec.duration} mins`));
      const watch = el('a', 'watch-btn', 'Watch Now →');
      watch.href = rec.play_url;
      watch.target = '_blank';
      watch.rel = 'noopener';
      meta.appendChild(watch);
      info.appendChild(meta);

      // Normally the link carries the passcode itself. When Zoom does not
      // supply one to embed, showing it beats sending the student to a
      // password prompt with nothing to type.
      if (rec.passcode) {
        const hint = el('div', 'recording-passcode');
        hint.appendChild(el('span', null, 'Passcode: '));
        hint.appendChild(el('code', null, rec.passcode));
        info.appendChild(hint);
      }

      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  async function boot() {
    document.getElementById('classes-grid')
      ?.addEventListener('click', (e) => {
        const btn = e.target.closest('.join-btn');
        if (btn && btn.dataset.classId) joinClass(btn.dataset.classId, btn);
      });

    document.getElementById('next-class-card')
      ?.addEventListener('click', (e) => {
        const btn = e.target.closest('.join-btn');
        if (btn && btn.dataset.classId) joinClass(btn.dataset.classId, btn);
      });

    document.getElementById('zoom-leave-btn')
      ?.addEventListener('click', leaveMeeting);

    const session = await requireSession();
    if (!session) return;

    // The two feeds are independent — a Zoom outage on recordings must not
    // take the class schedule down with it.
    await Promise.allSettled([
      (async () => {
        try {
          await loadClasses();
          renderAll();
        } catch (err) {
          console.error('Classes failed:', err);
          const grid = document.getElementById('classes-grid');
          grid.innerHTML = '';
          grid.appendChild(emptyState('Could not load your schedule', err.message || 'Please refresh and try again.'));
        }
      })(),
      (async () => {
        try {
          await loadRecordings(session);
        } catch (err) {
          console.error('Recordings failed:', err);
          const grid = document.getElementById('recordings-grid');
          grid.innerHTML = '';
          grid.appendChild(emptyState('Could not load recordings', err.message || 'Please check back later.'));
        }
      })(),
    ]);

    // Keeps the countdowns honest and flips "Opens in 1m" to "Join now"
    // without the student having to refresh.
    setInterval(renderAll, TICK_MS);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
