'use strict';
module.exports=[{
 files:['api/*.js','api/_booking-trust.js','api/book-consultation.js','api/quiz-lead.js','shsat-quiz-logic.js','shsat-quiz.js','tracking.js','sticky-cta.js','tests/shsat-durable.test.js','tests/shsat-calendar-reuse.test.js','tests/shsat-calendar-booking.test.js','tests/e2e/*.js'],
 languageOptions:{ecmaVersion:2022,sourceType:'commonjs',globals:Object.fromEntries(['structuredClone','fbq','gtag','DOMException','innerWidth','MutationObserver','MouseEvent','window','document','navigator','location','history','sessionStorage','localStorage','URL','URLSearchParams','Event','CustomEvent','Image','performance','matchMedia','getComputedStyle','crypto','console','process','require','module','__dirname','Buffer','fetch','Response','AbortController','setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','global','globalThis'].map(k=>[k,'readonly']))},
 rules:{'no-undef':'error','no-dupe-args':'error','no-dupe-keys':'error','no-unreachable':'error','valid-typeof':'error','constructor-super':'error','no-async-promise-executor':'error'}
}];
