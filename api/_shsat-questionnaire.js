'use strict';
const Q=require('../shsat-quiz-logic');
const R=require('./_shsat-request');
const Slots=require('../booking-slots');
const {createBooking}=require('./_shsat-booking');

// The requested flow has NO pre-booking contact capture, mail or platform
// handoff. All six self-reported answers and the contact/slot are validated
// together on the final booking POST; no eligibility/completed boolean is used.
function createQuestionnaireBooking({store,book,origins=[]}) {
  const finish=createBooking({store,book});
  return async function(req,res) {
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST') return res.status(405).json({error:'method_not_allowed'});
    const origin=R.header(req,'origin');
    if(!R.originAllowed(origin,{VERCEL_ENV:'production'}) && !origins.includes(origin))return res.status(403).json({error:'origin_not_allowed'});
    try {
      const body=await R.readBody(req);
      if(body===R.TOO_LARGE)return res.status(413).json({error:'request_too_large'});
      const quiz=body && body.quiz;
      if(!quiz || quiz.version!==1 || !Q.isUuid(quiz.quiz_id) || quiz.role!=='parent' || Q.firstMissing(quiz)!==null || !Q.consultationFit(quiz).eligible) return res.status(400).json({error:'completed_eligible_questionnaire_required'});
      const name=typeof body.name==='string'?Q.sanitizeName(body.name):'';
      const email=typeof body.email==='string'?Q.normalizeEmail(body.email):'';
      const phone=Q.normalizeUsMobile(body.phone);
      if(name.length<2 || !Q.isValidEmail(email) || !phone)return res.status(400).json({error:'invalid_contact'});
      if (typeof body.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || typeof body.time!=='string' || !/^\d{1,2}:\d{2} (AM|PM)$/.test(body.time)) return res.status(400).json({error:'invalid_slot'});
      const [y,m,d]=body.date.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
      if (date.getUTCFullYear()!==y || date.getUTCMonth()+1!==m || date.getUTCDate()!==d) return res.status(400).json({error:'invalid_slot'});
      const ip=R.clientIp(req);
      if(!ip)return res.status(503).json({error:'trusted_ip_required'});
      const value={quiz_id:quiz.quiz_id.toLowerCase(),test_type:'SHSAT',student_grade:Number(quiz.grade),parent_name:name,parent_email:email,phone,
        quiz:{version:1,role:'parent',targets:Q.CODES.targets.filter(t=>quiz.targets.includes(t)),prep:quiz.prep,practice_test:quiz.practice_test,worry:quiz.worry,band:Q.bandFor(quiz,Q.todayNY())},
        purpose:'consultation_booking',booking_requested:true,consent:false,consent_version:null,delivery:'disabled',company_name:'',attribution:Q.sanitizeAttribution(body.attribution)};
      // An exact durable outcome remains replayable after the current slot's
      // lead-time cutoff. Identity, all answers and bound slot must still match.
      const prior=await store.lookupBooking(value,body.date+' '+body.time);
      if(prior && prior.error)return res.status(409).json({error:prior.error});
      if(prior && prior.response)return res.status(prior.response.status).json(prior.response.body);
      if(!Slots.openSlots(y,m,d,{durationMinutes:15,busy:[]}).includes(body.time))return res.status(400).json({error:'invalid_slot'});
      // Reserve globally BEFORE the first calendar/provider call. No message
      // outbox entry is created. The receipt stays server-side for this request.
      const saved=await store.reserve(value,ip);
      if(saved.error)return res.status(saved.error==='rate_limited'?429:409).json({error:saved.error});
      req.body=Object.assign({},body,{name,email,phone,booking_receipt:saved.receipt});
      return finish(req,res);
    }catch(_){return res.status(503).json({error:'booking_unavailable'});}
  };
}
module.exports={createQuestionnaireBooking};
