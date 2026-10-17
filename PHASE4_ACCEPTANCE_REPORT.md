# Phase 4 acceptance report
Environment: sandbox with no Supabase, OpenAI, Twilio or Vercel access. Real Chromium 141 was used against a MOCKED backend. Nothing was deployed. Do not read any PASS below as a live result unless the Kind column says live (there are none).

## Results
| Item | Status | Kind |
|---|---|---|
| `npm ci` | PASS | build |
| `npm test` 66 tests: core 8, rls 11, phase2 7, phase3 7, routes 27, security 6 | PASS | unit, PGlite, mocked routes, static checks |
| `npm run build` | PASS | build |
| Build with no server secrets set (only the two public variables) | PASS | build |
| Browser, 17 steps: landing, password-recovery screen, sign in, summary and stale banner, search and clear, list view, pagination, sort, unknown-deadline filter, kanban, dialog open and Escape, edit form request, notifications, team, 401 sign-out, mobile overflow, mobile filter width. No console errors in the final run | PASS | browser, mocked backend |
| Static check: no server secret or server-only module in client files, every route authenticates or verifies, demo bypass disabled in production, GET routes forced dynamic | PASS | static |
| Sign-up, email confirmation, password reset against real Supabase | BLOCKED | live |
| Onboarding wizard persistence (4 steps), Vault persistence | NOT RUN in browser. Logic reviewed. Org update denial for members tested in PGlite | |
| Tasks, notes, invites, role change, removal, documents UI in browser | NOT RUN | |
| Cross-organization access (database level) | PASS | PGlite |
| Cross-organization access (deployed app, two accounts) | BLOCKED | live |
| Storage privacy, signed URL expiry, partial-failure cleanup | BLOCKED | live |
| Upload validation | PASS | mocked routes |
| OpenAI extraction and strategy | BLOCKED | live. Malformed output handling PASS in unit tests |
| Twilio webhook end to end | BLOCKED | live. Signature, replay, unknown sender, rate limit PASS in mocked routes |
| Vercel deployment, build log, runtime logs | BLOCKED | no access |
| Cron registered and firing on Vercel | BLOCKED | |
| Keyboard-only walkthrough, screen reader, real mobile devices | NOT RUN | |

## Defects fixed in Phase 4
1. Password-reset link signed the user in without letting them set a password. Added a set-new-password screen (browser-tested).
2. `/api/status` ran at build time and failed the build without server secrets. Found by the build. GET routes are now forced dynamic, with a regression test.
3. Application link was saved from the browser without validation. It now goes through the validated server route.
4. Onboarding had no invite step. Added as optional step 4.
5. Sign-up and sign-in validation and honest messages (confirm email, 8 character minimum).
6. Invalid, expired or already-used invitation links now explain the cause in one message.
7. Corrected fields now show the original AI value next to "corrected by you".
8. Fit score copy says it is not an award prediction (landing page and opportunity detail). Added a "how to read this page" note.
9. Server status endpoint and UI show AI live or demo, WhatsApp configured or not, reminder job configured or not. Booleans only (tested to leak no secrets).
10. Retry button shows attempts used and disables at the limit.
11. Added `engines` and `.nvmrc`. `.env.example` now separates required, optional and local-only variables.
12. Landing steps renamed Capture, Assess, Coordinate.

## Files changed
`app/page.js`, `app/app/page.js`, `app/api/status/route.js` (new), `app/api/cron/route.js`, `app/api/documents/route.js`, `package.json`, `.nvmrc`, `.env.example`, `tests/routes.test.js`, `tests/security.test.js` (new), `tests/browser/smoke.py`, `docs/*` (new), `PHASE4_BASELINE.md`, this report, `README.md`. No migration was added in Phase 4. Migrations 0001 to 0004 are all still required and none has been applied to a real project.

## Release checklist
Backup, run migrations once in order, set env vars, configure Supabase Auth URLs, deploy, smoke test, create two accounts and test isolation, configure Twilio, verify cron registration, set retention and backups, then promote. See `docs/VERCEL_DEPLOYMENT.md`.

## Known limitations
No queue (webhook synchronous, 24 s budget). Invites are copy-link only, no email. Reminders are in-app, UTC dates. Images cannot be retried. No focus trap in dialogs, notification panel ignores Escape. Chunked uploads without a length rely on the host limit. DNS rebinding window in URL fetching. No token or cost accounting for AI. WhatsApp message text has no retention job. One organization per user. No ownership transfer.

## Actions for you
1. Create a test Supabase project and apply the four migrations (backup first).
2. Deploy to Vercel with the variables in `.env.example`.
3. Run the smoke tests and the two-account isolation test on the deployed URL.
4. Add Twilio and OpenAI keys, test one real message and one real extraction.
5. Confirm the cron job in the Vercel dashboard.
Not production-ready until steps 1 to 5 pass.
