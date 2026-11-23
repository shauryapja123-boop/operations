"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList, Eye, EyeOff, Monitor, ShieldCheck, Wrench } from "lucide-react";
import {
  authenticateDemoManager, DEMO_OUTLETS, readDemoManagerAccounts, readDemoOutlets,
  saveDemoSession, type DemoManagerAccount, type DemoRole
} from "@/lib/demo-auth";
import { fetchSupabaseProfile, getDemoRole, isSupabaseConfigured } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";

const roleDetails = {
  restaurant_manager: {
    title: "Manager sign in",
    description: "Sign in to raise an issue for your restaurant and track its progress.",
    label: "Restaurant Manager",
    icon: ClipboardList,
    emailPlaceholder: "you@restaurant.com"
  },
  admin: {
    title: "Admin sign in",
    description: "Sign in to review reported issues and manage the support queue.",
    label: "Operations Admin",
    icon: ShieldCheck,
    emailPlaceholder: "admin@company.com"
  },
  it_team: {
    title: "IT team sign in",
    description: "View IT issues across all outlets and update assignments and status.",
    label: "IT Team",
    icon: Monitor,
    emailPlaceholder: "it@company.com"
  },
  maintenance_team: {
    title: "Maintenance sign in",
    description: "View maintenance issues across all outlets and update assignments and status.",
    label: "Maintenance Team",
    icon: Wrench,
    emailPlaceholder: "maintenance@company.com"
  }
} satisfies Record<DemoRole, {
  title: string;
  description: string;
  label: string;
  icon: typeof ClipboardList;
  emailPlaceholder: string;
}>;

export default function LoginForm({ role }: { role: DemoRole }) {
  const router = useRouter();
  const details = roleDetails[role];
  const Icon = details.icon;
  const supabaseEnabled = isSupabaseConfigured();
  const demoMode = !supabaseEnabled && process.env.NODE_ENV !== "production";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [outlet, setOutlet] = useState(DEMO_OUTLETS[0]);
  const [outlets, setOutlets] = useState(DEMO_OUTLETS);
  const [managerAccounts, setManagerAccounts] = useState<DemoManagerAccount[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (role !== "restaurant_manager" || !demoMode) return;
    try {
      const savedOutlets = readDemoOutlets();
      setOutlets(savedOutlets);
      setOutlet(current => savedOutlets.includes(current) ? current : savedOutlets[0]);
      setManagerAccounts(readDemoManagerAccounts());
    } catch (loadError) {
      console.error("Could not load demo manager settings.", loadError);
      setError("Could not load manager settings from this browser.");
    }
  }, [role, demoMode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      setPending(true);
      if (!supabaseEnabled && process.env.NODE_ENV === "production") {
        throw new Error("Supabase is not configured for this deployment. Add the public Supabase URL and anon key in Vercel.");
      }
      if (supabaseEnabled) {
        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw new Error(authError.message);
        if (!data.user) throw new Error("Supabase did not return a signed-in user.");

        try {
          const profile = await fetchSupabaseProfile(data.user.id);
          if (!getDemoRole(profile)) throw new Error("Your account is missing a valid department assignment.");
        } catch (profileError) {
          await supabase.auth.signOut();
          throw profileError;
        }
        router.replace("/dashboard");
        return;
      }

      let managerOutlet = outlet;
      if (role === "restaurant_manager") {
        const manager = await authenticateDemoManager(email, password, outlet);
        if (!manager) {
          setError("Manager email or password is incorrect. Contact the administrator if you need access.");
          return;
        }
        managerOutlet = manager.outlet;
      }
      saveDemoSession({ role, email, ...(role === "restaurant_manager" ? { outlet: managerOutlet } : {}) });
      router.replace("/dashboard");
    } catch (loginError) {
      console.error("Could not sign in to the workspace.", loginError);
      setError(loginError instanceof Error ? loginError.message : "Could not sign in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={`login-page ${role === "admin" ? "login-admin" : "login-manager"}`}>
      <section className="login-panel">
        <Link className="login-back" href="/"><ArrowLeft size={16} /> Back to role selection</Link>
        <Link className="login-brand" href="/">
          <span className="login-brand-logo"><Image src="/btw-logo.png" alt="BTW" width={90} height={70} priority /></span>
          <span><b>BTW Operations</b><small>KEEP EVERY OPERATION MOVING</small></span>
        </Link>

        <div className="login-form-wrap">
          <div className="login-role-icon"><Icon size={22} /></div>
          <div className="login-eyebrow">{details.label.toUpperCase()} PORTAL</div>
          <h1>{details.title}</h1>
          <p className="login-description">{details.description}</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor={`${role}-email`}>Email address</label>
            <input
              autoComplete="email"
              id={`${role}-email`}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={details.emailPlaceholder}
              required
              type="email"
              value={email}
            />
            {role === "restaurant_manager" && demoMode && (
              managerAccounts.length === 0 ? (
                <>
                  <label className="login-outlet-label" htmlFor="manager-outlet">Your outlet</label>
                  <select id="manager-outlet" value={outlet} onChange={(event) => setOutlet(event.target.value)} required>
                    {outlets.map((name, index) => (
                      <option key={name} value={name}>Outlet {String(index + 1).padStart(2, "0")} — {name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="login-outlet-label" htmlFor="manager-outlet">Outlet assigned by administrator</label>
                  <input
                    className="login-outlet-note"
                    id="manager-outlet"
                    readOnly
                    value={managerAccounts.find(account => account.email === email.trim().toLocaleLowerCase())?.outlet ?? "Use your admin-created manager account"}
                  />
                </>
              )
            )}
            <div className="login-password-label">
              <label htmlFor={`${role}-password`}>Password</label>
            </div>
            <div className="login-password-input">
              <input
                autoComplete="current-password"
                id={`${role}-password`}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                type="button"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" disabled={pending} type="submit">
              {pending ? "Signing in..." : "Sign in to your workspace"}
              {!pending && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="login-help">{supabaseEnabled
            ? "Sign in with the account created for you by your administrator."
            : process.env.NODE_ENV === "production"
              ? "Supabase authentication must be configured before this deployment can accept sign-ins."
              : role === "restaurant_manager"
            ? managerAccounts.length > 0
              ? "Use the manager account and password created by your administrator in this browser."
              : "Demo sign-in: enter any email and password. Admin can configure manager accounts."
            : "Demo sign-in: enter any email and password. No account verification is performed."}</div>
          <div className="login-switch">Choose a different role? <Link href="/">Back to role selection</Link></div>
        </div>

        <div className="login-footer"><ShieldCheck size={14} /> {supabaseEnabled ? "Protected by Supabase authentication" : "Demo only — this sign-in does not secure or verify an account"}</div>
      </section>
      <aside className="login-aside">
        <div className="login-aside-content">
          <div className="login-aside-mark"><Image src="/btw-logo.png" alt="BTW" width={110} height={85} /></div>
          <div className="login-aside-kicker">BTW OPERATIONS</div>
          <h2>{role === "restaurant_manager" ? <>Keep your<br />restaurant running.</> : <>Turn reports<br />into resolutions.</>}</h2>
          <p>{role === "restaurant_manager"
            ? "Report operational issues for your selected outlet and stay informed as your support team responds."
            : "Stay on top of incoming issues, coordinate support and keep every location moving."}</p>
          <div className="login-aside-rule" />
          <div className="login-aside-note"><span /> Keep every operation moving.</div>
        </div>
        <div className="login-aside-decoration" />
      </aside>
    </main>
  );
}
