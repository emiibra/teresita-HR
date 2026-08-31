# Teresita MVP — Audit Tracker

**How to use:** One place to see what failed, what’s fixed, and what’s waiting.  
Update after each scanner step. Master plan stays in `docs/MVP_FINISH_PLAN.md`.

---

## Legend

| Status | Meaning |
|--------|---------|
| `OPEN` | Still a problem |
| `FIXED` | Code changed + retest PASS |
| `RETEST` | Code changed — waiting for your click confirm |
| `DEFERRED` | Not fixing until after blockers / after MVP |
| `NOT TESTED` | Need click or Supabase check |

| Severity | Action |
|----------|--------|
| **Blocker** | Fix before Gate checkpoint |
| **Minor** | Can ship with note; fix when free |
| **UI** | Polish only |

---

## GATE 1 — Core (Auth → Workers → Staff → Build)

### Blockers

| ID | Issue | Step found | Status | Where / notes |
|----|-------|------------|--------|---------------|
| B-AUTH-1 | Admin restored on reload without re-asking manager PIN | Step 4 | `FIXED` | RETEST PASS 2026-08-06 |
| B-INV-1 | Worker invite `?crear-pin=` blocked by company login gate | Step 6 | `FIXED` | RETEST PASS 2026-08-30 — link → crear PIN → Personal login |
| B-INV-2 | `create_worker_with_invite` needs SQL `03_FIX` | Step 6 | `FIXED` | User confirmed migrations already applied (2026-08-06). Do not re-ask unless alta fails again. |

### Minors

| ID | Issue | Step found | Status | Notes |
|----|-------|------------|--------|-------|
| M-AUTH-1 | Password JS 6 vs HTML minLength 8 | Step 4 | `DEFERRED` | |
| M-AUTH-2 | Signup email-confirm UX | Step 4 | `NOT TESTED` | |
| M-AUTH-3 | `ensure_company_profile` needs `03_FIX` | Step 4 | `FIXED` | Migrations already used (user confirmed) |
| M-AUTH-4 | Staff kiosk needs company session | Step 4 | `DEFERRED` | Invite phones fixed via B-INV-1 |
| M-INV-1 | WhatsApp required but invite is email-only | Step 6 | `DEFERRED` | |
| M-INV-2 | Worker appears in Personal before PIN is set | Step 6 | `DEFERRED` | |
| M-INV-3 | No resend invite / offline invites never expire | Step 6 | `DEFERRED` | |
| M-INV-4 | Offline duplicate emails allowed | Step 6 | `DEFERRED` | |

### UI

| ID | Issue | Step found | Status | Notes |
|----|-------|------------|--------|-------|
| U-AUTH-1 | No clear company logout in App | Step 4 | `DEFERRED` | |
| U-INV-1 | False “email sent” with no red alert | Step 6–7 | `FIXED` | Honest alert + link path; Resend/domain deferred for MVP |
| U-INV-2 | Agregar trabajador form too heavy | Step 7 | `FIXED` | MVP: nombre/apellido/tel + sedes; optional under “Más datos”; button “Crear trabajador” |

### Gate 1 scan progress

| Area | Plan step | Status |
|------|-----------|--------|
| Auth / manager PIN | Steps 4–5 | Done |
| Worker invite → PIN → Personal | Steps 6–7 | **Done** (Step 7 RETEST PASS 2026-08-30) |
| Staff day in/break/out | Steps 8–9 | Pending |
| `npm run build` | Step 10 | Pending |
| Checkpoint A | Step 11 | Pending |

---

## GATE 2 — Admin ops (after Gate 1 clean)

| Area | Plan step | Status |
|------|-----------|--------|
| Control de equipo | Steps 12–13 | Pending |
| Avisos + Comandas + Historial | Steps 14–15 | Pending |
| Análisis + Excel | Steps 16–17 | Pending |
| Full scan + ship note | Steps 18–20 | Pending |
| Checkpoint B (MVP done) | Step 21 | Pending |

---

## Your next action (sticky)

**Step 7 complete.** Reply **GO NEXT** for Step 8 — scanner: staff day (PIN → CLOCK_IN → BREAK → CLOCK_OUT). Report only, no fixes until you say FIX.

**Email / Resend:** still deferred — link path is enough for Gate 1.

**Do work in:** MVP Audit Scanner chat + `teresita-HR`.
