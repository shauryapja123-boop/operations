import type { Metadata } from "next";
import LoginForm from "../login-form";

export const metadata: Metadata = {
  title: "Maintenance Team Sign In | BTW Operations"
};

export default function MaintenanceTeamLoginPage() {
  return <LoginForm role="maintenance_team" />;
}
