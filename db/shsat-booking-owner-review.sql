-- REVIEW DRAFT ONLY. Owner applies to the EXISTING Postgres project after review.
-- No extensions, schedules, product tables, roles, credentials or public RPCs.
BEGIN;
CREATE SCHEMA IF NOT EXISTS shsat_intake;
REVOKE ALL ON SCHEMA shsat_intake FROM PUBLIC;
CREATE TABLE shsat_intake.intakes (
 quiz_id uuid PRIMARY KEY,
 fingerprint text NOT NULL,
 snapshot text NOT NULL, -- AES-GCM envelope: contact, consent, canonical answers
 receipt_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours'
);
CREATE TABLE shsat_intake.reservations (
 quiz_id uuid NOT NULL REFERENCES shsat_intake.intakes(quiz_id),
 identity text NOT NULL, -- HMAC, never a bare phone/email/IP hash
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (quiz_id,identity)
);
CREATE INDEX reservations_identity_time ON shsat_intake.reservations(identity,created_at);
CREATE TABLE shsat_intake.bookings (
 receipt_hash text PRIMARY KEY REFERENCES shsat_intake.intakes(receipt_hash),
 slot text NOT NULL UNIQUE,
 event_id text NOT NULL UNIQUE,
 state text NOT NULL CHECK (state IN ('pending','unknown','accepted')),
 event_payload text, -- encrypted exact calendar resource before insert
 response text -- encrypted result, no tokens/PII in general logs
);
ALTER TABLE shsat_intake.intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shsat_intake.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shsat_intake.bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA shsat_intake FROM PUBLIC;
-- Explicitly remove inherited access in projects with old default grants.
DO $roles$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA shsat_intake FROM %I',r);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA shsat_intake FROM %I',r);
  END IF;
 END LOOP;
END $roles$;
COMMIT;
-- Owner must bind an EXISTING dedicated server role with only USAGE on this
-- schema, SELECT/INSERT on intakes/reservations, and SELECT/INSERT/UPDATE on
-- bookings, with explicit role-scoped RLS policies. No product grants,
-- service_role, anon/authenticated grants or SECURITY DEFINER escape hatch.
-- Role/key availability is UNVERIFIED; no credential is created by this draft.
