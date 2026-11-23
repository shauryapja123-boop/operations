-- Apply after schema.sql to enable shared dashboard data and issue notifications.

alter table public.tickets
  add column if not exists assignee_name text;

alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

drop policy if exists "manager creates own restaurant tickets" on public.tickets;
create policy "manager creates own restaurant tickets" on public.tickets for insert to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'new'
  and assignee_id is null
  and assignee_name is null
  and first_response_at is null
  and resolved_at is null
  and closed_at is null
  and escalation_level = 0
  and escalated_at is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role = 'restaurant_manager'
      and p.restaurant_id = tickets.restaurant_id
  )
);

drop policy if exists "department and admin update tickets" on public.tickets;
create policy "department and admin update tickets" on public.tickets for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
      and (
        p.role = 'admin'
        or (p.role in ('department_executive','department_head') and p.department = tickets.department)
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
      and (
        p.role = 'admin'
        or (p.role in ('department_executive','department_head') and p.department = tickets.department)
      )
  )
);

create or replace function public.prevent_ticket_scope_changes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_role() = 'admin' then
    return new;
  end if;

  if new.ticket_number is distinct from old.ticket_number
    or new.restaurant_id is distinct from old.restaurant_id
    or new.reporter_id is distinct from old.reporter_id
    or new.department is distinct from old.department
    or new.category is distinct from old.category
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.priority is distinct from old.priority
    or new.assignee_id is distinct from old.assignee_id
    or new.created_at is distinct from old.created_at
    or new.response_due_at is distinct from old.response_due_at
    or new.resolution_due_at is distinct from old.resolution_due_at
    or new.first_response_at is distinct from old.first_response_at
    or new.closed_at is distinct from old.closed_at
    or new.escalation_level is distinct from old.escalation_level
    or new.escalated_at is distinct from old.escalated_at then
    raise exception 'Department users may only update ticket status and assignee name.';
  end if;
  return new;
end $$;

drop trigger if exists tickets_prevent_scope_changes on public.tickets;
create trigger tickets_prevent_scope_changes before update on public.tickets
for each row execute function public.prevent_ticket_scope_changes();

create or replace function public.set_ticket_resolution_time()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolved','closed') and old.status not in ('resolved','closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved','closed') then
    new.resolved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tickets_set_resolution_time on public.tickets;
create trigger tickets_set_resolution_time before update of status on public.tickets
for each row execute function public.set_ticket_resolution_time();

create or replace function public.notify_ticket_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare outlet_name text;
begin
  select name into outlet_name from public.restaurants where id = new.restaurant_id;

  insert into public.notifications(user_id, ticket_id, title, body, metadata)
  select
    p.id,
    new.id,
    'New ' || new.department::text || ' issue',
    new.ticket_number || ' - ' || new.title || ' at ' || coalesce(outlet_name, 'your outlet'),
    jsonb_build_object(
      'ticket_number', new.ticket_number,
      'department', new.department::text,
      'issue_title', new.title,
      'location', coalesce(outlet_name, 'Unknown outlet'),
      'priority', initcap(new.priority::text)
    )
  from public.profiles p
  where p.is_active = true
    and (
      p.role = 'admin'
      or (
        p.role in ('department_executive','department_head')
        and p.department = new.department
      )
    );

  return new;
end $$;

drop trigger if exists tickets_notify_recipients on public.tickets;
create trigger tickets_notify_recipients after insert on public.tickets
for each row execute function public.notify_ticket_created();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    execute 'alter publication supabase_realtime add table public.tickets';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
