-- OWNER REVIEW DRAFT ONLY. Existing isolated booking ledger; no new service,
-- role, credential, public endpoint, cron or product-table grant. NOT applied
-- to production by this task. Apply after shsat-booking-owner-review.sql.
BEGIN;
ALTER TABLE shsat_intake.bookings
 ADD COLUMN relay_state text NOT NULL DEFAULT 'not_ready'
  CHECK (relay_state IN ('not_ready','pending','delivering','delivered','blocked')),
 ADD COLUMN relay_payload text, -- encrypted immutable minimal contact/event POST
 ADD COLUMN relay_claim uuid,
 ADD COLUMN relay_lease_until timestamptz,
 ADD COLUMN relay_next_attempt_at timestamptz,
 ADD COLUMN relay_attempts integer NOT NULL DEFAULT 0 CHECK (relay_attempts BETWEEN 0 AND 12),
 ADD CONSTRAINT relay_after_calendar_acceptance CHECK
  (relay_state='not_ready' OR (state='accepted' AND relay_payload IS NOT NULL)),
 ADD CONSTRAINT relay_claim_matches_state CHECK
  ((relay_state='delivering' AND relay_claim IS NOT NULL AND relay_lease_until IS NOT NULL)
   OR (relay_state<>'delivering' AND relay_claim IS NULL AND relay_lease_until IS NULL));
CREATE INDEX bookings_relay_due ON shsat_intake.bookings(relay_next_attempt_at)
 WHERE state='accepted' AND relay_state IN ('pending','delivering');
COMMIT;
-- Existing accepted rows lacking explicitly private persisted Calendar evidence
-- are NOT retroactively relayed. They require owner review, not a bulk backfill.
