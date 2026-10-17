# FundFlow audit report

Method: full code review of the repository, then fixes, then executed checks. Nothing here was run against a live Supabase, OpenAI or Twilio account.

## Executed results (re-run in Phase 2, current repository)
- `npm test`: 66 passed (core 8, rls 11, phase2 7, phase3 7, routes 27, security 6). See PHASE3_VALIDATION_REPORT.md for what each kind covers. Database tests run migrations 0001, 0002 and 0003 in a real Postgres engine (PGlite) with a stubbed Supabase `auth` schema. This is not real Supabase.
- `next build`: passes.
- Correction: the earlier version of this report said `npm test` passed. It was run as `npx vitest run`. The `test` script was missing from `package.json` (a bad `sed`), so `npm test` actually failed. Fixed and verified in Phase 2.
- Not executed: lint (not configured), browser or end-to-end tests, route handler tests, any live Supabase, Storage, OpenAI or Twilio call, any manual run of the UI in a browser.

## Confirmed defects found and fixed
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | Tasks, notes and activity only checked `organization_id`. A user could attach rows to another organization's opportunity (cross-tenant write). | Composite foreign keys `(opportunity_id, organization_id)` in 0002. Tested. |
| 2 | High | `/api/senders` upserted on phone number. An admin of org B could take over org A's verified number. | Insert or update only for the same org. Verified numbers cannot be re-registered. |
| 3 | High | Org admins could insert invites with role `admin` straight through the database API (privilege escalation). | No client write policy on invites. Server route only, owner alone can invite admins. Tested. |
| 4 | Medium | Task assignee was not checked against membership. | Trigger. Tested. |
| 5 | Medium | Verification codes never expired. | 15 minute expiry, cleared after use, code masked in stored message text. |
| 6 | Medium | Media fetch had no host allowlist, size cap, MIME check or timeout, and could forward Twilio credentials on redirect. | Allowlist, 4 MB cap, MIME check, timeouts, no credentials on redirect. |
| 7 | Medium | Failed webhook messages could not be retried. Redelivery of a failed message was silently dropped. | Admin retry route and button. Source hash blocks duplicate records. |
| 8 | Medium | Applicant type matching used substrings (false matches). | Alias-based canonical matching. Tested. |
| 9 | Medium | Invalid or contradictory AI values (bad dates, min greater than max, negatives) could be stored. | `sanitize()` drops them and records why. Tested. |
| 10 | Medium | Score weights accepted negative or invalid values. | Validated and normalized. |
| 11 | Medium | No stale analysis detection or refresh. Analysis history was overwritten. | Vault version tracking, refresh route, `opportunity_analyses` history table. |
| 12 | Low | Missing activity events (notes, submitted, analysis refreshed). | Triggers and route logging. Tested. |
| 13 | Low | Image messages in mock mode were silently treated as text. | Honest "image analysis not enabled" reply and status. |
| 14 | Low | Junk `fetch("/")` effect in the Add screen. | Removed. |

## Phase 2 additional findings
| # | Severity | Finding | Fix |
|---|---|---|---|
| 15 | Medium | `npm test` script missing. | Added, verified. |
| 16 | High | Owner could demote or remove themselves, or leave no owner, through direct table writes. | No client write policy on memberships. `set_member_role` and `remove_member` functions. Tested. |
| 17 | Medium | Opportunity edits went straight from the browser with no server validation. | `/api/opportunity` validates with Zod and the caller's own JWT. Table CHECK constraints added. Tested. |
| 18 | Medium | Rate limiter was per instance. | Atomic database limiter `rate_hit`, fails closed. Tested. |

## Phase 3 findings
See PHASE3_VALIDATION_REPORT.md, defects 1 to 10 (reminder race, retry claim, upload buffering, DOCX check, cron compare, signature trailing slash, expired session, dialog focus, mobile filters, route tests).

## Partially implemented (superseded by IMPLEMENTATION_REPORT.md)
- Invitations: secure in the database and server route, but delivery is dev-mode only (link shown once, no email).
- Webhook processing is synchronous with a 24 second budget. A timed-out job may still finish in the background. The source hash prevents duplicates on retry.
- Rate limiting is in-memory per server instance only.
- Webhook response is not a queue. A managed queue is the next step for slow AI calls.
- DNS rebinding between lookup and connect is a residual risk in `safeFetch`.
- Media size is checked via header and after download, not streamed.
- Image-only flyers need a live AI key. Images are not stored, so they cannot be retried.

## Not done
- Role change and member removal screens.
- Document upload and storage.
- Notification center.
- Meta WhatsApp provider.
- Browser end-to-end tests.
- Edit of required documents, eligible countries and applicant types in the UI (only title, funder, deadline, max funding).
- Table (list) view alongside the Kanban.
- One organization per user remains a deliberate MVP limit, enforced by a unique constraint.
