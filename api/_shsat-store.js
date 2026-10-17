'use strict';
const crypto = require('node:crypto');
const {buildRelayPayload,eventInstant}=require('./_shsat-relay');
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
  function fingerprintFor(value) {
    return key('intake/v1', JSON.stringify({
      id:value.quiz_id, name:value.parent_name, email:value.parent_email,
      phone:value.phone, grade:value.student_grade, quiz:{role:value.quiz.role,
      version:value.quiz.version,targets:value.quiz.targets,prep:value.quiz.prep,
      practice_test:value.quiz.practice_test,worry:value.quiz.worry},
      purpose:value.purpose
    }));
  }
  async function lookupBooking(value, slot) {
    const prior=(await pool.query('SELECT * FROM shsat_intake.intakes WHERE quiz_id=$1',[value.quiz_id])).rows[0];
    if (!prior) return null;
    if (prior.fingerprint!==fingerprintFor(value)) return {error:'intake_conflict'};
    const booking=(await pool.query('SELECT * FROM shsat_intake.bookings WHERE receipt_hash=$1',[prior.receipt_hash])).rows[0];
    if (!booking) return null;
    if (booking.slot!==slot) return {error:'booking_conflict'};
    return booking.state==='accepted' ? {response:open(booking.response)} : {error:'booking_reconciliation_required'};
  }
  async function reserve(value, ip) {
    const fingerprint=fingerprintFor(value);
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
  async function reserveBooking(token, slot, ip) {
    return tx(async c => {
      const hash = key('receipt-lookup',token);
      const live = (await c.query('SELECT quiz_id,snapshot FROM shsat_intake.intakes WHERE receipt_hash=$1 AND expires_at>clock_timestamp()', [hash])).rows[0];
      if (!live) return { error:'verified_intake_required' };
      const prior = (await c.query('SELECT * FROM shsat_intake.bookings WHERE receipt_hash=$1', [hash])).rows[0];
      if (prior) return prior.slot !== slot ? { error:'booking_conflict' }
        : prior.state === 'accepted' ? { response:open(prior.response) } : { error:'booking_reconciliation_required' };
      if ((await c.query('SELECT 1 FROM shsat_intake.bookings WHERE slot=$1',[slot])).rowCount) return {error:'slot_taken'};
      // Every fresh provider check consumes a durable reservation, including a
      // known pre-insert slot rejection. Five insert-only buckets per identity
      // fit the existing schema/grants; the advisory transaction serializes all
      // instances. Accepted/unknown outcomes above never consume or retry.
      const value=open(live.snapshot);
      const budgets=[['booking-check-phone',value.phone,86400],['booking-check-ip',ip,3600]];
      const chosen=[];
      for (const [label,raw,seconds] of budgets) {
        if (typeof raw!=='string' || !raw) return {error:'trusted_ip_required'};
        const keys=Array.from({length:5},(_,i)=>key(label+'/'+i,raw));
        const count=Number((await c.query("SELECT count(*) AS n FROM shsat_intake.reservations WHERE identity=ANY($1::text[]) AND created_at>clock_timestamp()-($2 * interval '1 second')",[keys,seconds])).rows[0].n);
        if(count>=5)return {error:'rate_limited'};
        const used=(await c.query('SELECT identity FROM shsat_intake.reservations WHERE quiz_id=$1 AND identity=ANY($2::text[])',[live.quiz_id,keys])).rows.map(r=>r.identity);
        const identity=keys.find(k=>!used.includes(k));
        if(!identity)return {error:'rate_limited'};
        chosen.push(identity);
      }
      for (const identity of chosen) await c.query('INSERT INTO shsat_intake.reservations(quiz_id,identity) VALUES($1,$2)',[live.quiz_id,identity]);
      const eventId = key('calendar-event',hash); // lowercase hex meets Google's base32hex event ID alphabet
      await c.query("INSERT INTO shsat_intake.bookings(receipt_hash,slot,event_id,state) VALUES($1,$2,$3,'pending')", [hash,slot,eventId]);
      return { eventId };
    });
  }
  async function acceptBooking(c,hash,result) {
    const row=(await c.query('SELECT b.*,i.snapshot FROM shsat_intake.bookings b JOIN shsat_intake.intakes i USING(receipt_hash) WHERE b.receipt_hash=$1',[hash])).rows[0];
    if(!row || !['pending','unknown'].includes(row.state))return false;
    if(!row.event_payload)throw new Error('private_calendar_evidence_required');
    const payload=buildRelayPayload(open(row.snapshot),open(row.event_payload),row.event_id,result);
    // Calendar acceptance and a pending immutable relay are one commit. A crash
    // before this commit leaves unknown Calendar evidence; after it, recovery
    // can deliver without another Calendar insert or a client replay.
    const saved=await c.query("UPDATE shsat_intake.bookings SET state='accepted',response=$2,relay_state='pending',relay_payload=$3,relay_next_attempt_at=clock_timestamp() WHERE receipt_hash=$1 AND state IN ('pending','unknown')",[hash,seal(result),seal(payload)]);
    return saved.rowCount===1;
  }
  async function finishBooking(token, result) {
    if (result && result.status >= 400) {
      const removed=await pool.query("DELETE FROM shsat_intake.bookings WHERE receipt_hash=$1 AND state='pending' AND event_payload IS NULL", [key('receipt-lookup',token)]);
      if (removed.rowCount===1) return;
    }
    if(result?.status===200 && result.body?.calendar===true){
      if(!await tx(c=>acceptBooking(c,key('receipt-lookup',token),result)))throw new Error('booking_outcome_not_persisted');
      return;
    }
    const updated=await pool.query("UPDATE shsat_intake.bookings SET state='unknown',response=$2 WHERE receipt_hash=$1 AND state='pending'",[key('receipt-lookup',token),result?seal(result):null]);
    if(updated.rowCount!==1)throw new Error('booking_outcome_not_persisted');
  }
  async function saveBookingEvent(token,event) {
    if(event?.visibility!=='private')throw new Error('private_calendar_evidence_required');
    const saved=await pool.query("UPDATE shsat_intake.bookings SET event_payload=$2 WHERE receipt_hash=$1 AND state='pending' AND event_payload IS NULL AND event_id=$3",[key('receipt-lookup',token),seal(event),event.id]);
    if(saved.rowCount!==1)throw new Error('booking_event_not_persisted');
  }
  async function reconcileBooking(token,lookup) {
    // lookup is an authenticated read-only calendar adapter supplied by the
    // server. No HTTP/client evidence can enter this function.
    const hash=key('receipt-lookup',token);
    const r=(await pool.query('SELECT * FROM shsat_intake.bookings WHERE receipt_hash=$1',[hash])).rows[0];
    if (!r || r.state==='accepted' || !r.event_payload) return false;
    const expected=open(r.event_payload), actual=await lookup(r.event_id);
    const fields=['id','summary','description','attendees','extendedProperties','visibility'];
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
    if (!actual || actual.status==='cancelled' || !fields.every(k=>contains(actual[k],expected[k])) || eventInstant(actual.start)!==eventInstant(expected.start) || eventInstant(actual.end)!==eventInstant(expected.end)) return false;
    const response={status:200,body:{ok:true,success:true,calendar:true,email:expected.attendees[0].email,date:r.slot.slice(0,10),time:r.slot.slice(11),meetLink:actual.hangoutLink||'',eventLink:actual.htmlLink||''}};
    return tx(c=>acceptBooking(c,hash,response));
  }
  async function reconcileByQuizId(quizId,lookup) {
    // Internal authenticated recovery only; never an HTTP/browser capability.
    const row=(await pool.query('SELECT fingerprint FROM shsat_intake.intakes WHERE quiz_id=$1',[quizId])).rows[0];
    return row ? reconcileBooking(receipt(quizId,row.fingerprint),lookup) : false;
  }
  async function claimRelay(quizId) {
    if(!require('../shsat-quiz-logic').isUuid(quizId))return null;
    return tx(async c=>{
      const r=(await c.query("SELECT b.*,clock_timestamp() AS now FROM shsat_intake.bookings b JOIN shsat_intake.intakes i USING(receipt_hash) WHERE i.quiz_id=$1 AND b.state='accepted' AND b.relay_state IN ('pending','delivering')",[quizId])).rows[0];
      if(!r || (r.relay_state==='delivering' && r.relay_lease_until>r.now) || (r.relay_state==='pending' && r.relay_next_attempt_at>r.now))return null;
      if(r.relay_attempts>=12){
        await c.query("UPDATE shsat_intake.bookings SET relay_state='blocked',relay_claim=NULL,relay_lease_until=NULL WHERE receipt_hash=$1",[r.receipt_hash]);return null;
      }
      const claim=crypto.randomUUID();
      await c.query("UPDATE shsat_intake.bookings SET relay_state='delivering',relay_claim=$2,relay_lease_until=clock_timestamp()+interval '60 seconds',relay_attempts=relay_attempts+1 WHERE receipt_hash=$1",[r.receipt_hash,claim]);
      return {receiptHash:r.receipt_hash,claim,payload:open(r.relay_payload)};
    });
  }
  async function finishRelay(job,accepted) {
    const done=await pool.query("UPDATE shsat_intake.bookings SET relay_state=CASE WHEN $3 THEN 'delivered' WHEN relay_attempts>=12 THEN 'blocked' ELSE 'pending' END,relay_claim=NULL,relay_lease_until=NULL,relay_next_attempt_at=CASE WHEN $3 THEN NULL ELSE clock_timestamp()+LEAST(3600,5*power(2,relay_attempts-1))*interval '1 second' END WHERE receipt_hash=$1 AND relay_state='delivering' AND relay_claim=$2 AND relay_lease_until>clock_timestamp()",[job.receiptHash,job.claim,accepted===true]);
    return accepted===true && done.rowCount===1;
  }
  async function dueRelays(limit=10) {
    if(!Number.isInteger(limit) || limit<1 || limit>20)throw new Error('bounded_recovery_batch_required');
    const r=await pool.query("SELECT i.quiz_id FROM shsat_intake.bookings b JOIN shsat_intake.intakes i USING(receipt_hash) WHERE b.state='accepted' AND ((b.relay_state='pending' AND b.relay_next_attempt_at<=clock_timestamp()) OR (b.relay_state='delivering' AND b.relay_lease_until<=clock_timestamp())) ORDER BY b.relay_next_attempt_at LIMIT $1",[limit]);
    return r.rows.map(r=>r.quiz_id);
  }
  return { reserve, lookupBooking, verify, reserveBooking, finishBooking, saveBookingEvent, reconcileBooking, reconcileByQuizId, claimRelay, finishRelay, dueRelays };
}
module.exports = { createStore };
