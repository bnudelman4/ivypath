const { calendarClient, busyBetween, etOffsetIso } = require('./_calendar');

// GET /api/availability?from=YYYY-MM-DD&days=N  (N <= 21)
// Busy intervals on the info@ivypathacademy.com calendar, so the booking
// pickers can grey out slots that are already taken or that Vicente blocked by
// adding an event there. Returns only start/end times, never event details.
// Any failure answers 200 {busy:[], degraded:true}: the page then offers its
// plain hours and api/book-consultation.js still re-checks the exact slot.
const MAX_DAYS = 21;

function todayEt() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA formats as YYYY-MM-DD
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.query || {};
  const today = todayEt();
  let from = typeof query.from === 'string' && query.from ? query.from.trim() : today;
  let days = parseInt(query.days, 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  if (days > MAX_DAYS) days = MAX_DAYS;

  // Only a sane window: yesterday (a visitor just past midnight ET) through
  // ~3 months out. Keeps the cache keys, and the Google calls, bounded.
  const fromOk = /^\d{4}-\d{2}-\d{2}$/.test(from) && !isNaN(Date.parse(from + 'T00:00:00Z')) &&
    from >= addDays(today, -1) && from <= addDays(today, 90);
  if (!fromOk) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'from must be YYYY-MM-DD within the next 90 days', busy: [] });
  }

  const to = addDays(from, days);
  const timeMin = from + 'T00:00:00' + etOffsetIso(from);
  const timeMax = to + 'T00:00:00' + etOffsetIso(to);

  try {
    const calendar = calendarClient();
    const busy = await busyBetween(calendar, timeMin, timeMax, 4000);
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({ busy: busy, from: from, days: days });
  } catch (err) {
    console.error('Availability degraded:', err && err.message);
    // Do not let the edge cache an outage answer for a whole minute.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ busy: [], degraded: true });
  }
};
