'use strict';
// Release is deliberately unbound. Only reviewed SERVER wiring may supply the
// factory in _shsat-questionnaire after SQL, role/secret, quota,
// retention, backup/restore, provider identity and independent/live gates pass.
// No browser option or environment flag can activate the legacy handler.
module.exports = Object.freeze({captureHandler:null,bookingHandler:null});
