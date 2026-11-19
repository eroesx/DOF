import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { DofForm } from "../types";
import { isFieldInspectorDof } from "../lib/fieldClassification";

interface DofPerformancePanelProps {
  dofs: DofForm[];
  onNavigateToDofs?: (statusFilter: string, deptFilter?: string) => void;
}

type PeriodFilter = "3m" | "6m" | "all";
type TypeFilter = "all" | "düzeltici" | "önleyici" | "saha_tespiti";
type ChartMode = "monthly_bar" | "trend_area" | "dept_bar";

const MONTHS_TR = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

function parseDateSafe(input: any): Date | null {
  if (!input) return null;
  if (typeof input?.toDate === "function") {
    try {
      const d = input.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof input?.seconds === "number") {
    const d = new Date(input.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(input);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function classifyDofStatus(status?: string): "completed" | "open" | "rejected" {
  const st = (status || "").toLowerCase().trim();
  if (
    st === "cozuldu" ||
    st === "çözüldü" ||
    st === "tamamlandi" ||
    st === "tamamlandı" ||
    st === "kapali"
  ) {
    return "completed";
  }
  if (st === "reddedildi" || st === "iptal") {
    return "rejected";
  }
  return "open";
}

export const DofPerformancePanel: React.FC<DofPerformancePanelProps> = ({
  dofs,
  onNavigateToDofs,
}) => {
  const [period, setPeriod] = useState<PeriodFilter>("6m");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [chartMode, setChartMode] = useState<ChartMode>("monthly_bar");
  const [hoveredSlice, setHoveredSlice] = useState<"completed" | "open" | "rejected" | null>(null);

  const filteredDofs = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (period === "3m") {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (period === "6m") {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    return dofs.filter((d) => {
      if (typeFilter === "saha_tespiti") {
        if (!isFieldInspectorDof(d)) return false;
      } else if (typeFilter !== "all") {
        if (d.type !== typeFilter) return false;
      }

      if (cutoff) {
        const dt = parseDateSafe(d.createdAt);
        if (dt && dt < cutoff) return false;
      }
      return true;
    });
  }, [dofs, period, typeFilter]);

  const metrics = useMemo(() => {
    const now = new Date();
    let completed = 0;
    let open = 0;
    let newCount = 0;
    let reviewCount = 0;
    let rejected = 0;
    let overdueOpen = 0;
    let totalClosureDays = 0;
    let closedWithDuration = 0;

    filteredDofs.forEach((d) => {
      const cls = classifyDofStatus(d.status);
      const rawSt = (d.status || "").toLowerCase().trim();
      if (cls === "completed") {
        completed++;
        const start = parseDateSafe(d.createdAt);
        const end = parseDateSafe(d.closedAt || d.updatedAt);
        if (start && end && end >= start) {
          const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
          totalClosureDays += days;
          closedWithDuration++;
        }
      } else if (cls === "rejected") {
        rejected++;
      } else {
        open++;
        if (rawSt === "yeni") newCount++;
        else reviewCount++;

        const target = parseDateSafe(d.targetCompletionDate);
        if (target && target < now) {
          overdueOpen++;
        }
      }
    });

    const total = filteredDofs.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const openRate = total > 0 ? Math.round((open / total) * 100) : 0;
    const avgClosureDays =
      closedWithDuration > 0 ? (totalClosureDays / closedWithDuration).toFixed(1) : "-";

    return {
      total,
      completed,
      open,
      newCount,
      reviewCount,
      rejected,
      overdueOpen,
      completionRate,
      openRate,
      avgClosureDays,
    };
  }, [filteredDofs]);

  // Monthly series for Recharts (BarChart & AreaChart)
  const monthlySeries = useMemo(() => {
    const now = new Date();
    const monthSpan = period === "3m" ? 3 : period === "6m" ? 6 : 12;
    const buckets: Record<
      string,
      { label: string; sortKey: string; Tamamlanan: number; Açık: number; Toplam: number }
    > = {};

    for (let i = monthSpan - 1; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const sortKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS_TR[dt.getMonth()]} ${String(dt.getFullYear()).slice(-2)}`;
      buckets[sortKey] = { label, sortKey, Tamamlanan: 0, Açık: 0, Toplam: 0 };
    }

    filteredDofs.forEach((d) => {
      const dt = parseDateSafe(d.createdAt);
      if (!dt) return;
      const sortKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS_TR[dt.getMonth()]} ${String(dt.getFullYear()).slice(-2)}`;
      if (!buckets[sortKey]) {
        if (period !== "all") return;
        buckets[sortKey] = { label, sortKey, Tamamlanan: 0, Açık: 0, Toplam: 0 };
      }
      const cls = classifyDofStatus(d.status);
      if (cls === "completed") {
        buckets[sortKey].Tamamlanan++;
      } else if (cls === "open") {
        buckets[sortKey].Açık++;
      }
      buckets[sortKey].Toplam++;
    });

    const sorted = Object.values(buckets).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    let runningCompleted = 0;
    let runningOpen = 0;

    return sorted.map((item) => {
      runningCompleted += item.Tamamlanan;
      runningOpen += item.Açık;
      const rate =
        item.Tamamlanan + item.Açık > 0
          ? Math.round((item.Tamamlanan / (item.Tamamlanan + item.Açık)) * 100)
          : 0;
      return {
        ...item,
        "Kümülatif Tamamlanan": runningCompleted,
        "Kümülatif Açık": runningOpen,
        "Başarı %": rate,
      };
    });
  }, [filteredDofs, period]);

  // Department breakdown for both Recharts horizontal bar & D3 scaled table
  const departmentStats = useMemo(() => {
    const map = new Map<
      string,
      { department: string; completed: number; open: number; rejected: number; total: number }
    >();

    filteredDofs.forEach((d) => {
      const dept = (d.department || "Belirtilmemiş").trim();
      const entry = map.get(dept) || {
        department: dept,
        completed: 0,
        open: 0,
        rejected: 0,
        total: 0,
      };
      const cls = classifyDofStatus(d.status);
      if (cls === "completed") entry.completed++;
      else if (cls === "open") entry.open++;
      else entry.rejected++;
      entry.total++;
      map.set(dept, entry);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        Tamamlanan: item.completed,
        Açık: item.open,
        rate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredDofs]);

  // D3 linear scale for horizontal comparison bars inside department performance table
  const maxDeptTotal = useMemo(() => {
    return d3.max<(typeof departmentStats)[number], number>(departmentStats, (d) => d.total) || 1;
  }, [departmentStats]);

  const deptWidthScale = useMemo(() => {
    return d3.scaleLinear().domain([0, maxDeptTotal]).range([0, 100]).clamp(true);
  }, [maxDeptTotal]);

  // D3 pie & arc computation for the SVG Donut chart
  const d3DonutSlices = useMemo(() => {
    const rawData: Array<{
      key: "completed" | "open" | "rejected";
      label: string;
      value: number;
      color: string;
      statusFilter: string;
    }> = [
      {
        key: "completed",
        label: "Tamamlanan",
        value: metrics.completed,
        color: "#10b981",
        statusFilter: "cozuldu",
      },
      {
        key: "open",
        label: "Açık / İşlemde",
        value: metrics.open,
        color: "#f59e0b",
        statusFilter: "acik",
      },
    ];

    if (metrics.rejected > 0) {
      rawData.push({
        key: "rejected",
        label: "Reddedilen / İptal",
        value: metrics.rejected,
        color: "#e11d48",
        statusFilter: "reddedildi",
      });
    }

    const nonZero = rawData.filter((d) => d.value > 0);
    const pieGen = d3
      .pie<(typeof rawData)[number]>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.03);

    const arcGen = d3
      .arc<d3.PieArcDatum<(typeof rawData)[number]>>()
      .innerRadius(62)
      .outerRadius(88)
      .cornerRadius(4);

    const activeArcGen = d3
      .arc<d3.PieArcDatum<(typeof rawData)[number]>>()
      .innerRadius(60)
      .outerRadius(94)
      .cornerRadius(4);

    const arcs = pieGen(nonZero);
    return {
      legend: rawData,
      arcs: arcs.map((a) => ({
        ...a.data,
        path: arcGen(a) || "",
        activePath: activeArcGen(a) || "",
        percent: metrics.total > 0 ? Math.round((a.data.value / metrics.total) * 100) : 0,
      })),
    };
  }, [metrics]);

  const activeDonutFocus = useMemo(() => {
    if (!hoveredSlice) {
      return {
        title: "Tamamlanma",
        value: `%${metrics.completionRate}`,
        sub: `${metrics.completed} / ${metrics.total} DÖF`,
      };
    }
    const found = d3DonutSlices.arcs.find((a) => a.key === hoveredSlice);
    if (!found) {
      return {
        title: "Tamamlanma",
        value: `%${metrics.completionRate}`,
        sub: `${metrics.completed} / ${metrics.total} DÖF`,
      };
    }
    return {
      title: found.label,
      value: `${found.value}`,
      sub: `%${found.percent} pay`,
    };
  }, [hoveredSlice, d3DonutSlices.arcs, metrics]);

  const resetFilters = () => {
    setPeriod("all");
    setTypeFilter("all");
  };

  return (
    <section
      id="admin-performance-panel"
      className="space-y-6"
      aria-label="DÖF Performans Paneli"
    >
      {/* Header + Segmented Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-5 w-5 text-indigo-600 shrink-0" />
              <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">
                Performans Paneli
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Tamamlanan ve açık olan DÖF sayılarının dönem, faaliyet türü ve birim bazlı dağılımı
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Period Filter */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              {(
                [
                  { id: "3m", label: "Son 3 Ay" },
                  { id: "6m", label: "Son 6 Ay" },
                  { id: "all", label: "Tümü" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPeriod(item.id)}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                    period === item.id
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Type Filter */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto max-w-full">
              {(
                [
                  { id: "all", label: "Tüm Türler" },
                  { id: "düzeltici", label: "Düzeltici" },
                  { id: "önleyici", label: "Önleyici" },
                  { id: "saha_tespiti", label: "Saha Tespiti" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTypeFilter(item.id)}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                    typeFilter === item.id
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredDofs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <BarChart3 className="h-8 w-8 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800">
              Seçili filtreler için görüntülenecek DÖF kaydı bulunamadı
            </p>
            <p className="text-xs text-slate-500">
              Dönem aralığını genişleterek veya faaliyet türü filtresini temizleyerek tüm verileri inceleyebilirsiniz.
            </p>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Filtreleri Sıfırla</span>
          </button>
        </div>
      ) : (
        <>
          {/* 4-Column Tabular KPI Strip (Single surface with hairline dividers) */}
          <div className="bg-white border border-slate-200 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigateToDofs && onNavigateToDofs("all")}
              className="p-5 text-left hover:bg-slate-50/70 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  Toplam DÖF
                </span>
                {onNavigateToDofs && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-600 transition" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-display font-bold text-slate-900 tabular-nums">
                  {metrics.total}
                </span>
                <span className="text-xs text-slate-500">kayıt</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {departmentStats.length} farklı birimde takip ediliyor
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToDofs && onNavigateToDofs("cozuldu")}
              className="p-5 text-left hover:bg-emerald-50/40 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Tamamlanan DÖF
                </span>
                {onNavigateToDofs && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300 group-hover:text-emerald-700 transition" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-3xl font-display font-bold text-emerald-700 tabular-nums">
                  {metrics.completed}
                </span>
                <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                  %{metrics.completionRate}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Çözüldü · Kapatılan faaliyetler
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToDofs && onNavigateToDofs("acik")}
              className="p-5 text-left hover:bg-amber-50/40 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  Açık DÖF
                </span>
                {onNavigateToDofs && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-amber-300 group-hover:text-amber-700 transition" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-3xl font-display font-bold text-amber-700 tabular-nums">
                  {metrics.open}
                </span>
                <span className="text-xs font-mono font-semibold text-amber-700 tabular-nums">
                  %{metrics.openRate}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                {metrics.newCount} yeni · {metrics.reviewCount} işlemde
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToDofs && onNavigateToDofs("acik")}
              className="p-5 text-left hover:bg-rose-50/30 transition cursor-pointer group"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle
                    className={`h-3.5 w-3.5 ${
                      metrics.overdueOpen > 0 ? "text-rose-600" : "text-slate-400"
                    }`}
                  />
                  Termini Geçen Açık
                </span>
                {onNavigateToDofs && (
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-600 transition" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span
                  className={`text-3xl font-display font-bold tabular-nums ${
                    metrics.overdueOpen > 0 ? "text-rose-600" : "text-slate-900"
                  }`}
                >
                  {metrics.overdueOpen}
                </span>
                <span className="text-xs text-slate-500">geciken</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                Ort. kapanış süresi: {metrics.avgClosureDays === "-" ? "-" : `${metrics.avgClosureDays} gün`}
              </p>
            </button>
          </div>

          {/* Main 12-Col Analytics Split: 8 Cols Recharts + 4 Cols D3 Donut */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* Left 8 Cols: Recharts Bar / Area / Department Comparison */}
            <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tamamlanan ve Açık DÖF Karşılaştırması
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {chartMode === "monthly_bar"
                      ? "Aylara göre tamamlanan ve açık DÖF adetleri"
                      : chartMode === "trend_area"
                      ? "Kümülatif tamamlanma ve açık DÖF gelişim eğrisi"
                      : "Birim bazında tamamlanan ve açık DÖF yoğunluğu (ilk 10 birim)"}
                  </p>
                </div>

                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                  {(
                    [
                      { id: "monthly_bar", label: "Aylık Çubuk" },
                      { id: "trend_area", label: "Trend Alan" },
                      { id: "dept_bar", label: "Birim Bazlı" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setChartMode(tab.id)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                        chartMode === tab.id
                          ? "bg-white text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[320px] w-full pt-5 flex-1">
                {chartMode === "monthly_bar" && (
                  <SafeResponsiveContainer>
                    <BarChart
                      data={monthlySeries}
                      margin={{ top: 10, right: 12, left: -16, bottom: 4 }}
                      barGap={6}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#e2e8f0" }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(241, 245, 249, 0.7)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload;
                          return (
                            <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-lg text-xs space-y-1">
                              <p className="font-bold text-slate-200">{label}</p>
                              <div className="flex items-center justify-between gap-5">
                                <span className="text-emerald-300">Tamamlanan:</span>
                                <span className="font-mono font-bold tabular-nums">{row.Tamamlanan}</span>
                              </div>
                              <div className="flex items-center justify-between gap-5">
                                <span className="text-amber-300">Açık:</span>
                                <span className="font-mono font-bold tabular-nums">{row.Açık}</span>
                              </div>
                              <div className="flex items-center justify-between gap-5 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                                <span>Başarı oranı:</span>
                                <span className="font-mono font-semibold text-white tabular-nums">
                                  %{row["Başarı %"]}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} iconType="circle" />
                      <Bar
                        dataKey="Tamamlanan"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                      />
                      <Bar
                        dataKey="Açık"
                        fill="#f59e0b"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </SafeResponsiveContainer>
                )}

                {chartMode === "trend_area" && (
                  <SafeResponsiveContainer>
                    <AreaChart
                      data={monthlySeries}
                      margin={{ top: 10, right: 12, left: -16, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="perfCompletedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="perfOpenFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#e2e8f0" }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: "12px",
                          color: "#f8fafc",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} iconType="circle" />
                      <Area
                        type="monotone"
                        dataKey="Kümülatif Tamamlanan"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fill="url(#perfCompletedFill)"
                      />
                      <Area
                        type="monotone"
                        dataKey="Kümülatif Açık"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fill="url(#perfOpenFill)"
                      />
                    </AreaChart>
                  </SafeResponsiveContainer>
                )}

                {chartMode === "dept_bar" && (
                  <SafeResponsiveContainer>
                    <BarChart
                      data={departmentStats.slice(0, 10)}
                      layout="vertical"
                      margin={{ top: 6, right: 16, left: 10, bottom: 4 }}
                      barGap={4}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        axisLine={{ stroke: "#e2e8f0" }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="department"
                        width={120}
                        tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(241, 245, 249, 0.7)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload;
                          return (
                            <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-700 shadow-lg text-xs space-y-1">
                              <p className="font-bold text-slate-200">{row.department}</p>
                              <div className="flex items-center justify-between gap-5">
                                <span className="text-emerald-300">Tamamlanan:</span>
                                <span className="font-mono font-bold tabular-nums">{row.Tamamlanan}</span>
                              </div>
                              <div className="flex items-center justify-between gap-5">
                                <span className="text-amber-300">Açık:</span>
                                <span className="font-mono font-bold tabular-nums">{row.Açık}</span>
                              </div>
                              <div className="flex items-center justify-between gap-5 pt-1 border-t border-slate-800 text-[11px] text-slate-400">
                                <span>Tamamlanma:</span>
                                <span className="font-mono font-semibold text-white tabular-nums">
                                  %{row.rate}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} iconType="circle" />
                      <Bar dataKey="Tamamlanan" fill="#10b981" radius={[0, 5, 5, 0]} maxBarSize={16} />
                      <Bar dataKey="Açık" fill="#f59e0b" radius={[0, 5, 5, 0]} maxBarSize={16} />
                    </BarChart>
                  </SafeResponsiveContainer>
                )}
              </div>
            </div>

            {/* Right 4 Cols: D3 Donut Visualization */}
            <div className="xl:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
              <div className="pb-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Tamamlanan / Açık Oranı
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dilime dokunarak veya tıklayarak filtreleyin
                </p>
              </div>

              <div className="py-4 flex items-center justify-center">
                <svg
                  viewBox="0 0 210 210"
                  className="w-52 h-52 overflow-visible"
                  role="img"
                  aria-label="Tamamlanan ve açık DÖF oranları halka grafiği"
                >
                  <g transform="translate(105, 105)">
                    {/* Background Track */}
                    <circle r={75} fill="none" stroke="#f1f5f9" strokeWidth={24} />

                    {d3DonutSlices.arcs.map((slice) => {
                      const isActive = hoveredSlice === slice.key;
                      return (
                        <path
                          key={slice.key}
                          d={isActive ? slice.activePath : slice.path}
                          fill={slice.color}
                          className="transition-all duration-150 cursor-pointer"
                          onMouseEnter={() => setHoveredSlice(slice.key)}
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() =>
                            onNavigateToDofs && onNavigateToDofs(slice.statusFilter)
                          }
                        />
                      );
                    })}

                    {/* Centered Tabular Value */}
                    <text
                      textAnchor="middle"
                      y={-12}
                      className="fill-slate-500 text-[11px] font-semibold"
                    >
                      {activeDonutFocus.title}
                    </text>
                    <text
                      textAnchor="middle"
                      y={14}
                      className="fill-slate-900 text-2xl font-bold font-display"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {activeDonutFocus.value}
                    </text>
                    <text
                      textAnchor="middle"
                      y={32}
                      className="fill-slate-400 text-[11px]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {activeDonutFocus.sub}
                    </text>
                  </g>
                </svg>
              </div>

              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {d3DonutSlices.legend.map((item) => {
                  const pct = metrics.total > 0 ? Math.round((item.value / metrics.total) * 100) : 0;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onMouseEnter={() => setHoveredSlice(item.key)}
                      onMouseLeave={() => setHoveredSlice(null)}
                      onClick={() =>
                        onNavigateToDofs && onNavigateToDofs(item.statusFilter)
                      }
                      className="w-full py-2.5 px-1 flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2 font-semibold text-slate-700">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.label}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 font-bold">
                        {item.value}{" "}
                        <span className="text-slate-400 font-normal">(%{pct})</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Department Completion Table with D3 Scaled Proportional Bars */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Birim Performans Özeti
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Her birim için tamamlanan ve açık DÖF dengesi (satıra tıklayarak listeye gidebilirsiniz)
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                  Tamamlanan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                  Açık
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 px-5">Birim</th>
                    <th className="py-2.5 px-4 text-right">Toplam</th>
                    <th className="py-2.5 px-4 text-right">Tamamlanan</th>
                    <th className="py-2.5 px-4 text-right">Açık</th>
                    <th className="py-2.5 px-4 text-right">Kapanış %</th>
                    <th className="py-2.5 px-5 w-52">Dağılım</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentStats.map((row) => {
                    const completedW = deptWidthScale(row.completed);
                    const openW = deptWidthScale(row.open);
                    return (
                      <tr
                        key={row.department}
                        onClick={() =>
                          onNavigateToDofs && onNavigateToDofs("all", row.department)
                        }
                        className="hover:bg-slate-50 transition cursor-pointer"
                      >
                        <td className="py-2.5 px-5 font-semibold text-slate-800 whitespace-nowrap">
                          {row.department}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {row.total}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {row.completed}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-amber-700">
                          {row.open}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-700">
                          %{row.rate}
                        </td>
                        <td className="py-2.5 px-5">
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                            {completedW > 0 && (
                              <div
                                style={{ width: `${completedW}%` }}
                                className="h-full bg-emerald-500"
                                title={`Tamamlanan: ${row.completed}`}
                              />
                            )}
                            {openW > 0 && (
                              <div
                                style={{ width: `${openW}%` }}
                                className="h-full bg-amber-500"
                                title={`Açık: ${row.open}`}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default DofPerformancePanel;
