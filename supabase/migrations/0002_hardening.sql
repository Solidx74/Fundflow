-- 0002 hardening. Safe on top of 0001 (existing installs: run this file only).
alter table opportunities add column if not exists extraction jsonb, add column if not exists source_text text;
alter table organizations add column if not exists onboarding_step int not null default 0, add column if not exists typical_grant_size numeric;
alter table whatsapp_senders add column if not exists code_expires_at timestamptz;

-- Cross-tenant integrity: child rows must reference an opportunity of the SAME organization.
alter table opportunities add constraint opp_id_org unique (id, organization_id);
alter table opportunity_tasks drop constraint opportunity_tasks_opportunity_id_fkey, add constraint task_opp_org foreign key (opportunity_id, organization_id) references opportunities (id, organization_id) on delete cascade;
alter table opportunity_notes drop constraint opportunity_notes_opportunity_id_fkey, add constraint note_opp_org foreign key (opportunity_id, organization_id) references opportunities (id, organization_id) on delete cascade;
alter table opportunity_activity drop constraint opportunity_activity_opportunity_id_fkey, add constraint act_opp_org foreign key (opportunity_id, organization_id) references opportunities (id, organization_id) on delete cascade;

create table opportunity_analyses (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, opportunity_id uuid not null,
  score int, eligibility_status text, findings jsonb, vault_version int, ai_mode text, created_at timestamptz default now(),
  foreign key (opportunity_id, organization_id) references opportunities (id, organization_id) on delete cascade);
alter table opportunity_analyses enable row level security;
create policy ana_sel on opportunity_analyses for select using (organization_id = my_org());

-- Task assignee must belong to the same organization.
create function task_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.assigned_to is not null and not exists (select 1 from organization_members where user_id = new.assigned_to and organization_id = new.organization_id) then raise exception 'Assignee must be a member'; end if; return new; end $$;
create trigger t_taskguard before insert or update on opportunity_tasks for each row execute function task_guard();

-- Invites are written only by the server route (owner may invite admins). No client write path.
drop policy inv_adm on organization_invites;
create policy inv_sel on organization_invites for select using (organization_id = my_org() and my_role() in ('owner','admin'));
drop policy opp_ins on opportunities;
create policy opp_ins on opportunities for insert with check (organization_id = my_org() and (created_by is null or created_by = auth.uid()));

create or replace function accept_invite(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare i organization_invites; em text := auth.jwt() ->> 'email'; begin
  select * into i from organization_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') and accepted_at is null and expires_at > now() and lower(email) = lower(em) for update;
  if i.id is null then raise exception 'Invalid or expired invite'; end if;
  insert into organization_members(organization_id, user_id, role, email, display_name, invited_by) values (i.organization_id, auth.uid(), i.role, em, split_part(em, '@', 1), i.created_by);
  update organization_invites set accepted_at = now() where id = i.id; return i.organization_id; end $$;

create or replace function log_opp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'received', jsonb_build_object('via', new.received_via));
  else
    if old.status is distinct from new.status then
      insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
      if new.status = 'Submitted' then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type) values (new.organization_id, new.id, auth.uid(), 'application_submitted'); end if;
    end if;
    if old.assigned_to is distinct from new.assigned_to then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'assignment_changed', jsonb_build_object('to', new.assigned_to)); end if;
    if old.deadline is distinct from new.deadline then insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type, metadata) values (new.organization_id, new.id, auth.uid(), 'deadline_updated', jsonb_build_object('from', old.deadline, 'to', new.deadline)); end if;
  end if; return new; end $$;
create function log_note() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into opportunity_activity(organization_id, opportunity_id, actor_id, action_type) values (new.organization_id, new.opportunity_id, auth.uid(), 'note_added'); return new; end $$;
create trigger t_lognote after insert on opportunity_notes for each row execute function log_note();
