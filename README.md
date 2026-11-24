# BTW Operations

Keep every operation moving. A multi-location restaurant operations issue-management app built with Next.js, TypeScript and Supabase.

The interface uses the BTW Operations name and supplied BTW logo with a warm cream, charcoal and red theme based on the provided brand reference.

## What's included

- Responsive operations dashboard with issue KPIs and sample SLA visualisation.
- Issue register with search, status and department filters.
- New issue submission flow and ticket detail/status interaction (local demo state).
- IT and Maintenance queue views.
- In-app alerts for the selected department team and Admin when a manager raises an issue.
- Shared tickets and real-time notifications through Supabase when Supabase Auth is configured.
- Admin tools for renaming outlets and managing demo manager accounts.
- Resolution controls for IT and Maintenance teams, with resolved state visible to managers and admins.
- Resolution date and time is recorded and displayed in each relevant issue view.
- Supabase PostgreSQL schema for restaurants, profiles, SLA policies, tickets, comments, attachments, activity and notifications.
- Row Level Security (RLS) policies for restaurant managers, department teams and administrators.
- Ticket numbering, SLA deadline calculation and audit logging triggers.

## Authentication and storage modes

When Supabase environment variables are configured, sign-in uses Supabase Auth, profiles determine each user's role and outlet/department, and tickets and notifications are stored in the shared Supabase database. Row Level Security controls which tickets each account can read or update.

Without Supabase configuration, local development uses the browser-only demo mode. Demo issues, roles, outlets and accounts stay in that browser and are not shared across devices. A production deployment without Supabase configuration blocks sign-in rather than silently using local demo data.

## Requirements

- Node.js 20.9+

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose a role:

- Outlet manager: `/login/manager` — choose one of 24 outlets, raise issues for it and track those issues.
- IT team: `/login/it` — see IT issues from all outlets, assign them and update status.
- Maintenance team: `/login/maintenance` — see maintenance issues from all outlets, assign them and update status.
- Admin: `/login/admin` — see all issues across all outlets and both departments.

No Supabase project or environment variables are needed to try the local demo. In demo mode, any valid email and non-empty password works on the sign-in pages. The first three outlet names are examples from the starter; `Outlet 04` through `Outlet 24` are placeholders to replace with your actual outlet names.

In demo mode, Admin can open **Outlet Settings** to edit outlet names and manage browser-local manager accounts. Those settings are not used in Supabase mode.

## Demo in-app notifications

When Supabase is configured, a database trigger creates an unread notification for active Admin and matching department accounts whenever a manager submits a ticket. Notifications and ticket changes are delivered to signed-in dashboards through Supabase Realtime. In demo mode, alerts remain in browser local storage and only sync across tabs in that browser.

## Demo WhatsApp alerts for Maintenance

The demo can send a WhatsApp template message to configured maintenance team members when a manager raises a Maintenance issue. IT issues do not trigger WhatsApp messages.

1. In Meta's WhatsApp Business Platform, configure the sender and use an approved template with exactly four body placeholders, in this order: ticket ID, issue title, outlet, priority.
2. Copy `.env.example` to `.env.local` and set the WhatsApp variables. Put recipient phone numbers in international format as digits only (country code included), separated by commas.
3. Set `WHATSAPP_DEMO_ALERTS_ENABLED=true`, then restart the Next.js server.

The access token and recipient list are read only by the server; never use `NEXT_PUBLIC_` for these settings. The demo login and tickets are not authenticated or stored on a server, so this endpoint is intentionally demo-only and can be called without a verified manager account. Do not enable it on a public or production deployment. For production, first connect real Supabase Auth and server-side ticket creation, then trigger WhatsApp only from that authenticated ticket workflow.

## Set up shared Supabase data

1. Create a Supabase project and open its **SQL Editor**.
2. Run `supabase/schema.sql`, then run `supabase/shared-data-migration.sql`.
3. In **Project Settings → API**, copy the project URL and public anon/publishable key. Do not use the service-role key in the browser.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` for local development and to Vercel's environment variables for every deployment environment. Redeploy after changing Vercel variables.
5. In **Authentication → Users**, create a user for each manager, IT/Maintenance team member, and Admin. Add a matching row in `public.profiles` for each Auth user's UUID. The profile's role and restaurant/department assignment determine what they can see.

For an existing manager Auth user, open `supabase/create-manager-profile.sql`, replace `manager@example.com`, `Restaurant Manager`, and `NOI-018` with the manager's email, name, and restaurant code, then run the full script in SQL Editor. It checks that both the Auth user and active restaurant exist and refuses to overwrite an existing profile.

Example profile inserts (replace the UUID, name, email and outlet code with real values):

```sql
-- Admin
insert into public.profiles(id, full_name, email, role)
values ('AUTH_USER_UUID', 'Operations Admin', 'admin@example.com', 'admin');

-- Manager assigned to an existing restaurant
insert into public.profiles(id, full_name, email, role, restaurant_id)
select 'AUTH_USER_UUID', 'Outlet Manager', 'manager@example.com', 'restaurant_manager', id
from public.restaurants where code = 'NOI-018';

-- IT team member; use 'Maintenance' for the Maintenance team
insert into public.profiles(id, full_name, email, role, department)
values ('AUTH_USER_UUID', 'IT Team Member', 'it@example.com', 'department_head', 'IT');
```

In Supabase mode, create and assign manager accounts in Supabase Auth and `public.profiles`; the browser-only **Outlet Settings** manager form is available only in demo mode. Existing issues saved in a browser's local storage are not automatically imported into Supabase.

The app only needs the public anon/publishable key in `NEXT_PUBLIC_` variables. Keep any Supabase service-role key server-side and out of client code.

## Remaining production setup

The ticket and notification flow uses Supabase Auth, Postgres, RLS and Realtime. Attachments are not implemented yet; before enabling them, create a **private** Storage bucket named `ticket-attachments` and add Storage RLS policies. Configure email delivery and scheduled SLA escalation separately using a trusted server/Edge Function.

### Department workflow
- Department executive/head: see their department's tickets, enter an assignee name and update status.
- Restaurant manager: create tickets for their assigned restaurant and track their status.
- Admin: see tickets across restaurants and departments. Create Auth users and assign profiles in Supabase.

### SLA and escalation
The schema calculates response and resolution deadlines at ticket creation using `sla_policies`. For a reliable production scheduler:
1. Create a Supabase Edge Function or trusted server endpoint that queries open tickets whose `response_due_at` or `resolution_due_at` has passed.
2. Increment `escalation_level`, set `escalated_at`, create notification rows and email the department head / operations admin.
3. Invoke it on a schedule (for example every 5 minutes) using Supabase Cron / pg_cron or an external scheduler.
4. Make the job idempotent so the same breach does not send duplicate emails.
5. Define business hours, holidays, pause rules for `on_hold`, and escalation recipients with operations before launch. The starter SLA values are calendar minutes, not business-hours calculations.

### Email notifications
In-app notifications are created by the database trigger and delivered through Supabase Realtime. Email delivery and scheduled SLA escalation are not implemented; add them through a trusted server/Edge Function and configure SMTP/domain authentication and delivery logs.

### Reporting
Use SQL views or server-side aggregate queries for:
- Tickets opened/closed by date, restaurant and department.
- First response and resolution time.
- SLA compliance and breach rate.
- Reopened and recurring issues.
- Workload and technician performance.

Do not expose internal comments to restaurant managers; enforce `is_internal` filtering in the query and RLS.

## Suggested production acceptance tests

- A manager at Restaurant A cannot read Restaurant B tickets.
- An IT executive cannot read Maintenance tickets.
- A department executive cannot change a ticket's restaurant or department.
- A manager cannot assign tickets or mark them resolved.
- A manager can reopen a resolved ticket with a reason.
- A ticket cannot be closed before it is resolved.
- SLA deadlines and escalation notifications are correct across timezone and business-hour boundaries.
- Attachment URLs expire and are only available to authorized users.
- All status, priority and assignee changes create audit records.

## Suggested next build milestone

Implement private ticket attachments, then email/SLA escalation and operational reporting.
