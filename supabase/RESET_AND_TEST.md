# Reset + test signup (clean workflow)

## What gets deleted

| Place | What |
|-------|------|
| Supabase tables | companies, profiles, workers, invites, marcaciones, comandas, manager_pins, worker_delete_codes |
| Supabase Auth | **all** users (so old emails are free again) |
| Browser | session + `teresita.*` localStorage (schedules, solicitudes, etc.) |

## Exact order (do this once)

### A) Wipe + rebuild in Supabase
1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → your Teresita project  
2. Left menu → **SQL Editor** → **New query**  
3. Paste **entire** file `supabase/00_RESET_DATABASE.sql` → **Run** → wait for Success  
4. New query → paste **entire** `supabase/01_SETUP_TERESITA.sql` → **Run** → Success  
5. New query → paste **entire** `supabase/03_FIX_MISSING_PROFILE.sql` → **Run** → Success  
6. (Optional) Run `supabase/02_VERIFY.sql` to confirm tables exist  
7. **Authentication → Users**: list should be **empty**. If anyone remains, delete them manually.

### B) Clear the browser
1. Open `http://localhost:3001`  
2. DevTools (`Cmd+Option+I`) → **Application** → **Local Storage** → `http://localhost:3001` → **Clear All**  
3. Also clear **Session Storage** for that site  
4. Hard refresh: **Cmd+Shift+R**

### C) Create a NEW company (any email — not forced)
1. Click **Crear empresa**  
2. Fill:
   - Nombre empresa: e.g. `Teresita El Legado`
   - Correo: **your real new email** (Gmail/etc.) — leave blank until you type it
   - Contraseña: min 6 characters (remember it)
3. Click create / submit  
4. If email confirmation is ON in Supabase Auth settings, open the confirm link in email first  
5. Create **PIN de gerente** (6 digits) when asked — remember it  
6. Enter app → **Administrador** → unlock with that PIN  

### D) Smoke-test workflow
1. Control de equipo → **Agregar trabajador** → fill form → invite  
2. Open invite / crear-PIN link → set worker PIN  
3. **Personal** → pick worker → PIN → clock in  
4. **Análisis** → Descargar Excel  

## `.env` note
`REACT_APP_ADMIN_NOTIFY_EMAIL` is only a fallback for notifications.  
Signup now uses **the email you type** as the company notify email.  
You can set `.env` to that same new email later if you want.
