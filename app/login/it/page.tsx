import type { Metadata } from "next";
import LoginForm from "../login-form";

export const metadata: Metadata = {
  title: "IT Team Sign In | BTW Operations"
};

export default function ITTeamLoginPage() {
  return <LoginForm role="it_team" />;
}
