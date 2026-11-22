import type { Metadata } from "next";
import LoginForm from "../login-form";

export const metadata: Metadata = {
  title: "Operations Admin Sign In | BTW Operations"
};

export default function AdminLoginPage() {
  return <LoginForm role="admin" />;
}
