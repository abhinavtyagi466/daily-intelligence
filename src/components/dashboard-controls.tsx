"use client";

import { useActionState } from "react";
import { LoaderCircle, Moon, Play, Sun } from "lucide-react";
import { type ActionState, runResearch, signIn } from "@/app/actions";
import { Button } from "./ui/button";

const blank: ActionState = { message: "" };

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signIn, blank);
  return (
    <form action={action} className="login-form">
      <label htmlFor="email">Email</label>
      <input id="email" type="email" name="email" autoComplete="username" required disabled={!configured || pending} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" name="password" autoComplete="current-password" required disabled={!configured || pending} />
      <div className="form-message" aria-live="polite">
        {configured ? state.message : "Configure Supabase to enable sign-in."}
      </div>
      <Button type="submit" disabled={!configured || pending}>
        {pending && <LoaderCircle className="spin" size={16} />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RunResearchButton() {
  const [state, action, pending] = useActionState(runResearch, blank);
  return (
    <form action={action} className="run-form">
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
        {pending ? "Running Crossref…" : "Run Research Now"}
      </Button>
      <span className={state.ok ? "run-message positive" : "run-message"} aria-live="polite">{state.message}</span>
    </form>
  );
}

export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `intelligence-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  return (
    <Button variant="ghost" className="theme-toggle" aria-label="Toggle light and dark theme" title="Toggle theme" onClick={toggle}>
      <Sun size={18} className="theme-sun" />
      <Moon size={18} className="theme-moon" />
    </Button>
  );
}
