# Implementation report

## Verified (executed here)
- `npm test`: 66 passed (Phase 4). `next build`: passes. Real-browser smoke test (16 steps) passes against a mocked backend. See PHASE3_VALIDATION_REPORT.md.
- Migrations 0001, 0002, 0003 apply in order on a fresh database and as an upgrade over existing data (bad legacy rows are kept, new bad rows are rejected). Run in PGlite, not real Supabase.
- Database rules tested: tenant isolation, cross-org child rows, role changes, owner immutability, member removal and reassignment, history preserved, private notifications and read-only-`read_at`, atomic rate limiter and server-only execution, once-a-day deadline reminders, funding and date constraints, document row access.

## Implemented, NOT live-tested (no credentials or browser here)
- Opportunity list view (search, status, eligibility, deadline, assignee filters, sort, pagination, clear), shared with Kanban data. Saved view choice.
- Full opportunity edit via `/api/opportunity` (Zod, caller JWT, member-only assignee, correction tracking, AI evidence kept), application tracking fields and checklist.
- Team page: directory, role change (owner only), removal, leave, invites (dev-mode link).
- Documents: private bucket `org-docs`, magic-byte validation (PDF, DOCX, TXT), 4 MB limit, signed 60 second downloads, delete with confirmation. Storage API calls were never run against real Supabase Storage.
- Notification center with bell, unread count, mark read, mark all, navigation. Events: new opportunity, eligibility review, assignment, task assigned, WhatsApp failure, invite accepted.
- Deadline and task reminders: `notify_deadlines()` plus `/api/cron` and `vercel.json`. Active only after you set `CRON_SECRET` and deploy to Vercel.
- WhatsApp: `processing` state, failure notifications, retry of stuck messages (older than 2 minutes), per-sender and per-org daily AI cap, shared rate limiting on intake, retry, reanalyse, documents.

## Not done
- Meta WhatsApp provider. Twilio code is not yet behind an adapter. No Meta signature or payload code exists.
- Playwright via npm. A Python Playwright smoke test exists (mocked backend). No live-backend browser tests.
- Background queue. The webhook is still synchronous (24 second budget, idempotent, retryable).
- Email delivery of invites. Image retention for retrying image messages. Ownership transfer. Multi-organization.
- Route handler tests (document sniffing, opportunity validation, webhook signature) are not automated.
- The UI has never been rendered in a browser by me. Expect visual or interaction bugs.

## Migrations
0001 to 0004 created. None applied to a real Supabase project. Run each once, in order. Existing installs run only the files not yet applied.

## Commands
`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm start`.

## Deploy
Push to GitHub, import in Vercel, set env vars from `.env.example` (add `CRON_SECRET`, set `APP_BASE_URL`), run the three migrations in the Supabase SQL editor, point the Twilio webhook to `/api/whatsapp`.

## Credentials still needed
Supabase URL, anon and service keys; OpenAI key (else demo extractor); Twilio SID, token, WhatsApp sender; `APP_BASE_URL`; `CRON_SECRET`.
