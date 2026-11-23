import { readDemoOutlets } from "./demo-auth";

export type IssueDepartment = "IT" | "Maintenance";
export type IssueStatus = "New" | "Assigned" | "In Progress" | "On Hold" | "Resolved" | "Reopened" | "Closed";
export type IssuePriority = "Critical" | "High" | "Medium" | "Low";

export interface DemoIssue {
  id: string;
  databaseId?: string;
  title: string;
  description?: string;
  location: string;
  department: IssueDepartment;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  resolved_at?: string | null;
  assignee: string;
  age: string;
  created: string;
  reporterEmail: string;
}

const STORAGE_KEY = "operations-hub-demo-issues";

export const INITIAL_ISSUES: DemoIssue[] = [
  { id:"OPS-2026-00125", title:"POS terminal not connecting to server", location:"Noida Sector 18", department:"IT", category:"POS / Billing", priority:"Critical", status:"In Progress", assignee:"Rahul Sharma", age:"1h 24m", created:"Today, 10:18 AM", reporterEmail:"manager-noida@example.com" },
  { id:"OPS-2026-00124", title:"Dining area AC not cooling", location:"Vaishali", department:"Maintenance", category:"Air Conditioning", priority:"High", status:"Assigned", assignee:"Amit Verma", age:"3h 10m", created:"Today, 8:32 AM", reporterEmail:"manager-vaishali@example.com" },
  { id:"OPS-2026-00123", title:"Printer paper jam at billing counter", location:"Rohini", department:"IT", category:"Printer", priority:"Medium", status:"New", assignee:"Unassigned", age:"5h 42m", created:"Today, 6:00 AM", reporterEmail:"manager-rohini@example.com" },
  { id:"OPS-2026-00122", title:"Water leakage near kitchen wash area", location:"Noida Sector 18", department:"Maintenance", category:"Plumbing", priority:"High", status:"On Hold", assignee:"Sanjay Kumar", age:"1d 2h", created:"Yesterday, 9:12 AM", reporterEmail:"manager-noida@example.com" },
  { id:"OPS-2026-00121", title:"CCTV camera feed unavailable", location:"Vaishali", department:"IT", category:"CCTV / Network", priority:"Low", status:"Resolved", assignee:"Rahul Sharma", age:"2d 1h", created:"12 Nov, 11:45 AM", reporterEmail:"manager-vaishali@example.com" },
  { id:"OPS-2026-00120", title:"Kitchen exhaust fan making noise", location:"Rohini", department:"Maintenance", category:"Electrical", priority:"Medium", status:"Closed", assignee:"Amit Verma", age:"2d 6h", created:"12 Nov, 7:20 AM", reporterEmail:"manager-rohini@example.com" }
];

function isDemoIssue(value: unknown, outlets: string[]): value is DemoIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  return typeof issue.id === "string" &&
    (issue.databaseId === undefined || typeof issue.databaseId === "string") &&
    typeof issue.title === "string" &&
    (issue.description === undefined || typeof issue.description === "string") &&
    typeof issue.location === "string" &&
    outlets.includes(issue.location) &&
    (issue.department === "IT" || issue.department === "Maintenance") &&
    typeof issue.category === "string" &&
    (issue.priority === "Critical" || issue.priority === "High" || issue.priority === "Medium" || issue.priority === "Low") &&
    (issue.status === "New" || issue.status === "Assigned" || issue.status === "In Progress" || issue.status === "On Hold" || issue.status === "Resolved" || issue.status === "Reopened" || issue.status === "Closed") &&
    (issue.resolved_at === undefined || issue.resolved_at === null ||
      (typeof issue.resolved_at === "string" && !Number.isNaN(Date.parse(issue.resolved_at)))) &&
    typeof issue.assignee === "string" &&
    typeof issue.age === "string" &&
    typeof issue.created === "string" &&
    typeof issue.reporterEmail === "string";
}

export function readDemoIssues(): DemoIssue[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return INITIAL_ISSUES;

  const parsed: unknown = JSON.parse(saved);
  const outlets = readDemoOutlets();
  if (!Array.isArray(parsed) || !parsed.every(issue => isDemoIssue(issue, outlets))) {
    throw new Error("Saved demo issues have an unexpected format.");
  }
  return parsed;
}

export function saveDemoIssues(issues: DemoIssue[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
}
