# Agents for this repo

Cursor loads rules from `.cursor/rules/`:

| File | Focus | When |
|------|--------|------|
| `teresita-product.mdc` | Business workflows + data | Always |
| `teresita-ui-speed.mdc` | Fast, clear UI | Always |
| `teresita-testing.mdc` | QA smoke tests + PASS/FAIL | Say “run testing phase” |

## How to use agents again (exact)

1. Open this project in Cursor.  
2. Start a **new Agent chat** (old chats may miss updated rules).  
3. Pick what you want:

| Goal | Paste this |
|------|------------|
| Build / fix product | `Follow product + UI rules. …your task…` |
| UI clarity | `Follow teresita-ui-speed. Simplify Control de equipo…` |
| Full QA | `Follow teresita-testing.mdc. Run testing phase. Existing data / Fresh DB.` |

4. Every reply should end with a console block `[TERESITA · …]`.

## Console result (all agents)

```text
[TERESITA · PRODUCT|UI|TESTING]
status: OK | WARN | FAIL
done: ...
found: ...
next: ...
```

Human checklist: `docs/TESTING_CHECKLIST.md`  
Clean DB signup: `supabase/RESET_AND_TEST.md`  
Seed test team: `supabase/04_SEED_TEST_TEAM.sql`

