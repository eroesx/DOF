import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Clock, AlertTriangle, CheckCircle, TrendingUp, BarChart2, PieChart as PieIcon } from "lucide-react";
import { DofForm } from "../types";

interface DofDeadlineSummaryChartProps {
  dofs: DofForm[];
}

export const DofDeadlineSummaryChart: React.FC<DofDeadlineSummaryChartProps> = ({ dofs }) => {
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");

  // Helper to determine remaining days
  const getRemainingDays = (dof: DofForm): number => {
    if (dof.targetCompletionDate) {
      const targetDate = new Date(dof.targetCompletionDate);
      const today = new Date();
      targetDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      const diffMs = targetDate.getTime() - today.getTime();
      return Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    // Default calculations if no targetCompletionDate
    let createdDate = new Date();
    if (dof.createdAt) {
      try {
        if (typeof dof.createdAt.toDate === "function") {
          createdDate = dof.createdAt.toDate();
        } else if (dof.createdAt.seconds !== undefined) {
          createdDate = new Date(dof.createdAt.seconds * 1000);
        } else {
          createdDate = new Date(dof.createdAt);
        }
      } catch (e) {
        // ignore
      }
    }
    const targetDays = dof.type === "düzeltici" ? 7 : 14;
    const terminDate = new Date(createdDate.getTime());
    terminDate.setDate(terminDate.getDate() + targetDays);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const terminDateZero = new Date(terminDate.getTime());
    terminDateZero.setHours(0, 0, 0, 0);

    const diffTime = terminDateZero.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  };

  // Categorize
  let pendingCount = 0; // Bekleyen (Açık, Süresi Var)
  let urgentCount = 0;  // Süresi Yaklaşan (Açık, <= 3 gün veya gecikmiş)
  let completedCount = 0; // Tamamlanan

  dofs.forEach((dof) => {
    if (dof.status === "cozuldu") {
      completedCount++;
    } else if (dof.status !== "reddedildi") {
      const remainingDays = getRemainingDays(dof);
      if (remainingDays <= 3) {
        urgentCount++;
      } else {
        pendingCount++;
      }
    }
  });

  const total = pendingCount + urgentCount + completedCount;

  const data = [
    {
      name: "Tamamlananlar",
      value: completedCount,
      color: "#10b981", // emerald
      description: "Çözümlenmiş DÖF kayıtları"
    },
    {
      name: "Bekleyenler (Süresi Var)",
      value: pendingCount,
      color: "#3b82f6", // blue
      description: "Çözüm süresi > 3 gün olan açık kayıtlar"
    },
    {
      name: "Süresi Yaklaşanlar / Kritik",
      value: urgentCount,
      color: "#ef4444", // rose
      description: "Termine 3 gün veya daha az kalan/gecikmiş açık kayıtlar"
    }
  ];

  const customTooltipStyle = {
    contentStyle: {
      backgroundColor: "#1e293b",
      border: "none",
      borderRadius: "12px",
      color: "#f8fafc",
      fontSize: "11px",
      fontWeight: "600",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    },
    labelStyle: {
      color: "#94a3b8",
      fontWeight: "bold",
      marginBottom: "4px",
    },
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    value
  }: any) => {
    if (value === 0) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[10px] font-bold font-mono"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md" id="dof-deadline-summary-chart-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-50">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 font-display">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Termin & Çözüm Durum Özeti
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Bekleyen, tamamlanan ve süresi yaklaşan/gecikmiş DÖF süreçlerinin anlık genel dağılımı.
          </p>
        </div>

        {/* Chart Type Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setChartType("bar")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              chartType === "bar" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Sütun Grafik
          </button>
          <button
            onClick={() => setChartType("pie")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              chartType === "pie" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <PieIcon className="h-3.5 w-3.5" />
            Daire Grafik
          </button>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-150 rounded-2xl bg-slate-50/20">
          <Clock className="h-10 w-10 text-slate-300 mb-3" />
          <h4 className="text-xs font-bold text-slate-700">Henüz Kayıt Bulunmuyor</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Sistemde henüz kayıtlı DÖF bulunmadığı için analiz grafiği çizilemedi.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Visual Chart */}
          <div className="lg:col-span-6 h-64 flex items-center justify-center">
            {chartType === "bar" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b", fontWeight: "bold" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip {...customTooltipStyle} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip {...customTooltipStyle} />
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={90}
                    innerRadius={40}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={36} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: "bold" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Explanation / Breakdown Metrics cards */}
          <div className="lg:col-span-6 space-y-3.5">
            {/* Completed */}
            <div className="flex items-start gap-3 p-3 bg-emerald-50/20 border border-emerald-100/50 rounded-2xl">
              <span className="p-1.5 bg-emerald-500 text-white rounded-xl shrink-0 mt-0.5">
                <CheckCircle className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Tamamlananlar</span>
                  <span className="text-xs font-black font-mono text-emerald-600">{completedCount} DÖF</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  Başarıyla çözümlenip sisteme kapatılmış olan kayıtlar.
                </p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? (completedCount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Pending */}
            <div className="flex items-start gap-3 p-3 bg-blue-50/20 border border-blue-100/50 rounded-2xl">
              <span className="p-1.5 bg-blue-500 text-white rounded-xl shrink-0 mt-0.5">
                <Clock className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Bekleyenler (Güvenli Sürede)</span>
                  <span className="text-xs font-black font-mono text-blue-600">{pendingCount} DÖF</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  Çözümü devam eden ve son güne 3 günden fazla süre bulunan açık faaliyetler.
                </p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? (pendingCount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Urgent / Overdue */}
            <div className="flex items-start gap-3 p-3 bg-rose-50/30 border border-rose-100/50 rounded-2xl">
              <span className="p-1.5 bg-rose-500 text-white rounded-xl shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Süresi Yaklaşanlar / Kritik</span>
                  <span className="text-xs font-black font-mono text-rose-600">{urgentCount} DÖF</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  Maksimum çözüm süresi dolmak üzere olan (son 3 gün) ya da süresi geçmiş olan faaliyetler.
                </p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? (urgentCount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
