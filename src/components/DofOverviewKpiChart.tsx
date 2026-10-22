import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  FolderKanban,
  Layers,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Target,
} from "lucide-react";
import { DofForm } from "../types";

interface DofOverviewKpiChartProps {
  dofs?: DofForm[];
  totalCount?: number;
  resolvedCount?: number;
  openCount?: number;
  newCount?: number;
  reviewCount?: number;
  rejectedCount?: number;
  correctiveCount?: number;
  preventiveCount?: number;
  onFilterClick?: (status: string, type?: string) => void;
}

export const DofOverviewKpiChart: React.FC<DofOverviewKpiChartProps> = ({
  dofs = [],
  totalCount: propTotal,
  resolvedCount: propResolved,
  openCount: propOpen,
  newCount: propNew,
  reviewCount: propReview,
  rejectedCount: propRejected,
  correctiveCount: propCorrective,
  preventiveCount: propPreventive,
  onFilterClick,
}) => {
  const [activeViewMode, setActiveViewMode] = useState<"volume" | "type_comparison" | "trend">("volume");

  // Derive counts accurately
  const total = propTotal ?? dofs.length;

  const resolved =
    propResolved ??
    dofs.filter((d) => {
      const s = (d.status || "").toLowerCase().trim();
      return s === "cozuldu" || s === "çözüldü" || s === "tamamlandi" || s === "kapali";
    }).length;

  const pending =
    propOpen ??
    dofs.filter((d) => {
      const s = (d.status || "").toLowerCase().trim();
      return s === "yeni" || s === "inceleniyor" || s === "beklemede" || s === "islemde";
    }).length;

  const rejected =
    propRejected ??
    dofs.filter((d) => {
      const s = (d.status || "").toLowerCase().trim();
      return s === "reddedildi" || s === "iptal";
    }).length;

  const corrective =
    propCorrective ?? dofs.filter((d) => d.type === "düzeltici").length;
  const preventive =
    propPreventive ?? dofs.filter((d) => d.type === "önleyici").length;

  // Rate calculations
  const completionRateNum = total > 0 ? (resolved / total) * 100 : 0;
  const pendingRateNum = total > 0 ? (pending / total) * 100 : 0;
  const rejectedRateNum = total > 0 ? (rejected / total) * 100 : 0;

  const completionRateStr = completionRateNum.toFixed(1);
  const pendingRateStr = pendingRateNum.toFixed(1);

  // Corrective vs Preventive Breakdown
  const correctiveResolved = dofs.filter(
    (d) =>
      d.type === "düzeltici" &&
      ((d.status || "").toLowerCase() === "cozuldu" ||
        (d.status || "").toLowerCase() === "tamamlandi" ||
        (d.status || "").toLowerCase() === "kapali")
  ).length;

  const correctivePending = dofs.filter(
    (d) =>
      d.type === "düzeltici" &&
      ((d.status || "").toLowerCase() === "yeni" ||
        (d.status || "").toLowerCase() === "inceleniyor" ||
        (d.status || "").toLowerCase() === "beklemede")
  ).length;

  const preventiveResolved = dofs.filter(
    (d) =>
      d.type === "önleyici" &&
      ((d.status || "").toLowerCase() === "cozuldu" ||
        (d.status || "").toLowerCase() === "tamamlandi" ||
        (d.status || "").toLowerCase() === "kapali")
  ).length;

  const preventivePending = dofs.filter(
    (d) =>
      d.type === "önleyici" &&
      ((d.status || "").toLowerCase() === "yeni" ||
        (d.status || "").toLowerCase() === "inceleniyor" ||
        (d.status || "").toLowerCase() === "beklemede")
  ).length;

  // 1. Volume Bar Chart Data
  const volumeData = [
    {
      category: "Toplam DÖF",
      adet: total,
      oran: 100,
      fill: "#4f46e5", // Indigo 600
      statusKey: "all",
    },
    {
      category: "Bekleyen Faaliyetler",
      adet: pending,
      oran: Number(pendingRateStr),
      fill: "#f59e0b", // Amber 500
      statusKey: "acik",
    },
    {
      category: "Tamamlanan Faaliyetler",
      adet: resolved,
      oran: Number(completionRateStr),
      fill: "#10b981", // Emerald 500
      statusKey: "cozuldu",
    },
    {
      category: "Reddedilen / İptal",
      adet: rejected,
      oran: Number(rejectedRateNum.toFixed(1)),
      fill: "#f43f5e", // Rose 500
      statusKey: "reddedildi",
    },
  ];

  // 2. Type Comparison Data
  const typeComparisonData = [
    {
      name: "Düzeltici Faaliyet",
      Toplam: corrective,
      "Bekleyen (İşlemde)": correctivePending,
      Tamamlanan: correctiveResolved,
      "Tamamlanma %": corrective > 0 ? Number(((correctiveResolved / corrective) * 100).toFixed(1)) : 0,
    },
    {
      name: "Önleyici Faaliyet",
      Toplam: preventive,
      "Bekleyen (İşlemde)": preventivePending,
      Tamamlanan: preventiveResolved,
      "Tamamlanma %": preventive > 0 ? Number(((preventiveResolved / preventive) * 100).toFixed(1)) : 0,
    },
  ];

  // 3. Monthly Trend Data (Last 6 months)
  const monthlyTrendData = useMemo(() => {
    const months = [
      "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
      "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];
    const map: Record<string, { label: string; toplam: number; bekleyen: number; tamamlanan: number; sortKey: string }> = {};

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[label] = { label, toplam: 0, bekleyen: 0, tamamlanan: 0, sortKey };
    }

    dofs.forEach((d) => {
      let date: Date | null = null;
      if (d.createdAt) {
        if (typeof (d.createdAt as any).toDate === "function") {
          try { date = (d.createdAt as any).toDate(); } catch {}
        } else if ((d.createdAt as any).seconds) {
          date = new Date((d.createdAt as any).seconds * 1000);
        } else {
          const parsed = new Date(d.createdAt as any);
          if (!isNaN(parsed.getTime())) date = parsed;
        }
      }

      if (date) {
        const label = `${months[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
        if (map[label]) {
          map[label].toplam++;
          const s = (d.status || "").toLowerCase().trim();
          if (s === "cozuldu" || s === "çözüldü" || s === "tamamlandi" || s === "kapali") {
            map[label].tamamlanan++;
          } else if (s === "yeni" || s === "inceleniyor" || s === "beklemede") {
            map[label].bekleyen++;
          }
        }
      }
    });

    return Object.values(map)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((item) => {
        const rate = item.toplam > 0 ? Number(((item.tamamlanan / item.toplam) * 100).toFixed(1)) : 0;
        return {
          ay: item.label,
          "Toplam Bildirim": item.toplam,
          "Bekleyen": item.bekleyen,
          "Tamamlanan": item.tamamlanan,
          "Tamamlanma Oranı (%)": rate,
        };
      });
  }, [dofs]);

  // Donut data for mini visual chart
  const donutData = [
    { name: "Tamamlandı", value: resolved, color: "#10b981" },
    { name: "Bekleyen", value: pending, color: "#f59e0b" },
    { name: "Reddedildi", value: rejected, color: "#f43f5e" },
  ].filter((d) => d.value > 0);

  return (
    <div
      id="dof-overview-kpi-chart"
      className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden"
    >
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                <span>DÖF Hacmi, Bekleyenler ve Tamamlanma Grafiği</span>
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Target className="h-3 w-3 text-emerald-600" />
                Hedef %85
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Toplam DÖF sayısı, açık/bekleyen süreçler ve tamamlanma başarı oranlarının analitik görselleştirmesi
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/70 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveViewMode("volume")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeViewMode === "volume"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Genel Hacim</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode("type_comparison")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeViewMode === "type_comparison"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Tür Karşılaştırması</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode("trend")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeViewMode === "trend"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Aylık Trend</span>
          </button>
        </div>
      </div>

      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-5 pb-5">
        {/* Metric 1: Toplam DÖF */}
        <div
          onClick={() => onFilterClick && onFilterClick("all", "all")}
          className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 hover:border-indigo-300 transition cursor-pointer group shadow-2xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
              <FolderKanban className="h-3.5 w-3.5 text-indigo-600" />
              Toplam DÖF Sayısı
            </span>
            <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
              %100 Hacim
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black font-display text-indigo-950">
              {total}
            </span>
            <span className="text-xs text-indigo-700 font-medium">Faaliyet Kaydı</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-indigo-800/80">
            <span>{corrective} Düzeltici</span>
            <span>·</span>
            <span>{preventive} Önleyici</span>
          </div>
        </div>

        {/* Metric 2: Bekleyen Faaliyetler */}
        <div
          onClick={() => onFilterClick && onFilterClick("acik")}
          className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 hover:border-amber-300 transition cursor-pointer group shadow-2xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Bekleyen Faaliyetler
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded-full border border-amber-200">
              %{pendingRateStr} Beklemede
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black font-display text-amber-950">
              {pending}
            </span>
            <span className="text-xs text-amber-700 font-medium">Açık / İşlemde</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-800">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Aksiyon ve inceleme bekleyen süreçler</span>
          </div>
        </div>

        {/* Metric 3: Tamamlanma Oranı */}
        <div
          onClick={() => onFilterClick && onFilterClick("cozuldu")}
          className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 hover:border-emerald-300 transition cursor-pointer group shadow-2xs hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Tamamlanma Oranı
            </span>
            <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
              {resolved} Çözüldü
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black font-display text-emerald-950">
              %{completionRateStr}
            </span>
            <span className="text-xs text-emerald-700 font-medium">Başarı Oranı</span>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-emerald-200/60 h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, Math.max(0, completionRateNum))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Chart Rendering Container */}
      <div className="pt-2">
        {activeViewMode === "volume" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">Faaliyet Dağılım ve Hacim Grafiği (Adet & Oran %)</span>
              <span>Çubuklara tıklayarak filtre uygulayabilirsiniz</span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={volumeData}
                  margin={{ top: 15, right: 20, left: -10, bottom: 25 }}
                  onClick={(e) => {
                    if (e && e.activePayload && e.activePayload[0] && onFilterClick) {
                      const data = e.activePayload[0].payload;
                      if (data.statusKey) onFilterClick(data.statusKey);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="category"
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
                            <p className="font-bold text-amber-300">{d.category}</p>
                            <p className="text-slate-200">
                              Adet: <span className="font-bold font-mono text-white">{d.adet}</span>
                            </p>
                            <p className="text-slate-300">
                              Toplam Hacim Payı: <span className="font-bold font-mono text-emerald-400">%{d.oran}</span>
                            </p>
                            <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                              Filtrelemek için tıklayın
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="adet" radius={[8, 8, 0, 0]} maxBarSize={64}>
                    {volumeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeViewMode === "type_comparison" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">Düzeltici vs Önleyici Faaliyet Karşılaştırması</span>
              <span className="text-[11px] text-indigo-600 font-medium">Toplam, Bekleyen ve Tamamlanan Adetler</span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={typeComparisonData}
                  margin={{ top: 15, right: 20, left: -10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#475569", fontSize: 12, fontWeight: 700 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5">
                            <p className="font-bold text-indigo-300 text-sm">{label}</p>
                            {payload.map((p, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-4">
                                <span className="text-slate-300 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                  {p.name}:
                                </span>
                                <span className="font-bold font-mono text-white">{p.value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
                    iconType="circle"
                  />
                  <Bar dataKey="Toplam" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  <Bar dataKey="Bekleyen (İşlemde)" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  <Bar dataKey="Tamamlanan" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeViewMode === "trend" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">Aylık DÖF Hacmi ve Tamamlanma Oranı Trendi</span>
              <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Başarı Oranı Eğrisi
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyTrendData}
                  margin={{ top: 15, right: 20, left: -10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="ay"
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fill: "#10b981", fontSize: 10, fontWeight: 700 }}
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5">
                            <p className="font-bold text-amber-300 text-sm">{label}</p>
                            {payload.map((p, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-4">
                                <span className="text-slate-300 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                  {p.name}:
                                </span>
                                <span className="font-bold font-mono text-white">
                                  {p.name.includes("%") ? `%${p.value}` : p.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
                    iconType="circle"
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="Toplam Bildirim"
                    fill="#818cf8"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="Tamamlanan"
                    fill="#34d399"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="Tamamlanma Oranı (%)"
                    stroke="#059669"
                    strokeWidth={3}
                    dot={{ fill: "#059669", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DofOverviewKpiChart;
