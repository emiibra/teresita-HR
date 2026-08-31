-- =============================================================================
-- TERESITA HR — STEP 1: FULL WIPE (app tables + Auth users)
-- Run this FIRST in Supabase → SQL Editor, then 01_SETUP, then 03_FIX
-- =============================================================================
-- WARNING: deletes ALL Teresita companies, workers, punches, comandas AND
--          ALL login users in this Supabase project (auth.users).
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Extra tables from later fixes
DROP TABLE IF EXISTS public.worker_delete_codes CASCADE;

-- Core tables (CASCADE removes policies)
DROP TABLE IF EXISTS public.comandas CASCADE;
DROP TABLE IF EXISTS public.marcaciones CASCADE;
DROP TABLE IF EXISTS public.worker_invites CASCADE;
DROP TABLE IF EXISTS public.workers CASCADE;
DROP TABLE IF EXISTS public.manager_pins CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;

DROP FUNCTION IF EXISTS public.get_company_admin_email() CASCADE;
DROP FUNCTION IF EXISTS public.list_comandas_company(date, date) CASCADE;
DROP FUNCTION IF EXISTS public.registrar_comanda_admin(text, uuid, text, date, numeric, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.list_marcaciones_worker(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.list_marcaciones_company(date, date) CASCADE;
DROP FUNCTION IF EXISTS public.registrar_marcacion_worker(uuid, text, text, date, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.mark_invite_email_sent(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.list_workers_for_staff_login(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.verify_worker_pin(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.set_worker_pin_from_invite(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_invite_for_pin_setup(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_worker_with_invite(text, text, text, text, date, text, text, text, text[], text) CASCADE;
DROP FUNCTION IF EXISTS public.list_workers() CASCADE;
DROP FUNCTION IF EXISTS public.verify_manager_pin(text) CASCADE;
DROP FUNCTION IF EXISTS public.setup_manager_pin(text) CASCADE;
DROP FUNCTION IF EXISTS public.manager_pin_is_set() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.my_company_id() CASCADE;
DROP FUNCTION IF EXISTS public.assert_six_digit_pin(text) CASCADE;
DROP FUNCTION IF EXISTS public.verify_pin(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.hash_pin(text) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_company_profile(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.issue_worker_delete_code(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_worker_with_code(uuid, text) CASCADE;

-- Wipe Auth logins so you can "Crear empresa" again with ANY email
DELETE FROM auth.users;

NOTIFY pgrst, 'reload schema';
