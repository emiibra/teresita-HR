-- =============================================================================
-- TERESITA HR — STEP 2: full setup (run AFTER 00_RESET_DATABASE.sql)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.manager_pins (
  company_id uuid PRIMARY KEY REFERENCES public.companies (id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  fecha_nacimiento date NOT NULL,
  direccion text,
  contacto_emergencia_nombre text NOT NULL,
  contacto_emergencia_telefono text NOT NULL,
  sedes text[] NOT NULL DEFAULT '{}',
  horario text NOT NULL DEFAULT '08:00',
  rol text NOT NULL DEFAULT 'Colaborador',
  pin_hash text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE TABLE public.worker_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workers_company ON public.workers (company_id);
CREATE INDEX idx_worker_invites_token ON public.worker_invites (token);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER — never expose pin_hash to client)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hash_pin(p_pin text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.crypt(p_pin, extensions.gen_salt('bf'::text, 8));
$$;

CREATE OR REPLACE FUNCTION public.verify_pin(p_pin text, p_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p_hash IS NOT NULL AND p_hash = extensions.crypt(p_pin, p_hash);
$$;

CREATE OR REPLACE FUNCTION public.assert_six_digit_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Company bootstrap on first signup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_role text;
BEGIN
  v_company_name := COALESCE(
    NEW.raw_user_meta_data ->> 'company_name',
    split_part(NEW.email, '@', 1)
  );
  v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'owner');

  INSERT INTO public.companies (name)
  VALUES (v_company_name)
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, role)
  VALUES (
    NEW.id,
    v_company_id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    CASE WHEN v_role IN ('owner', 'manager') THEN v_role ELSE 'owner' END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: manager PIN setup / verify
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.manager_pin_is_set()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_pins mp
    WHERE mp.company_id = public.my_company_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.setup_manager_pin(p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  PERFORM public.assert_six_digit_pin(p_pin);
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no company profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.manager_pins WHERE company_id = v_company_id) THEN
    RAISE EXCEPTION 'Manager PIN already configured';
  END IF;
  INSERT INTO public.manager_pins (company_id, pin_hash)
  VALUES (v_company_id, public.hash_pin(p_pin));
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  PERFORM public.assert_six_digit_pin(p_pin);
  SELECT mp.pin_hash INTO v_hash
  FROM public.manager_pins mp
  WHERE mp.company_id = public.my_company_id();
  RETURN public.verify_pin(p_pin, v_hash);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: workers list (safe columns only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_workers()
RETURNS TABLE (
  id uuid,
  nombre text,
  email text,
  whatsapp text,
  fecha_nacimiento date,
  direccion text,
  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  sedes text[],
  horario text,
  rol text,
  pin_configured boolean,
  activo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.nombre,
    w.email,
    w.whatsapp,
    w.fecha_nacimiento,
    w.direccion,
    w.contacto_emergencia_nombre,
    w.contacto_emergencia_telefono,
    w.sedes,
    w.horario,
    w.rol,
    (w.pin_hash IS NOT NULL) AS pin_configured,
    w.activo
  FROM public.workers w
  WHERE w.company_id = public.my_company_id()
    AND w.activo = true
  ORDER BY w.nombre;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create worker + invite (requires manager PIN)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_worker_with_invite(
  p_manager_pin text,
  p_nombre text,
  p_email text,
  p_whatsapp text,
  p_fecha_nacimiento date,
  p_direccion text,
  p_contacto_emergencia_nombre text,
  p_contacto_emergencia_telefono text,
  p_sedes text[],
  p_horario text DEFAULT '08:00'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_worker_id uuid;
  v_token uuid;
  v_invite_id uuid;
BEGIN
  IF NOT public.verify_manager_pin(p_manager_pin) THEN
    RAISE EXCEPTION 'Invalid manager PIN';
  END IF;

  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company for user';
  END IF;

  IF p_nombre IS NULL OR trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  IF p_whatsapp IS NULL OR trim(p_whatsapp) = '' THEN
    RAISE EXCEPTION 'WhatsApp phone is required';
  END IF;
  IF p_fecha_nacimiento IS NULL THEN
    RAISE EXCEPTION 'Date of birth is required';
  END IF;
  IF p_contacto_emergencia_nombre IS NULL OR trim(p_contacto_emergencia_nombre) = '' THEN
    RAISE EXCEPTION 'Emergency contact name is required';
  END IF;
  IF p_contacto_emergencia_telefono IS NULL OR trim(p_contacto_emergencia_telefono) = '' THEN
    RAISE EXCEPTION 'Emergency contact phone is required';
  END IF;
  IF p_sedes IS NULL OR array_length(p_sedes, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one location (sede) is required';
  END IF;

  INSERT INTO public.workers (
    company_id, nombre, email, whatsapp, fecha_nacimiento, direccion,
    contacto_emergencia_nombre, contacto_emergencia_telefono, sedes, horario
  )
  VALUES (
    v_company_id,
    trim(p_nombre),
    lower(trim(p_email)),
    trim(p_whatsapp),
    p_fecha_nacimiento,
    NULLIF(trim(p_direccion), ''),
    trim(p_contacto_emergencia_nombre),
    trim(p_contacto_emergencia_telefono),
    p_sedes,
    COALESCE(NULLIF(trim(p_horario), ''), '08:00')
  )
  RETURNING id INTO v_worker_id;

  INSERT INTO public.worker_invites (worker_id, company_id)
  VALUES (v_worker_id, v_company_id)
  RETURNING token, id INTO v_token, v_invite_id;

  RETURN jsonb_build_object(
    'worker_id', v_worker_id,
    'invite_id', v_invite_id,
    'token', v_token,
    'email', lower(trim(p_email)),
    'nombre', trim(p_nombre)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: worker PIN from invite link (public, token-based)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invite_for_pin_setup(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.worker_invites%ROWTYPE;
  v_worker public.workers%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.worker_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF v_inv.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'used');
  END IF;
  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  SELECT * INTO v_worker FROM public.workers WHERE id = v_inv.worker_id;
  RETURN jsonb_build_object(
    'valid', true,
    'worker_id', v_worker.id,
    'company_id', v_worker.company_id,
    'nombre', v_worker.nombre,
    'email', v_worker.email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_worker_pin_from_invite(p_token uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.worker_invites%ROWTYPE;
BEGIN
  PERFORM public.assert_six_digit_pin(p_pin);

  SELECT * INTO v_inv FROM public.worker_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite';
  END IF;
  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;

  UPDATE public.workers
  SET pin_hash = public.hash_pin(p_pin)
  WHERE id = v_inv.worker_id;

  UPDATE public.worker_invites
  SET used_at = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'worker_id', v_inv.worker_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: staff login — verify worker PIN (anon callable)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_worker_pin(p_worker_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  PERFORM public.assert_six_digit_pin(p_pin);
  SELECT pin_hash INTO v_hash FROM public.workers WHERE id = p_worker_id AND activo = true;
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.verify_pin(p_pin, v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_workers_for_staff_login(p_company_id uuid)
RETURNS TABLE (id uuid, nombre text, rol text, sedes text[], horario text, pin_configured boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.nombre, w.rol, w.sedes, w.horario, (w.pin_hash IS NOT NULL)
  FROM public.workers w
  WHERE w.company_id = p_company_id
    AND w.activo = true
    AND w.rol <> 'Administrador'
  ORDER BY w.nombre;
$$;

-- Mark invite email sent (edge function)
CREATE OR REPLACE FUNCTION public.mark_invite_email_sent(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.worker_invites
  SET email_sent_at = now()
  WHERE id = p_invite_id
    AND company_id = public.my_company_id();
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS companies_select_member ON public.companies;
CREATE POLICY companies_select_member ON public.companies
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS workers_select_company ON public.workers;
CREATE POLICY workers_select_company ON public.workers
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

DROP POLICY IF EXISTS worker_invites_select_company ON public.worker_invites;
CREATE POLICY worker_invites_select_company ON public.worker_invites
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

-- No direct insert/update on workers or pins from client — use RPCs only
REVOKE INSERT, UPDATE, DELETE ON public.workers FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.manager_pins FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.worker_invites FROM authenticated, anon;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.workers TO authenticated;
GRANT SELECT ON public.worker_invites TO authenticated;

GRANT EXECUTE ON FUNCTION public.manager_pin_is_set() TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_manager_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker_with_invite(
  text, text, text, text, date, text, text, text, text[], text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invite_email_sent(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_invite_for_pin_setup(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_worker_pin_from_invite(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_workers_for_staff_login(uuid) TO anon, authenticated;

-- ========== Part 2: admin email + marcaciones + comandas ==========

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS admin_notification_email text;

UPDATE public.companies
SET admin_notification_email = 'emiliaabravo19@gmail.com'
WHERE admin_notification_email IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_role text;
  v_admin_email text;
BEGIN
  v_company_name := COALESCE(
    NEW.raw_user_meta_data ->> 'company_name',
    split_part(NEW.email, '@', 1)
  );
  v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'owner');
  v_admin_email := COALESCE(
    NEW.raw_user_meta_data ->> 'admin_notification_email',
    NEW.email,
    'emiliaabravo19@gmail.com'
  );

  INSERT INTO public.companies (name, admin_notification_email)
  VALUES (v_company_name, lower(trim(v_admin_email)))
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, role)
  VALUES (
    NEW.id,
    v_company_id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    CASE WHEN v_role IN ('owner', 'manager') THEN v_role ELSE 'owner' END
  );

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marcaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  sede text NOT NULL,
  fecha date NOT NULL,
  tipo text NOT NULL,
  hora text NOT NULL,
  puntualidad text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marcaciones_company_fecha ON public.marcaciones (company_id, fecha);
CREATE INDEX IF NOT EXISTS idx_marcaciones_worker ON public.marcaciones (worker_id, fecha);

CREATE TABLE IF NOT EXISTS public.comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  sede text NOT NULL,
  fecha date NOT NULL,
  monto numeric(12, 2) NOT NULL,
  concepto text,
  numero_boleta text NOT NULL,
  foto_nombre text,
  foto_data_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comandas_company ON public.comandas (company_id, fecha);
CREATE INDEX IF NOT EXISTS idx_comandas_worker ON public.comandas (worker_id, fecha);

CREATE OR REPLACE FUNCTION public.registrar_marcacion_worker(
  p_worker_id uuid,
  p_pin text,
  p_sede text,
  p_fecha date,
  p_tipo text,
  p_hora text,
  p_puntualidad text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_nombre text;
  v_id uuid;
BEGIN
  IF NOT public.verify_worker_pin(p_worker_id, p_pin) THEN
    RAISE EXCEPTION 'Invalid worker PIN';
  END IF;
  SELECT company_id, nombre INTO v_company_id, v_nombre
  FROM public.workers WHERE id = p_worker_id AND activo = true;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;
  INSERT INTO public.marcaciones (company_id, worker_id, nombre, sede, fecha, tipo, hora, puntualidad)
  VALUES (v_company_id, p_worker_id, v_nombre, p_sede, p_fecha, p_tipo, p_hora, p_puntualidad)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_marcaciones_company(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS SETOF public.marcaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.marcaciones m
  WHERE m.company_id = public.my_company_id()
    AND (p_desde IS NULL OR m.fecha >= p_desde)
    AND (p_hasta IS NULL OR m.fecha <= p_hasta)
  ORDER BY m.fecha DESC, m.hora DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_marcaciones_worker(
  p_company_id uuid,
  p_worker_id uuid
)
RETURNS SETOF public.marcaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.marcaciones m
  WHERE m.company_id = p_company_id
    AND m.worker_id = p_worker_id
  ORDER BY m.fecha DESC, m.hora DESC;
$$;

CREATE OR REPLACE FUNCTION public.registrar_comanda_admin(
  p_manager_pin text,
  p_worker_id uuid,
  p_sede text,
  p_fecha date,
  p_monto numeric,
  p_concepto text,
  p_numero_boleta text,
  p_foto_nombre text,
  p_foto_data_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_id uuid;
BEGIN
  IF NOT public.verify_manager_pin(p_manager_pin) THEN
    RAISE EXCEPTION 'Invalid manager PIN';
  END IF;
  SELECT nombre INTO v_nombre FROM public.workers
  WHERE id = p_worker_id AND company_id = public.my_company_id();
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;
  INSERT INTO public.comandas (
    company_id, worker_id, nombre, sede, fecha, monto, concepto,
    numero_boleta, foto_nombre, foto_data_url
  )
  VALUES (
    public.my_company_id(), p_worker_id, v_nombre, p_sede, p_fecha, p_monto,
    COALESCE(NULLIF(trim(p_concepto), ''), 'Consumo personal'),
    p_numero_boleta, p_foto_nombre, p_foto_data_url
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_comandas_company(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS SETOF public.comandas
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.comandas c
  WHERE c.company_id = public.my_company_id()
    AND (p_desde IS NULL OR c.fecha >= p_desde)
    AND (p_hasta IS NULL OR c.fecha <= p_hasta)
  ORDER BY c.fecha DESC, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_company_admin_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.admin_notification_email, 'emiliaabravo19@gmail.com')
  FROM public.companies c
  WHERE c.id = public.my_company_id();
$$;

ALTER TABLE public.marcaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marcaciones_select_company ON public.marcaciones;
CREATE POLICY marcaciones_select_company ON public.marcaciones
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

DROP POLICY IF EXISTS comandas_select_company ON public.comandas;
CREATE POLICY comandas_select_company ON public.comandas
  FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());

REVOKE INSERT, UPDATE, DELETE ON public.marcaciones FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.comandas FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION public.registrar_marcacion_worker(uuid, text, text, date, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_marcaciones_company(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_marcaciones_worker(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_comanda_admin(text, uuid, text, date, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_comandas_company(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_admin_email() TO authenticated;

NOTIFY pgrst, 'reload schema';
