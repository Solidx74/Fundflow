# Phase 2 plan (confirmed against the code)
Confirmed remaining at start: broken `npm test`; no list view; edit form missing fields; no role or removal UI; no documents; no notifications; in-memory rate limit; synchronous webhook; no Meta provider; no browser tests; invite delivery dev-only.
Already fine: invitation hashing, expiry, single use, email binding (0002).

Order: A scripts and migration check, B opportunities, C team, D documents, E notifications, F WhatsApp and rate limit, G e2e and Meta (deferred, see report), H docs.
Verification: `npm test`, `next build`, database tests for every new rule. No live provider testing is possible here.
