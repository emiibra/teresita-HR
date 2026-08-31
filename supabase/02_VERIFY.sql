-- Paste in Supabase → SQL Editor → Run
-- Shows what Teresita tables exist in YOUR project right now

SELECT
  t.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'missing' END AS status
FROM (
  VALUES
    ('companies'),
    ('profiles'),
    ('manager_pins'),
    ('workers'),
    ('worker_invites'),
    ('marcaciones'),
    ('comandas')
) AS expected(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
  AND t.table_name = expected.table_name
ORDER BY expected.table_name;

-- If any row is missing → run 00_RESET then 01_SETUP_TERESITA.sql
