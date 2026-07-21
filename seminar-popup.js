/*
 * SpeakLab — Free Seminar Popup
 * Self-contained overlay. Injects its own styles + markup so it never touches
 * a page's existing layout. Appears 4s after load, once per calendar day
 * (localStorage: speaklab_seminar_shown = YYYY-MM-DD).
 *
 * To change the seminar details, edit the CONFIG block below.
 */
(function () {
  'use strict';

  var CONFIG = {
    delayMs: 4000,
    storageKey: 'speaklab_seminar_shown',
    whatsappNumber: '923014497532',
    whatsappText: 'I want to register for the free seminar on 28th July',
    badge: '🔥 LIMITED SEATS',
    overline: '🎤 FREE SEMINAR — LAHORE',
    title: 'Speak With Confidence',
    subtitle: 'Free English Communication Seminar',
    details: [
      { icon: '📅', label: 'Date', value: '28th July, 2026' },
      { icon: '📍', label: 'Venue', value: 'Lahore (details shared on WhatsApp)' },
      { icon: '💰', label: 'Cost', value: 'Absolutely FREE' },
      { icon: '🪑', label: 'Seats', value: 'Limited — Register Now!' }
    ]
  };

  // ---- Once-per-day guard -------------------------------------------------
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  var shownOn;
  try { shownOn = window.localStorage.getItem(CONFIG.storageKey); } catch (e) { shownOn = null; }
  if (shownOn === todayKey()) return; // already shown today

  // ---- Styles (theme-matched: navy/teal/gold, Outfit, dark #0b0e1a) -------
  var css = '' +
    '.slab-seminar-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;' +
      'background:rgba(11,14,26,0.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);' +
      'opacity:0;transition:opacity .35s ease;font-family:"Outfit",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}' +
    '.slab-seminar-overlay.slab-open{opacity:1;}' +
    '.slab-seminar-card{position:relative;width:100%;max-width:440px;background:#ffffff;border-radius:26px;' +
      'padding:38px 32px 30px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.45);' +
      'transform:translateY(16px) scale(.96);opacity:0;transition:transform .4s cubic-bezier(.2,.8,.2,1),opacity .4s ease;' +
      'max-height:92vh;overflow-y:auto;}' +
    '.slab-seminar-overlay.slab-open .slab-seminar-card{transform:translateY(0) scale(1);opacity:1;}' +
    '.slab-seminar-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(90deg,#1e3a8a,#0f766e,#d97706);' +
      'color:#fff;font-weight:700;font-size:.66rem;letter-spacing:.12em;padding:6px 14px;border-radius:999px;text-transform:uppercase;' +
      'box-shadow:0 6px 16px rgba(217,118,6,0.28);}' +
    '.slab-seminar-overline{margin:18px 0 6px;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;}' +
    '.slab-seminar-title{margin:0;font-size:2rem;line-height:1.1;font-weight:800;letter-spacing:-.02em;' +
      'background:linear-gradient(90deg,#1e3a8a 0%,#0f766e 50%,#d97706 100%);-webkit-background-clip:text;background-clip:text;' +
      '-webkit-text-fill-color:transparent;}' +
    '.slab-seminar-sub{margin:8px 0 22px;font-size:.98rem;color:#555;font-weight:500;}' +
    '.slab-seminar-details{list-style:none;margin:0 0 26px;padding:20px;text-align:left;background:#f6f7fb;border-radius:16px;' +
      'border:1px solid #eceef5;}' +
    '.slab-seminar-details li{display:flex;align-items:flex-start;gap:10px;font-size:.94rem;color:#222;line-height:1.4;}' +
    '.slab-seminar-details li+li{margin-top:12px;}' +
    '.slab-seminar-details .slab-ic{flex-shrink:0;font-size:1.05rem;line-height:1.3;}' +
    '.slab-seminar-details b{color:#1e3a8a;font-weight:700;}' +
    '.slab-seminar-actions{display:flex;flex-direction:column;gap:12px;}' +
    '.slab-seminar-wa{display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:15px 20px;' +
      'background:#0b0e1a;color:#fff;font-weight:700;font-size:.92rem;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;' +
      'border-radius:999px;border:2px solid transparent;background-image:linear-gradient(#0b0e1a,#0b0e1a),linear-gradient(90deg,#1e3a8a,#0f766e,#d97706);' +
      'background-origin:border-box;background-clip:padding-box,border-box;transition:transform .18s ease,box-shadow .18s ease;}' +
    '.slab-seminar-wa:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(15,118,110,0.32);}' +
    '.slab-seminar-later{background:none;border:none;color:#777;font-size:.9rem;font-weight:600;cursor:pointer;padding:6px;' +
      'font-family:inherit;transition:color .2s ease;}' +
    '.slab-seminar-later:hover{color:#1e3a8a;text-decoration:underline;}' +
    '.slab-seminar-close{position:absolute;top:14px;right:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;' +
      'background:#f0f1f6;border:none;border-radius:50%;color:#333;font-size:1.15rem;line-height:1;cursor:pointer;' +
      'transition:background .2s ease;}' +
    '.slab-seminar-close:hover{background:#e2e4ee;}' +
    '@media (max-width:480px){.slab-seminar-card{padding:34px 22px 26px;border-radius:22px;}' +
      '.slab-seminar-title{font-size:1.6rem;}.slab-seminar-details{padding:16px;}}';

  // ---- Build the WhatsApp URL --------------------------------------------
  var waHref = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(CONFIG.whatsappText);

  var detailsHtml = CONFIG.details.map(function (d) {
    return '<li><span class="slab-ic">' + d.icon + '</span><span><b>' + d.label + ':</b> ' + d.value + '</span></li>';
  }).join('');

  // ---- Show ---------------------------------------------------------------
  function show() {
    if (document.getElementById('slab-seminar-overlay')) return;

    var style = document.createElement('style');
    style.id = 'slab-seminar-style';
    style.textContent = css;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'slab-seminar-overlay';
    overlay.id = 'slab-seminar-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'slab-seminar-title');
    overlay.innerHTML =
      '<div class="slab-seminar-card">' +
        '<button class="slab-seminar-close" type="button" aria-label="Close">&times;</button>' +
        '<span class="slab-seminar-badge">' + CONFIG.badge + '</span>' +
        '<p class="slab-seminar-overline">' + CONFIG.overline + '</p>' +
        '<h2 class="slab-seminar-title" id="slab-seminar-title">' + CONFIG.title + '</h2>' +
        '<p class="slab-seminar-sub">' + CONFIG.subtitle + '</p>' +
        '<ul class="slab-seminar-details">' + detailsHtml + '</ul>' +
        '<div class="slab-seminar-actions">' +
          '<a class="slab-seminar-wa" href="' + waHref + '" target="_blank" rel="noopener">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.6.8.6-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3c-.8-1.3-1.3-2.8-1.3-4.3C3.5 7.3 7.3 3.5 12 3.5S20.5 7.3 20.5 12 16.7 20.2 12 20.2z"/></svg>' +
            'Register on WhatsApp</a>' +
          '<button class="slab-seminar-later" type="button">Maybe Later</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // trigger transition
    requestAnimationFrame(function () { overlay.classList.add('slab-open'); });

    function close() {
      overlay.classList.remove('slab-open');
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 380);
    }

    function onKey(e) { if (e.key === 'Escape' || e.keyCode === 27) close(); }

    overlay.querySelector('.slab-seminar-close').addEventListener('click', close);
    overlay.querySelector('.slab-seminar-later').addEventListener('click', close);
    // Clicking the WhatsApp button also counts as done — let it close the popup.
    overlay.querySelector('.slab-seminar-wa').addEventListener('click', function () { setTimeout(close, 100); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    // Mark as shown for today, regardless of how it is dismissed.
    try { window.localStorage.setItem(CONFIG.storageKey, todayKey()); } catch (e) {}
  }

  function schedule() { setTimeout(show, CONFIG.delayMs); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
