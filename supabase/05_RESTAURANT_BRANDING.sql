-- Restaurant branding: apply once after 03_FIX_MISSING_PROFILE.sql.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-branding', 'restaurant-branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS restaurant_branding_upload ON storage.objects;
CREATE POLICY restaurant_branding_upload
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-branding'
  AND (storage.foldername(name))[1] = public.my_company_id()::text
);

DROP POLICY IF EXISTS restaurant_branding_update ON storage.objects;
CREATE POLICY restaurant_branding_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'restaurant-branding'
  AND (storage.foldername(name))[1] = public.my_company_id()::text
)
WITH CHECK (
  bucket_id = 'restaurant-branding'
  AND (storage.foldername(name))[1] = public.my_company_id()::text
);

DROP POLICY IF EXISTS restaurant_branding_delete ON storage.objects;
CREATE POLICY restaurant_branding_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'restaurant-branding'
  AND (storage.foldername(name))[1] = public.my_company_id()::text
);

CREATE OR REPLACE FUNCTION public.set_company_logo_url(p_logo_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies
  SET logo_url = NULLIF(trim(p_logo_url), '')
  WHERE id = public.my_company_id();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_company_logo_url(text) TO authenticated;
