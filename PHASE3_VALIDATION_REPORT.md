# Phase 3 validation report
Environment: no Supabase, OpenAI, Twilio or Vercel credentials, and those hosts are not reachable from the sandbox (0 matching environment variables). Everything live is BLOCKED. Chromium 141 (Python Playwright) was available, so a real-browser run was done against a MOCKED backend.

## Results (PASS = executed and verified)
| Item | Status | Kind | Notes |
|---|---|---|---|
| `npm ci` from lockfile | PASS | build | 66 packages |
| `npm test` | PASS | mixed | 59 tests: core 8 (unit), rls 11 + phase2 7 + phase3 7 (PGlite Postgres engine), routes 26 (route handlers, mocked Supabase/ingest/limiter) |
| `npm run build` | PASS | build | |
| Lint, type check | NOT RUN | | No ESLint config, project is JavaScript |
| Migrations 0001 to 0004 fresh order | PASS | PGlite | Not real Supabase |
| Upgrade over existing data | PASS | PGlite | Legacy bad rows kept, new bad rows rejected. Upgrade from a Phase 2 schema (0001 to 0003 applied) to 0004 is covered by the same additive path, not tested separately |
| Tenant isolation, roles, removal, invites, notifications, documents rows | PASS | PGlite | Direct SQL as separate users with RLS on |
| Reminder dedupe, retry claim (cap 3, in-flight protection) | PASS | PGlite | Sequential. True concurrent clients were NOT exercised |
| Browser: landing, sign-in, summary, search, clear, list, pagination, sort, unknown-deadline filter, kanban, dialog open/Escape, edit PATCH, notifications, team, 401 sign-out, mobile overflow, mobile filter width | PASS (16 steps) | browser, mocked backend | `tests/browser/smoke.py`. Backend responses are fabricated by the test. One transient "Failed to fetch RSC payload" console error appeared in 2 of 5 runs (aborted prefetch during navigation), none in the final run |
| Browser: tasks, invites, documents UI, vault, onboarding wizard, role change, removal, keyboard focus trap, screen reader | NOT RUN | | |
| Browser: two-organization isolation journey | BLOCKED | | Needs a live backend |
| Live Supabase auth, RLS, RPC, triggers | BLOCKED | | |
| Storage: bucket privacy, Storage policies, signed URL expiry, partial-failure consistency | BLOCKED | | Code reviewed only. Bucket is private with no policies, all access via service-role routes |
| Upload validation (PDF, DOCX, TXT sniffing, size) | PASS | mocked routes | Misleading extensions, SVG, over 4 MB, declared length |
| Twilio signature, replay, unknown sender, rate limit, demo-bypass blocked in production | PASS | mocked routes | Real Twilio traffic BLOCKED |
| OpenAI timeout, malformed output, rate limit | PARTIAL | | Malformed output and sanitizing covered by unit tests. Live timeout and outage paths NOT RUN |
| Measure webhook timeout under real load | NOT RUN | | Still synchronous, 24 s budget inside a 30 s limit |
| Per-org AI budget under concurrent requests | BLOCKED | | Atomic upsert by design, verified single-client only |
| Cron secret auth | PASS | mocked route | Constant-time compare |
| Cron actually scheduled on Vercel | BLOCKED | | `vercel.json` declares it. Check the Vercel dashboard after deploy |

## Defects found and fixed in Phase 3
| # | Sev | Defect | Fix | Verified by |
|---|---|---|---|---|
| 1 | Med | Reminder dedupe was check-then-insert, not race-safe | Unique index and ON CONFLICT (0004) | PGlite |
| 2 | Med | Retry had no cap and two admins could double-claim | `claim_retry` atomic compare-and-set, cap 3, 2 minute in-flight guard (0004) | PGlite |
| 3 | Med | Upload body buffered before size check | Declared-length precheck (413). Chunked bodies without a length are bounded only by the host limit | mocked routes |
| 4 | Low | DOCX check accepted any zip containing "word/" | Also requires `[Content_Types].xml`. Download filename sanitized | mocked routes |
| 5 | Low | Cron secret compared with `!==` | `timingSafeEqual` | mocked routes |
| 6 | Med | Twilio signature failed if APP_BASE_URL ended in "/" (all webhooks 403) | Normalized | mocked routes |
| 7 | Med | Expired session: null dereference in token helper, no sign-out | Null-safe, 401 signs out | browser |
| 8 | Med | Detail dialog: Escape did nothing, no focus on open or restore on close | Focus management, document Escape handler | browser |
| 9 | Med | Mobile: filter row collapsed to slivers | CSS fix with regression assertion | browser |
| 10 | Med | Route handlers had no tests | 26 mocked tests | |

## Migration review
None of 0001 to 0004 is re-runnable (plain CREATE, ADD CONSTRAINT, DROP POLICY). Apply once, in order. 0002 and 0003 rely on the default constraint names created by 0001. Replaced objects: foreign keys (0002), policies `inv_adm`, `opp_ins`, `mem_own` (0002, 0003). No data is deleted. There are no down migrations: take a backup or enable point-in-time recovery before applying, and restore from it to roll back.

## Other facts
- Reminders are in-app notifications only. Nothing is sent to email or WhatsApp. Date logic uses the database `current_date` (UTC on Supabase). For Bangladesh (UTC+6) a reminder can run up to 6 hours off the local date. Deadlines are plain dates with no time zone.
- AI usage control is a request-count cap per user, sender and organization per day. There is no token or cost accounting.
- App code has no `console` logging. `inbound_messages` keeps full message text and short error text. No retention policy exists.
- Orphan risk: a deletion that removes the stored file but fails to delete the database row leaves a row pointing at a missing file (returns an error, retry works). Upload failure after storing removes the file.

## Remaining risks
Live behaviour of Supabase RLS, Storage and cron is unverified. Concurrency is verified by design and single-client tests only. Several screens have never been opened in a browser. No focus trap in dialogs. DNS rebinding window in URL fetching. Not production ready.

## Commands
`npm ci`, `npm test`, `npm run build`. Browser: build with `NEXT_PUBLIC_SUPABASE_URL=https://fake.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`, run `npx next start -p 3100`, then `python3 tests/browser/smoke.py http://localhost:3100` (needs Python Playwright with Chromium).
