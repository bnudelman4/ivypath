'use strict';
const policy = require('./_shsat-policy');
module.exports = async function bookConsultation(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (req.method === 'POST' && body.booking_flow === 'shsat_quiz') {
    res.setHeader('Cache-Control','no-store');
    if (typeof policy.bookingHandler !== 'function') return res.status(409).json({error:'verified_intake_required'});
    return policy.bookingHandler(req,res);
  }
  if (req.method === 'POST' && body.quiz) {
    // Generic/SAT bookings cannot inherit stale SHSAT intake.
    req.body = Object.assign({}, body); delete req.body.quiz;
  }
  return require('./_book-consultation-handler')(req,res);
};
