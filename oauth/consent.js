export function portalConsentHandoff(value) {
  const ids = new URL(value).searchParams.getAll('authorization_id');
  if (ids.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(ids[0])) throw Error('Invalid authorization request');
  // Carry only the opaque request ID. Never transfer credentials, codes, state,
  // client-provided destinations or an authentication session across origins.
  return 'https://app.ivypathacademy.com/oauth/consent?' + new URLSearchParams({authorization_id: ids[0]});
}
if (typeof document !== 'undefined') {
  try { location.replace(portalConsentHandoff(location.href)); }
  catch { document.getElementById('status').textContent = 'Open this page from your agent’s OAuth connection request. Return to ChatGPT and reconnect.'; }
}
