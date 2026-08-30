-- ============================================================
-- SSR — INTEGRATION CONTACT + DATA PREFERENCE MIGRATION
-- Run in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

alter table pre_registrations
  add column if not exists integration_contact_email text,
  add column if not exists data_integration_preference jsonb;

-- No new RLS policies needed: both new columns are written only by the
-- update-profile and generate-operator-letter edge functions, which use
-- the service role key and bypass RLS. The public/anon key still cannot
-- read or update these rows directly.

-- VERIFY
select
  (select count(*) from information_schema.columns
     where table_name = 'pre_registrations'
       and column_name in ('integration_contact_email','data_integration_preference')) as new_columns_2;
-- Expect: 2
