'use strict';
const Q=require('../shsat-quiz-logic');
const TRUST=require('./_booking-trust');
const R=require('./_shsat-request');
function createBooking({store,book}) {
  return async function(req,res) {
    res.setHeader('Cache-Control','no-store');
    try {
      const body=req.body && typeof req.body==='object' ? req.body : {};
      const verified=await store.verify(body.booking_receipt);
      if (!verified.ok) return res.status(409).json({error:'verified_intake_required'});
      const value=verified.value;
      const answers=Object.assign({},value.quiz,{grade:value.student_grade});
      if (Q.firstMissing(answers)!==null || !Q.consultationFit(answers).eligible || !(value.consent || (value.purpose==='consultation_booking' && value.booking_requested===true)) || value.company_name) return res.status(400).json({error:'ineligible_intake'});
      // Token binds the original consenting contact. A browser edit cannot
      // redirect a calendar invite or attach another parent's intake.
      if (Q.sanitizeName(body.name)!==value.parent_name || Q.normalizeEmail(body.email)!==value.parent_email || Q.normalizeUsMobile(body.phone)!==value.phone || body.type || body.exam==='sat') return res.status(409).json({error:'intake_contact_mismatch'});
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !/^\d{1,2}:\d{2} (AM|PM)$/.test(body.time)) return res.status(400).json({error:'invalid_slot'});
      const reserved=await store.reserveBooking(body.booking_receipt,body.date+' '+body.time,R.clientIp(req));
      if (reserved.error) return res.status(reserved.error==='rate_limited'?429:409).json({error:reserved.error});
      if (reserved.response) return res.status(reserved.response.status).json(reserved.response.body);
      const trusted=Object.assign({},body,{quiz:Object.assign({quiz_id:value.quiz_id,grade:value.student_grade},value.quiz),attribution:value.attribution});
      trusted[TRUST]={eventId:reserved.eventId,beforeInsert:event=>store.saveBookingEvent(body.booking_receipt,event)};
      req.body=trusted;
      /** @type {{status:number,body:any}|undefined} */
      let result;
      // Buffer the handler response until the durable outcome is saved.
      const proxy={statusCode:200,setHeader:(...args)=>res.setHeader(...args),status(n){this.statusCode=n;return this;},json(body){result={status:this.statusCode,body};return this;},end(){result={status:this.statusCode,body:{}};}};
      await book(req,proxy);
      await store.finishBooking(body.booking_receipt,result);
      if (result && result.status===409 && result.body.error==='slot_taken') return res.status(409).json(result.body);
      if (!result || !result.body.calendar) return res.status(503).json({error:'booking_reconciliation_required'});
      return res.status(result.status).json(result.body);
    } catch (_) { return res.status(503).json({error:'booking_unavailable'}); }
  };
}
module.exports={createBooking};
