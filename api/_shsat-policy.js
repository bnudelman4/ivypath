'use strict';
// The six-answer consultation path reuses the existing marketing Calendar
// credentials/writer. No platform DB/key/bridge activation is required.
// Plan-copy/prebooking capture stays disabled on the server.
module.exports=Object.freeze({captureHandler:null,bookingHandler:(req,res)=>require('./_shsat-calendar-booking').createCalendarQuestionnaireBooking()(req,res)});
