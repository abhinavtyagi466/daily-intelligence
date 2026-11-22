import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { LoginForm } from "@/components/dashboard-controls";
import { Button } from "@/components/ui/button";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { getDashboardAccess } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const access = await getDashboardAccess();
  if (access?.role) redirect("/");

  let title = "Sign in";
  let message = "Access your private research workspace.";
  if (access?.setupRequired) {
    title = "Workspace setup required";
    message = "Ask your administrator to apply the Supabase migrations and grant workspace membership.";
  } else if (access) {
    title = "Workspace access required";
    message = "Ask your administrator to grant access to this workspace.";
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand login-brand"><span className="brand-mark"><Radar size={22} /></span><span>Intelligence OS</span></div>
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        {access ? <form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form>
          : <LoginForm configured={Boolean(publicSupabaseConfig())} />}
      </div>
    </main>
  );
}
