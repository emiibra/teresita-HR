-- Run once if you see: "Not authenticated or no company profile"
-- Creates company + profile for the logged-in user when the signup trigger did not run.

CREATE OR REPLACE FUNCTION public.ensure_company_profile(
  p_company_name text DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company_id uuid;
  v_email text;
  v_company_name text;
  v_full_name text;
  v_admin_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión primero';
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_uid;
  IF v_company_id IS NOT NULL THEN
    RETURN v_company_id;
  END IF;

  SELECT
    u.email,
    COALESCE(
      NULLIF(trim(p_company_name), ''),
      u.raw_user_meta_data ->> 'company_name',
      split_part(u.email, '@', 1)
    ),
    COALESCE(
      NULLIF(trim(p_full_name), ''),
      u.raw_user_meta_data ->> 'full_name',
      u.email
    ),
    COALESCE(
      u.raw_user_meta_data ->> 'admin_notification_email',
      u.email
    )
  INTO v_email, v_company_name, v_full_name, v_admin_email
  FROM auth.users u
  WHERE u.id = v_uid;

  -- Stale JWT: el usuario fue borrado de auth.users (p. ej. después de un wipe).
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'AUTH_USER_NOT_FOUND: tu sesión es de un usuario que ya no existe. Cierra sesión y vuelve a registrar la empresa.';
  END IF;

  IF v_company_name IS NULL OR length(trim(v_company_name)) = 0 THEN
    v_company_name := 'Mi empresa';
  END IF;

  INSERT INTO public.companies (name, admin_notification_email)
  VALUES (v_company_name, lower(trim(v_admin_email)))
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, full_name, role)
  VALUES (v_uid, v_company_id, v_full_name, 'owner');

  RETURN v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_company_profile(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Alta trabajador sin PIN (si aún tienes la versión antigua con p_manager_pin)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_worker_with_invite(text, text, text, text, date, text, text, text, text[], text);
DROP FUNCTION IF EXISTS public.create_worker_with_invite(text, text, text, date, text, text, text, text[], text);

CREATE OR REPLACE FUNCTION public.create_worker_with_invite(
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
  INSERT INTO public.workers (
    company_id, nombre, email, whatsapp, fecha_nacimiento, direccion,
    contacto_emergencia_nombre, contacto_emergencia_telefono, sedes, horario
  )
  VALUES (
    v_company_id, trim(p_nombre), lower(trim(p_email)), trim(p_whatsapp),
    p_fecha_nacimiento, NULLIF(trim(p_direccion), ''),
    trim(p_contacto_emergencia_nombre), trim(p_contacto_emergencia_telefono),
    p_sedes, COALESCE(p_horario, '08:00')
  )
  RETURNING id INTO v_worker_id;
  INSERT INTO public.worker_invites (worker_id, company_id)
  VALUES (v_worker_id, v_company_id)
  RETURNING id, token INTO v_invite_id, v_token;
  RETURN jsonb_build_object(
    'worker_id', v_worker_id,
    'invite_id', v_invite_id,
    'token', v_token,
    'email', lower(trim(p_email)),
    'nombre', trim(p_nombre),
    'whatsapp', trim(p_whatsapp)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_worker_with_invite(text, text, text, date, text, text, text, text[], text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Eliminar trabajador con código por correo (15 min)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.worker_delete_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_delete_codes_lookup
  ON public.worker_delete_codes (worker_id, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.worker_delete_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.issue_worker_delete_code(p_worker_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_code text;
  v_hash text;
BEGIN
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company for user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workers w
    WHERE w.id = p_worker_id AND w.company_id = v_company_id AND w.activo = true
  ) THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := extensions.crypt(v_code, extensions.gen_salt('bf'::text, 8));
  UPDATE public.worker_delete_codes
  SET used_at = now()
  WHERE worker_id = p_worker_id AND company_id = v_company_id AND used_at IS NULL;
  INSERT INTO public.worker_delete_codes (company_id, worker_id, code_hash, expires_at)
  VALUES (v_company_id, p_worker_id, v_hash, now() + interval '15 minutes');
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_worker_with_code(p_worker_id uuid, p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_row public.worker_delete_codes%ROWTYPE;
BEGIN
  v_company_id := public.my_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company for user';
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) <> 6 THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;
  SELECT * INTO v_row
  FROM public.worker_delete_codes
  WHERE worker_id = p_worker_id
    AND company_id = v_company_id
    AND used_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No active code';
  END IF;
  IF NOT extensions.crypt(trim(p_code), v_row.code_hash) = v_row.code_hash THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;
  UPDATE public.worker_delete_codes SET used_at = now() WHERE id = v_row.id;
  UPDATE public.workers SET activo = false WHERE id = p_worker_id AND company_id = v_company_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_worker_delete_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_worker_with_code(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
