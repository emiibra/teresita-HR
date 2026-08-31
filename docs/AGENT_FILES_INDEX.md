# Agent / MVP docs — where everything lives

All of this is **inside the same project folder** `teresita-HR` (one GitHub repo).  
You open files in Cursor’s file tree or search by name. The agent does **not** replace this folder — it **reads and edits** these files when you ask.

## Start here (index)

| File | What it is |
|------|------------|
| `docs/AGENT_FILES_INDEX.md` | **This list** — map of all agent/MVP docs |
| `docs/MVP_FINISH_PLAN.md` | Numbered finish plan + progress log |
| `docs/AUDIT_TRACKER.md` | **Bugs board** — Blockers / Minors / UI separated + status |
| `docs/MANUAL_CHECKS.md` | What **you** must do in Supabase / Resend / retest |
| `docs/agents/MVP_AUDIT_SCANNER.md` | Scanner agent = generic core + honesty/UX checks + Teresita pack |
| `docs/TESTING_CHECKLIST.md` | Human + agent smoke checklist |
| `.cursor/rules/teresita-testing.mdc` | Testing agent rule |
| `.cursor/rules/teresita-product.mdc` | Product laws |
| `.cursor/rules/teresita-ui-speed.mdc` | UI speed laws |

## How you access them

1. **File tree (left sidebar)** → open `docs/` → open the file.  
2. **Quick open** → `Cmd+P` → type `MVP_FINISH` or `AUDIT_SCANNER`.  
3. **In chat** → type `@MVP_FINISH_PLAN` or `@MVP_AUDIT_SCANNER` to attach context.  
4. **Agent** → when this chat (or a new agent) runs a step, it reads these paths automatically if instructed.

You do **not** need a second GitHub project.  
Cursor Agents/Automations UI is only *how the AI runs*; the **source of truth** for instructions is these docs in the repo.
