# Phase 4 baseline (measured at the start of Phase 4)
Not a Git repository yet (`git status` failed). No `engines` field and no `docs/` folder existed.

## Verified
`npm ci` succeeded. `npm test`: 59 passed. `next build` passed. Client bundle scan found no secret variable names. Node used here: v22.

## Architecture and routes
Next.js 14 App Router, JavaScript. Pages: `/` (landing), `/app` (workspace: auth, onboarding wizard, dashboard with Kanban and List, opportunity detail, Add, Vault with Documents, My tasks, Team, WhatsApp, notification bell). API: intake, whatsapp, senders, retry, reanalyse, invites, opportunity, documents, cron. Libraries: auth, extract, score, process, ingest, rate, safeFetch, supabase.

## Database
Migrations 0001 to 0004. Entities: organizations, organization_members, opportunities, opportunity_tasks, notes, activity, analyses, whatsapp_senders, inbound_messages, organization_invites, notifications, org_documents, rate_limits. RLS on all. Functions: create_organization, accept_invite, set_member_role, remove_member, claim_retry, rate_hit, notify_deadlines.

## Integrations
Supabase, OpenAI (optional, demo fallback), Twilio WhatsApp, Vercel cron. None verified live.

## Known defects and blocked checks at baseline
No password-recovery screen. Application URL edited without server validation. Onboarding had no invite step. Integration status not visible in the UI. All live checks BLOCKED (no credentials, hosts unreachable).

## Do not rewrite
`lib/score.js`, `lib/safeFetch.js`, `lib/process.js`, migrations 0001 to 0004 (additive only), `tests/rls.test.js`, `tests/phase2.test.js`, `tests/phase3.test.js`.
