import type { Metadata } from "next";
import LoginForm from "../login-form";

export const metadata: Metadata = {
  title: "Restaurant Manager Sign In | BTW Operations"
};

export default function RestaurantManagerLoginPage() {
  return <LoginForm role="restaurant_manager" />;
}
