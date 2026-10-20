# Minimal quiz -> existing Google Calendar consultation release

This supersedes the earlier platform-relocation/setup proposal for the minimum
release. Keep meeting creation in the EXISTING marketing Calendar writer. The
candidate needs no new database, encryption key, credential, authorization scope,
platform booking endpoint, webhook, recovery job or Vercel account access.
The earlier platform ledger/key/secret-scope drafts remain preserved history;
do not apply them as setup for this native-Calendar variant.

The user already authorized the GitHub auto-deploy path. No generic push/deploy
confirmation is outstanding. Final correctness/privacy review of this selected
revision remains required; no reviewer workers were started in this run.

## Existing backend, verified source behavior

Marketing main6c2db2c5ab40d3de91ec474e056d87642c0b194a already creates meetings
DIRECTLY in api/book-consultation.js using api/_calendar.js. It uses the existing
GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_CALENDAR_SUBJECT (default info@ivypathacademy.com),
checks free/busy, calls events.insert on primary with a Meet conference request
and sendUpdates:all, then relays the completed event to /api/bookings/site.
The platform receiver records completed bookings; it is not the meeting creator.
GitHub main and vercel[bot] Production deployment metadata identify6c2db2c5.

Six characterization tests execute that exact git source with mocked providers.
They establish a working happy path, retained attribution, ignored quiz answers,
unknown-write200calendar:false, duplicate events on exact retries, and the
pre-existing free/busy race/shared-rate-budget gap. No real Calendar read/write,
invitation, email, lead, ad or customer record was used to establish those facts.
A new live appointment has not been claimed.

## Small runtime delta

-api/_shsat-policy.js binds the SHSAT branch to the new thin native adapter.
 Prebooking capture/plan-copy stays disabled. The unused platform bridge and
 its obsolete tests are removed; the earlier commits/bundles remain intact.
-api/_shsat-calendar-booking.js validates all six parent answers, grades5–9,
 contact, dates, time and slot before insert. Client eligibility/completion/
 outcome flags or digests cannot authorize an event. A canonical answer summary
 is placed in the existing Calendar description; no invented score/income filter.
-It derives a stable Google event ID from the random quiz attempt UUID. A private
 server-derived request fingerprint binds exact canonical contact/answers/slot.
 Replays GET that ID with the EXISTING Calendar credentials and compare private
 metadata, full canonical description/title, attendee and actual time instants.
 Changed data, cancelled events, edited answers/time/visibility cannot replay.
-New inserts call the EXISTING hardened marketing writer with its existing
 service client. Calendar ID and Meet request ID are stable; event visibility is
 private. Free/busy failure fails closed for quiz. A lost insert acknowledgement
 gets one read-only check; the request never inserts a second time. Missing or
 mismatched evidence never becomes a success. Preview cannot use production.
-The existing writer retains its normal confirmation and post-booking operations
 side effects for a confirmed new quiz event. A read-back replay/unknown recovery
 may retry the EXISTING completed-booking receiver with its existing secret and
 external-event key; it sends no additional branded family confirmation. Google
 invitations remain the existing Calendar sendUpdates behavior.
-book.html adds seven lines requiring calendar:true before clearing the plan,
 storing booked-email state or going to the existing thank-you conversion URL.
 A legacy200 with false/missing Calendar confirmation stays on the booking page
 and asks the parent to call before another attempt. Existing successful-meeting
 conversion semantics, attribution and generic/SAT behavior are retained.

UTMs, gclid/fbclid presence markers and braid presence markers remain private to
the owner Calendar copy. Existing raw click IDs remain on the existing server
operations attribution channel; quiz answers never enter that payload. The native
adapter preserves marketing-only wbraid/gbraid and the landing path alongside the
quiz's attribution keys. No answers/contact enter a URL, console or ad tag.
VSL, six questions, eligibility alternatives, minor/student suppression and SAT
experiment are unchanged. No Ads/budget change occurred.

## Proportionate residual risks, explicitly not claimed solved

1. TWO DIFFERENT PARENTS can still both pass free/busy before either insert
   becomes visible. They have different quiz IDs. This is a pre-existing property
   of the current live handler; no in-process lock or provider event ID is called
   an atomic global slot reservation. The new adapter improves same-attempt
   retries, not cross-parent locking.
2. There is NO NEW globally shared per-phone/IP quota. That limitation exists in
   the current public booking handler and generic path. The quiz adds strict
   validation and private provider proof, but does not claim the older proposed
   SQL adapter's atomic budget guarantee. Review should assess this residual
   proportionately; a full booking-platform redesign is not automatically made
   a prerequisite under the parent's latest minimum-change direction.
3. Operations delivery remains BEST-EFFORT as on the live site, with exact replay
   able to retry the existing receiver. No new durable outbox or background
   subsystem is claimed. A parent exiting after a confirmed Calendar event but a
   failed relay can still require operational reconciliation, as before.
4. Provider-native ID semantics are not a formal distributed lock. Google's
   create-event guide recommends supplied IDs to avoid duplicates after a write
   succeeds but acknowledgement fails; the reference also cautions that distributed
   ID collisions are not guaranteed detected at creation time. The implementation
   therefore makes no stronger global exactly-once/race-safety claim.

Primary references:
[Google create-event guidance](https://developers.google.com/workspace/calendar/api/guides/create-events),
[Google event ID/private-property reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

The old strict SQL-guard tests remain as regression evidence for their preserved,
UNBOUND constructor; passing them does not mean those guarantees apply to the
native policy. Their policy assertions now verify that constructing that legacy
runtime cannot replace the selected Calendar binding. The public native policy
has its own active-path and rejection tests.

## Verification and publication

The native tests use real selected writer code and a mocked Calendar with native
ID conflicts/read-back, plus a local receiver. They cover canonical summaries,
UTMs/braid IDs, all qualifying grades, invalid/forged completion, exact replay,
unknown outcomes, edited provider evidence, free/busy failure and preview/origin/
size guards. Browser defaults now exercise this native adapter through the local
server; historical pre-capture fixtures alone retain their old receipt adapter.
Every server/provider request is redirected to loopback fixtures or blocked.

Two new browser cases at all three viewports cover false/missing Calendar
confirmation. The old happy-path browser stub was corrected to explicitly return
calendar:true, matching a confirmed meeting; the separate negative cases ensure
that omission cannot count as a booking. This fixes the fixture contract without
weakening the production guard or changing unsafe expectations into success.

Before push: final full unit/browser/lint/type checks and independent correctness/
privacy review of the exact native revision must pass, including assessment of
these residual risks. No broader production setup approval is required for this
variant; no Vercel login or new GitHub token is needed to push. Once those gates
pass, use the already-authorized GitHub integration, then verify public quiz ->
qualified consultation flow without claiming live before it is observed. A real
new invitation/record test still needs its specific authorization. No production
publication, SQL, credential/scope action, or new reviewer occurred in this run.
