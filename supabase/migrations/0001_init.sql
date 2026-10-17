create extension if not exists pgcrypto;
create table organizations (
  id uuid primary key default gen_random_uuid(), name text not null, mission_statement text, country text, website text,
  organization_type text, registration_status text, budget_size numeric, budget_currency text default 'USD',
  focus_areas text[] default '{}', geographic_reach text[] default '{}', beneficiary_groups text, impact_summary text,
  knowledge_vault jsonb default '{}', vault_version int not null default 1, onboarding_completed boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  user_id uuid not null unique references auth.users on delete cascade, role text not null check (role in ('owner','admin','member')),
  email text, display_name text, invited_by uuid references auth.users on delete set null, joined_at timestamptz default now(),
  unique (organization_id, user_id));
create table opportunities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  grant_title text not null, funder_name text, summary text, source_url text, funding_min numeric, funding_max numeric, currency text,
  deadline date, opening_date date,
  eligibility_status text check (eligibility_status in ('likely_eligible','needs_review','likely_ineligible')),
  eligibility_findings jsonb default '[]', alignment_score int check (alignment_score between 0 and 100), alignment_explanation text,
  ai_strategy_notes text, source_evidence jsonb default '{}', focus_areas text[] default '{}', required_documents text[] default '{}',
  status text not null default 'New' check (status in ('New','Evaluating','Shortlisted','Drafting','Submitted','Won','Lost','Archived')),
  assigned_to uuid references auth.users on delete set null, received_via text default 'manual', created_by uuid references auth.users on delete set null,
  extraction_status text default 'done', analysis_status text default 'done', last_analyzed_at timestamptz, vault_version_at_analysis int,
  application_url text, source_hash text, created_at timestamptz default now(), updated_at timestamptz default now());
create unique index opp_dedupe on opportunities (organization_id, source_hash) where source_hash is not null;
create index opp_org_status on opportunities (organization_id, status, deadline);
create table whatsapp_senders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  phone_number text not null unique, verification_status text not null default 'pending' check (verification_status in ('pending','verified')),
  code_hash text, verified_at timestamptz, created_at timestamptz default now());
create table inbound_messages (
  id uuid primary key default gen_random_uuid(), organization_id uuid references organizations on delete set null, provider text not null,
  provider_message_id text not null, sender_phone text, message_type text, message_text text, media_reference text,
  processing_status text not null default 'received', error_message text, opportunity_id uuid references opportunities on delete set null,
  received_at timestamptz default now(), processed_at timestamptz, unique (provider, provider_message_id));
create table opportunity_tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  opportunity_id uuid not null references opportunities on delete cascade, title text not null, description text,
  assigned_to uuid references auth.users on delete set null, due_date date, priority text default 'medium' check (priority in ('low','medium','high')),
  status text default 'open' check (status in ('open','done')), created_by uuid references auth.users on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table opportunity_notes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  opportunity_id uuid not null references opportunities on delete cascade, author_id uuid references auth.users on delete set null,
  content text not null, created_at timestamptz default now());
create table opportunity_activity (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  opportunity_id uuid references opportunities on delete cascade, actor_id uuid references auth.users on delete set null,
  action_type text not null, metadata jsonb default '{}', created_at timestamptz default now());
create table organization_invites (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations on delete cascade,
  email text not null, role text not null check (role in ('admin','member')), token_hash text not null,
  expires_at timestamptz not null default now() + interval '7 days', accepted_at timestamptz, created_by uuid references auth.users on delete set null);

create function my_org() returns uuid language sql stable security definer set search_path = public as
$$ select organization_id from organization_members where user_id = auth.uid() limit 1 $$;
create function my_role() returns text language sql stable security definer set search_path = public as
$$ select role from organization_members where user_id = auth.uid() limit 1 $$;

alter table organizations enable row level security; alter table organization_members enable row level security;
alter table opportunities enable row level security; alter table whatsapp_senders enable row level security;
alter table inbound_messages enable row level security; alter table opportunity_tasks enable row level security;
alter table opportunity_notes enable row level security; alter table opportunity_activity enable row level security;
alter table organization_invites enable row level security;

create policy org_sel on organizations for select using (id = my_org());
create policy org_upd on organizations for update using (id = my_org() and my_role() in ('owner','admin'));
create policy mem_sel on organization_members for select using (organization_id = my_org());
create policy mem_own on organization_members for all using (organization_id = my_org() and my_role() = 'owner') with check (organization_id = my_org() and my_role() = 'owner');
create policy opp_sel on opportunities for select using (organization_id = my_org());
create policy opp_ins on opportunities for insert with check (organization_id = my_org());
create policy opp_upd on opportunities for update using (organization_id = my_org()) with check (organization_id = my_org());
create policy opp_del on opportunities for delete using (organization_id = my_org() and my_role() in ('owner','admin'));
create policy snd_sel on whatsapp_senders for select using (organization_id = my_org());
create policy snd_del on whatsapp_senders for delete using (organization_id = my_org() and my_role() in ('owner','admin'));
create policy msg_sel on inbound_messages for select using (organization_id = my_org() and my_role() in ('owner','admin'));
create policy task_all on opportunity_tasks for all using (organization_id = my_org()) with check (organization_id = my_org());
create policy note_sel on opportunity_notes for select using (organization_id = my_org());
create policy note_ins on opportunity_notes for insert with check (organization_id = my_org() and author_id = auth.uid());
create policy act_sel on opportunity_activity for select using (organization_id = my_org());
create policy inv_adm on organization_invites for all using (organization_id = my_org() and my_role() in ('owner','admin')) with check (organization_id = my_org() and my_role() in ('owner','admin'));

create function create_organization(p_name text, p_country text) returns uuid language plpgsql security definer set search_path = public as $$
declare oid uuid; em text := auth.jwt() ->> 'email'; begin
  if exists (select 1 from organization_members where user_id = auth.uid()) then raise exception 'Already in an organization'; end if;
  insert into organizations(name, country) values (p_name, p_country) returning id into oid;
  insert into organization_members(organization_id, user_id, role, email, display_name) values (oid, auth.uid(), 'owner', em, split_part(em, '@', 1));
  return oid; end $$;
create function accept_invite(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare i organization_invites; em text := auth.jwt() ->> 'email'; begin
  select * into i from organization_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') and accepted_at is null and expires_at > now() and lower(email) = lower(em);
  if i.id is null then raise exception 'Invalid or expired invite'; end if;
  insert into organization_members(organization_id, user_id, role, email, display_name, invited_by) values (i.organization_id, auth.uid(), i.role, em, split_part(em, '@', 1), i.created_by);
  update organization_invites set accepted_at = now() where id = i.id; return i.organization_id; end $$;

create function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); if tg_table_name = 'organizations' then new.vault_version = old.vault_version + 1; end if; return new; end $$;
create trigger t_org before update on organizations for each row execute function touch();
create trigger t_opp before update on opportunities for each row execute function touch();
create trigger t_task before update on opportunity_tasks for each row execute function touch();

create function opp_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and not exists (select 1 from organization_members where user_id = new.assigned_to and organization_id = new.organization_id) then raise exception 'Assignee must be a member'; end if;
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then raise exception 'Cannot move opportunity'; end if; return new; end $$;
create trigger t_guard before insert or update on opportunities for each row execute function opp_guard();

create function log_opp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'received', jsonb_build_object('via', new.received_via));
  else
    if old.status is distinct from new.status then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status)); end if;
    if old.assigned_to is distinct from new.assigned_to then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'assignment_changed', jsonb_build_object('to', new.assigned_to)); end if;
    if old.deadline is distinct from new.deadline then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'deadline_updated', jsonb_build_object('from', old.deadline, 'to', new.deadline)); end if;
  end if; return new; end $$;
create trigger t_log after insert or update on opportunities for each row execute function log_opp();

create function log_task() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.opportunity_id, auth.uid(), 'task_created', jsonb_build_object('title', new.title));
  elsif old.status <> 'done' and new.status = 'done' then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.opportunity_id, auth.uid(), 'task_completed', jsonb_build_object('title', new.title)); end if; return new; end $$;
create trigger t_logtask after insert or update on opportunity_tasks for each row execute function log_task();
