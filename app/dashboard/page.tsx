"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { readDemoSession, type DemoSession } from "@/lib/demo-auth";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const currentSession = readDemoSession();
      if (!currentSession) {
        router.replace("/");
        return;
      }
      setSession(currentSession);
    } catch {
      router.replace("/");
    } finally {
      setChecked(true);
    }
  }, [router]);

  if (!checked || !session) {
    return <main className="login-page"><p className="dashboard-loading">Opening your workspace...</p></main>;
  }

  return <DashboardClient role={session.role} email={session.email} outlet={session.outlet} />;
}
