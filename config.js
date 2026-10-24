// Jo-CHF settings for the website.
// API_URL empty  → DEMO mode: runs fully in the browser with invented patients (nothing is sent anywhere).
// API_URL filled → LIVE mode: real accounts and data on the Cloudflare backend.
window.JOCHF_CONFIG = {
  API_URL: 'https://jo-chf-api.aymankatwa.workers.dev',
  // Show the "Explore the demo" button on the sign-in page even in live mode.
  SHOW_DEMO_LINK: true,
};
