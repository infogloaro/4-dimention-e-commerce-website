"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ApiError, api, errorMessage } from "@/lib/admin/api";
import { Btn, Field, Input } from "@/components/admin/ui";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only same-site admin paths are honoured (prevents open redirects).
  const nextParam = sp.get("next");
  const next = nextParam && /^\/admin(\/|$|\?)/.test(nextParam) && !nextParam.startsWith("//") ? nextParam : "/admin";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ user: { isStaff: boolean } }>("/auth/login", { email, password });
      if (!data.user.isStaff) {
        await api.post("/auth/logout").catch(() => {});
        setError("This account does not have staff access.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "me"] });
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 423 ? `Account temporarily locked. Try again in ${err.details?.retryAfterMinutes ?? "a few"} minutes.` : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-base font-bold text-white">4D</span>
        <div><h1 className="text-lg font-semibold text-slate-900">Admin sign in</h1><p className="text-xs text-slate-500">4D Commerce operations console</p></div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Field label="Email" required>{(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password" required>{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
      <Btn type="submit" variant="primary" loading={busy} className="w-full">Sign in</Btn>
      <p className="text-center text-xs text-slate-400">Staff accounts only. All actions are audited.</p>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
