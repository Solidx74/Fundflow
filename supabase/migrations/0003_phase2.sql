-- 0003: opportunity fields, role management, notifications, documents, rate limiting. Additive. Checks are NOT VALID so existing rows never block the upgrade.
alter table opportunities add column if not exists eligible_countries text[], add column if not exists eligible_applicant_types text[], add column if not exists eligibility_requirements text[],
  add column if not exists submission_date date, add column if not exists application_reference text, add column if not exists prep_notes text,
  add column if not exists document_checklist jsonb not null default '[]', add column if not exists user_corrections jsonb not null default '{}';
alter table opportunities add constraint opp_funding_nonneg check (coalesce(funding_min,0) >= 0 and coalesce(funding_max,0) >= 0) not valid,
  add constraint opp_funding_order check (funding_min is null or funding_max is null or funding_min <= funding_max) not valid,
  add constraint opp_dates_order check (opening_date is null or deadline is null or opening_date <= deadline) not valid;

-- Rate limiting: one atomic upsert, shared by all server instances. Service role only.
create table rate_limits (key text primary key, window_start timestamptz not null, hits int not null);
alter table rate_limits enable row level security;
create function rate_hit(p_key text, p_limit int, p_window_seconds int) returns boolean language plpgsql security definer set search_path = public as $$
declare h int; begin
  insert into rate_limits(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.hits + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning hits into h;
  return h <= p_limit; end $$;

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade, type text not null, title text not null, body text,
  opportunity_id uuid, task_id uuid references opportunity_tasks on delete cascade, read_at timestamptz, created_at timestamptz default now(),
  foreign key (opportunity_id, organization_id) references opportunities (id, organization_id) on delete cascade);
create index notif_user on notifications (user_id, read_at, created_at desc);
alter table notifications enable row level security;
create policy n_sel on notifications for select using (user_id = auth.uid() and organization_id = my_org());
create policy n_upd on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notifications from authenticated; grant update (read_at) on notifications to authenticated;
revoke insert, delete on notifications from authenticated;

create function notify(p_org uuid, p_user uuid, p_type text, p_title text, p_opp uuid, p_task uuid default null) returns void language sql security definer set search_path = public as $$
  insert into notifications(organization_id, user_id, type, title, opportunity_id, task_id)
  select p_org, p_user, p_type, p_title, p_opp, p_task where p_user is not null and exists (select 1 from organization_members where user_id = p_user and organization_id = p_org) $$;
create function notify_opp() returns trigger language plpgsql security definer set search_path = public as $$
declare m record; begin
  if tg_op = 'INSERT' then
    for m in select user_id from organization_members where organization_id = new.organization_id and role in ('owner','admin') and user_id is distinct from auth.uid() loop
      perform notify(new.organization_id, m.user_id, 'new_opportunity', 'New opportunity: ' || new.grant_title, new.id);
      if new.eligibility_status is distinct from 'likely_eligible' then perform notify(new.organization_id, m.user_id, 'eligibility_review', 'Eligibility review needed: ' || new.grant_title, new.id); end if;
    end loop;
  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is distinct from auth.uid() then
    perform notify(new.organization_id, new.assigned_to, 'assigned', 'Assigned to you: ' || new.grant_title, new.id);
  end if; return new; end $$;
create trigger t_notify_opp after insert or update on opportunities for each row execute function notify_opp();
create function notify_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.assigned_to is distinct from auth.uid() then
    perform notify(new.organization_id, new.assigned_to, 'task_assigned', 'Task assigned: ' || new.title, new.opportunity_id, new.id); end if; return new; end $$;
create trigger t_notify_task after insert or update on opportunity_tasks for each row execute function notify_task();
-- Run daily by a scheduler (Vercel cron route /api/cron or pg_cron). Not active until you schedule it.
create function notify_deadlines() returns int language plpgsql security definer set search_path = public as $$
declare a int; b int; begin
  insert into notifications(organization_id, user_id, type, title, opportunity_id)
  select o.organization_id, m.user_id, 'deadline_approaching', 'Deadline in ' || (o.deadline - current_date) || ' day(s): ' || o.grant_title, o.id
  from opportunities o join organization_members m on m.organization_id = o.organization_id and (o.assigned_to = m.user_id or (o.assigned_to is null and m.role in ('owner','admin')))
  where o.deadline between current_date and current_date + 3 and o.status in ('New','Evaluating','Shortlisted','Drafting')
    and not exists (select 1 from notifications x where x.user_id = m.user_id and x.opportunity_id = o.id and x.type = 'deadline_approaching' and x.created_at::date = current_date);
  get diagnostics a = row_count;
  insert into notifications(organization_id, user_id, type, title, opportunity_id, task_id)
  select t.organization_id, t.assigned_to, case when t.due_date < current_date then 'task_overdue' else 'task_due' end, (case when t.due_date < current_date then 'Task overdue: ' else 'Task due soon: ' end) || t.title, t.opportunity_id, t.id
  from opportunity_tasks t where t.status = 'open' and t.assigned_to is not null and t.due_date <= current_date + 1
    and not exists (select 1 from notifications x where x.task_id = t.id and x.user_id = t.assigned_to and x.created_at::date = current_date and x.type in ('task_due','task_overdue'));
  get diagnostics b = row_count; return a + b; end $$;

-- Team administration: no direct client writes to memberships. Owner cannot be changed or removed.
drop policy mem_own on organization_members;
create function set_member_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path = public as $$
declare t organization_members; begin
  if my_role() is distinct from 'owner' then raise exception 'Only the owner can change roles'; end if;
  if p_role not in ('admin','member') then raise exception 'Invalid role'; end if;
  select * into t from organization_members where user_id = p_user and organization_id = my_org();
  if t.id is null then raise exception 'Member not found'; end if;
  if t.role = 'owner' then raise exception 'The owner role cannot be changed'; end if;
  update organization_members set role = p_role where id = t.id; end $$;
create function remove_member(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare t organization_members; me text := my_role(); o uuid := my_org(); begin
  select * into t from organization_members where user_id = p_user and organization_id = o;
  if t.id is null then raise exception 'Member not found'; end if;
  if t.role = 'owner' then raise exception 'The owner cannot be removed'; end if;
  if p_user <> auth.uid() and not (me = 'owner' or (me = 'admin' and t.role = 'member')) then raise exception 'Not allowed'; end if;
  update opportunities set assigned_to = null where assigned_to = p_user and organization_id = o;
  update opportunity_tasks set assigned_to = null where assigned_to = p_user and organization_id = o;
  delete from organization_members where id = t.id;
  insert into opportunity_activity(organization_id, actor_id, action_type, metadata) values (o, auth.uid(), 'member_removed', jsonb_build_object('email', t.email)); end $$;
create or replace function accept_invite(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare i organization_invites; em text := auth.jwt() ->> 'email'; begin
  select * into i from organization_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') and accepted_at is null and expires_at > now() and lower(email) = lower(em) for update;
  if i.id is null then raise exception 'Invalid or expired invite'; end if;
  insert into organization_members(organization_id, user_id, role, email, display_name, invited_by) values (i.organization_id, auth.uid(), i.role, em, split_part(em, '@', 1), i.created_by);
  update organization_invites set accepted_at = now() where id = i.id;
  perform notify(i.organization_id, i.created_by, 'invite_accepted', em || ' joined the team', null); return i.organization_id; end $$;

-- Documents: metadata here, files in the PRIVATE bucket org-docs. Reads and writes go through server routes only.
create table org_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade, filename text not null,
  storage_path text not null unique, content_type text not null, size_bytes int not null check (size_bytes > 0 and size_bytes <= 4194304),
  category text, description text, uploaded_by uuid references auth.users on delete set null, created_at timestamptz default now());
alter table org_documents enable row level security;
create policy doc_sel on org_documents for select using (organization_id = my_org());
create policy doc_upd on org_documents for update using (organization_id = my_org() and my_role() in ('owner','admin')) with check (organization_id = my_org());
revoke update on org_documents from authenticated; grant update (category, description) on org_documents to authenticated;
revoke insert, delete on org_documents from authenticated;
do $$ begin if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
  insert into storage.buckets (id, name, public) values ('org-docs', 'org-docs', false) on conflict (id) do update set public = false; end if; end $$;

-- Server-only functions: not callable by browser roles.
do $$ declare f text; r text; begin
  foreach f in array array['rate_hit(text,int,int)','notify(uuid,uuid,text,text,uuid,uuid)','notify_deadlines()'] loop
    execute format('revoke all on function %s from public', f);
    foreach r in array array['anon','authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function %s from %I', f, r); end if; end loop; end loop; end $$;
