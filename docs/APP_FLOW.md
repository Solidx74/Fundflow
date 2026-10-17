# FundFlow application flows
Legend: OK path, then failure and recovery. "Dev mode" and "not available" are called out where they apply.

## 1. First-time owner
Landing (explains Capture, Assess, Coordinate, states scores are not predictions) > Sign up (email format and 8 character password checked) > confirm email if the Supabase project requires it (message says so honestly) > Sign in > no membership, so Create organization (name, country) > 4-step setup: organization, mission and impact, funding profile, invite teammates (optional, dev-mode link) > Dashboard.
Failures: invalid input shows a message. Unconfirmed email says to confirm first. Leaving mid-setup resumes at the saved step. Skip goes to the dashboard, the Vault warns about missing information.

## 2. Returning user
Landing > Sign in > resolve membership > load workspace. Loading shows a status message, never workspace content. Expired session: a 401 signs the user out and shows sign-in. Missing membership: organization setup, or invitation acceptance when a link is present. Forgot password: reset email > link opens "Set a new password" > save > workspace.

## 3. Opportunity intake
Manual text or link, or a verified WhatsApp message > validate > fetch public page if a link (failure is recorded, supplied text still used) > extract with evidence (live AI or labelled demo) > sanitize > deterministic fit assessment > save > show result (added, review, duplicate) > review and correct.
Failures: processing error saves nothing and says so. Duplicate (same URL, title and deadline) is reported, a new round with a different deadline is accepted. Rate or daily cap returns a clear message.

## 4. Grant application
Open opportunity > read how-to-read note, evidence and findings > correct facts in the edit form (corrections marked, AI value shown) > refresh analysis > set status and assignee > add tasks, notes, checklist > record link, submission date, reference > activity log keeps the history.
Failures: server validation errors are shown and nothing is claimed saved. Failed status moves roll back.

## 5. Team
Owner or admin opens Team > creates invite (email, role) > link shown once (dev mode: no email is sent, share it privately) > invitee signs in with that email > accepts once within 7 days > receives the role.
Failures: wrong email, expired or used link shows one explanatory message. Admins cannot invite admins. Owner cannot be removed or demoted. Removal unassigns work and keeps history.

## 6. Documents
Choose file > client size check > server checks size, content type by bytes > private Storage > metadata row > list > Download issues a 60 second signed link > admin deletes with confirmation.
Failures: wrong type or over 4 MB rejected. If the stored file cannot be removed, the record stays and an error is shown.

## 7. WhatsApp
Webhook > verify Twilio signature > deduplicate MessageSid > verified sender? (else reply with verify steps, nothing saved) > rate limit > process > save > reply after saving. Failed messages appear under WhatsApp with the reason, Retry (n/3) for text, admins get a notification. Images are not retained and cannot be retried.

## 8. Reminders
Vercel cron calls the route with the secret > unauthorized calls rejected > eligible deadlines (today to +3 days, active statuses) and tasks (due within a day or overdue) > unique keys block duplicates > in-app notifications.
Not available: email or WhatsApp delivery. Dates use UTC, so Bangladesh (UTC+6) can see reminders up to 6 hours off. Verify in the Vercel project that the job exists and runs.
