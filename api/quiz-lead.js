'use strict';
const policy = require('./_shsat-policy');
module.exports = async function quizLead(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ok:true,capture_enabled:typeof policy.captureHandler==='function',plan_copy_enabled:false});
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ok:false});
  if (typeof policy.captureHandler !== 'function') return res.status(503).json({ok:false,error:'capture_unavailable'});
  return policy.captureHandler(req,res);
};
