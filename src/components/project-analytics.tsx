"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  BarChart3,
  MessageSquare,
  Clock,
  DollarSign,
  Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface AnalyticsData {
  totalQueries: number;
  queriesToday: number;
  avgResponseMs: number;
  estimatedCost: number;
  dailyData: { date: string; queries: number }[];
}

interface ProjectAnalyticsProps {
  projectId: string;
}

// ─── Component ──────────────────────────────────────────

export function ProjectAnalytics({ projectId }: ProjectAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/analytics`);
        if (!res.ok) throw new Error("Failed to load analytics");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <BarChart3 className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            {error || "No analytics data available."}
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      label: "Total Queries",
      value: data.totalQueries.toLocaleString(),
      icon: MessageSquare,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Queries Today",
      value: data.queriesToday.toLocaleString(),
      icon: BarChart3,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Avg Response Time",
      value: data.avgResponseMs > 0 ? `${(data.avgResponseMs / 1000).toFixed(1)}s` : "—",
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Estimated Cost",
      value: `$${data.estimatedCost.toFixed(4)}`,
      icon: DollarSign,
      color: "text-emerald-600 bg-emerald-50",
    },
  ];

  // Format chart dates to short labels
  const chartData = data.dailyData.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="space-y-6 overflow-y-auto p-4">
      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}
              >
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Chart ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Queries per Day
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">Last 30 days</p>

        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="queries"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#7c3aed" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
