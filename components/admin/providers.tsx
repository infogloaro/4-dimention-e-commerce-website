"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, UNAUTH_EVENT, api } from "@/lib/admin/api";
import { ErrorState, Spinner, ToastProvider } from "./ui";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isStaff: boolean;
  permissions: string[];
}

interface AuthCtx {
  user: AdminUser;
  can: (permission: string) => boolean;
  canAny: (permissions?: string[]) => boolean;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthGate>");
  return v;
}

export function AdminProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** Resolves the session via /auth/me. Non-staff and signed-out users are sent to the admin login. UI only — the API re-checks everything. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["admin", "me"],
    queryFn: async () => (await api.get<{ user: AdminUser }>("/auth/me")).data.user,
    staleTime: 60_000,
  });
  const user = me.data;
  const unauth = me.error instanceof ApiError && me.error.status === 401;
  const notStaff = !!user && !user.isStaff;

  useEffect(() => {
    const onUnauth = () => qc.invalidateQueries({ queryKey: ["admin", "me"] });
    window.addEventListener(UNAUTH_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTH_EVENT, onUnauth);
  }, [qc]);

  useEffect(() => {
    if (unauth || notStaff) router.replace(`/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [unauth, notStaff, router]);

  const value = useMemo<AuthCtx | null>(() => {
    if (!user || !user.isStaff) return null;
    const set = new Set(user.permissions);
    return {
      user,
      can: (p) => set.has(p),
      canAny: (ps) => !ps || ps.length === 0 || ps.some((p) => set.has(p)),
      logout: async () => {
        try { await api.post("/auth/logout"); } finally { qc.clear(); router.replace("/admin/login"); }
      },
    };
  }, [user, qc, router]);

  if (me.isLoading || unauth || notStaff) return <div className="grid min-h-screen place-items-center bg-slate-50"><Spinner label="Checking your session" /></div>;
  if (me.error || !value) return <div className="grid min-h-screen place-items-center bg-slate-50"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Shows a permission-denied state instead of children when the user lacks every listed permission. */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { canAny } = useAuth();
  if (!canAny(anyOf)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">Access restricted</p>
        <p className="mt-1 text-sm text-slate-500">Your role doesn’t include the permission required for this area ({anyOf.join(" or ")}). Ask a super admin if you need access.</p>
      </div>
    );
  }
  return <>{children}</>;
}
