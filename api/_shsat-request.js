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

// Only the Vercel-owned single client-IP header in an actual deployment.
// Source: https://vercel.com/docs/headers/request-headers . Direct Node/dev,
// custom proxy chains, malformed/duplicate headers and socket fallbacks fail
// closed. Local fixtures inject their own server-only resolver explicitly.
function clientIp(req, env=process.env) {
  if(env.VERCEL!=='1' || !['production','preview'].includes(env.VERCEL_ENV))return '';
  const raw=req?.headers?.['x-vercel-forwarded-for'];
  if(typeof raw!=='string' || raw!==raw.trim() || raw.includes('%') || !require('node:net').isIP(raw))return '';
  if(require('node:net').isIP(raw)===4)return raw;
  const canonical=new URL('http://['+raw+']/').hostname.slice(1,-1);
  const mapped=/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if(mapped){const n=(parseInt(mapped[1],16)*65536)+parseInt(mapped[2],16);return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
  return canonical;
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
