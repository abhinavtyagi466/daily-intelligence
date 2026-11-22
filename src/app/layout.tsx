import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Intelligence OS", template: "%s · Intelligence OS" },
  description: "Private research intelligence workspace",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = (await cookies()).get("intelligence-theme")?.value === "light" ? "light" : "dark";
  return <html lang="en" data-theme={theme}><body>{children}</body></html>;
}
