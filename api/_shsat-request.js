'use strict';
const MAX_BODY = 4096;
const PROD_ORIGINS = ['https://www.ivypathacademy.com', 'https://ivypathacademy.com'];
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;
function header(req, name) {
  const h = req && req.headers ? req.headers[name] : undefined;
  return Array.isArray(h) ? h[0] : h;
}

function originAllowed(origin, env) {
  if (origin === undefined) return true; // no Origin header: not a cross-site browser request
  if (typeof origin !== 'string') return false;
  if (PROD_ORIGINS.indexOf(origin) !== -1) return true;
  const dev = !env.VERCEL_ENV || env.VERCEL_ENV === 'development';
  return dev && LOCAL_ORIGIN.test(origin);
}

// First x-forwarded-for entry (Vercel sets it), else the socket. '' when it is not an IP.
function clientIp(req) {
  const xff = header(req, 'x-forwarded-for');
  let ip = xff ? String(xff).split(',')[0].trim() : '';
  if (!ip) ip = String(header(req, 'x-real-ip') || (req.socket && req.socket.remoteAddress) || '').trim();
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip : '';
}

const TOO_LARGE = { tooLarge: true };
const INVALID = { invalid: true };

function readStream(req) {
  return new Promise((resolve) => {
    // On Vercel, a missing or unknown Content-Type leaves req.body undefined after the platform
    // has already read the stream; waiting for 'end' again would hang until the function times out.
    if (!req || typeof req.on !== 'function' || req.readableEnded) return resolve(INVALID);
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c) => {
      if (settled) return; // keep draining, ignore the rest
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(String(c));
      size += buf.length;
      if (size > MAX_BODY) return finish(TOO_LARGE);
      chunks.push(buf);
    });
    req.on('end', () => finish(Buffer.concat(chunks)));
    req.on('error', () => finish(INVALID));
  });
}

// The parsed JSON value, TOO_LARGE or INVALID.
async function readBody(req) {
  const declared = Number(header(req, 'content-length'));
  if (declared > MAX_BODY) return TOO_LARGE;
  let raw;
  try {
    raw = req.body; // Vercel parses it lazily and throws on invalid JSON
  } catch (e) {
    return INVALID;
  }
  if (raw === undefined) raw = await readStream(req);
  if (raw === TOO_LARGE || raw === INVALID) return raw;
  let size;
  if (Buffer.isBuffer(raw)) size = raw.length;
  else if (typeof raw === 'string') size = Buffer.byteLength(raw);
  else {
    try { size = Buffer.byteLength(JSON.stringify(raw) || ''); } catch (e) { return INVALID; }
  }
  if (size > MAX_BODY) return TOO_LARGE;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return INVALID; }
  }
  return raw === null ? INVALID : raw;
}


module.exports = { header, originAllowed, clientIp, readBody, TOO_LARGE, INVALID };
