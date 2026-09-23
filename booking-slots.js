/* Booking slot rules shared by book.html, cn-book.html and consulting.html.

   Every rule is decided in America/New_York, whatever the visitor's own time
   zone is: the consultation hours, what counts as "today", the 3-hour minimum
   lead time, and the busy intervals from /api/availability (the info@
   calendar's free/busy, so an event on that calendar blocks the slot).

   Plain JS, no build step. The same file loads in node (module.exports) so the
   rules are unit-tested with fixed dates, including the DST change. */
(function (root) {
  var TZ = 'America/New_York';
  var LEAD_MINUTES = 180; // never offer a slot that starts less than 3 hours from now
  var AVAILABILITY_DAYS = 21;

  // Consultation hours, Eastern Time: weekdays 5:00 PM to 11:00 PM, weekends 10:00 AM to 10:00 PM.
  var WEEKDAY_TIMES = ['5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM','10:00 PM','10:30 PM'];
  var WEEKEND_TIMES = ['10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM','4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM'];

  var fmt = null;
  // ET wall clock of an instant: { year, month (1-12), day, hour (0-23), minute, second }.
  function etParts(ms) {
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    var out = {};
    var pm = null;
    fmt.formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type === 'dayPeriod') pm = /p/i.test(p.value);
      else if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
    });
    if (out.hour === 24) out.hour = 0; // older engines print midnight as 24
    // Engines without hourCycle support (Safari 12 and older) ignore it and
    // print en-US's 12-hour clock plus AM/PM; fold that back into 0-23.
    if (pm !== null) out.hour = out.hour % 12 + (pm ? 12 : 0);
    return out;
  }

  // ET's UTC offset at an instant, in ms (-4h in EDT, -5h in EST).
  function etOffsetMs(ms) {
    var whole = Math.floor(ms / 1000) * 1000;
    var p = etParts(whole);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
  }

  // The instant of an ET wall-clock time (month is 1-12). Two passes so a date
  // on the other side of a DST change from "now" still gets its own offset.
  function etToMs(y, m, d, h, min) {
    var guess = Date.UTC(y, m - 1, d, h, min);
    var first = guess - etOffsetMs(guess);
    return guess - etOffsetMs(first);
  }

  // "5:30 PM" -> 1050 (minutes after midnight).
  function slotMinutes(label) {
    var m = String(label).match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return NaN;
    return (parseInt(m[1], 10) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + parseInt(m[2], 10);
  }

  // Weekday of a calendar date, independent of any time zone.
  function timesFor(y, m, d) {
    var dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return (dow === 0 || dow === 6) ? WEEKEND_TIMES : WEEKDAY_TIMES;
  }

  function etToday(now) {
    var p = etParts(typeof now === 'number' ? now : Date.now());
    return { y: p.year, m: p.month, d: p.day };
  }

  // -1 / 0 / 1 comparing calendar date y-m-d with ET today.
  function compareToEtToday(y, m, d, now) {
    var t = etToday(now);
    var a = y * 10000 + m * 100 + d;
    var b = t.y * 10000 + t.m * 100 + t.d;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function ymd(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Half-open overlap: a slot ending exactly when a busy block starts is free.
  function overlapsBusy(startMs, endMs, busy) {
    for (var i = 0; i < (busy || []).length; i++) {
      var bs = Date.parse(busy[i].start);
      var be = Date.parse(busy[i].end);
      if (isNaN(bs) || isNaN(be)) continue;
      if (startMs < be && bs < endMs) return true;
    }
    return false;
  }

  // Busy intervals known to the page: the last /api/availability answer plus
  // any slot this visitor was just told is taken (so it disappears at once,
  // even if the refreshed answer is still cached at the edge).
  var fetchedBusy = [];
  var takenBusy = [];
  function currentBusy() { return fetchedBusy.concat(takenBusy); }

  // Slot labels a visitor may pick on ET calendar date y-m-d (month 1-12).
  // opts: { durationMinutes (default 15), now (ms, default Date.now()), busy (default: what the page loaded) }
  function openSlots(y, m, d, opts) {
    opts = opts || {};
    var now = typeof opts.now === 'number' ? opts.now : Date.now();
    var dur = (opts.durationMinutes || 15) * 60000;
    var busy = opts.busy || currentBusy();
    var earliest = now + LEAD_MINUTES * 60000;
    return timesFor(y, m, d).filter(function (label) {
      var mins = slotMinutes(label);
      var start = etToMs(y, m, d, Math.floor(mins / 60), mins % 60);
      return start >= earliest && !overlapsBusy(start, start + dur, busy);
    });
  }

  // Remember a slot the server just refused (409 slot_taken).
  function markTaken(y, m, d, label, durationMinutes) {
    var mins = slotMinutes(label);
    if (isNaN(mins)) return;
    var start = etToMs(y, m, d, Math.floor(mins / 60), mins % 60);
    takenBusy.push({
      start: new Date(start).toISOString(),
      end: new Date(start + (durationMinutes || 15) * 60000).toISOString()
    });
  }

  // Fetch the info@ calendar's busy intervals once. Any failure leaves the page
  // on its plain hours (the server re-checks free/busy before every booking).
  // fresh=true bypasses the 60-second edge cache, for the refresh after a 409.
  function loadAvailability(fresh, done) {
    if (typeof done !== 'function') done = function () {};
    try {
      var t = etToday();
      var url = '/api/availability?from=' + ymd(t.y, t.m, t.d) + '&days=' + AVAILABILITY_DAYS + (fresh ? '&fresh=' + Date.now() : '');
      fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : { busy: [] }; })
        .then(function (data) {
          if (data && Array.isArray(data.busy)) fetchedBusy = data.busy;
          done();
        })
        .catch(function () { done(); });
    } catch (e) { done(); }
  }

  var api = {
    TZ: TZ,
    LEAD_MINUTES: LEAD_MINUTES,
    WEEKDAY_TIMES: WEEKDAY_TIMES,
    WEEKEND_TIMES: WEEKEND_TIMES,
    etParts: etParts,
    etToMs: etToMs,
    etToday: etToday,
    compareToEtToday: compareToEtToday,
    slotMinutes: slotMinutes,
    timesFor: timesFor,
    ymd: ymd,
    overlapsBusy: overlapsBusy,
    openSlots: openSlots,
    markTaken: markTaken,
    loadAvailability: loadAvailability
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IvpSlots = api;
})(typeof window !== 'undefined' ? window : this);
