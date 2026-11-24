import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface CreateManagerPayload {
  email: string;
  fullName: string;
  password: string;
  restaurantId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreateManagerPayload(value: unknown): value is CreateManagerPayload {
  if (!isRecord(value)) return false;
  return typeof value.email === "string" &&
    value.email.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) &&
    typeof value.fullName === "string" &&
    value.fullName.trim().length > 0 &&
    value.fullName.trim().length <= 120 &&
    typeof value.password === "string" &&
    value.password.length >= 8 &&
    value.password.length <= 128 &&
    typeof value.restaurantId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.restaurantId);
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Manager account creation is not configured. Ask the deployment administrator to configure Supabase server credentials." },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values: { name: string; value: string; options: CookieOptions }[]) =>
        values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sign in as an Admin to create manager accounts." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify the manager creator's Admin profile.", profileError);
    return NextResponse.json({ error: "Could not verify Admin access." }, { status: 500 });
  }
  if (profile?.role !== "admin" || profile.is_active !== true) {
    return NextResponse.json({ error: "Only an active Admin can create manager accounts." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isCreateManagerPayload(payload)) {
    return NextResponse.json(
      { error: "Enter a valid email, manager name, password of at least 8 characters, and restaurant." },
      { status: 400 }
    );
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: restaurant, error: restaurantError } = await adminClient
    .from("restaurants")
    .select("id,name")
    .eq("id", payload.restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  if (restaurantError) {
    console.error("Could not verify the selected manager restaurant.", restaurantError);
    return NextResponse.json({ error: "Could not verify the selected restaurant." }, { status: 500 });
  }
  if (!restaurant) {
    return NextResponse.json({ error: "Choose an active restaurant." }, { status: 400 });
  }

  const normalizedEmail = payload.email.trim().toLocaleLowerCase();
  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: payload.password,
    email_confirm: true,
    user_metadata: { full_name: payload.fullName.trim() }
  });
  if (createUserError || !createdUser.user) {
    if (createUserError) console.error("Could not create a manager Auth user.", createUserError);
    return NextResponse.json(
      { error: createUserError?.message.includes("already been registered")
        ? "A user with this email already exists. Use a different email or ask an Admin to check the existing account."
        : "Could not create the login. Check that the email is unused and the password meets Supabase requirements." },
      { status: 409 }
    );
  }

  const { error: createProfileError } = await adminClient
    .from("profiles")
    .insert({
      id: createdUser.user.id,
      full_name: payload.fullName.trim(),
      email: normalizedEmail,
      role: "restaurant_manager",
      restaurant_id: restaurant.id,
      department: null
    });

  if (createProfileError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createdUser.user.id);
    if (cleanupError) {
      console.error("Could not remove the Auth user after manager profile creation failed.", cleanupError);
    }
    console.error("Could not create a manager profile.", createProfileError);
    return NextResponse.json(
      { error: `Could not assign the manager to the restaurant: ${createProfileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: createdUser.user.id,
    email: normalizedEmail,
    fullName: payload.fullName.trim(),
    restaurant: restaurant.name
  }, { status: 201 });
}
