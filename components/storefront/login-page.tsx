"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useShop } from "./shop-provider";
import { ApiError, errorMessage } from "@/lib/shop/api";

/** Only same-site relative redirects are honoured (prevents open redirects through ?next=). */
export const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/account/orders");

export function LoginPage() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { user, authReady, signIn, register } = useShop();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => { if (authReady && user) router.replace(next); }, [authReady, user, next, router]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true); setError(null); setFields({});
    try {
      if (mode === "login") await signIn(f.email!, f.password!);
      else await register({ name: f.name!, email: f.email!, password: f.password!, phone: f.phone?.trim() || undefined });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.details?.fields) setFields(Object.fromEntries(err.details.fields.map((x) => [x.path, x.message])));
      setError(err instanceof ApiError && err.details?.fields ? "Please correct the highlighted fields." : errorMessage(err));
    } finally { setBusy(false); }
  };

  const input = (name: string, label: string, type = "text", extra: Record<string, string> = {}) => (
    <div>
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input id={name} name={name} type={type} required={name !== "phone"} aria-invalid={!!fields[name]} aria-describedby={fields[name] ? `${name}-err` : undefined} className="mt-1.5 w-full rounded-lg border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-[#758446]" {...extra} />
      {fields[name] && <p id={`${name}-err`} className="mt-1 text-xs text-red-700">{fields[name]}</p>}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-black/10 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-3xl font-medium tracking-[-0.05em]">{mode === "login" ? "Welcome back" : "Create your account"}<span className="text-[#87964f]">.</span></h1>
        <p className="mt-2 text-sm text-[#717168]">{mode === "login" ? "Sign in to check out and track your orders." : "An account lets you check out, track orders and save a wishlist."}</p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
          {mode === "register" && input("name", "Full name", "text", { autoComplete: "name" })}
          {input("email", "Email", "email", { autoComplete: "email" })}
          {input("password", "Password", "password", { autoComplete: mode === "login" ? "current-password" : "new-password", ...(mode === "register" ? { minLength: "8" } : {}) })}
          {mode === "register" && <><p className="-mt-2 text-xs text-[#77786f]">At least 8 characters with a letter and a number.</p>{input("phone", "Mobile number (optional)", "tel", { autoComplete: "tel" })}</>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#22231f] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#44463b] disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-[#62635b]">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); setFields({}); }} className="font-semibold underline underline-offset-4">{mode === "login" ? "Create an account" : "Sign in"}</button>
        </p>
        <p className="mt-4 text-center text-xs text-[#92938b]"><Link href="/" className="hover:underline">← Back to the store</Link></p>
      </section>
    </div>
  );
}
