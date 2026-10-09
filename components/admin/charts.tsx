"use client";

import { useId, useState } from "react";
import { EmptyState } from "./ui";

export interface SeriesPoint { label: string; value: number; secondary?: number }

/** Dependency-free SVG area chart. Renders only real points; an all-zero series is shown as empty, never padded. */
export function AreaChart({ data, format, height = 200, secondaryLabel, primaryLabel = "Value" }: { data: SeriesPoint[]; format: (n: number) => string; height?: number; primaryLabel?: string; secondaryLabel?: string }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || data.every((d) => d.value === 0 && !d.secondary)) return <EmptyState title="No data in this range" hint="Charts show real recorded activity only." />;
  const W = 640, H = height, P = { l: 8, r: 8, t: 12, b: 22 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const x = (i: number) => P.l + (data.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (data.length - 1));
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const h = hover !== null ? data[hover] : null;
  const step = Math.max(1, Math.ceil(data.length / 6));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${primaryLabel} over time`} className="h-auto w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (data.length - 1))))); }}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" strokeDasharray="3 4" />)}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => i % step === 0 && <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{d.label.slice(5)}</text>)}
        {h && hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="#94a3b8" /><circle cx={x(hover)} cy={y(h.value)} r="4" fill="#4f46e5" stroke="#fff" strokeWidth="2" /></>}
      </svg>
      {h && <div className="pointer-events-none absolute right-2 top-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow"><p className="font-medium text-slate-900">{h.label}</p><p className="text-slate-600">{primaryLabel}: {format(h.value)}</p>{secondaryLabel && h.secondary !== undefined && <p className="text-slate-600">{secondaryLabel}: {h.secondary}</p>}</div>}
    </div>
  );
}

/** Horizontal bar list (revenue by category, orders by status, ...). */
export function BarList({ items, format }: { items: { label: string; value: number; hint?: string }[]; format: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <EmptyState title="No data in this range" />;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs"><span className="truncate font-medium text-slate-700">{i.label}</span><span className="shrink-0 tabular-nums text-slate-600">{format(i.value)}{i.hint && <span className="ml-1.5 text-slate-400">{i.hint}</span>}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
