-- Operations Hub database schema for Supabase / PostgreSQL.
-- Apply in Supabase SQL Editor. Create Auth users separately, then assign profiles.

create extension if not exists pgcrypto;

create type public.app_role as enum ('restaurant_manager','department_executive','department_head','admin');
create type public.issue_department as enum ('IT','Maintenance');
create type public.issue_priority as enum ('critical','high','medium','low');
create type public.issue_status as enum ('new','assigned','in_progress','on_hold','resolved','closed','reopened');

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'restaurant_manager',
  restaurant_id uuid references public.restaurants(id),
  department public.issue_department,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_scope_check check (
    (role = 'restaurant_manager' and restaurant_id is not null and department is null)
    or (role in ('department_executive','department_head') and department is not null)
    or role = 'admin'
  )
);

create table public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  department public.issue_department not null,
  priority public.issue_priority not null,
  response_minutes integer not null check (response_minutes > 0),
  resolution_minutes integer not null check (resolution_minutes > 0),
  is_active boolean not null default true,
  unique(department, priority)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique,
  restaurant_id uuid not null references public.restaurants(id),
  reporter_id uuid not null references public.profiles(id),
  department public.issue_department not null,
  category text not null,
  title text not null,
  description text not null,
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'new',
  assignee_id uuid references public.profiles(id),
  response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  escalation_level integer not null default 0,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.ticket_number_seq start 10001;

create or replace function public.set_ticket_defaults()
returns trigger language plpgsql as $$
declare policy public.sla_policies%rowtype;
begin
  if new.ticket_number is null then
    new.ticket_number := 'OPS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.ticket_number_seq')::text, 5, '0');
  end if;
  select * into policy from public.sla_policies
    where department = new.department and priority = new.priority and is_active = true;
  if found then
    new.response_due_at := new.created_at + make_interval(mins => policy.response_minutes);
    new.resolution_due_at := new.created_at + make_interval(mins => policy.resolution_minutes);
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger tickets_before_insert before insert on public.tickets
for each row execute function public.set_ticket_defaults();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tickets_touch_updated_at before update on public.tickets
for each row execute function public.touch_updated_at();

create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table public.ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index tickets_restaurant_created_idx on public.tickets(restaurant_id, created_at desc);
create index tickets_department_status_idx on public.tickets(department, status, created_at desc);
create index tickets_assignee_status_idx on public.tickets(assignee_id, status);
create index tickets_sla_idx on public.tickets(resolution_due_at) where status not in ('resolved','closed');

-- Audit trail: record changes to status, priority, assignee and department.
create or replace function public.log_ticket_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid;
begin
  actor := auth.uid();
  if tg_op = 'INSERT' then
    insert into ticket_activity(ticket_id, actor_id, action, new_value)
    values(new.id, actor, 'ticket_created', to_jsonb(new));
    return new;
  end if;
  if old.status is distinct from new.status then
    insert into ticket_activity(ticket_id, actor_id, action, old_value, new_value)
    values(new.id, actor, 'status_changed', jsonb_build_object('status',old.status), jsonb_build_object('status',new.status));
  end if;
  if old.assignee_id is distinct from new.assignee_id then
    insert into ticket_activity(ticket_id, actor_id, action, old_value, new_value)
    values(new.id, actor, 'assignee_changed', jsonb_build_object('assignee_id',old.assignee_id), jsonb_build_object('assignee_id',new.assignee_id));
  end if;
  if old.priority is distinct from new.priority then
    insert into ticket_activity(ticket_id, actor_id, action, old_value, new_value)
    values(new.id, actor, 'priority_changed', jsonb_build_object('priority',old.priority), jsonb_build_object('priority',new.priority));
  end if;
  return new;
end $$;
create trigger tickets_audit after insert or update on public.tickets
for each row execute function public.log_ticket_changes();

-- Helper functions used by RLS policies.
create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path=public as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;
create or replace function public.can_access_ticket(target_restaurant uuid, target_department public.issue_department)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and (
      p.role='admin'
      or (p.role='restaurant_manager' and p.restaurant_id=target_restaurant)
      or (p.role in ('department_executive','department_head') and p.department=target_department)
    )
  )
$$;

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.sla_policies enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_activity enable row level security;
alter table public.notifications enable row level security;

create policy "users read their profile" on public.profiles for select using (id=auth.uid() or public.current_role()='admin');
create policy "admins manage profiles" on public.profiles for all using (public.current_role()='admin') with check (public.current_role()='admin');
create policy "users see relevant restaurants" on public.restaurants for select using (
  public.current_role()='admin' or id=(select restaurant_id from public.profiles where id=auth.uid())
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('department_executive','department_head'))
);
create policy "authenticated read sla" on public.sla_policies for select to authenticated using (true);
create policy "admins manage sla" on public.sla_policies for all using (public.current_role()='admin') with check (public.current_role()='admin');

create policy "read permitted tickets" on public.tickets for select to authenticated
using (public.can_access_ticket(restaurant_id, department));
create policy "manager creates own restaurant tickets" on public.tickets for insert to authenticated
with check (
  reporter_id=auth.uid() and exists(select 1 from public.profiles p
    where p.id=auth.uid() and p.role='restaurant_manager' and p.restaurant_id=restaurant_id)
);
create policy "department and admin update tickets" on public.tickets for update to authenticated
using (public.can_access_ticket(restaurant_id, department))
with check (public.can_access_ticket(restaurant_id, department));

create policy "read comments on accessible tickets" on public.ticket_comments for select to authenticated
using (exists(select 1 from public.tickets t where t.id=ticket_id and public.can_access_ticket(t.restaurant_id,t.department)));
create policy "write comments on accessible tickets" on public.ticket_comments for insert to authenticated
with check (author_id=auth.uid() and exists(select 1 from public.tickets t where t.id=ticket_id and public.can_access_ticket(t.restaurant_id,t.department)));
create policy "read attachments on accessible tickets" on public.ticket_attachments for select to authenticated
using (exists(select 1 from public.tickets t where t.id=ticket_id and public.can_access_ticket(t.restaurant_id,t.department)));
create policy "upload attachments on accessible tickets" on public.ticket_attachments for insert to authenticated
with check (uploaded_by=auth.uid() and exists(select 1 from public.tickets t where t.id=ticket_id and public.can_access_ticket(t.restaurant_id,t.department)));
create policy "read activity on accessible tickets" on public.ticket_activity for select to authenticated
using (exists(select 1 from public.tickets t where t.id=ticket_id and public.can_access_ticket(t.restaurant_id,t.department)));
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Example SLA defaults; tune these with your operations team before production.
insert into public.sla_policies(department,priority,response_minutes,resolution_minutes) values
('IT','critical',10,120),('IT','high',30,240),('IT','medium',120,1440),('IT','low',240,2880),
('Maintenance','critical',10,120),('Maintenance','high',30,240),('Maintenance','medium',120,1440),('Maintenance','low',240,2880)
on conflict(department,priority) do nothing;

-- Seed restaurants (edit/delete these examples).
insert into public.restaurants(name,code,address) values
('Noida Sector 18','NOI-018','Noida, Uttar Pradesh'),
('Vaishali','VAI-001','Ghaziabad, Uttar Pradesh'),
('Rohini','ROH-001','Delhi')
on conflict(code) do nothing;

-- IMPORTANT:
-- 1. Enable email confirmations and configure SMTP in Supabase Auth.
-- 2. Configure Storage bucket "ticket-attachments" as private, with policies scoped
--    to accessible ticket IDs. Do not make it public.
-- 3. Do not expose SUPABASE_SERVICE_ROLE_KEY in browser code.
-- 4. The escalation scheduler and email delivery need a trusted server/Edge Function
--    plus scheduled invocation; see README for the required production step.
