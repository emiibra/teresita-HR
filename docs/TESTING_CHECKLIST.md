# Teresita HR — Testing checklist (you + agent)

Use this when you enter the **testing phase**.  
Cursor agent rule: `.cursor/rules/teresita-testing.mdc`

## What “testing phase” means

1. **You** click through the real app (or describe what broke).  
2. The **testing agent** follows the checklist, runs `npm run build`, and writes PASS/FAIL.  
3. Only then it **fixes** failures — one blocker at a time.  
4. You hard-refresh and re-check.

This is **manual / smoke QA**, not a separate Selenium suite (yet). Goal: prove the restaurant workflow works end-to-end.

```text
Prep → Auth → Add worker → Staff clock → Admin schedule → Comandas → Excel → Report → Fix FAILs
```

---

## Before you start

| Check | How |
|-------|-----|
| App running | `npm start` → http://localhost:3001 |
| Clean signup test? | Follow `supabase/RESET_AND_TEST.md` first |
| Hard refresh | Cmd+Shift+R |

---

## Checklist (tick as you go)

### A. Company
- [ ] Crear empresa OR Entrar
- [ ] PIN gerente 6 dígitos
- [ ] Administrador unlock

### B. Worker
- [ ] Agregar trabajador
- [ ] Invite / crear PIN
- [ ] Appears in Personal

### C. Staff
- [ ] PIN login
- [ ] Ingreso → refrigerio → salida
- [ ] See schedule / organización

### D. Admin equipo
- [ ] Calendario
- [ ] Por persona
- [ ] Marcaciones
- [ ] Planificar fechas

### E. Ops + Excel
- [ ] Avisos
- [ ] Comanda + PIN
- [ ] Análisis rango
- [ ] Excel 3 hojas

### F. Always
- [ ] `npm run build` succeeds
- [ ] Historial ediciones visible in admin

---

## How to start the agent in Cursor

1. **New Agent chat**  
2. Paste:

```text
Follow .cursor/rules/teresita-testing.mdc and docs/TESTING_CHECKLIST.md.
Run the testing phase for Teresita HR.
App is at http://localhost:3001.
[Fresh DB / Existing data — pick one].
Start Phase 0–1, then continue. Report PASS/FAIL before fixing.
```

3. You click the UI; tell the agent what you see (or paste errors/screenshots).  
4. Agent reports → then fixes FAILs.

Every agent reply should end with a **console block** like:

```text
[TERESITA · TESTING]
status: OK | WARN | FAIL
phase: ...
pass: ...
fail: ...
found: ...
next: ...
```

---

## Pass criteria (done)

- Build green  
- Can create/login company, set PIN, add worker, clock, plan a day, register comanda, download Excel  
- Control de equipo has clear Calendario / Por persona / Marcaciones  
- No crash on main tabs
