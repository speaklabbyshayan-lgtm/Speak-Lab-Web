/*
 * SpeakLab — Community notification bell (navbar)
 * ------------------------------------------------------------------
 * Drop-in: add <script defer src="community-bell.js"></script> to any page.
 * Injects a bell icon into .nav-right that links to community.html and shows a
 * red badge with the number of posts created since the visitor last opened the
 * community page (tracked in localStorage, so it works for visitors and logged-in
 * users alike). Visiting community.html clears the badge.
 *
 * Styles are injected here (not in style.css) so the bell always renders
 * correctly regardless of CSS caching, and so it can override the mobile
 * `.nav-right a { display:none }` rule.
 */
(function () {
  'use strict';

  var LAST_VISIT_KEY = 'speaklab_community_last_visit';

  function onCommunityPage() {
    return /\/community(?:\.html)?$/i.test(location.pathname);
  }

  function injectStyles() {
    if (document.getElementById('slab-bell-style')) return;
    var css = [
      '.slab-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;',
        'width:40px;height:40px;border-radius:50%;color:var(--text-main,#111);cursor:pointer;',
        'text-decoration:none;transition:background .2s ease,opacity .2s ease;}',
      // beat the mobile `.nav-right a{display:none}` rule (higher specificity + !important)
      '.nav-right a.slab-bell,a.slab-bell{display:inline-flex !important;}',
      '.slab-bell:hover{background:rgba(0,0,0,0.06);opacity:1;}',
      '.slab-bell svg{width:22px;height:22px;display:block;}',
      '.slab-bell-badge{position:absolute;top:1px;right:1px;min-width:18px;height:18px;padding:0 5px;',
        'box-sizing:border-box;border-radius:999px;background:#e11d48;color:#fff;',
        'font-family:"Outfit",system-ui,sans-serif;font-size:0.66rem;font-weight:800;line-height:1;',
        'align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff;}',
      '.slab-bell-badge.pulse{animation:slabBellPulse 1.6s ease-in-out infinite;}',
      '@keyframes slabBellPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 2px #fff,0 0 0 0 rgba(225,29,72,.55);}',
        '50%{transform:scale(1.14);box-shadow:0 0 0 2px #fff,0 0 0 6px rgba(225,29,72,0);}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'slab-bell-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  var BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

  function build() {
    var navRight = document.querySelector('.nav-right');
    if (!navRight || document.getElementById('slab-bell')) return null;
    injectStyles();

    var bell = document.createElement('a');
    bell.id = 'slab-bell';
    bell.className = 'slab-bell';
    bell.href = 'community.html';
    bell.setAttribute('aria-label', 'SpeakLab Community — notifications');
    bell.innerHTML = BELL_SVG +
      '<span class="slab-bell-badge" id="slab-bell-badge" style="display:none">0</span>';

    // Sit just left of the primary action button (GET STARTED / ENROLL) when present.
    var action = navRight.querySelector('.donate-btn');
    if (action) navRight.insertBefore(bell, action);
    else navRight.insertBefore(bell, navRight.firstChild);
    return bell;
  }

  function showBadge(count) {
    var badge = document.getElementById('slab-bell-badge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'flex';
    badge.classList.add('pulse');
  }

  function refresh() {
    // On the community page itself: mark visited, clear the badge, stop.
    if (onCommunityPage()) {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch (e) {}
      var badge = document.getElementById('slab-bell-badge');
      if (badge) { badge.style.display = 'none'; badge.classList.remove('pulse'); }
      return;
    }

    var sb = window.supabaseClient;
    if (!sb) return; // no backend on this page → bell still links, just no live count

    var last = null;
    try { last = localStorage.getItem(LAST_VISIT_KEY); } catch (e) {}
    var since = last ? new Date(last) : new Date(0);

    sb.from('community_posts')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', since.toISOString())
      .then(function (res) {
        if (res.error) { console.warn('[bell]', res.error.message); return; }
        var count = res.count || 0;
        if (count > 0) showBadge(count);
      })
      .catch(function () { /* offline / table missing → silently skip */ });
  }

  function boot() {
    if (!build()) return;
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
