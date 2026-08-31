# Teresita HR — Supabase (solo 3 archivos SQL)

## Orden exacto en SQL Editor (wipe limpio + test)

| Paso | Archivo | Qué hace |
|------|---------|----------|
| 1 | `00_RESET_DATABASE.sql` | Borra tablas Teresita **y** todos los usuarios Auth |
| 2 | `01_SETUP_TERESITA.sql` | Crea todo de nuevo |
| 3 | `03_FIX_MISSING_PROFILE.sql` | Perfil + delete codes (recomendado siempre) |
| 4 | `02_VERIFY.sql` | Comprueba tablas |
| 5 | `04_SEED_TEST_TEAM.sql` | **Después** de Crear empresa en la app: 6 trabajadores + marcaciones + comandas |

Guía limpia: **`RESET_AND_TEST.md`**  
Seed team: **`04_SEED_TEST_TEAM.sql`** (PINs 111111…666666)

## App `.env`

```env
REACT_APP_SUPABASE_URL=https://TU_PROYECTO.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...anon...
REACT_APP_ADMIN_NOTIFY_EMAIL=tu-correo@ejemplo.com
```

(`ADMIN_NOTIFY_EMAIL` es fallback; al crear empresa se usa el correo del signup.)

## Flujo de la app

1. **Crear empresa** (cualquier correo) o **Entrar**
2. Crear PIN de gerente (6 dígitos)
3. Administrador → agregar trabajador → enlace PIN
4. Trabajador → enlace → PIN → Vista Personal

## Correos (Resend — gratis para tu volumen)

Guía paso a paso: **`EMAIL_SETUP.md`**

Resumen: cuenta en [resend.com](https://resend.com) → API key → secrets en Supabase → deploy `send-worker-invite`.  
Plan gratis ≈ 3.000 correos/mes; Teresita usa muy pocos. Sin Resend, el código de eliminar trabajador sigue saliendo en pantalla.
