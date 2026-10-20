'use strict';
// Default-off server gate. Owner must approve the existing relay secret's
// booking scope, platform schema/key/Calendar identity and exact final release.
// A browser payload cannot activate this gate; preview cannot call production.
module.exports=Object.freeze({captureHandler:null,get bookingHandler(){
 if(process.env.SHSAT_PLATFORM_BOOKING_ENABLED!=='1' || process.env.VERCEL!=='1' || process.env.VERCEL_ENV!=='production')return null;
 return require('./_shsat-platform').createPlatformBooking();
}});
