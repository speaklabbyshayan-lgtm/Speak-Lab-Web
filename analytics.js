/**
 * SpeakLab analytics.
 *
 * The site sells 20 seats a batch off paid traffic, but had no analytics at
 * all — so there was no way to tell where an enrollment came from beyond the
 * self-reported "how did you hear about us" dropdown. Vercel Speed Insights
 * measures page speed, not funnels.
 *
 * ── SETUP ────────────────────────────────────────────────────────────────
 * Paste your IDs below. Until they are filled in, nothing loads and nothing
 * is sent — the tracking calls all no-op safely, so shipping this without
 * IDs is harmless.
 *
 *   GA4:        analytics.google.com → Admin → Data Streams → "G-XXXXXXXXXX"
 *   Meta Pixel: business.facebook.com → Events Manager → Data Sources
 */
const ANALYTICS = {
  GA4_ID: 'G-K83DWRBSRF',
  PIXEL_ID: '2246859136132897',
};

(function () {
  'use strict';

  // Guard against the script being included twice on one page: a second copy
  // would bind a second click listener and double-count every conversion.
  if (window.__slAnalyticsLoaded) return;
  window.__slAnalyticsLoaded = true;

  const WA_NUMBER = '923014497532';
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');

  // ── Loaders ────────────────────────────────────────────────────────────
  if (ANALYTICS.GA4_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS.GA4_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ANALYTICS.GA4_ID);
  }

  if (ANALYTICS.PIXEL_ID) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', ANALYTICS.PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  /**
   * Fire one event to whichever providers are configured.
   * Safe to call before/without setup — it simply does nothing.
   */
  function track(event, params = {}) {
    const payload = { page, ...params };
    if (window.gtag) window.gtag('event', event, payload);
    if (window.fbq) window.fbq('trackCustom', event, payload);
    if (!ANALYTICS.GA4_ID && !ANALYTICS.PIXEL_ID) {
      console.debug('[analytics: not configured]', event, payload);
    }
  }
  window.slTrack = track;

  // ── WhatsApp: the last measurable step before money ─────────────────────
  // Payment is collected off-platform over WhatsApp, so this click is the
  // closest thing the site has to a checkout. Two jobs:
  //   1. track it, so paid traffic can be attributed to real conversations;
  //   2. prefill the message with the page it came from, so an inbound chat
  //      says what the person was looking at.
  const CONTEXT = {
    index: 'Hi! I saw the SpeakLab homepage and want to know more about the July batch.',
    'course-details': 'Hi! I was reading the SpeakLab course details and have a question.',
    enroll: 'Hi! I was enrolling for SpeakLab and need help with my registration.',
    'trial-classes': 'Hi! I want to book my 3 Free Trial Classes at SpeakLab.',
    'thank-you': 'Hi! I just registered for SpeakLab and want to confirm my payment.',
    'level-test': 'Hi! I just took the SpeakLab level test and want to discuss my result.',
    'ai-tutor': 'Hi! I was using Sara AI on SpeakLab and want to ask about the course.',
    faq: 'Hi! I read the SpeakLab FAQ and still have a question.',
    venue: 'Hi! I have a question about the SpeakLab venue and directions.',
    contact: 'Hi! I would like to know more about SpeakLab.',
    about: 'Hi! I would like to know more about SpeakLab and Sir Shayan.',
  };

  function waUrl() {
    const msg = CONTEXT[page] || 'Hi! I would like to know more about SpeakLab.';
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  function isWaTarget(el) {
    const href = el.getAttribute && el.getAttribute('href');
    const onclick = el.getAttribute && el.getAttribute('onclick');
    return (
      (href && href.includes(`wa.me/${WA_NUMBER}`)) ||
      (onclick && onclick.includes(`wa.me/${WA_NUMBER}`))
    );
  }

  let enhanced = false;
  function enhanceWhatsApp() {
    if (enhanced) return;
    enhanced = true;
    const url = waUrl();

    document.querySelectorAll('a[href], [onclick]').forEach((el) => {
      if (!isWaTarget(el)) return;

      // Only rewrite links that have no message of their own.
      const href = el.getAttribute('href');
      if (href && href.includes(`wa.me/${WA_NUMBER}`) && !href.includes('text=')) {
        el.setAttribute('href', url);
      }

      const onclick = el.getAttribute('onclick');
      if (onclick && onclick.includes(`wa.me/${WA_NUMBER}`) && !onclick.includes('text=')) {
        el.setAttribute('onclick', onclick.replace(`https://wa.me/${WA_NUMBER}`, url));
      }
    });

    // Delegated, so it covers links rendered later too.
    document.addEventListener('click', (e) => {
      const el = e.target.closest('a[href], button[onclick], [onclick]');
      if (!el || !isWaTarget(el)) return;

      const label = (el.textContent || '').trim().slice(0, 40) ||
        (el.className.includes('floating') ? 'floating-button' : 'unlabelled');

      track('whatsapp_click', { cta: label });
      if (window.fbq) window.fbq('track', 'Contact');
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceWhatsApp);
  } else {
    enhanceWhatsApp();
  }
})();
