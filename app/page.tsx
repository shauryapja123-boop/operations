import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ClipboardList, Monitor, ShieldCheck, Wrench } from "lucide-react";

export default function Home() {
  return (
    <main className="portal-page">
      <div className="portal-glow portal-glow-one" />
      <div className="portal-glow portal-glow-two" />
      <section className="portal-content">
        <Link className="portal-brand" href="/">
          <span className="portal-brand-logo"><Image src="/btw-logo.png" alt="BTW" width={90} height={70} priority /></span>
          <span><b>BTW Operations</b><small>KEEP EVERY OPERATION MOVING</small></span>
        </Link>

        <div className="portal-intro">
          <div className="portal-eyebrow"><span /> FOUR ROLE-BASED WORKSPACES</div>
          <h1>Keep every<br /><em>operation moving.</em></h1>
          <p>Choose your team to report, assign and resolve issues across all outlets.</p>
        </div>

        <div className="portal-cards">
          <Link className="portal-card manager-card" href="/login/manager">
            <span className="portal-card-icon manager-icon"><ClipboardList size={22} /></span>
            <span className="portal-card-copy">
              <small>FOR RESTAURANT TEAMS</small>
              <b>Restaurant Manager</b>
              <span>Raise issues and track them for your selected outlet.</span>
            </span>
            <span className="portal-card-arrow"><ArrowRight size={18} /></span>
          </Link>
          <Link className="portal-card admin-card" href="/login/it">
            <span className="portal-card-icon manager-icon"><Monitor size={22} /></span>
            <span className="portal-card-copy">
              <small>FOR SUPPORT TEAMS</small>
              <b>IT Team</b>
              <span>See and manage IT issues from every outlet.</span>
            </span>
            <span className="portal-card-arrow"><ArrowRight size={18} /></span>
          </Link>
          <Link className="portal-card admin-card" href="/login/maintenance">
            <span className="portal-card-icon admin-icon"><Wrench size={22} /></span>
            <span className="portal-card-copy">
              <small>FOR SUPPORT TEAMS</small>
              <b>Maintenance Team</b>
              <span>See and manage maintenance issues from every outlet.</span>
            </span>
            <span className="portal-card-arrow"><ArrowRight size={18} /></span>
          </Link>
          <Link className="portal-card admin-card" href="/login/admin">
            <span className="portal-card-icon admin-icon"><ShieldCheck size={22} /></span>
            <span className="portal-card-copy">
              <small>FOR SUPPORT TEAMS</small>
              <b>Admin</b>
              <span>See all issues across outlets and departments.</span>
            </span>
            <span className="portal-card-arrow"><ArrowRight size={18} /></span>
          </Link>
        </div>
        <div className="portal-foot"><ShieldCheck size={14} /> Demo mode — no account or server setup required</div>
      </section>
      <aside className="portal-aside">
        <div className="portal-aside-mark"><Image src="/btw-logo.png" alt="BTW" width={110} height={85} /></div>
        <div className="portal-aside-copy">
          <div className="portal-aside-label">KEEP EVERY OPERATION MOVING</div>
          <h2>Make every<br />issue count.</h2>
          <p>From the first report to final resolution, keep your teams connected and your restaurants running smoothly.</p>
        </div>
        <div className="portal-aside-bottom"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
        <div className="portal-aside-caption"><b>BTW Operations</b><span>RESTAURANT OPERATIONS</span></div>
      </aside>
    </main>
  );
}
