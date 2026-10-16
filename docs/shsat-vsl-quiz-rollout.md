# SHSAT funnel revision: private cloud handoff

2026-10-16. Local implementation only. Production capture and SHSAT booking are **disabled** in `api/_shsat-policy.js`. Parent coordinates release after fresh independent reviews and live gates. No deployment, push, merge, production SQL, new credential, real lead/message/calendar/ad call or reviewer worker occurred.

## Requested flow

The owner-requested v5 VSL remains ON and unchanged. SHSAT landing/sticky CTAs open the six-question parent questionnaire. The default flow shows the plan immediately after all six valid answers, offers consultation for self-declared parents of students in grades 5–9, and collects contact details once on the existing booking page. Under5/over9 receive a clear alternative without capture or consultation. Student exit and tab-long ad suppression remain. Income, score and willingness-to-pay filters were not added. Diagnostic entitlement remains separate.

The parent clarified that unused pre-booking alert/copy capability should stay disabled instead of becoming a launch dependency. `PREBOOK_CAPTURE=false` is the default. No capture, platform, alert or plan-copy request happens before booking; the handoff holds only answers/quiz ID in this tab, never contact details or URLs. The old gate remains as a historical offline fixture behind an explicit test override, with public `/api/quiz-lead` default off. It is not the requested production flow. The optional durable mail-outbox experiment is excluded from this revision and retained separately for review; do not enable it.

## Booking trust and durability

`api/_shsat-questionnaire.js` validates all six answer fields, parent role, grade5–9, contact and offered calendar slot on the final POST. It ignores client completion/eligibility flags and derives the band itself. Complete means a structurally complete set of self-reported answers; it does not authenticate a person's age/parenthood or attest that a human clicked every UI step.

Before Calendar is called, `api/_shsat-store.js` reserves phone/IP capacity across instances in a Postgres transaction using a shared transaction advisory lock. The limits are two booking intake attempts per phone/day and five per IP/hour; pending and failed attempts count. The selected slot is also reserved with a unique constraint, preventing two eligible requests from booking it concurrently through this path. Existing outside-calendar events still use the calendar free/busy check. Unknown IP or store failure blocks the write. Trust in the hosting proxy's IP header must be verified before release.

The intake snapshot is encrypted with AES-GCM; contact lookup keys/fingerprints use purpose-separated HMACs. No key is embedded. Server creates an opaque receipt internally from the exact normalized intake. The client does not supply a trusted eligibility boolean or choose the summary. A changed answer/contact with the same quiz ID conflicts. The booking reservation binds the exact slot and deterministic Google event/conference ID. The server-owned canonical labels appear in the owner's primary-calendar description, labeled as the parent's own answers, not a score. The existing business calendar identity must be verified in the release gate.

The exact event resource is persisted before insert. A provider success is acknowledged only after the durable outcome is recorded. Timeout, worker crash, provider failure or persistence failure leaves a pending/unknown reservation; HTTP retries never insert a second event. Internal `reconcileByQuizId(quizId, lookup)` reads the existing event using the same ID and accepts only exact submitted summary/contact/answer/private fields and equivalent start/end instants. Google-added timezone offsets are handled. Missing/cancelled/mismatching evidence remains blocked. It never inserts, emails, uses a new ID or treats absence as permission to resend. A crash before event persistence needs authenticated operator recovery; no blind automatic retry is supplied.

SHSAT bookings use the Calendar invitation as confirmation. They do not independently run the legacy Resend confirmation, platform booking relay or strategy-call tracker. Those generic/SAT/consulting paths keep their existing behavior. This is a proposed SHSAT-only workflow amendment, requiring parent review along with the exact patch. Thank-you route and the existing booking conversion label are preserved. No answers/contact details are placed in public URLs, general logs or ad events.

## Owner-ready SQL and server wiring

`db/shsat-booking-owner-review.sql` creates only three isolated tables plus constraints/index/RLS. `db/shsat-booking-grants.psql` grants only an already-approved dedicated existing role access to this schema; it creates no login, password, token, extension, schedule, public RPC or product-table grant. These are review drafts, not applied production migrations. They passed disposable Postgres17 tests under a NOLOGIN/NOBYPASSRLS fixture role. Do not run against production from this task.

To make the requested booking path available after review, the owner must apply the reviewed SQL/grants in the existing project and supply a verified existing least-privilege server pool and stable existing 32+-byte server secret through approved server-only infrastructure. Their availability is not established; do not reuse an unrelated key or create one silently. Configure connection/statement timeouts inside the function budget. Instantiate `createStore(pool, secret)`, then bind `createQuestionnaireBooking({store, book: legacyBookingHandler})` as `bookingHandler` in the server policy. `captureHandler` stays null. No environment/browser flag can activate the old in-memory sender. An anonymous/publishable/service_role client is not a substitute for the dedicated role.

The SQL is deliberately outside public static serving (`/db/` in `.vercelignore`). Server modules use dependency injection and do not connect or load credentials at import. No live SQL/key provisioning was attempted.

## Remaining release gates

- Parent-run fresh correctness and security/privacy reviews of this exact revision. Prior reviews were invalidated by source changes; no reviewer workers were invoked here.
- Owner-applied SQL, verified existing role/secret binding, current project quota headroom, encrypted backup/restore and actual retention/deletion procedure before enabling durable writes. No live proof is claimed.
- Approved live smoke on the actual business calendar/sender identity, trusted proxy IP handling and deployed-source parity. Only mocks/local transport were used here. Existing platform PR119/120/migration reports are historical and are not proof of readiness.
- Current v5 narration/captions, real device Safari playback and manual VoiceOver/NVDA. Chromium iPhone emulation is not Safari.
- Existing opt-out/texter/consent guards before any optional texting or pre-booking capture is ever activated. This flow requests no texting consent or automated outreach.
- Ad account/conversion changes remain out of scope; quiz conversion label remains inert. Parent handles advertising separately.

## Source and verification

Recovered from private Library WIP `libfile_92527349bcb08191b1648c833dc7fc78`, archive SHA256 `ae9e2fdce66ad4e70bbb95a743a2bad0d92d19b6ac9661efd0a69ba83f26f5bc`, full checkpoint diff `3c334da268acb07dedff06eb2c7dbc348f5342b89513e63d105784d1f3aa06ea` applied to main `6c2db2c5ab40d3de91ec474e056d87642c0b194a`. The original local commit `06100b3a...` was provenance in the checkpoint, not an available commit object here; the source tree was recovered from the exact verified patch. Both archives rejected traversal, links and special entries before extraction. The mounted product checkout was not modified.

The v5 LFS asset is materialized locally with its original 4,124,843 bytes and SHA256 `6f00f5010fe86cb0ef61a99e2410613592fa05b9cc3f657711c74e1d5cf4a674`; no media delta is committed. Current NYCPS specialized-high-schools page confirms registration Oct6–30, grade8 Nov18 at terminating NYCPS middle schools / Nov14–15 otherwise, and grade9 Nov21 with alternate-date caveat. Date fixtures were corrected against that source, with grade-specific boundaries, rather than reverting safe behavior to old expectations. Source: https://www.schools.nyc.gov/enrollment/enroll-grade-by-grade/specialized-high-schools

Run `SHSAT_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55439/postgres npm test` against a disposable local database only. Without that exact fixture URL the real database tests skip. `npm run lint` covers changed browser/server JS and browser tests; `npm run typecheck` uses checkJs on the new server contracts and imported pure logic. Historical legacy handler tests remain regression fixtures and do not prove live capture readiness.

Playwright serves the real local site with external browser requests intercepted, fake Calendar and loopback Resend. The requested default-flow tests exercise the real questionnaire booking boundary and real calendar handler; legacy gate fixtures are labeled separately. Full-suite results, exact revision, actual screenshots and remaining blockers are recorded in the final private Library bundle/report. No intermediate run should be mistaken for final acceptance.
