// Shared Google Calendar plumbing for api/book-consultation.js and
// api/availability.js. The leading underscore keeps Vercel from deploying this
// file as its own function.
const { google } = require('googleapis');

// The service account's domain-wide delegation only allows these two scopes
// (calendar.readonly and calendar.freebusy are refused with
// unauthorized_client), so free/busy reads use the same pair as the insert.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Calendar client acting as info@ivypathacademy.com (or GOOGLE_CALENDAR_SUBJECT)
// via domain-wide delegation. Throws when the key is missing or unparseable.
function calendarClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not configured');
  }
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT || 'info@ivypathacademy.com';
  const auth = new google.auth.JWT({
    email: serviceAccountKey.client_email,
    key: serviceAccountKey.private_key,
    scopes: SCOPES,
    subject: subject,
  });
  return google.calendar({ version: 'v3', auth });
}

// Busy intervals [{start, end}] (ISO strings) on the subject's primary calendar
// between two instants. Throws on any failure, including a per-calendar error
// inside an otherwise successful response and a timeout, so callers decide
// what "we could not tell" means for them.
async function busyBetween(calendar, timeMin, timeMax, timeoutMs) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('free/busy timed out after ' + timeoutMs + 'ms')), timeoutMs);
  });
  try {
    const result = await Promise.race([
      calendar.freebusy.query({
        requestBody: { timeMin: timeMin, timeMax: timeMax, items: [{ id: 'primary' }] },
      }),
      timeout,
    ]);
    const cal = result && result.data && result.data.calendars && result.data.calendars.primary;
    if (!cal) throw new Error('free/busy response had no primary calendar');
    if (cal.errors && cal.errors.length) {
      throw new Error('free/busy calendar error: ' + cal.errors.map((e) => e.reason || e.domain).join(', '));
    }
    return (cal.busy || []).map((b) => ({ start: b.start, end: b.end }));
  } finally {
    clearTimeout(timer);
  }
}

// Half-open overlap test on ISO strings (a block ending at 7:00 does not clash
// with a slot starting at 7:00).
function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = Date.parse(aStart), ae = Date.parse(aEnd), bs = Date.parse(bStart), be = Date.parse(bEnd);
  if ([as, ae, bs, be].some(isNaN)) return false;
  return as < be && bs < ae;
}

// America/New_York UTC offset for a calendar date, as "-04:00" / "-05:00".
// Probed at 12:00 UTC (7-8 AM ET), after the 2 AM DST switch, so it is right
// for every consultation slot on that date without needing a tz library.
function etOffsetIso(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(probe);
    const tz = (parts.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT-5';
    const mm = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!mm) return '-05:00';
    return mm[1] + String(mm[2]).padStart(2, '0') + ':' + (mm[3] || '00');
  } catch (e) {
    return '-05:00';
  }
}

module.exports = { calendarClient, busyBetween, overlaps, etOffsetIso };
