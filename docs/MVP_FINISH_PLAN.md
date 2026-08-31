# Teresita HR — MVP Finish Plan

Master plan for phase-by-phase audit and ship. Follow **one step at a time**. After each step wait for **GO NEXT** or **FIX**.

**All agent/MVP docs map:** `[docs/AGENT_FILES_INDEX.md](./AGENT_FILES_INDEX.md)`  
**Bugs board (Blocker / Minor / UI):** `[docs/AUDIT_TRACKER.md](./AUDIT_TRACKER.md)`

## Scanner rules (every audit step)

1. State the precise scope of the current test.
2. Execute the test analysis.
3. Output a Severity Table (Blocker / Minor / UI) showing PASS/FAIL.
4. DO NOT write or suggest any code fixes until explicitly approved.
5. Retest after fixes are applied.
6. Process ONLY ONE STEP at a time — then stop.

## Ship bar

- **Gate 1:** Live core — company, workers, invites, PIN, marcaciones (+ build green).
- **Gate 2 (MVP done):** Control de equipo, avisos, comandas, análisis/Excel, historial trustworthy.
- localStorage pieces (jornadas, turnosPlan, solicitudes, etc.) may stay device-local; do not pretend multi-device sync.

---

## PHASE 0 — Setup (learning + control)

- [x] **Step 1.** Save this plan somewhere you’ll follow it.
- [x] **Step 2.** Create one agent: MVP Audit Scanner (generic core + Teresita pack).
- [x] **Step 3.** Confirm app runs (`npm start`) + note if Supabase is configured. Report: app URL + Supabase yes/no.

## PHASE 1 — Gate 1 audit (core live product)

- [x] **Step 4.** Run scanner: Auth / company / manager PIN only. Report PASS/FAIL. No code yet.
- [x] **Step 5.** Fix blockers only from Step 4 (one at a time). Retest. Wait for GO NEXT after clean.
- [x] **Step 6.** Run scanner: Agregar trabajador → invite → worker PIN → Personal. Report only.
- [x] **Step 7.** Fix blockers from Step 6. Retest. GO NEXT.
- [ ] **Step 8.** Run scanner: Staff day (PIN → CLOCK_IN → BREAK → CLOCK_OUT). Report only.
- [ ] **Step 9.** Fix blockers from Step 8. Retest. GO NEXT.
- [ ] **Step 10.** Run `npm run build`. Must succeed before calling Gate 1 done.
- [ ] **Step 11.** CHECKPOINT A — Gate 1 done when Steps 4–10 have zero blockers.

## PHASE 2 — Gate 2 audit (admin ops MVP)

- [ ] **Step 12.** Run scanner: Control de equipo (only 3 modes + Planificar + Editar día). Report only.
- [ ] **Step 13.** Fix blockers. Retest. GO NEXT.
- [ ] **Step 14.** Run scanner: Avisos + Comandas (manager PIN) + Historial on admin tabs. Report only.
- [ ] **Step 15.** Fix blockers. Retest. GO NEXT.
- [ ] **Step 16.** Run scanner: Análisis + Excel (3 sheets, invalid range blocked). Report only.
- [ ] **Step 17.** Fix blockers. Retest. GO NEXT.
- [ ] **Step 18.** Full scanner once: whole MVP checklist (Phases 1+2). One final audit report.
- [ ] **Step 19.** Fix any remaining blockers only. Ignore beauty unless it blocks ops.
- [ ] **Step 20.** Final build + short “MVP ship note” (what works / localStorage limits / known minors) + **Final improvements pack** (cleanup + hardening + nice-to-have — see scanner agent).
- [ ] **Step 21.** CHECKPOINT B — Teresita MVP FINISHED when Step 18–20 = no blockers.

## PHASE 3 — Template Extraction

- [ ] **Step 22.** Save scanner as a generic template (strip Teresita names; keep process).
- [ ] **Step 23.** Optional Flow Critic pass.
- [ ] **Step 24.** Optional Automation trigger.

---

## Progress log


| Step | Date       | Result | Notes                                                                                                 |
| ---- | ---------- | ------ | ----------------------------------------------------------------------------------------------------- |
| 1    | 2026-08-01 | PASS   | Saved to `docs/MVP_FINISH_PLAN.md`                                                                    |
| 2    | 2026-08-01 | PASS   | Agent def at `docs/agents/MVP_AUDIT_SCANNER.md`                                                       |
| 3    | 2026-08-03 | PASS   | App [http://localhost:3000](http://localhost:3000) ; Supabase YES; index at docs/AGENT_FILES_INDEX.md |
| 4    | 2026-08-03 | WARN   | 1 Blocker (admin vista bypass); minors listed; no fixes yet                                           |
| 5    | 2026-08-03 | RETEST | Patched admin vista restore without PIN in App.jsx — user must confirm click retest                   |
| 5b   | 2026-08-06 | RETEST | User RETEST FAIL; hardened: no admin persist + clear unlock on load                                   |
| 5    | 2026-08-06 | PASS   | B-AUTH-1 FIXED — user RETEST PASS                                                                     |
| 6    | 2026-08-06 | WARN   | Invite audit: B-INV-1 OPEN (gate blocks crear-pin); B-INV-2 NOT TESTED (SQL 03)                       |
| 7    | 2026-08-06 | RETEST | B-INV-1 gate bypass for crear-pin; B-INV-2 clearer RPC error + 03 in gate help                       |
| 7    | 2026-08-30 | PASS   | B-INV-1 FIXED — user RETEST PASS (invite link → PIN → Personal)                                      |


