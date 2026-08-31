# Manual checks (you do these — agent cannot)

Use while finishing Gate 1 invite / email. No secrets in chat.

---

## A. SQL `03_FIX` — **DONE** (user already ran migrations)

Skip unless **Agregar trabajador** fails again with a schema/RPC error.  
Then: Supabase → SQL Editor → re-run `supabase/03_FIX_MISSING_PROFILE.sql` → paste the error in chat.

---

## B. Resend email — real fix for “only your own email”

**What you have now:** function + secrets work. Resend **test mode** only allows sending to  
`arielleminano@gmail.com`. Other addresses → 403 (trabajador still created; use PIN link).

### Option 1 — Keep MVP moving (no domain)
Use **Copiar / Abrir enlace** after Agregar. Email can wait.

### Option 2 — Prove email works today
Agregar trabajador with worker email = **`arielleminano@gmail.com`** → should go green.

### Option 3 — Send to any worker (needs a domain you control)
1. [resend.com/domains](https://resend.com/domains) → **Add domain** → add the DNS records they show.  
2. Wait until status is **Verified**.  
3. Supabase → Edge Functions → **Secrets** → set:
   - `RESEND_FROM` = `Teresita HR <noreply@TU-DOMINIO.com>`  
     (must use that verified domain)  
4. Agregar trabajador with any worker email → expect green.

Without a verified domain, **no code change can send to Gmail/others** — Resend blocks it on purpose.

---

## C. Retest invite PIN (required before GO NEXT to Step 8)

1. Hard refresh `http://localhost:3000`.  
2. Agregar trabajador → expect **red alert** if Resend off, or **green** if Resend on.  
3. **Copiar** link → **Private window** (logged out) → paste.  
4. Expect **Crea tu PIN** (not company Entrar).  
5. Save 6-digit PIN → Personal login with that worker.  
6. Reply: `RETEST PASS` or `RETEST FAIL`.
