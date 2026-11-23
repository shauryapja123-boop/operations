"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { readDemoSession, type DemoSession } from "@/lib/demo-auth";
import { fetchSupabaseProfile, getDemoRole, isSupabaseConfigured } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";

interface DashboardSession extends DemoSession {
  userId?: string;
  restaurantId?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase.auth.getUser();
          if (error) throw new Error(`Could not verify your Supabase session: ${error.message}`);
          if (!data.user) {
            router.replace("/");
            return;
          }

          const profile = await fetchSupabaseProfile(data.user.id);
          const role = getDemoRole(profile);
          if (!role) throw new Error("Your account is missing a valid department assignment.");
          if (active) {
            setSession({
              role,
              email: profile.email,
              ...(profile.restaurant ? { outlet: profile.restaurant.name } : {}),
              userId: profile.id,
              restaurantId: profile.restaurant_id ?? undefined
            });
          }
          return;
        }

        if (process.env.NODE_ENV === "production") {
          throw new Error("Supabase is not configured for this deployment. Add the public Supabase URL and anon key in Vercel.");
        }
        const demoSession = readDemoSession();
        if (!demoSession) {
          router.replace("/");
          return;
        }
        if (active) setSession(demoSession);
      } catch (error) {
        console.error("Could not open the dashboard.", error);
        if (active) setAuthError(error instanceof Error ? error.message : "Could not open your workspace.");
      } finally {
        if (active) setChecked(true);
      }
    }

    void loadSession();
    return () => { active = false; };
  }, [router]);

  if (!checked) {
    return <main className="login-page"><p className="dashboard-loading">Opening your workspace...</p></main>;
  }
  if (authError) {
    return <main className="login-page"><section className="login-form-wrap"><h1>Could not open workspace</h1><p className="login-description">{authError}</p><button className="primary-btn" onClick={() => router.replace("/")}>Return to sign in</button></section></main>;
  }
  if (!session) {
    return <main className="login-page"><p className="dashboard-loading">Redirecting to sign in...</p></main>;
  }

  return <DashboardClient
    role={session.role}
    email={session.email}
    outlet={session.outlet}
    userId={session.userId}
    restaurantId={session.restaurantId}
  />;
}
