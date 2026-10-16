'use strict';
const crypto = require('node:crypto');
const LOCK = "SELECT pg_advisory_xact_lock(180774, 1)";

// pool is an existing approved least-privilege pg Pool, never a browser client.
// No env lookup, connection, SQL application or provider call at module load.
function createStore(pool, secret) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('server_secret_required');
  const encKey = Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), 'shsat-intake/encryption/v1', 32));
  function key(purpose, value) { return crypto.createHmac('sha256', secret).update(purpose + '\0' + value).digest('hex'); }
  function seal(value) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), bytes].map(x => x.toString('base64url')).join('.');
  }
  function open(value) {
    const [iv, tag, bytes] = value.split('.').map(x => Buffer.from(x, 'base64url'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(bytes), cipher.final()]).toString());
  }
  async function tx(fn) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); await c.query(LOCK); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; }
    finally { c.release(); }
  }
  function receipt(id, fingerprint) { return key('booking-receipt/v1', id + ':' + fingerprint); }
  async function reserve(value, ip) {
    const fingerprint = key('intake/v1', JSON.stringify({
      id:value.quiz_id, name:value.parent_name, email:value.parent_email,
      phone:value.phone, grade:value.student_grade, quiz:{role:value.quiz.role,
      version:value.quiz.version,targets:value.quiz.targets,prep:value.quiz.prep,
      practice_test:value.quiz.practice_test,worry:value.quiz.worry},
      purpose:value.purpose
    }));
    return tx(async c => {
      const prior=(await c.query('SELECT * FROM shsat_intake.intakes WHERE quiz_id=$1',[value.quiz_id])).rows[0];
      if(prior){
        if(prior.fingerprint!==fingerprint)return{error:'intake_conflict'};
        if(new Date(prior.expires_at)<=new Date((await c.query('SELECT clock_timestamp() AS now')).rows[0].now))return{error:'intake_expired'};
        return{value:open(prior.snapshot),receipt:receipt(value.quiz_id,fingerprint),replay:true};
      }
      const identities=[['booking-phone',value.phone,2,86400],['booking-ip',ip,5,3600]];
      for(const [label,raw,limit,seconds] of identities){
        const count=Number((await c.query("SELECT count(*) AS n FROM shsat_intake.reservations WHERE identity=$1 AND created_at>clock_timestamp()-($2 * interval '1 second')",[key(label,raw),seconds])).rows[0].n);
        if(count>=limit)return{error:'rate_limited'};
      }
      const token=receipt(value.quiz_id,fingerprint);
      await c.query('INSERT INTO shsat_intake.intakes(quiz_id,fingerprint,snapshot,receipt_hash) VALUES($1,$2,$3,$4)',[value.quiz_id,fingerprint,seal(value),key('receipt-lookup',token)]);
      for(const [label,raw] of identities)await c.query('INSERT INTO shsat_intake.reservations(quiz_id,identity) VALUES($1,$2)',[value.quiz_id,key(label,raw)]);
      return{value,receipt:token,replay:false};
    });
  }
  async function verify(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { ok:false };
    const r = (await pool.query('SELECT snapshot FROM shsat_intake.intakes WHERE receipt_hash=$1 AND expires_at>clock_timestamp()', [key('receipt-lookup',token)])).rows[0];
    return r ? { ok:true, value:open(r.snapshot) } : { ok:false };
  }
  async function reserveBooking(token, slot) {
    return tx(async c => {
      const hash = key('receipt-lookup',token);
      const live = (await c.query('SELECT quiz_id FROM shsat_intake.intakes WHERE receipt_hash=$1 AND expires_at>clock_timestamp()', [hash])).rows[0];
      if (!live) return { error:'verified_intake_required' };
      const prior = (await c.query('SELECT * FROM shsat_intake.bookings WHERE receipt_hash=$1', [hash])).rows[0];
      if (prior) return prior.slot !== slot ? { error:'booking_conflict' }
        : prior.state === 'accepted' ? { response:open(prior.response) } : { error:'booking_reconciliation_required' };
      if ((await c.query('SELECT 1 FROM shsat_intake.bookings WHERE slot=$1',[slot])).rowCount) return {error:'slot_taken'};
      const eventId = key('calendar-event',hash); // lowercase hex meets Google's base32hex event ID alphabet
      await c.query("INSERT INTO shsat_intake.bookings(receipt_hash,slot,event_id,state) VALUES($1,$2,$3,'pending')", [hash,slot,eventId]);
      return { eventId };
    });
  }
  async function finishBooking(token, result) {
    if (result && result.status >= 400) {
      const removed=await pool.query("DELETE FROM shsat_intake.bookings WHERE receipt_hash=$1 AND state='pending' AND event_payload IS NULL", [key('receipt-lookup',token)]);
      if (removed.rowCount===1) return;
    }
    const accepted = result && result.status === 200 && result.body && result.body.calendar === true;
    const updated=await pool.query("UPDATE shsat_intake.bookings SET state=$2,response=$3 WHERE receipt_hash=$1 AND state='pending'", [key('receipt-lookup',token),accepted?'accepted':'unknown',result?seal(result):null]);
    if(updated.rowCount!==1)throw new Error('booking_outcome_not_persisted');
  }
  async function saveBookingEvent(token,event) {
    const saved=await pool.query("UPDATE shsat_intake.bookings SET event_payload=$2 WHERE receipt_hash=$1 AND state='pending' AND event_payload IS NULL",[key('receipt-lookup',token),seal(event)]);
    if(saved.rowCount!==1)throw new Error('booking_event_not_persisted');
  }
  async function reconcileBooking(token,lookup) {
    // lookup is an authenticated read-only calendar adapter supplied by the
    // server. No HTTP/client evidence can enter this function.
    const hash=key('receipt-lookup',token);
    const r=(await pool.query('SELECT * FROM shsat_intake.bookings WHERE receipt_hash=$1',[hash])).rows[0];
    if (!r || r.state==='accepted' || !r.event_payload) return false;
    const expected=open(r.event_payload), actual=await lookup(r.event_id);
    const fields=['id','summary','description','attendees','extendedProperties'];
    function canonical(v) {
      if (Array.isArray(v)) return v.map(canonical);
      if (!v || typeof v!=='object') return v;
      return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
    }
    // Google may add responseStatus, displayName, htmlLink, timezone offsets,
    // etc. Require the exact fields we submitted, allowing only added fields.
    function contains(a,e) {
      if (Array.isArray(e)) return Array.isArray(a) && e.length===a.length && e.every((v,i)=>contains(a[i],v));
      if (e && typeof e==='object') return a && Object.keys(e).every(k=>contains(a[k],e[k]));
      return JSON.stringify(canonical(a))===JSON.stringify(canonical(e));
    }
    function instant(t) {
      if(!t || typeof t.dateTime!=='string')return NaN;
      if(/(?:Z|[+-]\d{2}:\d{2})$/.test(t.dateTime))return Date.parse(t.dateTime);
      const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(t.dateTime);
      return m && t.timeZone==='America/New_York'?require('../booking-slots').etToMs(+m[1],+m[2],+m[3],+m[4],+m[5]):NaN;
    }
    if (!actual || actual.status==='cancelled' || !fields.every(k=>contains(actual[k],expected[k])) || instant(actual.start)!==instant(expected.start) || instant(actual.end)!==instant(expected.end)) return false;
    const response={status:200,body:{ok:true,success:true,calendar:true,email:expected.attendees[0].email,date:r.slot.slice(0,10),time:r.slot.slice(11),meetLink:actual.hangoutLink||'',eventLink:actual.htmlLink||''}};
    await pool.query("UPDATE shsat_intake.bookings SET state='accepted',response=$2 WHERE receipt_hash=$1 AND state IN ('pending','unknown')",[hash,seal(response)]);
    return true;
  }
  async function reconcileByQuizId(quizId,lookup) {
    // Internal authenticated recovery only; never an HTTP/browser capability.
    const row=(await pool.query('SELECT fingerprint FROM shsat_intake.intakes WHERE quiz_id=$1',[quizId])).rows[0];
    return row ? reconcileBooking(receipt(quizId,row.fingerprint),lookup) : false;
  }
  return { reserve, verify, reserveBooking, finishBooking, saveBookingEvent, reconcileBooking, reconcileByQuizId };
}
module.exports = { createStore };
