export const fmt = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const ghs = (n: number | string | null | undefined) => "GHS " + fmt(n);
export const pct = (x: number | string | null | undefined, d = 2) => (x == null ? "—" : Number(x).toFixed(d) + "%");
export const dstr = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const today = () => new Date().toISOString().slice(0, 10);

export const TYPE: Record<string, string> = {
  dues: "Monthly dues", bra: "BRA Contribution", other: "Additional investment", signon: "Sign-on fee",
  tbill: "T-bill interest", bankint: "Bank interest", profit: "Venture profit", loss: "Venture loss", withdrawal: "Withdrawal",
};
export const chipFor = (t: string) =>
  ["dues", "bra", "other"].includes(t) ? "ok" : t === "tbill" || t === "profit" ? "gold" : t === "bankint" ? "info" : t === "signon" ? "neutral" : "warn";

export function words(n: number) {
  const a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const t = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const h = (x: number): string => x < 20 ? a[x] : x < 100 ? t[Math.floor(x / 10)] + (x % 10 ? "-" + a[x % 10] : "") : a[Math.floor(x / 100)] + " hundred" + (x % 100 ? " and " + h(x % 100) : "");
  const w = (x: number) => { if (x === 0) return "zero"; const out: string[] = [];
    for (const [u, nm] of [[1e6, "million"], [1e3, "thousand"]] as [number, string][]) { if (x >= u) { out.push(h(Math.floor(x / u)) + " " + nm); x %= u; } }
    if (x) out.push((out.length && x < 100 ? "and " : "") + h(x)); return out.join(" "); };
  const c = Math.floor(n), p = Math.round((n - c) * 100);
  let s = w(c) + " Ghana cedi" + (c === 1 ? "" : "s"); if (p) s += ", " + w(p) + " pesewa" + (p === 1 ? "" : "s");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
