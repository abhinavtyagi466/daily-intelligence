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

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand login-brand"><span className="brand-mark"><Radar size={22} /></span><span>Intelligence OS</span></div>
        <h1>{access ? "Workspace access required" : "Sign in"}</h1>
        <p className="muted">{access ? "Ask your administrator to grant access to this workspace." : "Access your private research workspace."}</p>
        {access ? <form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form>
          : <LoginForm configured={Boolean(publicSupabaseConfig())} />}
      </div>
    </main>
  );
}
