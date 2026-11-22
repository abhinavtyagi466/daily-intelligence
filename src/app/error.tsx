"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Workspace data is unavailable</h1>
        <p className="muted">Check the Supabase connection and try again.</p>
        <div className="error-actions"><Button onClick={reset}>Try again</Button><Link href="/login">Sign in</Link></div>
      </div>
    </main>
  );
}
