import type { DemoRole } from "./demo-auth";
import type { DemoIssue } from "./demo-issues";

export type DemoNotificationRecipient = Exclude<DemoRole, "restaurant_manager">;

export interface DemoNotification {
  id: string;
  ticketId: string;
  title: string;
  location: string;
  department: DemoIssue["department"];
  priority: DemoIssue["priority"];
  createdAt: string;
  recipients: DemoNotificationRecipient[];
  readBy: string[];
}

const STORAGE_KEY = "operations-hub-demo-notifications";
const NOTIFICATION_RECIPIENTS: DemoNotificationRecipient[] = ["it_team", "maintenance_team", "admin"];

function isDemoNotification(value: unknown): value is DemoNotification {
  if (typeof value !== "object" || value === null) return false;
  const notification = value as Record<string, unknown>;
  return typeof notification.id === "string" &&
    typeof notification.ticketId === "string" &&
    typeof notification.title === "string" &&
    typeof notification.location === "string" &&
    (notification.department === "IT" || notification.department === "Maintenance") &&
    (notification.priority === "Critical" || notification.priority === "High" ||
      notification.priority === "Medium" || notification.priority === "Low") &&
    typeof notification.createdAt === "string" &&
    !Number.isNaN(Date.parse(notification.createdAt)) &&
    Array.isArray(notification.recipients) &&
    notification.recipients.every(recipient =>
      typeof recipient === "string" && NOTIFICATION_RECIPIENTS.includes(recipient as DemoNotificationRecipient)
    ) &&
    Array.isArray(notification.readBy) &&
    notification.readBy.every(reader => typeof reader === "string");
}

export function createDemoNotification(issue: DemoIssue): DemoNotification {
  return {
    id: issue.id,
    ticketId: issue.id,
    title: issue.title,
    location: issue.location,
    department: issue.department,
    priority: issue.priority,
    createdAt: new Date().toISOString(),
    recipients: ["it_team", "maintenance_team", "admin"],
    readBy: []
  };
}

export function readDemoNotifications(): DemoNotification[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed) || !parsed.every(isDemoNotification)) {
    throw new Error("Saved demo notifications have an unexpected format.");
  }
  return parsed;
}

export function saveDemoNotifications(notifications: DemoNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}
