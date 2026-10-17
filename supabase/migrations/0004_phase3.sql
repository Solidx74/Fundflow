-- 0004: race-safe reminder dedupe, atomic retry claim with a retry cap. Additive. Run once, after 0003.
alter table notifications add column dedupe_key text;
create unique index notif_dedupe on notifications (user_id, dedupe_key) where dedupe_key is not null;
alter table inbound_messages add column retry_count int not null default 0, add column claimed_at timestamptz;

-- Reminders: unique index makes concurrent runs safe. Dates use the database time zone (UTC on Supabase).
create or replace function notify_deadlines() returns int language plpgsql security definer set search_path = public as $$
declare a int; b int; begin
  insert into notifications(organization_id, user_id, type, title, opportunity_id, dedupe_key)
  select o.organization_id, m.user_id, 'deadline_approaching', 'Deadline in ' || (o.deadline - current_date) || ' day(s): ' || o.grant_title, o.id, 'dl:' || o.id || ':' || current_date
  from opportunities o join organization_members m on m.organization_id = o.organization_id and (o.assigned_to = m.user_id or (o.assigned_to is null and m.role in ('owner','admin')))
  where o.deadline between current_date and current_date + 3 and o.status in ('New','Evaluating','Shortlisted','Drafting')
  on conflict do nothing;
  get diagnostics a = row_count;
  insert into notifications(organization_id, user_id, type, title, opportunity_id, task_id, dedupe_key)
  select t.organization_id, t.assigned_to, case when t.due_date < current_date then 'task_overdue' else 'task_due' end, (case when t.due_date < current_date then 'Task overdue: ' else 'Task due soon: ' end) || t.title, t.opportunity_id, t.id, 'task:' || t.id || ':' || current_date
  from opportunity_tasks t where t.status = 'open' and t.assigned_to is not null and t.due_date <= current_date + 1
  on conflict do nothing;
  get diagnostics b = row_count; return a + b; end $$;

-- One atomic compare-and-set decides who may retry a message. Cap 3. In-flight work is protected for 2 minutes.
create function claim_retry(p_id uuid, p_org uuid) returns inbound_messages language plpgsql security definer set search_path = public as $$
declare r inbound_messages; begin
  update inbound_messages set processing_status = 'processing', retry_count = retry_count + 1, claimed_at = now(), error_message = null
  where id = p_id and organization_id = p_org and message_text is not null and retry_count < 3
    and (processing_status = 'failed' or (processing_status in ('received','processing') and coalesce(claimed_at, received_at) < now() - interval '2 minutes'))
  returning * into r; return r; end $$;
do $$ declare rr text; begin
  execute 'revoke all on function claim_retry(uuid,uuid) from public';
  foreach rr in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = rr) then execute format('revoke all on function claim_retry(uuid,uuid) from %I', rr); end if; end loop; end $$;
