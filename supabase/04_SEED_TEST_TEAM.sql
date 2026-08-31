-- =============================================================================
-- TERESITA HR — 04_SEED_TEST_TEAM.sql
-- Seeds a full demo team + sample punches + comandas for QA.
--
-- PREREQUISITES (do this first):
--   1. Run 00 → 01 → 03 (and optional 02_VERIFY)
--   2. Create company in the APP: "Crear empresa" + manager PIN
--   3. THEN run this script in SQL Editor
--
-- Why step 2 first?
--   Auth users must be created by the app (Supabase Auth). This script only
--   fills workers / marcaciones / comandas for YOUR existing company.
--
-- KNOWN TEST PINs (all 6 digits):
--   Manager PIN: unchanged (whatever you set in the app)
--   Jayden     → 111111
--   Lucía      → 222222
--   Carlos     → 333333
--   María      → 444444
--   Pedro      → 555555
--   Ana        → 666666
--
-- NOT seeded here (still localStorage in the app):
--   jornadas / turnosPlan / solicitudes / overtime / historial ediciones
-- =============================================================================

DO $$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_w1 uuid;
  v_w2 uuid;
  v_w3 uuid;
  v_w4 uuid;
  v_w5 uuid;
  v_w6 uuid;
  v_hoy date := (timezone('America/Lima', now()))::date;
  v_ayer date := (timezone('America/Lima', now()))::date - 1;
BEGIN
  -- Use the newest company (the one you just created in the app)
  SELECT c.id, c.name
  INTO v_company_id, v_company_name
  FROM public.companies c
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION
      'No company found. First open the app → Crear empresa → set manager PIN, then re-run this script.';
  END IF;

  RAISE NOTICE 'Seeding test team for company: % (%)', v_company_name, v_company_id;

  -- Wipe previous seed workers for this company (safe to re-run)
  DELETE FROM public.comandas
  WHERE company_id = v_company_id
    AND concepto LIKE 'SEED:%';

  DELETE FROM public.marcaciones
  WHERE company_id = v_company_id
    AND puntualidad LIKE 'SEED:%';

  DELETE FROM public.workers
  WHERE company_id = v_company_id
    AND email LIKE '%@seed.teresita.test';

  -- -------------------------------------------------------------------------
  -- Workers (plantilla hours encoded in horario = typical entrada)
  -- -------------------------------------------------------------------------
  INSERT INTO public.workers (
    id, company_id, nombre, email, whatsapp, fecha_nacimiento, direccion,
    contacto_emergencia_nombre, contacto_emergencia_telefono,
    sedes, horario, rol, pin_hash, activo
  ) VALUES
  (
    gen_random_uuid(), v_company_id, 'Jayden Seed', 'jayden@seed.teresita.test',
    '+51911111111', '1998-03-12', 'Comas',
    'Mamá Jayden', '+51910000001',
    ARRAY['Comas']::text[], '07:00', 'Colaborador',
    public.hash_pin('111111'), true
  ),
  (
    gen_random_uuid(), v_company_id, 'Lucía Seed', 'lucia@seed.teresita.test',
    '+51922222222', '1995-07-22', 'Surquillo',
    'Papá Lucía', '+51920000002',
    ARRAY['Surquillo']::text[], '08:00', 'Cocina',
    public.hash_pin('222222'), true
  ),
  (
    gen_random_uuid(), v_company_id, 'Carlos Seed', 'carlos@seed.teresita.test',
    '+51933333333', '1992-11-05', 'Comas',
    'Hermana Carlos', '+51930000003',
    ARRAY['Comas', 'Surquillo']::text[], '07:00', 'Mozo',
    public.hash_pin('333333'), true
  ),
  (
    gen_random_uuid(), v_company_id, 'María Seed', 'maria@seed.teresita.test',
    '+51944444444', '1999-01-18', 'Surquillo',
    'Tía María', '+51940000004',
    ARRAY['Surquillo']::text[], '15:00', 'Caja',
    public.hash_pin('444444'), true
  ),
  (
    gen_random_uuid(), v_company_id, 'Pedro Seed', 'pedro@seed.teresita.test',
    '+51955555555', '1990-09-30', 'Comas',
    'Esposa Pedro', '+51950000005',
    ARRAY['Comas']::text[], '07:00', 'Cocina',
    public.hash_pin('555555'), true
  ),
  (
    gen_random_uuid(), v_company_id, 'Ana Seed', 'ana@seed.teresita.test',
    '+51966666666', '1997-05-08', 'Surquillo',
    'Hermano Ana', '+51960000006',
    ARRAY['Comas', 'Surquillo']::text[], '08:00', 'Colaborador',
    public.hash_pin('666666'), true
  );

  SELECT id INTO v_w1 FROM public.workers WHERE company_id = v_company_id AND email = 'jayden@seed.teresita.test';
  SELECT id INTO v_w2 FROM public.workers WHERE company_id = v_company_id AND email = 'lucia@seed.teresita.test';
  SELECT id INTO v_w3 FROM public.workers WHERE company_id = v_company_id AND email = 'carlos@seed.teresita.test';
  SELECT id INTO v_w4 FROM public.workers WHERE company_id = v_company_id AND email = 'maria@seed.teresita.test';
  SELECT id INTO v_w5 FROM public.workers WHERE company_id = v_company_id AND email = 'pedro@seed.teresita.test';
  SELECT id INTO v_w6 FROM public.workers WHERE company_id = v_company_id AND email = 'ana@seed.teresita.test';

  -- -------------------------------------------------------------------------
  -- Marcaciones: yesterday full day (Jayden, Lucía, Carlos)
  -- -------------------------------------------------------------------------
  INSERT INTO public.marcaciones (company_id, worker_id, nombre, sede, fecha, tipo, hora, puntualidad)
  VALUES
  -- Jayden Comas ayer (on time morning shift)
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_ayer, 'CLOCK_IN', '07:02', 'SEED:ok'),
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_ayer, 'BREAK_IN', '12:00', 'SEED:ok'),
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_ayer, 'BREAK_OUT', '12:45', 'SEED:ok'),
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_ayer, 'CLOCK_OUT', '15:05', 'SEED:ok'),
  -- Lucía Surquillo ayer (late)
  (v_company_id, v_w2, 'Lucía Seed', 'Surquillo', v_ayer, 'CLOCK_IN', '08:25', 'SEED:tarde'),
  (v_company_id, v_w2, 'Lucía Seed', 'Surquillo', v_ayer, 'BREAK_IN', '13:00', 'SEED:ok'),
  (v_company_id, v_w2, 'Lucía Seed', 'Surquillo', v_ayer, 'BREAK_OUT', '13:45', 'SEED:ok'),
  (v_company_id, v_w2, 'Lucía Seed', 'Surquillo', v_ayer, 'CLOCK_OUT', '17:10', 'SEED:ok'),
  -- Carlos Comas ayer (overtime)
  (v_company_id, v_w3, 'Carlos Seed', 'Comas', v_ayer, 'CLOCK_IN', '07:00', 'SEED:ok'),
  (v_company_id, v_w3, 'Carlos Seed', 'Comas', v_ayer, 'BREAK_IN', '12:00', 'SEED:ok'),
  (v_company_id, v_w3, 'Carlos Seed', 'Comas', v_ayer, 'BREAK_OUT', '12:45', 'SEED:ok'),
  (v_company_id, v_w3, 'Carlos Seed', 'Comas', v_ayer, 'CLOCK_OUT', '18:00', 'SEED:extra'),
  -- Hoy: Jayden mid-shift (still working)
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_hoy, 'CLOCK_IN', '07:00', 'SEED:hoy'),
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_hoy, 'BREAK_IN', '12:05', 'SEED:hoy'),
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_hoy, 'BREAK_OUT', '12:50', 'SEED:hoy'),
  -- María afternoon shift started
  (v_company_id, v_w4, 'María Seed', 'Surquillo', v_hoy, 'CLOCK_IN', '15:00', 'SEED:hoy');

  -- -------------------------------------------------------------------------
  -- Comandas sample (money)
  -- -------------------------------------------------------------------------
  INSERT INTO public.comandas (
    company_id, worker_id, nombre, sede, fecha, monto, concepto, numero_boleta, foto_nombre
  ) VALUES
  (v_company_id, v_w1, 'Jayden Seed', 'Comas', v_ayer, 18.50, 'SEED:Almuerzo staff', 'B-SEED-001', NULL),
  (v_company_id, v_w2, 'Lucía Seed', 'Surquillo', v_ayer, 12.00, 'SEED:Bebida', 'B-SEED-002', NULL),
  (v_company_id, v_w3, 'Carlos Seed', 'Comas', v_hoy, 25.00, 'SEED:Menú del día', 'B-SEED-003', NULL);

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'SEED OK — company: %', v_company_name;
  RAISE NOTICE 'Workers (Personal → pick name → PIN):';
  RAISE NOTICE '  Jayden Seed  PIN 111111  sede Comas     horario 07:00';
  RAISE NOTICE '  Lucía Seed   PIN 222222  sede Surquillo horario 08:00';
  RAISE NOTICE '  Carlos Seed  PIN 333333  ambas sedes    horario 07:00';
  RAISE NOTICE '  María Seed   PIN 444444  sede Surquillo horario 15:00 (tarde)';
  RAISE NOTICE '  Pedro Seed   PIN 555555  sede Comas     horario 07:00';
  RAISE NOTICE '  Ana Seed     PIN 666666  ambas sedes    horario 08:00';
  RAISE NOTICE 'Marcaciones: ayer (completas) + hoy (parcial).';
  RAISE NOTICE 'Comandas: 3 boletas SEED (S/ 18.50 + 12 + 25).';
  RAISE NOTICE 'Next in app: hard refresh → Personal / Admin → Análisis → Excel.';
  RAISE NOTICE 'Plantillas/turnos: create in UI (localStorage), not in SQL.';
  RAISE NOTICE '--------------------------------------------------';
END $$;

-- Quick verify
SELECT nombre, email, rol, sedes, horario, activo
FROM public.workers
WHERE email LIKE '%@seed.teresita.test'
ORDER BY nombre;

SELECT fecha, nombre, sede, tipo, hora
FROM public.marcaciones
WHERE puntualidad LIKE 'SEED:%'
ORDER BY fecha, nombre, hora;

SELECT fecha, nombre, sede, monto, concepto, numero_boleta
FROM public.comandas
WHERE concepto LIKE 'SEED:%'
ORDER BY fecha, nombre;
