"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Bell, Building2,
  CheckCircle2, ChevronDown, Clock3, ClipboardList, Filter, LayoutDashboard,
  LifeBuoy, LogOut, Menu, Plus, Search, Settings, ShieldCheck, Users,
  Wrench, Monitor, X, MoreHorizontal, Paperclip, Send, CircleHelp
} from "lucide-react";
import {
  addDemoManagerAccount, clearDemoSession, readDemoManagerAccounts, readDemoOutlets,
  renameDemoOutlet, resetDemoManagerPassword, type DemoManagerAccount, type DemoRole
} from "@/lib/demo-auth";
import { INITIAL_ISSUES, readDemoIssues, saveDemoIssues, type DemoIssue, type IssueStatus } from "@/lib/demo-issues";
import {
  createDemoNotification, readDemoNotifications, saveDemoNotifications, type DemoNotification
} from "@/lib/demo-notifications";
import {
  createSupabaseIssue, fetchSupabaseIssues, fetchSupabaseNotifications,
  markSupabaseNotificationsRead, updateSupabaseIssue
} from "@/lib/supabase/operations";
import { isSupabaseConfigured } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";

const statusClass: Record<IssueStatus,string> = {
  "New":"new", "Assigned":"assigned", "In Progress":"progress", "On Hold":"hold", "Resolved":"resolved", "Reopened":"reopened", "Closed":"closed"
};
const priorityClass: Record<DemoIssue["priority"],string> = { Critical:"critical", High:"high", Medium:"medium", Low:"low" };

export default function DashboardClient({ role, email, outlet, userId, restaurantId }: {
  role: DemoRole;
  email: string;
  outlet?: string;
  userId?: string;
  restaurantId?: string;
}) {
  const router = useRouter();
  const supabaseMode = isSupabaseConfigured();
  const [issues,setIssues] = useState<DemoIssue[]>([]);
  const [issuesLoaded,setIssuesLoaded] = useState(false);
  const [notifications,setNotifications] = useState<DemoNotification[]>([]);
  const [notificationsLoaded,setNotificationsLoaded] = useState(false);
  const [notificationsOpen,setNotificationsOpen] = useState(false);
  const [active,setActive] = useState(role === "it_team" ? "IT Queue" : role === "maintenance_team" ? "Maintenance Queue" : "Overview");
  const [query,setQuery] = useState("");
  const [statusFilter,setStatusFilter] = useState("All statuses");
  const [deptFilter,setDeptFilter] = useState("All departments");
  const [showNew,setShowNew] = useState(false);
  const [selected,setSelected] = useState<DemoIssue|null>(null);
  const [mobileNav,setMobileNav] = useState(false);
  const [notice,setNotice] = useState("");
  const [noticeError,setNoticeError] = useState(false);
  const [outlets,setOutlets] = useState<string[]>([]);
  const [outletEdits,setOutletEdits] = useState<Record<string,string>>({});
  const [managerAccounts,setManagerAccounts] = useState<DemoManagerAccount[]>([]);
  const [newManager,setNewManager] = useState({email:"",outlet:"",password:""});
  const [passwordEdits,setPasswordEdits] = useState<Record<string,string>>({});
  const [form,setForm] = useState({title:"",department:"IT" as "IT"|"Maintenance",category:"POS / Billing",priority:"Medium" as DemoIssue["priority"],description:""});
  const notificationReader = `${role}:${email.trim().toLocaleLowerCase()}`;
  const roleNotifications = role === "restaurant_manager"
    ? []
    : notifications.filter(notification => notification.recipients.includes(role));
  const unreadNotifications = roleNotifications.filter(notification => !notification.readBy.includes(notificationReader));
  function showNotice(message:string,isError=false) {
    setNotice(message);
    setNoticeError(isError);
  }
  const roleIssues = useMemo(() => issues.filter(issue =>
    role === "restaurant_manager" ? issue.location === outlet :
    role === "it_team" ? issue.department === "IT" :
    role === "maintenance_team" ? issue.department === "Maintenance" : true
  ), [issues, role, outlet]);
  const filtered = useMemo(()=>roleIssues.filter(i=>
    (active==="My Issues" ? true : active==="IT Queue" ? i.department==="IT" : active==="Maintenance Queue" ? i.department==="Maintenance" : true) &&
    (statusFilter==="All statuses" || i.status===statusFilter) &&
    (deptFilter==="All departments" || i.department===deptFilter) &&
    `${i.id} ${i.title} ${i.location} ${i.assignee}`.toLowerCase().includes(query.toLowerCase())
  ),[roleIssues,active,statusFilter,deptFilter,query]);
  const openCount=roleIssues.filter(i=>!["Closed","Resolved"].includes(i.status)).length;
  const overdueCount=2;

  useEffect(() => {
    if (supabaseMode) {
      void fetchSupabaseIssues()
        .then(setIssues)
        .catch(error => {
          console.error("Could not load Supabase issues.", error);
          showNotice(error instanceof Error ? error.message : "Could not load issues.", true);
        })
        .finally(() => setIssuesLoaded(true));
      return;
    }
    try {
      setIssues(readDemoIssues());
    } catch (error) {
      console.error("Could not load saved demo issues.", error);
      setIssues(INITIAL_ISSUES);
      setNotice("Saved demo issues could not be read; showing the example issues instead.");
      setNoticeError(true);
    } finally {
      setIssuesLoaded(true);
    }
  }, [supabaseMode]);

  useEffect(() => {
    if (supabaseMode) {
      if (role === "restaurant_manager") {
        setNotifications([]);
        setNotificationsLoaded(true);
        return;
      }
      if (!userId) {
        setNotice("Your Supabase user session is missing. Please sign in again.");
        setNoticeError(true);
        setNotificationsLoaded(true);
        return;
      }
      void fetchSupabaseNotifications(userId, role, notificationReader)
        .then(setNotifications)
        .catch(error => {
          console.error("Could not load Supabase notifications.", error);
          showNotice(error instanceof Error ? error.message : "Could not load notifications.", true);
        })
        .finally(() => setNotificationsLoaded(true));
      return;
    }
    try {
      setNotifications(readDemoNotifications());
    } catch (error) {
      console.error("Could not load saved demo notifications.", error);
      setNotifications([]);
      setNotice("Saved demo notifications could not be read.");
      setNoticeError(true);
    } finally {
      setNotificationsLoaded(true);
    }
  }, [supabaseMode, role, userId, notificationReader]);

  useEffect(() => {
    if (supabaseMode || !notificationsLoaded) return;
    try {
      saveDemoNotifications(notifications);
    } catch (error) {
      console.error("Could not save demo notifications.", error);
      setNotice("Could not save notifications in this browser.");
      setNoticeError(true);
    }
  }, [notifications, notificationsLoaded, supabaseMode]);

  useEffect(() => {
    if (supabaseMode || !issuesLoaded) return;
    try {
      saveDemoIssues(issues);
    } catch (error) {
      console.error("Could not save demo issues.", error);
      setNotice("Could not save issues in this browser. Changes may not be available after refresh.");
      setNoticeError(true);
    }
  }, [issues, issuesLoaded, supabaseMode]);

  useEffect(() => {
    if (supabaseMode) return;
    function syncLocalData(event:StorageEvent) {
      if (event.key === "operations-hub-demo-notifications" && event.newValue !== null) {
        try {
          setNotifications(readDemoNotifications());
        } catch (error) {
          console.error("Could not sync notifications from another tab.",error);
          showNotice("Could not refresh notifications from another tab.",true);
        }
      }
      if (event.key !== "operations-hub-demo-issues" || event.newValue === null) return;
      try {
        setIssues(readDemoIssues());
      } catch (error) {
        console.error("Could not sync updated demo issues from another tab.",error);
        showNotice("Could not refresh issue changes from another tab.",true);
      }
    }

    window.addEventListener("storage",syncLocalData);
    return () => window.removeEventListener("storage",syncLocalData);
  }, [supabaseMode]);

  useEffect(() => {
    if (!supabaseMode || !userId) return;
    const supabase = createClient();
    const refreshIssues = () => {
      void fetchSupabaseIssues()
        .then(setIssues)
        .catch(error => {
          console.error("Could not refresh Supabase issues.", error);
          showNotice(error instanceof Error ? error.message : "Could not refresh issues.", true);
        });
    };
    const refreshNotifications = () => {
      if (role === "restaurant_manager") return;
      void fetchSupabaseNotifications(userId, role, notificationReader)
        .then(setNotifications)
        .catch(error => {
          console.error("Could not refresh Supabase notifications.", error);
          showNotice(error instanceof Error ? error.message : "Could not refresh notifications.", true);
        });
    };
    const channel = supabase.channel(`dashboard-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, refreshIssues)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refreshNotifications)
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          showNotice("Live updates are unavailable. Reload the page to check for new changes.", true);
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [supabaseMode, userId, role, notificationReader]);

  useEffect(() => {
    if (role !== "admin" || supabaseMode) return;
    try {
      const savedOutlets = readDemoOutlets();
      setOutlets(savedOutlets);
      setOutletEdits(Object.fromEntries(savedOutlets.map(name => [name, name])));
      setNewManager(current => ({ ...current, outlet: savedOutlets[0] ?? "" }));
      setManagerAccounts(readDemoManagerAccounts());
    } catch (error) {
      console.error("Could not load outlet settings.", error);
      setNotice("Could not load outlet settings from this browser.");
      setNoticeError(true);
    }
  }, [role, supabaseMode]);

  function handleRenameOutlet(currentName:string) {
    try {
      const requestedName = outletEdits[currentName] ?? currentName;
      const updatedOutlets = renameDemoOutlet(currentName,requestedName);
      const updatedIssues = issues.map(issue => issue.location === currentName
        ? { ...issue, location: requestedName.trim() }
        : issue);
      saveDemoIssues(updatedIssues);
      setIssues(updatedIssues);
      setOutlets(updatedOutlets);
      setOutletEdits(Object.fromEntries(updatedOutlets.map(name => [name,name])));
      setManagerAccounts(readDemoManagerAccounts());
      setNewManager(current => ({
        ...current,
        outlet: current.outlet === currentName ? requestedName.trim() : current.outlet
      }));
      showNotice(`Outlet renamed to ${requestedName.trim()}.`);
    } catch (error) {
      console.error("Could not rename the outlet.",error);
      showNotice(error instanceof Error ? error.message : "Could not rename the outlet.",true);
    }
  }

  async function handleAddManager(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const updatedAccounts = await addDemoManagerAccount(newManager.email,newManager.outlet,newManager.password);
      setManagerAccounts(updatedAccounts);
      setNewManager(current => ({ ...current,email:"",password:"" }));
      showNotice(`Manager account created for ${newManager.email.trim()}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not create the manager account.",true);
    }
  }

  async function handleResetManagerPassword(event:React.FormEvent<HTMLFormElement>,email:string) {
    event.preventDefault();
    try {
      const updatedAccounts = await resetDemoManagerPassword(email,passwordEdits[email] ?? "");
      setManagerAccounts(updatedAccounts);
      setPasswordEdits(current => ({ ...current,[email]:"" }));
      showNotice(`Password reset for ${email}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not reset the manager password.",true);
    }
  }

  async function createIssue(e:React.FormEvent) {
    e.preventDefault();
    if (supabaseMode) {
      if (!userId || !restaurantId || !outlet) {
        showNotice("Your account is missing its restaurant assignment. Contact an administrator.", true);
        return;
      }
      try {
        const item = await createSupabaseIssue({
          userId,
          restaurantId,
          issue: form,
          location: outlet
        });
        setIssues(current => [item, ...current]);
        setShowNew(false);
        setActive("My Issues");
        setForm(current => ({ ...current, title: "", description: "" }));
        showNotice(`Issue submitted — ${item.id}. The assigned team and Admin have been notified.`);
      } catch (error) {
        console.error("Could not submit issue to Supabase.", error);
        showNotice(error instanceof Error ? error.message : "Could not submit the issue.", true);
      }
      setTimeout(()=>setNotice(""),5000);
      return;
    }

    const next = 126 + issues.length - INITIAL_ISSUES.length;
    const item:DemoIssue={...form,id:`OPS-2026-${String(next).padStart(5,"0")}`,location:outlet ?? "Noida Sector 18",reporterEmail:email,status:"New",assignee:"Unassigned",age:"Just now",created:"Just now"};
    setIssues([item,...issues]); setShowNew(false); setActive("My Issues");
    setNotifications(current => [createDemoNotification(item), ...current]);
    setForm({...form,title:"",description:""});
    if (item.department === "Maintenance") {
      try {
        const response = await fetch("/api/notifications/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department: item.department,
            ticketId: item.id,
            title: item.title,
            location: item.location,
            priority: item.priority
          })
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const errorMessage = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "WhatsApp notification failed.";
          throw new Error(errorMessage);
        }
        showNotice(`Issue submitted — ${item.id}. In-app alerts sent to Maintenance and Admin; WhatsApp accepted the alert.`);
        if (typeof result === "object" && result !== null && "accepted" in result && typeof result.accepted === "number") {
          showNotice(`Issue submitted — ${item.id}. In-app alerts sent to Maintenance and Admin; WhatsApp accepted ${result.accepted} alert(s).`);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "WhatsApp alerts are not enabled.") {
          showNotice(`Issue submitted — ${item.id}. In-app alerts sent to Maintenance and Admin.`);
          setTimeout(()=>setNotice(""),5000);
          return;
        }
        console.error("Issue was created, but the WhatsApp maintenance alert failed.", error);
        showNotice(`Issue submitted — ${item.id}. In-app alerts sent to Maintenance and Admin, but WhatsApp failed: ${error instanceof Error ? error.message : "Unknown error."}`,true);
      }
    } else {
      showNotice(`Issue submitted — ${item.id}. In-app alerts sent to IT and Admin.`);
    }
    setTimeout(()=>setNotice(""),5000);
  }
  async function updateIssue(id:string,updates:Partial<DemoIssue>) {
    const currentIssue = issues.find(issue => issue.id === id);
    if (!currentIssue) return;
    const updatedIssues=issues.map(issue=>{
      if (issue.id!==id) return issue;
      if (updates.status === undefined || updates.status === issue.status) return {...issue,...updates};
      const enteringResolved = updates.status === "Resolved" || updates.status === "Closed";
      const wasResolved = issue.status === "Resolved" || issue.status === "Closed";
      return {
        ...issue,
        ...updates,
        resolved_at: enteringResolved
          ? wasResolved ? issue.resolved_at ?? null : new Date().toISOString()
          : null
      };
    });
    if (supabaseMode) {
      const updatedIssue = updatedIssues.find(issue => issue.id === id);
      if (!updatedIssue) return;
      try {
        await updateSupabaseIssue(currentIssue, updates);
      } catch (error) {
        console.error("Could not update Supabase issue.", error);
        showNotice(error instanceof Error ? error.message : "Could not update the issue.", true);
        return;
      }
    }
    setIssues(updatedIssues);
    setSelected(current=>current?.id===id ? updatedIssues.find(issue=>issue.id===id) ?? null : current);
    if(updates.status === "Resolved") showNotice(`Issue ${id} marked resolved. Managers and admins can see the update.`);
    else if(updates.status === "Reopened") showNotice(`Issue ${id} marked not resolved and reopened.`);
    else if(updates.status) showNotice(`Ticket status updated to ${updates.status}`);
    else if(updates.assignee !== undefined) showNotice("Ticket assignment updated");
    setTimeout(()=>setNotice(""),3000);
  }

  function isResolved(issue:DemoIssue) {
    return issue.status === "Resolved" || issue.status === "Closed";
  }

  function formatResolvedAt(value:string | null | undefined) {
    if (!value) return "Time not recorded";
    return new Intl.DateTimeFormat(undefined,{
      dateStyle:"medium",
      timeStyle:"short"
    }).format(new Date(value));
  }

  function handleResolutionChange(issue:DemoIssue,resolution:"Resolved"|"Not resolved") {
    if (resolution === "Resolved" && !isResolved(issue)) {
      updateIssue(issue.id,{status:"Resolved"});
    } else if (resolution === "Not resolved" && isResolved(issue)) {
      updateIssue(issue.id,{status:"Reopened"});
    }
  }

  async function markNotificationRead(notification:DemoNotification) {
    if (supabaseMode) {
      try {
        await markSupabaseNotificationsRead([notification.id]);
      } catch (error) {
        console.error("Could not mark the Supabase notification as read.", error);
        showNotice(error instanceof Error ? error.message : "Could not mark the notification as read.", true);
        return;
      }
    }
    setNotifications(current => current.map(item =>
      item.id === notification.id && !item.readBy.includes(notificationReader)
        ? { ...item, readBy: [...item.readBy, notificationReader] }
        : item
    ));
    setActive(role === "it_team" ? "IT Queue" : role === "maintenance_team" ? "Maintenance Queue" : "My Issues");
    setNotificationsOpen(false);
  }

  async function markAllNotificationsRead() {
    const unreadIds = new Set(unreadNotifications.map(notification => notification.id));
    if (supabaseMode) {
      try {
        await markSupabaseNotificationsRead([...unreadIds]);
      } catch (error) {
        console.error("Could not mark Supabase notifications as read.", error);
        showNotice(error instanceof Error ? error.message : "Could not mark notifications as read.", true);
        return;
      }
    }
    setNotifications(current => current.map(notification =>
      unreadIds.has(notification.id) && !notification.readBy.includes(notificationReader)
        ? { ...notification, readBy: [...notification.readBy, notificationReader] }
        : notification
    ));
  }

  const navItems: [string, typeof LayoutDashboard][] = role === "restaurant_manager"
    ? [["Overview",LayoutDashboard],["My Issues",ClipboardList]]
    : role === "it_team"
      ? [["Overview",LayoutDashboard],["IT Queue",Monitor]]
      : role === "maintenance_team"
        ? [["Overview",LayoutDashboard],["Maintenance Queue",Wrench]]
          : supabaseMode
            ? [["Overview",LayoutDashboard],["My Issues",ClipboardList],["IT Queue",Monitor],["Maintenance Queue",Wrench],["Reports & Analytics",Activity]]
            : [["Overview",LayoutDashboard],["My Issues",ClipboardList],["IT Queue",Monitor],["Maintenance Queue",Wrench],["Outlet Settings",Building2],["Reports & Analytics",Activity]];
  const roleTitle = role === "restaurant_manager" ? "Outlet Manager" : role === "it_team" ? "IT Team" : role === "maintenance_team" ? "Maintenance Team" : "Administrator";
  const roleInitials = role === "restaurant_manager" ? "RM" : role === "it_team" ? "IT" : role === "maintenance_team" ? "MT" : "AD";

  if (!issuesLoaded) {
    return <main className="login-page"><p className="dashboard-loading">Loading issues...</p></main>;
  }

  function handleStatusChange(id:string,status:IssueStatus) {
    updateIssue(id,{status});
  }
  function handleAssigneeChange(id:string,assignee:string) {
    updateIssue(id,{assignee});
  }

  return <main className="shell">
    <aside className={`sidebar ${mobileNav?"mobile-open":""}`}>
      <div className="brand"><div className="dashboard-brand-logo"><Image src="/btw-logo.png" alt="BTW" width={80} height={62} priority /></div><div><b>BTW Operations</b><small>KEEP EVERY OPERATION MOVING</small></div><button className="close-nav" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>
        {navItems.map(([label,Icon])=>
          <button key={label} className={`nav-item ${active===label?"active":""}`} onClick={()=>{setActive(label);setMobileNav(false)}}><Icon size={18}/><span>{label}</span>{label==="My Issues"&&<em>{openCount}</em>}</button>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><LifeBuoy size={17}/></div><b>Need assistance?</b><p>Contact your system administrator for access or support.</p><button onClick={()=>showNotice("Support contact: operations administrator")}>Get help <ArrowUpRight size={13}/></button></div>
        <button className="nav-item"><Settings size={18}/>Settings</button>
        <div className="profile"><div className="avatar">{roleInitials}</div><div className="profile-text"><b>{email}</b><small>{roleTitle}{role === "restaurant_manager" ? ` · ${outlet}` : ""}{supabaseMode ? "" : " · Demo"}</small></div><button className="icon-btn" aria-label="Log out" title="Log out" onClick={async()=>{if(supabaseMode){const {error}=await createClient().auth.signOut();if(error){showNotice(`Could not sign out: ${error.message}`,true);return;}}else{clearDemoSession();}router.replace("/")}}><LogOut size={17}/></button></div>
      </div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="menu-btn" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">Workspace <span>/</span> <b>{active}</b></div><div className="top-actions"><div className="location-pill"><Building2 size={15}/> {role === "restaurant_manager" ? outlet : role === "it_team" ? "All outlets · IT" : role === "maintenance_team" ? "All outlets · Maintenance" : "All outlets"} <ChevronDown size={14}/></div><div className="notification-wrap"><button className="icon-btn notification" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={()=>setNotificationsOpen(open=>!open)}><Bell size={18}/>{unreadNotifications.length > 0 && <span className="notification-count">{unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}</span>}</button>{notificationsOpen&&<section className="notification-panel" aria-label="Notifications"><div className="notification-panel-head"><b>Notifications</b><button type="button" onClick={markAllNotificationsRead} disabled={unreadNotifications.length===0}>Mark all read</button></div>{roleNotifications.length===0?<p className="notification-empty">No notifications yet.</p>:<div className="notification-list">{roleNotifications.map(notification=><button type="button" key={notification.id} className={`notification-item ${notification.readBy.includes(notificationReader)?"":"unread"}`} onClick={()=>markNotificationRead(notification)}><span className="notification-item-top"><b>New {notification.department} issue</b><small>{new Date(notification.createdAt).toLocaleString()}</small></span><span>{notification.title}</span><small>{notification.ticketId} · {notification.location} · {notification.priority}</small></button>)}</div>}</section>}</div><div className="avatar small">{roleInitials}</div></div></header>

      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{roleTitle.toUpperCase()} WORKSPACE</div><h1>{active==="Overview" ? (role === "restaurant_manager" ? "Welcome to your workspace" : "Issue management") : active}</h1><p>{active==="Overview" ? (role === "restaurant_manager" ? `Raise issues for ${outlet} and track progress.` : "Review and resolve operational issues across all outlets.") : active==="Outlet Settings" ? "Manage unique outlet names and manager sign-in accounts." : "Monitor, manage and resolve operational issues."}</p></div>{role === "restaurant_manager" && <button className="primary-btn" onClick={()=>setShowNew(true)}><Plus size={17}/> Raise an issue</button>}</div>

        {active==="Overview" && <>
          <div className="metric-grid">
            <Metric icon={<ClipboardList/>} label="Total open issues" value={String(openCount).padStart(2,"0")} note={role === "restaurant_manager" ? outlet : role === "admin" ? "Across all outlets" : `All outlets · ${roleTitle}`} trend="12%" up/>
            <Metric icon={<Clock3/>} label="Awaiting action" value="08" note="Need department attention" trend="4%" up={false}/>
            <Metric icon={<CheckCircle2/>} label="Resolved this month" value="142" note="Across all departments" trend="18%" up/>
            <Metric icon={<AlertCircle/>} label="SLA breached" value={String(overdueCount).padStart(2,"0")} note="Requires escalation" trend="Needs attention" danger/>
          </div>
          <div className="overview-grid">
            <div className="panel performance"><div className="panel-head"><div><h3>Issue overview</h3><p>Current ticket distribution</p></div><button className="subtle-btn">This month <ChevronDown size={14}/></button></div>
              <div className="chart-wrap"><div className="donut"><div><b>{roleIssues.length}</b><small>Total tickets</small></div></div><div className="legend"><Legend color="#4779e6" label="In progress" value="35%"/><Legend color="#e8a23b" label="New / Assigned" value="25%"/><Legend color="#28a879" label="Resolved" value="30%"/><Legend color="#d8dee9" label="Closed / On hold" value="10%"/></div></div>
            </div>
            <div className="panel sla"><div className="panel-head"><div><h3>SLA performance</h3><p>Resolution within target</p></div><ShieldCheck size={19} className="muted-icon"/></div><div className="sla-score">92<span>%</span></div><div className="progress-track"><div style={{width:"92%"}}/></div><div className="sla-foot"><span><i className="dot green"/> Within SLA</span><b>92%</b></div><div className="sla-foot"><span><i className="dot red"/> Breached</span><b>8%</b></div><div className="sla-note"><ArrowUpRight size={14}/> 6% improvement from last month</div></div>
          </div>
        </>}

        {role === "admin" && !supabaseMode && active === "Outlet Settings" ? (
          <div className="panel settings-panel">
            <section>
              <div className="panel-head"><div><h3>Outlet names</h3><p>Names must be unique. Existing issues and manager assignments are updated when an outlet is renamed.</p></div></div>
              <div className="table-scroll settings-table">
                <table><thead><tr><th>OUTLET</th><th>UNIQUE NAME</th><th></th></tr></thead><tbody>
                  {outlets.map((name,index)=><tr key={name}>
                    <td>Outlet {String(index+1).padStart(2,"0")}</td>
                    <td><input className="settings-input" aria-label={`Outlet ${index+1} name`} maxLength={80} value={outletEdits[name] ?? name} onChange={event=>setOutletEdits(current=>({...current,[name]:event.target.value}))}/></td>
                    <td><button className="secondary-btn" type="button" disabled={(outletEdits[name] ?? name).trim()===name} onClick={()=>handleRenameOutlet(name)}>Save name</button></td>
                  </tr>)}
                </tbody></table>
              </div>
            </section>

            <section className="manager-access">
              <div className="panel-head"><div><h3>Manager accounts</h3><p>Passwords are hashed in this browser. Once accounts are added, managers must use an account created here.</p></div></div>
              <form className="manager-create-form" onSubmit={handleAddManager}>
                <label>Email<input autoComplete="off" required type="email" value={newManager.email} onChange={event=>setNewManager(current=>({...current,email:event.target.value}))}/></label>
                <label>Outlet<select required value={newManager.outlet} onChange={event=>setNewManager(current=>({...current,outlet:event.target.value}))}>{outlets.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
                <label>Temporary password<input autoComplete="new-password" minLength={8} required type="password" value={newManager.password} onChange={event=>setNewManager(current=>({...current,password:event.target.value}))}/></label>
                <button className="primary-btn" type="submit">Add manager</button>
              </form>

              {managerAccounts.length === 0 ? <p className="settings-empty">No manager accounts configured. Until the first account is added, the demo manager login accepts any email and password.</p> : (
                <div className="table-scroll settings-table">
                  <table><thead><tr><th>MANAGER</th><th>OUTLET</th><th>RESET PASSWORD</th><th></th></tr></thead><tbody>
                    {managerAccounts.map(account=><tr key={account.email}>
                      <td>{account.email}</td><td>{account.outlet}</td>
                      <td><form className="manager-reset-form" onSubmit={event=>handleResetManagerPassword(event,account.email)}>
                        <input aria-label={`New password for ${account.email}`} autoComplete="new-password" minLength={8} required type="password" value={passwordEdits[account.email] ?? ""} onChange={event=>setPasswordEdits(current=>({...current,[account.email]:event.target.value}))}/>
                        <button className="secondary-btn" type="submit">Reset</button>
                      </form></td><td></td>
                    </tr>)}
                  </tbody></table>
                </div>
              )}
            </section>
          </div>
        ) : (
        <div className="panel tickets-panel">
          <div className="panel-head tickets-head"><div><h3>{active==="Overview"?"Recent issues":"Issue register"}</h3><p>{role === "restaurant_manager" ? `Issues reported for ${outlet}` : role === "it_team" ? "IT issues from every outlet" : role === "maintenance_team" ? "Maintenance issues from every outlet" : "Issues across all outlets and departments"}</p></div><button className="text-btn" onClick={()=>setActive(role === "it_team" ? "IT Queue" : role === "maintenance_team" ? "Maintenance Queue" : "My Issues")}>View all <ArrowUpRight size={14}/></button></div>
          <div className="filters"><div className="searchbox"><Search size={16}/><input placeholder="Search tickets, locations..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option>{Object.keys(statusClass).map(s=><option key={s}>{s}</option>)}</select>{role !== "it_team" && role !== "maintenance_team" && <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option>All departments</option><option>IT</option><option>Maintenance</option></select>}<button className="filter-btn"><Filter size={15}/> Filters</button></div>
          <div className="table-scroll"><table><thead><tr><th>TICKET</th><th>ISSUE</th><th>LOCATION</th><th>DEPARTMENT</th><th>PRIORITY</th><th>STATUS</th><th>ASSIGNEE</th><th>RESOLUTION</th><th></th></tr></thead><tbody>
            {filtered.slice(0,active==="Overview"?5:100).map(i=><tr key={i.id} onClick={()=>setSelected(i)}><td><b className="ticket-id">{i.id}</b><small>{i.created}</small></td><td><b className="issue-title">{i.title}</b><small>{i.category}</small></td><td>{i.location}</td><td><span className="dept"><i className={i.department==="IT"?"blue-dot":"orange-dot"}/>{i.department}</span></td><td><span className={`priority ${priorityClass[i.priority]}`}>{i.priority}</span></td><td><span className={`status ${statusClass[i.status]}`}>{i.status}</span></td><td>{i.assignee}</td><td onClick={event=>event.stopPropagation()}><div className="resolution-cell">{role==="restaurant_manager"
              ? <span className={`resolution-indicator ${isResolved(i)?"is-resolved":"is-unresolved"}`}>{isResolved(i)?"Resolved":"Not resolved"}</span>
              : <select className={`resolution-select ${isResolved(i)?"is-resolved":"is-unresolved"}`} aria-label={`Resolution for ${i.id}`} value={isResolved(i)?"Resolved":"Not resolved"} onChange={event=>handleResolutionChange(i,event.target.value as "Resolved"|"Not resolved")}><option>Not resolved</option><option>Resolved</option></select>}
              {isResolved(i)&&<small className="resolved-time">{formatResolvedAt(i.resolved_at)}</small>}</div></td><td><MoreHorizontal size={17} className="row-more"/></td></tr>)}
            {filtered.length===0&&<tr><td colSpan={9} className="empty">No tickets match these filters.</td></tr>}
          </tbody></table></div>
          <div className="table-footer"><span>Showing {Math.min(filtered.length,active==="Overview"?5:filtered.length)} of {filtered.length} tickets</span><div><button disabled>Previous</button><button>Next <ArrowUpRight size={12}/></button></div></div>
        </div>
        )}
        <div className="bottom-note"><ShieldCheck size={14}/> All ticket activity is recorded for audit and operational reporting.</div>
      </div>
    </section>

    {showNew&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowNew(false)}}><form className="modal" onSubmit={createIssue}><div className="modal-head"><div><div className="eyebrow">NEW SUPPORT REQUEST</div><h2>Raise an issue</h2><p>Share the details so the right team can help.</p></div><button type="button" className="icon-btn" onClick={()=>setShowNew(false)}><X/></button></div>
      <label>Issue title<input required placeholder="e.g. POS terminal not working" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <div className="form-row"><label>Your outlet<input readOnly value={outlet}/></label><label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value as "IT"|"Maintenance",category:e.target.value==="IT"?"POS / Billing":"Air Conditioning"})}><option>IT</option><option>Maintenance</option></select></label></div>
      <div className="form-row"><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{(form.department==="IT"?["POS / Billing","Network / Internet","Printer","CCTV / Network","Software","Hardware","Other"]:["Air Conditioning","Electrical","Plumbing","Kitchen Equipment","Civil / Carpentry","Other"]).map(c=><option key={c}>{c}</option>)}</select></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as DemoIssue["priority"]})}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div>
      <label>Description<textarea required rows={4} placeholder="Describe what happened, where it happened and how operations are affected..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <div className="upload-hint"><Paperclip size={15}/> Attachments will be available after backend setup.</div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary-btn" type="submit"><Send size={15}/> Submit issue</button></div>
    </form></div>}

    {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modal detail-modal"><div className="modal-head"><div><div className="eyebrow">{selected.id}</div><h2>{selected.title}</h2><p>{selected.location} · {selected.created}</p></div><button className="icon-btn" onClick={()=>setSelected(null)}><X/></button></div><div className="detail-chips"><span className={`priority ${priorityClass[selected.priority]}`}>{selected.priority} priority</span><span className={`status ${statusClass[selected.status]}`}>{selected.status}</span><span className="dept">{selected.department}</span></div><div className="detail-grid"><div><small>Category</small><b>{selected.category}</b></div><div><small>Assigned to</small><b>{selected.assignee}</b></div><div><small>Restaurant</small><b>{selected.location}</b></div><div><small>Ticket age</small><b>{selected.age}</b></div>{isResolved(selected)&&<div><small>Resolved at</small><b>{formatResolvedAt(selected.resolved_at)}</b></div>}</div>{role !== "restaurant_manager" && <><label>Assign to<input value={selected.assignee} onChange={e=>handleAssigneeChange(selected.id,e.target.value)} placeholder="Enter team member name"/></label><label>Update status<select value={selected.status} onChange={e=>handleStatusChange(selected.id,e.target.value as IssueStatus)}>{Object.keys(statusClass).map(s=><option key={s}>{s}</option>)}</select></label></>}<div className="timeline"><b>Activity</b><p><i/> Ticket created by Restaurant Manager <small>{selected.created}</small></p><p><i/> Current status: {selected.status}{isResolved(selected)&&selected.resolved_at&&<> <small>{formatResolvedAt(selected.resolved_at)}</small></>}</p></div><div className="modal-actions"><button className="secondary-btn" onClick={()=>setSelected(null)}>Close</button></div></div></div>}
    {notice&&<div className={`toast ${noticeError?"toast-error":""}`} role={noticeError?"alert":"status"}>{noticeError?<AlertCircle size={17}/>:<CheckCircle2 size={17} />}{notice}<button onClick={()=>setNotice("")}><X size={14}/></button></div>}
  </main>;
}

function Metric({icon,label,value,note,trend,up,danger}:any){return <div className="metric-card"><div className="metric-top"><div className="metric-icon">{icon}</div><span className={`trend ${danger?"danger":up?"up":"down"}`}>{danger?<AlertCircle size={12}/>:up?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {trend}</span></div><div className="metric-value">{value}</div><b>{label}</b><small>{note}</small></div>}
function Legend({color,label,value}:any){return <div className="legend-item"><i style={{background:color}}/><span>{label}</span><b>{value}</b></div>}
