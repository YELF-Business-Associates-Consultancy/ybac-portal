"use client";
import { useRef, useState } from "react";

type P = { month_end: string; contributed: number; balance: number };
const f = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Chart({ data, label }: { data: P[]; label: string }) {
  const [i, setI] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (data.length < 2) return null;
  const W = 720, H = 260, L = 64, R = 96, T = 16, B = 30;
  const max0 = Math.max(...data.map((p) => Math.max(p.balance, p.contributed))) * 1.05 || 1;
  const pw = Math.pow(10, Math.floor(Math.log10(max0))), nn = max0 / pw;
  const mx = (nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 2.5 ? 2.5 : nn <= 5 ? 5 : 10) * pw;
  const x = (k: number) => L + ((W - L - R) * k) / (data.length - 1), y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const path = (key: "balance" | "contributed") => data.map((p, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const fk = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 2 : 0) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "k" : String(v));
  const last = data[data.length - 1];
  const move = (e: React.PointerEvent) => {
    const bb = ref.current!.getBoundingClientRect(); const vx = ((e.clientX - bb.left) * W) / bb.width;
    setI(Math.max(0, Math.min(data.length - 1, Math.round((vx - L) / ((W - L - R) / (data.length - 1))))));
  };
  const p = i == null ? null : data[i];
  return (
    <figure className="chart">
      <figcaption className="legend"><span style={{ ["--c" as string]: "var(--s1)" }}>Balance</span><span style={{ ["--c" as string]: "var(--s2)" }}>Money contributed (less withdrawals)</span><span className="muted">{label} · month-end, GHS</span></figcaption>
      <div className="chartbox">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: balance and money contributed by month`} onPointerMove={move} onPointerLeave={() => setI(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((q) => (<g key={q}><line x1={L} x2={W - R} y1={y(q * mx)} y2={y(q * mx)} className="grid" /><text x={L - 8} y={y(q * mx) + 4} textAnchor="end" className="ax">{fk(q * mx)}</text></g>))}
          {data.map((d, k) => (d.month_end.slice(5, 7) === "01" || k === 0) && <text key={k} x={x(k)} y={H - 8} textAnchor="middle" className="ax">{k === 0 ? "Aug " + d.month_end.slice(0, 4) : d.month_end.slice(0, 4)}</text>)}
          <path d={path("contributed")} className="ln" style={{ stroke: "var(--s2)" }} />
          <path d={path("balance")} className="ln" style={{ stroke: "var(--s1)" }} />
          <circle cx={x(data.length - 1)} cy={y(last.balance)} r={4} className="dot" style={{ fill: "var(--s1)" }} />
          <circle cx={x(data.length - 1)} cy={y(last.contributed)} r={4} className="dot" style={{ fill: "var(--s2)" }} />
          <text x={x(data.length - 1) + 8} y={y(last.balance) + 4} className="lab">Balance</text>
          <text x={x(data.length - 1) + 8} y={y(last.contributed) + (Math.abs(y(last.contributed) - y(last.balance)) < 14 ? 14 : 4)} className="lab">Contributed</text>
          {i != null && <line className="xh" x1={x(i)} x2={x(i)} y1={T} y2={H - B} />}
          <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" />
        </svg>
        {p && (
          <div className="tip" style={{ left: `min(calc(100% - 170px), ${(x(i!) / W) * 100}%)` }}>
            <b>{new Date(p.month_end + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</b>
            <span><i style={{ background: "var(--s1)" }} />Balance {f(p.balance)}</span>
            <span><i style={{ background: "var(--s2)" }} />Contributed {f(p.contributed)}</span>
            <span className="muted">Earned so far {f(p.balance - p.contributed)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
