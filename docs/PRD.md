# FundFlow Product Requirements (MVP)
Status: describes what exists in the repository plus the intended MVP. Items marked (gap) are not complete.

## Vision
Help NGOs capture grant opportunities, understand eligibility, organize the pipeline and coordinate applications without scattered WhatsApp messages, spreadsheets and repeated data entry.

**Principle:** AI supports the decision, the NGO makes it. Every extracted fact stays distinguishable from its source evidence and from human corrections. A fit score is not a prediction that a grant will be awarded and must never be presented as one.

## Users
Owner or administrator (sets up the organization, manages team, WhatsApp, documents). Grant manager or program officer (reviews fit, edits facts, manages pipeline). Team member (researches, completes assigned tasks, adds notes).

## Problem
Grants arrive through many channels. Teams lose deadlines, retype organization details, struggle to compare requirements with their profile and have no shared view of progress.

## MVP outcomes
Central opportunity records. Reusable Knowledge Vault. Evidence-backed, explainable fit assessment. Human review and correction. Kanban and List views. Tasks, notes, activity. Roles and membership. Private documents. Notifications and deadline reminders. Secure WhatsApp intake.

## Functional requirements
Priority: P0 must, P1 should. "Live" means verified against real services (none verified yet, see acceptance report).
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-1 | Authentication and sessions: sign up, optional email confirmation, sign in, password reset with set-new-password screen, sign out, expired-session recovery | P0 | Invalid input shows a specific message. A recovery link opens a set-password form. A 401 from the API returns the user to sign-in. |
| FR-2 | Organization creation and onboarding: create org, 4-step resumable setup (organization, mission, funding profile, invite teammates) | P0 | Progress persists across reloads. Completion is stored once. Skip is possible. |
| FR-3 | Knowledge Vault: edit profile used for fit analysis, missing-information warning, validation, admin-only editing | P0 | Members cannot edit. Saving bumps the profile version and marks older analyses stale. |
| FR-4 | Manual grant entry from pasted text or link | P0 | Result states added, review or duplicate. Demo mode is labelled. Failure saves nothing. |
| FR-5 | WhatsApp intake with sender verification | P0 | Only verified numbers create records. Unknown senders create none. Signature required in production. |
| FR-6 | Extraction and analysis with validated, nullable fields | P0 | Invalid dates and contradictory values are dropped and noted. Unknown stays unknown. |
| FR-7 | Source evidence and manual corrections | P0 | Corrected fields show "corrected by you" and the original AI value. Evidence is not overwritten. |
| FR-8 | Eligibility and confidence display | P0 | Hard conflicts cap the score and read "Likely ineligible". Unknowns lower confidence. Score copy says it is not an award prediction. |
| FR-9 | Search, filters, sort, pagination, saved view | P0 | Kanban and List share data. Unknown deadlines sort last. View choice persists. |
| FR-10 | Status management (8 statuses) | P0 | Drag or select persists. Failed saves roll back with a message. |
| FR-11 | Tasks, assignment, notes, activity | P0 | Assignee must be a member. Actions are logged with the actor. |
| FR-12 | Application tracking and document checklist | P1 | Link, submission date, reference, notes, checklist saved through the validated route. |
| FR-13 | Team: invitations, roles, removal, leaving | P0 | Only the owner changes roles or invites admins. Owner cannot be removed. Invite is single use, email-bound, 7 days. |
| FR-14 | Private documents with short-lived signed downloads | P1 | PDF, DOCX, TXT up to 4 MB, validated by content. Delete keeps records consistent. |
| FR-15 | Notifications and reminders | P1 | Private to the recipient. Reminders deduplicated per day. Reminders are in-app only. |
| FR-16 | Errors and retry | P0 | Failed WhatsApp messages are visible, retryable up to 3 times, with admin alerts. Images cannot be retried. |
| FR-17 | Mobile and accessibility | P1 | No horizontal page overflow at 390 px. Labels on fields. Dialog takes focus and closes on Escape. (gap: focus trap) |
| FR-18 | Privacy, authorization, auditability | P0 | Row Level Security on every table. Server routes resolve the org from verified membership. |

## Non-goals (this phase)
Meta WhatsApp provider. Billing. Post-award management. One user in several organizations. Asynchronous queue. Enterprise redesign. Email delivery.

## Success measures (to be measured after launch, no current figures exist)
Share of intake attempts that become a saved opportunity. Share of opportunities with deadline, funder and at least one evidence quote. Share of assessments with inspectable evidence. Share of users who finish onboarding. Tasks created per active opportunity. Median time from intake to first human review.

## Assumptions, dependencies, risks
Assumes organizations share requirements as text or links. Depends on Supabase, OpenAI (optional), Twilio, Vercel. Risks: unverified live behaviour, synchronous webhook limits, extraction errors (mitigated by evidence and correction), reminders on UTC dates, WhatsApp text retained without a retention job.

## Open decisions
Ownership transfer. Email delivery provider for invites. Message retention period. Multi-organization membership. Whether to add a queue after measuring real webhook latency.
