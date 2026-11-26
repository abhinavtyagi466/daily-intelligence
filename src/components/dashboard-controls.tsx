"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { Ellipsis, LoaderCircle, Moon, Play, Sun, X } from "lucide-react";
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

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.cookie = `intelligence-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
  return (
    <Button variant="ghost" className="theme-toggle" aria-label="Toggle light and dark theme" title="Toggle theme" onClick={toggle}>
      <Sun size={18} className="theme-sun" />
      <Moon size={18} className="theme-moon" />
      {showLabel && <span>Theme</span>}
    </Button>
  );
}

export function MobileWorkspaceMenu({ active, children }: { active: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    const closeOnDesktop = () => {
      if (!mobile.matches) dialog.current?.close();
    };
    mobile.addEventListener("change", closeOnDesktop);
    return () => mobile.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      <button type="button" className="mobile-tab" data-current={active || undefined} aria-haspopup="dialog" aria-controls={id}
        onClick={() => dialog.current?.showModal()}>
        <Ellipsis size={21} aria-hidden="true" />
        <span>More</span>
      </button>
      <dialog ref={dialog} id={id} className="mobile-menu" aria-labelledby={`${id}-title`}
        onClick={(event) => {
          const { target, currentTarget } = event;
          if (target === currentTarget || (target instanceof Element && target.closest("a[href]"))) currentTarget.close();
        }}>
        <div className="mobile-menu-heading">
          <h2 id={`${id}-title`}>Workspace menu</h2>
          <Button variant="ghost" className="mobile-menu-close" aria-label="Close menu" onClick={() => dialog.current?.close()}>
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </dialog>
    </>
  );
}
