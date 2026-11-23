import type { DemoRole } from "../demo-auth";
import type { DemoIssue, IssueDepartment, IssuePriority, IssueStatus } from "../demo-issues";
import type { DemoNotification } from "../demo-notifications";
import { createClient } from "./client";

type TicketRow = {
  id: string;
  ticket_number: string | null;
  restaurant_id: string;
  department: IssueDepartment;
  category: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assignee_name: string | null;
  resolved_at: string | null;
  created_at: string;
};

type RestaurantRow = { id: string; name: string };

const statusFromDatabase: Record<string, IssueStatus> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened"
};
const statusToDatabase: Record<IssueStatus, string> = {
  "New": "new",
  "Assigned": "assigned",
  "In Progress": "in_progress",
  "On Hold": "on_hold",
  "Resolved": "resolved",
  "Closed": "closed",
  "Reopened": "reopened"
};
const priorityFromDatabase: Record<string, IssuePriority> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low"
};

function formatCreated(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function mapTicket(row: TicketRow, locations: Map<string, string>, reporterEmail = "Manager"): DemoIssue {
  const priority = priorityFromDatabase[row.priority];
  const status = statusFromDatabase[row.status];
  if (!priority || !status) throw new Error(`Ticket ${row.id} has an unsupported priority or status.`);

  return {
    id: row.ticket_number ?? row.id,
    databaseId: row.id,
    title: row.title,
    description: row.description,
    location: locations.get(row.restaurant_id) ?? "Unknown outlet",
    department: row.department,
    category: row.category,
    priority,
    status,
    resolved_at: row.resolved_at,
    assignee: row.assignee_name ?? "Unassigned",
    age: "Open",
    created: formatCreated(row.created_at),
    reporterEmail
  };
}

export async function fetchSupabaseIssues(): Promise<DemoIssue[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id,ticket_number,restaurant_id,department,category,title,description,priority,status,assignee_name,resolved_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load issues: ${error.message}`);

  const rows = (data ?? []) as TicketRow[];
  const restaurantIds = [...new Set(rows.map(row => row.restaurant_id))];
  const locations = new Map<string, string>();
  if (restaurantIds.length > 0) {
    const { data: restaurants, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id,name")
      .in("id", restaurantIds);
    if (restaurantError) throw new Error(`Could not load issue locations: ${restaurantError.message}`);
    for (const restaurant of (restaurants ?? []) as RestaurantRow[]) locations.set(restaurant.id, restaurant.name);
  }

  return rows.map(row => mapTicket(row, locations));
}

export async function createSupabaseIssue(input: {
  userId: string;
  restaurantId: string;
  issue: Pick<DemoIssue, "title" | "description" | "department" | "category" | "priority">;
  location: string;
}): Promise<DemoIssue> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      reporter_id: input.userId,
      restaurant_id: input.restaurantId,
      department: input.issue.department,
      category: input.issue.category,
      title: input.issue.title,
      description: input.issue.description,
      priority: input.issue.priority.toLowerCase()
    })
    .select("id,ticket_number,restaurant_id,department,category,title,description,priority,status,assignee_name,resolved_at,created_at")
    .single();

  if (error) throw new Error(`Could not submit issue: ${error.message}`);
  return mapTicket(data as TicketRow, new Map([[input.restaurantId, input.location]]));
}

export async function updateSupabaseIssue(issue: DemoIssue, updates: Partial<DemoIssue>): Promise<void> {
  if (!issue.databaseId) throw new Error("This issue is missing its database identifier.");
  const supabase = createClient();
  const update: Record<string, string | null> = {};
  if (updates.status !== undefined) update.status = statusToDatabase[updates.status];
  if (updates.assignee !== undefined) update.assignee_name = updates.assignee || null;
  if (Object.keys(update).length === 0) return;

  const { data, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", issue.databaseId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not update issue: ${error.message}`);
  if (!data) throw new Error("Issue update was not permitted or the ticket no longer exists.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchSupabaseNotifications(userId: string, role: Exclude<DemoRole, "restaurant_manager">, reader: string): Promise<DemoNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,ticket_id,title,body,read_at,created_at,metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load notifications: ${error.message}`);

  return (data ?? []).map(value => {
    const notification = value as {
      id: string;
      ticket_id: string | null;
      title: string;
      body: string;
      read_at: string | null;
      created_at: string;
      metadata: unknown;
    };
    const metadata = isRecord(notification.metadata) ? notification.metadata : {};
    const department = metadata.department === "Maintenance" ? "Maintenance" : "IT";
    const priority = metadata.priority === "Critical" || metadata.priority === "High" ||
      metadata.priority === "Low" ? metadata.priority : "Medium";
    return {
      id: notification.id,
      ticketId: typeof metadata.ticket_number === "string" ? metadata.ticket_number : notification.ticket_id ?? notification.id,
      title: typeof metadata.issue_title === "string" ? metadata.issue_title : notification.title,
      location: typeof metadata.location === "string" ? metadata.location : "",
      department,
      priority,
      createdAt: notification.created_at,
      recipients: [role],
      readBy: notification.read_at ? [reader] : []
    };
  });
}

export async function markSupabaseNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", notificationIds);
  if (error) throw new Error(`Could not mark notifications as read: ${error.message}`);
}
