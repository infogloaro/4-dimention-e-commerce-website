"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Search, Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/admin/api";
import { NAV } from "@/lib/admin/nav";
import { AuthGate, useAuth } from "./providers";
import { Spinner, cx, useToast } from "./ui";

function isActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(href + "/");
}

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { canAny } = useAuth();
  const path = usePathname();
  const groups = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => canAny(i.anyOf)) })).filter((g) => g.items.length > 0), [canAny]);
  // Longest matching href wins so /admin/inventory/movements doesn't also highlight /admin/inventory.
  const activeHref = useMemo(() => groups.flatMap((g) => g.items).filter((i) => isActive(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href, [groups, path]);
  return (
    <nav aria-label="Admin navigation" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {groups.map((g) => (
        <div key={g.label}>
          {!collapsed && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = i.href === activeHref;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    title={collapsed ? i.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cx("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400", active ? "bg-indigo-500/15 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white", collapsed && "justify-center")}
                  >
                    <i.icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{i.label}</span>}
                    {collapsed && <span className="sr-only">{i.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface Queues {
  queues: { toConfirm: number; readyToShip: number; processing: number };
  attention: { pendingPayment: number; paymentFailed: number; manualReview: number; shipmentExceptions: number; returnRequests: number; refundIssues: number; failedFulfilmentActions: number };
}

/** Live order-desk alerts: polls the uncached queues endpoint (every 20 s, only while the tab is visible). */
function NotificationsMenu() {
  const { can } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const enabled = can("order:read");
  const q = useQuery({ queryKey: ["admin", "order-queues", "bell"], enabled, refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "visible" ? 20_000 : false), queryFn: async () => (await api.get<Queues>("/admin/orders/queues")).data });
  const prevNew = useRef<number | null>(null);
  const nowNew = q.data?.queues.toConfirm;
  useEffect(() => {
    if (nowNew === undefined) return;
    if (prevNew.current !== null && nowNew > prevNew.current) toast.info(`${nowNew - prevNew.current} new order${nowNew - prevNew.current === 1 ? "" : "s"} waiting to be confirmed`);
    prevNew.current = nowNew;
  }, [nowNew, toast]);
  // Only real, database-derived counts — no synthetic notifications.
  const d = q.data;
  const items = d
    ? [
        { label: "New orders to confirm", n: d.queues.toConfirm, href: "/admin/orders?status=PLACED" },
        { label: "Packed — ready to ship", n: d.queues.readyToShip, href: "/admin/orders?status=PACKED" },
        { label: "Awaiting payment", n: d.attention.pendingPayment, href: "/admin/orders?status=PENDING_PAYMENT" },
        { label: "Payments needing manual review", n: d.attention.manualReview, href: "/admin/payments" },
        { label: "Shipment exceptions", n: d.attention.shipmentExceptions, href: "/admin/shipments" },
        { label: "Return requests", n: d.attention.returnRequests, href: "/admin/returns" },
        { label: "Refund issues", n: d.attention.refundIssues, href: "/admin/refunds" },
        { label: "Failed notifications / webhooks", n: d.attention.failedFulfilmentActions, href: "/admin/notifications" },
      ].filter((i) => i.n > 0)
    : [];
  const total = items.reduce((s, i) => s + i.n, 0);
  return (
    <div className="relative">
      <button aria-label={`Notifications${total ? `, ${total} items need attention` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
        <Bell className="size-5" />
        {total > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <p className="px-2 py-1 text-xs font-semibold text-slate-500">Needs attention</p>
          {!enabled ? <p className="px-2 py-3 text-sm text-slate-500">Order alerts require order access.</p> : items.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">All clear — nothing waiting.</p> : items.map((i) => (
            <Link key={i.label} href={i.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <span>{i.label}</span><span className="rounded-full bg-rose-50 px-2 text-xs font-semibold text-rose-700">{i.n}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const { canAny } = useAuth();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const targets = [
    { label: "orders", href: "/admin/orders", perm: ["order:read"] },
    { label: "products", href: "/admin/products", perm: ["product:read"] },
    { label: "customers", href: "/admin/customers", perm: ["customer:read"] },
  ].filter((t) => canAny(t.perm));
  const [target, setTarget] = useState(0);
  const t = targets[Math.min(target, targets.length - 1)];
  if (!t) return null;
  return (
    <form
      role="search"
      className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 pl-2.5 md:flex"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) { router.push(`${t.href}?search=${encodeURIComponent(q.trim())}`); setQ(""); } }}
    >
      <Search className="size-4 text-slate-400" aria-hidden />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" placeholder="Search… (Ctrl K)" className="h-9 w-44 bg-transparent text-sm outline-none placeholder:text-slate-400 lg:w-60" />
      <select aria-label="Search in" value={target} onChange={(e) => setTarget(Number(e.target.value))} className="h-9 rounded-r-lg border-l border-slate-200 bg-transparent pl-2 pr-1 text-xs text-slate-600 outline-none">
        {targets.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}
      </select>
    </form>
  );
}

function Crumbs() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean).slice(1);
  if (parts.length === 0) return <span className="text-sm font-medium text-slate-800">Dashboard</span>;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
      <Link href="/admin" className="hover:text-slate-900">Admin</Link>
      {parts.map((p, i) => {
        const href = "/admin/" + parts.slice(0, i + 1).join("/");
        const isId = /^[0-9a-f-]{20,}$/i.test(p) || /^new$/.test(p);
        const label = isId ? (p === "new" ? "New" : "Details") : p.replace(/-/g, " ");
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            <span aria-hidden>/</span>
            {i === parts.length - 1 ? <span aria-current="page" className="truncate font-medium capitalize text-slate-800">{label}</span> : <Link href={href} className="capitalize hover:text-slate-900">{label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  // The shell only mounts client-side (after the session check), so reading localStorage in the initializer is hydration-safe.
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("admin:collapsed") === "1"; } catch { return false; } });
  const [mobileAt, setMobileAt] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const mobile = mobileAt === path; // opening records the current path, so navigating closes the drawer
  const setMobile = (open: boolean) => setMobileAt(open ? path : null);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("admin:collapsed", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  const brand = (c: boolean) => (
    <div className={cx("flex h-14 items-center gap-2 border-b border-white/10 px-4", c && "justify-center px-0")}>
      <span className="grid size-8 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white">4D</span>
      {!c && <div className="leading-tight"><p className="text-sm font-semibold text-white">4D Commerce</p><p className="text-[10px] text-slate-400">Admin console</p></div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      {/* desktop sidebar */}
      <aside className={cx("fixed inset-y-0 left-0 z-30 hidden flex-col bg-slate-900 transition-[width] lg:flex", collapsed ? "w-16" : "w-64")}>
        {brand(collapsed)}
        <Sidebar collapsed={collapsed} />
        <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-10 items-center justify-center border-t border-white/10 text-slate-400 hover:text-white">
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </aside>
      {/* mobile drawer */}
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-slate-900">
            <div className="flex items-center justify-between pr-2">{brand(false)}<button aria-label="Close navigation" onClick={() => setMobile(false)} className="rounded p-1 text-slate-300"><X className="size-5" /></button></div>
            <Sidebar collapsed={false} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}

      <div className={cx("transition-[padding]", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
          <button aria-label="Open navigation" onClick={() => setMobile(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="size-5" /></button>
          <div className="min-w-0 flex-1"><Crumbs /></div>
          <GlobalSearch />
          <Link href="/" target="_blank" aria-label="Open storefront" title="Open storefront" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Store className="size-5" /></Link>
          <NotificationsMenu />
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account menu" className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
              <span className="grid size-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">{user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
            </button>
            {menu && (
              <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl" onMouseLeave={() => setMenu(false)}>
                <div className="border-b border-slate-100 px-2 pb-2"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p><p className="mt-1 inline-block rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{user.role}</p></div>
                <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><LogOut className="size-4" /> Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main id="admin-main" className="mx-auto max-w-[1500px] px-3 py-5 sm:px-6">
          <Suspense fallback={<Spinner />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <Shell>{children}</Shell>
    </AuthGate>
  );
}
