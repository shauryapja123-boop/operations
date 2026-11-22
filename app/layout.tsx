import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTW Operations",
  description: "Keep every operation moving with BTW Operations."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
