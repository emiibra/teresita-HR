# Teresita HR

Control de asistencia y comandas para restaurante (React + Supabase).

## Ejecutar en local

```bash
npm install
npm start
```

Copia `.env.example` → `.env` y agrega tus claves de Supabase.

## Supabase (obligatorio para login en la nube)

Ver **`supabase/README.md`** — orden:

1. `00_RESET_DATABASE.sql`
2. `01_SETUP_TERESITA.sql`
3. `02_VERIFY.sql`
4. `05_RESTAURANT_BRANDING.sql` (imagen/logo por restaurante)

## Estructura del código

```txt
src/
  App.jsx                 # App principal
  components/             # CompanyAuthGate
  context/                # Sesión Supabase
  services/               # Llamadas a Supabase
  lib/supabaseClient.js
supabase/
  00_RESET_DATABASE.sql
  01_SETUP_TERESITA.sql
  02_VERIFY.sql
  functions/send-worker-invite/
```
