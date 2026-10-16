/* Local E2E harness for /shsat/quiz (spec 8.2). No `vercel dev`, no project
   linking, no real env, no network beyond 127.0.0.1.

   - Serves the repo root the way the Vercel project does (outputDirectory
     "."): vercel.json redirects, then the filesystem, then rewrites, with the
     vercel.json headers matched on the request path. Paths covered by
     .vercelignore (or .gitignore, since deploys come from git) are not
     served, so /docs/... and /tests/... are 404 here as they are on Vercel
     (AC10).
   - Mounts api/quiz-lead.js (the real handler) with RESEND_API_KEY=test,
     QUIZ_RESEND_URL pointing at a local Resend stub, QUIZ_ALERT_TO set to a
     reserved example.com address, and VERCEL_ENV unset (so the
     http://127.0.0.1 Origin is allowed, as in development). The stub records
     every email body for assertions and answers { id } like Resend.
   - Every other /api/* path is 404: the tests stub /api/book-consultation and
     /api/availability with page.route, as the spec asks.
   - Each request to the quiz function gets its own x-forwarded-for address, as
     Vercel sets one per client. The per-IP limits are unit-tested
     (tests/quiz-lead-api.test.js); here they would only make parallel tests
     depend on each other. The per-phone limit still applies, so the tests use
     a fresh phone number per run (GET /__e2e/seq).

   Test-only endpoints (never part of the site):
     GET /__e2e/health            200 once the server and the stub listen
     GET /__e2e/seq               { seq }, a fresh integer per call
     GET /__e2e/emails?email=x    recorded emails whose to or reply_to is x
     GET /__e2e/base?file=f       f as it was before this PR (see baseRef below)

   Run: node tests/e2e/server.js   (E2E_PORT, default 4317) */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.E2E_PORT || 4317);
const VERBOSE = process.env.E2E_VERBOSE === '1';

// ---------------------------------------------------------------------------
// Vercel config (vercel.json + .vercelignore)
// ---------------------------------------------------------------------------

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// The path-to-regexp subset vercel.json uses here: literal paths, "(.*)" groups
// and ":name" segments. Matching is exact, so "/shsat" does not match "/shsat/"
// (live behavior: /shsat/ is a 404, which is why 1.3 adds the "/shsat/quiz/" entry).
function sourceToRegex(src) {
  let re = '';
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('(.*)', i)) { re += '(.*)'; i += 4; continue; }
    const m = /^:([A-Za-z_]\w*)(\*)?/.exec(src.slice(i));
    if (m) { re += m[2] ? '(.*)' : '([^/]+)'; i += m[0].length; continue; }
    re += src[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + re + '$');
}

const REDIRECTS = (vercel.redirects || []).map((r) => ({ re: sourceToRegex(r.source), to: r.destination, permanent: !!r.permanent }));
const REWRITES = (vercel.rewrites || []).map((r) => ({ re: sourceToRegex(r.source), to: r.destination }));
const HEADERS = (vercel.headers || []).map((h) => ({ re: sourceToRegex(h.source), headers: h.headers || [] }));

// .vercelignore, with gitignore semantics for the patterns it uses: a leading
// "/" anchors to the root, a trailing "/" means a directory, a pattern with a
// "/" inside is anchored, anything else matches any path segment.
function globToRegex(g) {
  return new RegExp('^' + g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
}
// .gitignore too: the site deploys from git, so an ignored file (node_modules,
// .env) never exists on Vercel.
function readIgnore(name) {
  try { return fs.readFileSync(path.join(ROOT, name), 'utf8'); } catch (e) { return ''; }
}
const IGNORE = (readIgnore('.vercelignore') + '\n' + readIgnore('.gitignore'))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && l[0] !== '#')
  .map((raw) => {
    let p = raw;
    const dir = p.endsWith('/');
    if (dir) p = p.slice(0, -1);
    const anchored = p.startsWith('/') || p.indexOf('/') !== -1;
    if (p.startsWith('/')) p = p.slice(1);
    return { re: globToRegex(p), dir, anchored };
  });

function ignored(rel) {
  const parts = rel.split('/');
  for (const rule of IGNORE) {
    if (rule.anchored) {
      // Match the pattern against every leading run of segments.
      for (let n = 1; n <= parts.length; n++) {
        const head = parts.slice(0, n).join('/');
        if (rule.re.test(head) && (!rule.dir || n < parts.length || isDir(rel))) return true;
      }
    } else {
      for (let n = 0; n < parts.length; n++) {
        if (rule.re.test(parts[n]) && (!rule.dir || n < parts.length - 1 || isDir(rel))) return true;
      }
    }
  }
  return false;
}

function isDir(rel) {
  try { return fs.statSync(path.join(ROOT, rel)).isDirectory(); } catch (e) { return false; }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
};

// The file a URL path names on disk, or null. Never leaves ROOT, never serves
// dotfiles or ignored paths.
function fileFor(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { return null; }
  rel = rel.replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (rel.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) return null;
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  if (ignored(rel)) return null;
  try {
    if (fs.statSync(abs).isFile()) return abs;
  } catch (e) {}
  return null;
}

function applyHeaders(res, urlPath) {
  for (const rule of HEADERS) {
    if (!rule.re.test(urlPath)) continue;
    for (const h of rule.headers) res.setHeader(h.key, h.value);
  }
}

// ---------------------------------------------------------------------------
// Resend stub (records every email; answers like Resend)
// ---------------------------------------------------------------------------

const emails = [];
let emailSeq = 0;

function startResendStub() {
  return new Promise((resolve) => {
    const stub = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        if (req.method !== 'POST' || req.url !== '/emails') {
          res.statusCode = 404;
          return res.end('{}');
        }
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = null; }
        const id = 'e2e_' + (++emailSeq);
        emails.push({ id, at: Date.now(), authorization: req.headers.authorization || '', body });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id }));
      });
    });
    stub.listen(0, HOST, () => resolve(stub));
  });
}

function emailMatches(e, who) {
  if (!e.body || !who) return false;
  const to = Array.isArray(e.body.to) ? e.body.to : [e.body.to];
  const all = to.concat([e.body.reply_to]).filter(Boolean).map((x) => String(x).toLowerCase());
  return all.indexOf(who) !== -1;
}

// ---------------------------------------------------------------------------
// "Before this PR" versions of files, for the /shsat regression (8.2 flow 13)
// ---------------------------------------------------------------------------

// The parent of the oldest commit that added the quiz link to /shsat, or HEAD
// while the change is still uncommitted. Stays correct after the orchestrator
// commits and after the PR merges.
function baseRef() {
  if (process.env.E2E_BASE_REF) return process.env.E2E_BASE_REF;
  try {
    const out = execFileSync('git', ['log', '--reverse', '--format=%H', '-S', 'js-quiz-cta', '--', 'shsat-diagnostic.html'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (out) return out.split('\n')[0] + '^';
  } catch (e) {}
  return 'HEAD';
}

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

let quizLead = null;
let ipSeq = 0;   // x-forwarded-for addresses for the quiz function
let runSeq = 0;  // /__e2e/seq

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function serveFile(req, res, abs, urlPath) {
  applyHeaders(res, urlPath);
  res.setHeader('Content-Type', TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache');
  res.statusCode = 200;
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

function notFound(res, urlPath) {
  applyHeaders(res, urlPath);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404: NOT_FOUND');
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
  const p = url.pathname;

  // Test-only control endpoints.
  if (p.startsWith('/__e2e/')) {
    if (p === '/__e2e/health') return sendJson(res, 200, { ok: true });
    if (p === '/__e2e/seq') return sendJson(res, 200, { seq: ++runSeq });
    if (p === '/__e2e/emails') {
      const who = String(url.searchParams.get('email') || '').toLowerCase();
      return sendJson(res, 200, { emails: who ? emails.filter((e) => emailMatches(e, who)) : emails });
    }
    if (p === '/__e2e/base') {
      const file = String(url.searchParams.get('file') || '');
      if (!/^[\w.-]+\.html$/.test(file)) return sendJson(res, 400, { ok: false });
      const ref = baseRef();
      try {
        const html = execFileSync('git', ['show', ref + ':' + file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
        res.setHeader('X-E2E-Base-Ref', ref);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(html);
      } catch (e) {
        return sendJson(res, 404, { ok: false });
      }
    }
    return sendJson(res, 404, { ok: false });
  }

  // 1. Redirects (vercel.json), query string kept.
  for (const r of REDIRECTS) {
    if (!r.re.test(p)) continue;
    res.statusCode = r.permanent ? 308 : 307;
    res.setHeader('Location', r.to + url.search);
    return res.end();
  }

  // 2. Functions. Only the quiz function is mounted; the rest is stubbed per test.
  if (p === '/api' || p.startsWith('/api/')) {
    if (p === '/api/quiz-lead') {
      req.headers['x-forwarded-for'] = '10.0.' + ((ipSeq >> 8) & 255) + '.' + (ipSeq & 255);
      ipSeq++;
      return quizLead(req, res);
    }
    return sendJson(res, 404, { ok: false, error: 'not mounted in the E2E harness' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end();
  }

  // 3. Filesystem, then 4. rewrites.
  const direct = fileFor(p);
  if (direct) return serveFile(req, res, direct, p);
  for (const r of REWRITES) {
    if (!r.re.test(p)) continue;
    const target = fileFor(r.to);
    if (target) return serveFile(req, res, target, p);
  }
  return notFound(res, p);
}

async function main() {
  const stub = await startResendStub();
  const stubUrl = 'http://' + HOST + ':' + stub.address().port + '/emails';

  // Env for api/quiz-lead.js: a fake key, the local stub, no Vercel env.
  process.env.RESEND_API_KEY = 'test';
  process.env.QUIZ_RESEND_URL = stubUrl;
  process.env.QUIZ_ALERT_TO = 'ops-e2e@example.com';
  delete process.env.VERCEL_ENV;
  delete process.env.QUIZ_ALERT_DRY_RUN;
  if (!/^http:\/\/127\.0\.0\.1:\d+\/emails$/.test(process.env.QUIZ_RESEND_URL)) {
    throw new Error('refusing to start: QUIZ_RESEND_URL must be the local stub');
  }
  if (!VERBOSE) {
    // The handler logs one line per request (no PII). Keep the Playwright output readable.
    const quiet = (orig) => function () {
      const first = String(arguments[0] || '');
      if (/^quiz-lead[ :]/.test(first)) return;
      return orig.apply(console, arguments);
    };
    console.log = quiet(console.log);
    console.error = quiet(console.error);
  }
  quizLead = require(path.join(ROOT, 'api', 'quiz-lead.js'));

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      process.stderr.write('e2e server error: ' + (err && err.stack ? err.stack : err) + '\n');
      if (!res.headersSent) sendJson(res, 500, { ok: false });
      else res.end();
    });
  });
  server.listen(PORT, HOST, () => {
    process.stdout.write('e2e harness on http://' + HOST + ':' + PORT + ' (Resend stub ' + stubUrl + ')\n');
  });
  const stop = () => { server.close(); stub.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
