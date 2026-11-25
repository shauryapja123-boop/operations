-- Apply after shared-data-migration.sql so both department teams receive
-- an in-app notification whenever a manager creates a ticket.
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
        and p.department in ('IT', 'Maintenance')
      )
    );

  return new;
end $$;
