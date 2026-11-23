import type { DemoRole } from "../demo-auth";
import { createClient } from "./client";

export interface SupabaseProfile {
  id: string;
  email: string;
  full_name: string;
  role: "restaurant_manager" | "department_executive" | "department_head" | "admin";
  department: "IT" | "Maintenance" | null;
  restaurant_id: string | null;
  restaurant: { name: string; code: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("YOUR_PROJECT") && !key.includes("YOUR_SUPABASE"));
}

export function getDemoRole(profile: SupabaseProfile): DemoRole | null {
  if (profile.role === "restaurant_manager") return "restaurant_manager";
  if (profile.role === "admin") return "admin";
  if (profile.department === "IT") return "it_team";
  if (profile.department === "Maintenance") return "maintenance_team";
  return null;
}

function parseSupabaseProfile(value: unknown): SupabaseProfile | null {
  if (!isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.email !== "string" ||
      typeof value.full_name !== "string" ||
      (value.role !== "restaurant_manager" &&
        value.role !== "department_executive" &&
        value.role !== "department_head" &&
        value.role !== "admin") ||
      !(value.department === null || value.department === "IT" || value.department === "Maintenance") ||
      !(value.restaurant_id === null || typeof value.restaurant_id === "string")) {
    return null;
  }

  const restaurantValue = Array.isArray(value.restaurant) ? value.restaurant[0] : value.restaurant;
  let restaurant: SupabaseProfile["restaurant"] = null;
  if (restaurantValue !== null && restaurantValue !== undefined) {
    if (!isRecord(restaurantValue) ||
        typeof restaurantValue.name !== "string" ||
        typeof restaurantValue.code !== "string") {
      return null;
    }
    restaurant = { name: restaurantValue.name, code: restaurantValue.code };
  }

  return {
    id: value.id,
    email: value.email,
    full_name: value.full_name,
    role: value.role,
    department: value.department,
    restaurant_id: value.restaurant_id,
    restaurant
  };
}

export async function fetchSupabaseProfile(userId: string): Promise<SupabaseProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,department,restaurant_id,restaurant:restaurants(name,code)")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not load your account profile: ${error.message}`);
  const profile = parseSupabaseProfile(data);
  if (!profile) {
    throw new Error("Your Supabase account is missing a valid profile. Ask an administrator to configure it.");
  }
  if ((profile.role === "restaurant_manager" && (!profile.restaurant_id || !profile.restaurant)) ||
      ((profile.role === "department_executive" || profile.role === "department_head") && !profile.department)) {
    throw new Error("Your account profile is missing its restaurant or department assignment.");
  }
  return profile;
}
