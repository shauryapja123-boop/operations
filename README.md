# BTW Operations

Keep every operation moving. A multi-location restaurant operations issue-management app built with Next.js, TypeScript and Supabase.

The interface uses the BTW Operations name and supplied BTW logo with a warm cream, charcoal and red theme based on the provided brand reference.

## What's included

- Responsive operations dashboard with issue KPIs and sample SLA visualisation.
- Issue register with search, status and department filters.
- New issue submission flow and ticket detail/status interaction (local demo state).
- IT and Maintenance queue views.
- In-app alerts for the selected department team and Admin when a manager raises an issue.
- Admin tools for renaming outlets and managing demo manager accounts.
- Resolution controls for IT and Maintenance teams, with resolved state visible to managers and admins.
- Resolution date and time is recorded and displayed in each relevant issue view.
- Supabase PostgreSQL schema for restaurants, profiles, SLA policies, tickets, comments, attachments, activity and notifications.
- Row Level Security (RLS) policies for restaurant managers, department teams and administrators.
- Ticket numbering, SLA deadline calculation and audit logging triggers.

## Important implementation status

The sign-in pages use **local demo logins**. Admin, IT and Maintenance demo roles accept any email and password. Managers can choose an outlet until an Admin provisions the first manager account; after that, managers must use an account configured in Admin → Outlet Settings. Manager password hashes, outlet names, roles and demo issues are stored in browser local storage. This is not real authentication: local browser data can be changed or bypassed and is not shared with other devices. Do not use it to protect production data.

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

No Supabase project or environment variables are needed for this demo. Initially, any valid email and non-empty password works on the sign-in pages. After the Admin creates manager accounts, restaurant managers must use those accounts instead. The first three outlet names are examples from the starter; `Outlet 04` through `Outlet 24` are placeholders to replace with your actual outlet names. Since this is only browser storage, each team can see changes only when using the same browser on the same device.

Admins can open **Outlet Settings** in the dashboard to assign unique outlet names, create manager accounts, and reset manager passwords. Passwords are hashed with PBKDF2 before being stored, but these browser-local demo accounts are not production authentication.

## Demo in-app notifications

When a manager submits an issue, the selected department team and Admin receive an unread notification in the dashboard bell. IT receives IT issues; Maintenance receives Maintenance issues. Notifications can be marked read individually or all at once and sync across tabs in the same browser. Like the demo issues, notification history is stored only in browser local storage and is not delivered to other devices or users' browsers. Production notifications require authenticated server-side ticket creation and a shared backend; see the production integration plan below.

## Demo WhatsApp alerts for Maintenance

The demo can send a WhatsApp template message to configured maintenance team members when a manager raises a Maintenance issue. IT issues do not trigger WhatsApp messages.

1. In Meta's WhatsApp Business Platform, configure the sender and use an approved template with exactly four body placeholders, in this order: ticket ID, issue title, outlet, priority.
2. Copy `.env.example` to `.env.local` and set the WhatsApp variables. Put recipient phone numbers in international format as digits only (country code included), separated by commas.
3. Set `WHATSAPP_DEMO_ALERTS_ENABLED=true`, then restart the Next.js server.

The access token and recipient list are read only by the server; never use `NEXT_PUBLIC_` for these settings. The demo login and tickets are not authenticated or stored on a server, so this endpoint is intentionally demo-only and can be called without a verified manager account. Do not enable it on a public or production deployment. For production, first connect real Supabase Auth and server-side ticket creation, then trigger WhatsApp only from that authenticated ticket workflow.

## Optional Supabase setup for future integration

The current login and dashboard do not connect to Supabase. When you're ready to add real authentication and persistent tickets:

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In **Authentication → Users**, create your administrator account.
4. Add a `profiles` row for that user's UUID, with `role='admin'`, `full_name`, and `email`.
5. Create a restaurant manager Auth user and a matching profile row with `restaurant_id` set and role `restaurant_manager`.
6. Set the environment variables in `.env.local`.
7. Create a **private** Storage bucket named `ticket-attachments`. Add Storage RLS policies before enabling uploads.

The SQL schema includes restaurant manager, department executive/head and admin roles. The current demo logins are separate browser-only roles and are not connected to those profiles.

## Production integration plan

### Authentication
The current local demo login is only for previewing the four role-specific dashboards. It stores a role in browser local storage and can be bypassed by a user; it provides no authentication or authorization. The issue register is shared only within the same browser and device. Before production, use real sign-in accounts, store issues in a shared database, verify roles and outlet assignment on the server, protect routes, and enforce authorization at the database.

### Ticket CRUD
Replace the sample issue data in `lib/demo-issues.ts` with Supabase queries. On insert, set `reporter_id` from the authenticated session and `restaurant_id` from the signed-in manager's profile, not from arbitrary client input. Use a server action or authenticated API route for state transitions.

### Department workflow
- Department executive: see tickets for their department; accept/assign tickets and update progress.
- Department head: department-wide queue, assignment and escalation.
- Restaurant manager: create and view tickets for their restaurant; confirm or reject resolution.
- Admin: manage users, restaurants, SLA policies and cross-location reports.

Add server-side transition validation. For example, only the assigned department may move a ticket to `in_progress`; a manager may close a resolved ticket or reopen it with a reason.

### SLA and escalation
The schema calculates response and resolution deadlines at ticket creation using `sla_policies`. For a reliable production scheduler:
1. Create a Supabase Edge Function or trusted server endpoint that queries open tickets whose `response_due_at` or `resolution_due_at` has passed.
2. Increment `escalation_level`, set `escalated_at`, create notification rows and email the department head / operations admin.
3. Invoke it on a schedule (for example every 5 minutes) using Supabase Cron / pg_cron or an external scheduler.
4. Make the job idempotent so the same breach does not send duplicate emails.
5. Define business hours, holidays, pause rules for `on_hold`, and escalation recipients with operations before launch. The starter SLA values are calendar minutes, not business-hours calculations.

### Email and in-app notifications
Use an Edge Function or server-side worker with a provider such as Resend. Store notification events in `notifications`; subscribe to Supabase Realtime for in-app updates. Send email from trusted server-side code only. Configure SMTP/domain authentication and delivery logs.

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

Wire Supabase Auth and real ticket CRUD first. Then implement comments/attachments, email + realtime notifications, scheduled escalation, and finally management reports.
