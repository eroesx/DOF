import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import { DofForm } from "../types";

interface DofDashboardChartProps {
  dofs: DofForm[];
}

export const DofDashboardChart: React.FC<DofDashboardChartProps> = ({ dofs }) => {
  // Date parsing helper
  const getDofDate = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === "function") {
      try {
        return timestamp.toDate();
      } catch (e) {
        // ignore
      }
    }
    if (timestamp.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000);
    }
    const parsed = new Date(timestamp);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const activeCount = dofs.filter((d) => d.status === "yeni" || d.status === "inceleniyor").length;
  const closedCount = dofs.filter((d) => d.status === "cozuldu" || d.status === "reddedildi").length;

  // Monthly grouping
  const monthlyMap: Record<string, { month: string; active: number; closed: number; sortKey: string }> = {};

  const getMonthName = (date: Date): string => {
    const months = [
      "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
      "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Pre-populate last 6 months to make chart look clean even if empty
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const label = getMonthName(d);
    const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[label] = { month: label, active: 0, closed: 0, sortKey };
  }

  // Populate actual dofs
  dofs.forEach((d) => {
    const date = getDofDate(d.createdAt);
    if (date) {
      const label = getMonthName(date);
      const isActive = d.status === "yeni" || d.status === "inceleniyor";
      
      if (!monthlyMap[label]) {
        const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[label] = { month: label, active: 0, closed: 0, sortKey };
      }
      
      if (isActive) {
        monthlyMap[label].active++;
      } else {
        monthlyMap[label].closed++;
      }
    }
  });

  // Sort chronologically and format
  const chartData = Object.values(monthlyMap)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ month, active, closed }) => ({
      name: month,
      "Aktif DÖF": active,
      "Kapalı DÖF": closed,
    }));

  const totalCount = dofs.length;

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md hover:shadow-lg transition-shadow duration-300" id="dof-dashboard-recharts-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-50">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 font-display">
            <TrendingUp className="h-5 w-5 text-indigo-600" /> Aktif vs Kapalı DÖF Analizi
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">DÖF kayıtlarının aktif/kapalı durum oranları ve aylık bazda dağılım trendleri</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-bold bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-slate-500">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>Aylık Dağılım</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-amber-50/40 border border-amber-100/50 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-amber-100/60 text-amber-600 rounded-xl">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">AKTİF DÖF</span>
            <span className="text-xl font-display font-black text-slate-800 leading-none mt-0.5 block">
              {activeCount} Adet
            </span>
          </div>
        </div>

        <div className="p-4 bg-emerald-50/40 border border-emerald-100/50 rounded-2xl flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100/60 text-emerald-600 rounded-xl">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">KAPALI DÖF</span>
            <span className="text-xl font-display font-black text-slate-800 leading-none mt-0.5 block">
              {closedCount} Adet
            </span>
          </div>
        </div>

        <div className="p-4 bg-indigo-50/40 border border-indigo-100/50 rounded-2xl flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="p-2.5 bg-indigo-100/60 text-indigo-600 rounded-xl">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">ÇÖZÜM ORANI</span>
            <span className="text-xl font-display font-black text-slate-800 leading-none mt-0.5 block">
              %{totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0}
            </span>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart */}
      <div className="h-64 w-full">
        {totalCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
            <span className="text-xs">Grafik oluşturmak için yeterli veri bulunmuyor.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "none",
                  borderRadius: "12px",
                  color: "#f8fafc",
                  fontSize: "11px",
                  fontWeight: "600",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                }}
                labelStyle={{
                  color: "#94a3b8",
                  fontWeight: "bold",
                  marginBottom: "4px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold', paddingTop: 10 }} />
              <Bar dataKey="Aktif DÖF" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Kapalı DÖF" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
