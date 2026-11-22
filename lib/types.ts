export type Role = "restaurant_manager" | "department_executive" | "department_head" | "admin";
export type TicketStatus = "new" | "assigned" | "in_progress" | "on_hold" | "resolved" | "closed" | "reopened";
export type Priority = "critical" | "high" | "medium" | "low";

export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  department: "IT" | "Maintenance";
  category: string;
  priority: Priority;
  status: TicketStatus;
  created_at: string;
  response_due_at: string | null;
  resolution_due_at: string | null;
  restaurant?: { name: string; code: string } | null;
  reporter?: { full_name: string } | null;
  assignee?: { full_name: string } | null;
}
