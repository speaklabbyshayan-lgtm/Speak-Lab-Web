// Google Maps JavaScript API key for the commute widget on venue.html.
//
// Get one at console.cloud.google.com → APIs & Services → Credentials, with
// billing enabled and these APIs turned on: Maps JavaScript API, Places API,
// Directions API. Then restrict the key to your domain (HTTP referrers:
// https://www.speaklabbyshayan.com/*) — like the Supabase anon key in
// supabase-config.js, this key is meant to run in the browser and isn't a
// secret, but an unrestricted key can rack up billing if someone else uses it.
//
// Leave this blank to ship safely: the widget stays hidden and the static
// map link keeps working, same pattern as the GA4/Pixel IDs in analytics.js.
window.GOOGLE_MAPS_API_KEY = '';
