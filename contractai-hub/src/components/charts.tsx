/**
 * Dashboard charts. Color rule is enforced here: green = positive,
 * red = risk/negative, slate = neutral.
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ClauseItem } from "@/services/types";

const POSITIVE = "oklch(0.765 0.177 163.223)";
const RISK = "oklch(0.704 0.191 22.216)";
const NEUTRAL = "oklch(0.704 0.04 256.788)";

const tooltipStyle = {
  backgroundColor: "oklch(0.25 0.026 262)",
  border: "1px solid oklch(1 0 0 / 12%)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "oklch(0.94 0.008 250)",
} as const;

export function ImpactPie({ clauses }: { clauses: ClauseItem[] }) {
  const data = useMemo(() => {
    const counts = { positive: 0, negative: 0, neutral: 0 };
    for (const c of clauses) counts[c.impact] += 1;
    return [
      { name: "Positive", value: counts.positive, color: POSITIVE },
      { name: "Risk", value: counts.negative, color: RISK },
      { name: "Neutral", value: counts.neutral, color: NEUTRAL },
    ].filter((d) => d.value > 0);
  }, [clauses]);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No clauses extracted.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v: string) => (
            <span style={{ color: "oklch(0.704 0.04 256.788)", fontSize: 12 }}>{v}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ clauses }: { clauses: ClauseItem[] }) {
  const data = useMemo(() => {
    const byCategory = new Map<string, { positive: number; negative: number }>();
    for (const c of clauses) {
      const entry = byCategory.get(c.category) ?? { positive: 0, negative: 0 };
      if (c.impact === "positive") entry.positive += 1;
      if (c.impact === "negative") entry.negative += 1;
      byCategory.set(c.category, entry);
    }
    return [...byCategory.entries()]
      .map(([category, v]) => ({ category, Positive: v.positive, Risk: v.negative }))
      .sort((a, b) => b.Positive + b.Risk - (a.Positive + a.Risk))
      .slice(0, 8);
  }, [clauses]);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No clause categories to chart.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <XAxis
          dataKey="category"
          tick={{ fill: "oklch(0.704 0.04 256.788)", fontSize: 11 }}
          axisLine={{ stroke: "oklch(1 0 0 / 10%)" }}
          tickLine={false}
          interval={0}
          angle={-18}
          textAnchor="end"
          height={52}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "oklch(0.704 0.04 256.788)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "oklch(1 0 0 / 4%)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v: string) => (
            <span style={{ color: "oklch(0.704 0.04 256.788)", fontSize: 12 }}>{v}</span>
          )}
        />
        <Bar dataKey="Positive" fill={POSITIVE} radius={[5, 5, 0, 0]} maxBarSize={26} />
        <Bar dataKey="Risk" fill={RISK} radius={[5, 5, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiskGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = clamped <= 33 ? POSITIVE : clamped <= 66 ? NEUTRAL : RISK;
  const label = clamped <= 33 ? "Low risk" : clamped <= 66 ? "Moderate risk" : "High risk";

  const r = 54;
  const circumference = 2 * Math.PI * r;
  const filled = (clamped / 100) * circumference;

  return (
    <div className="flex items-center gap-5">
      <svg
        width="132"
        height="132"
        viewBox="0 0 132 132"
        role="img"
        aria-label={`Risk score ${clamped} out of 100`}
      >
        <circle cx="66" cy="66" r={r} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="10" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform="rotate(-90 66 66)"
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s ease" }}
        />
        <text
          x="66"
          y="62"
          textAnchor="middle"
          fill="oklch(0.94 0.008 250)"
          fontSize="26"
          fontWeight="700"
          fontFamily="Sora, sans-serif"
        >
          {clamped}
        </text>
        <text x="66" y="82" textAnchor="middle" fill="oklch(0.704 0.04 256.788)" fontSize="11">
          / 100
        </text>
      </svg>
      <div>
        <p className="font-display text-lg font-semibold" style={{ color }}>
          {label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Weighted across liability, termination, payment, IP and ambiguity signals found in the
          document.
        </p>
      </div>
    </div>
  );
}
