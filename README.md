# FundFlow
Grant pipeline for NGOs. Next.js 14 (App Router), Supabase (Auth, Postgres, RLS), OpenAI (optional), Twilio WhatsApp.

## Run locally
1. Create a Supabase project. Fresh install: run `0001_init.sql`, `0002_hardening.sql`, `0003_phase2.sql`, `0004_phase3.sql` in order in the SQL editor. Back up first. Each runs once. Existing install: run only the files you have not applied.
2. `cp .env.example .env.local` and fill values. Leave `OPENAI_API_KEY` empty for the labeled demo extractor.
3. `npm install && npm run dev`. Tests: `npm test`.

## Deploy
Push to GitHub, import in Vercel, add the same env vars (set `APP_BASE_URL` to your exact Vercel origin), deploy.

## WhatsApp (Twilio)
Webhook (POST): `https://YOUR-APP/api/whatsapp` (no query string). `APP_BASE_URL` must equal the exact origin Twilio calls. Requests are rejected unless the Twilio signature is valid. Add your number in the WhatsApp tab, then send `VERIFY <code>` from it. Unverified senders never create records. Delivery retries are deduplicated by MessageSid.

## Design notes
- Tenant isolation: RLS via `my_org()`; server routes resolve the org from verified membership, never from client input. One org per user in this MVP.
- Eligibility: deterministic scorer (`lib/score.js`). Hard conflicts cap the score at 35 and force "Likely ineligible". Unknown inputs score 0 and lower confidence. Weights are product defaults, set `SCORE_WEIGHTS` to change.
- URL fetching blocks private ranges, limits redirects, size and content type (`lib/safeFetch.js`). DNS rebinding is a residual risk.
- Webhook processing is synchronous within the Vercel function limit. A queue is the next step for slow AI calls.

## Documentation
`docs/PRD.md`, `docs/TRD.md`, `docs/APP_FLOW.md`, `docs/DESIGN_SYSTEM.md`, `docs/VERCEL_DEPLOYMENT.md`, `PHASE4_ACCEPTANCE_REPORT.md`. Product principle: AI supports the decision, the NGO makes it. Fit scores are not award predictions.

## Browser smoke test
Build with a fake Supabase URL, start the app on port 3100, run `python3 tests/browser/smoke.py http://localhost:3100`. It uses Chromium and a mocked backend. Commands are in PHASE3_VALIDATION_REPORT.md.

## Routes
`/` landing, `/app` workspace. API: `/api/intake`, `/api/whatsapp`, `/api/senders`, `/api/retry`, `/api/reanalyse`, `/api/invites`, `/api/opportunity`, `/api/documents`, `/api/cron`, `/api/status`.

## Quality
See `AUDIT_REPORT.md` and `IMPLEMENTATION_REPORT.md` (what is verified and what is not). `npm test` runs unit tests and database isolation tests (PGlite, no setup needed).

## Known gaps
See `AUDIT_REPORT.md` section "Not done" and "Partially implemented".
