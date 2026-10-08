import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  BarChart3,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { DofForm } from "../types";

interface DofMonthlyDistributionChartProps {
  dofs: DofForm[];
}

type PeriodOption = "6months" | "12months" | "all";
type ViewMode = "total" | "type" | "status";
type ChartType = "bar" | "area";

export const DofMonthlyDistributionChart: React.FC<DofMonthlyDistributionChartProps> = ({ dofs }) => {
  const [period, setPeriod] = useState<PeriodOption>("6months");
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [showTable, setShowTable] = useState<boolean>(false);

  // Date parsing helper
  const parseDate = (timestamp: any): Date | null => {
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

  const monthNames = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
  ];

  const monthShortNames = [
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"
  ];

  // Process data for charts
  const {
    chartData,
    totalDofCount,
    currentMonthCount,
    prevMonthCount,
    monthlyAverage,
    trendPercent,
    topMonth,
    typeCounts,
  } = useMemo(() => {
    const totalCount = dofs.length;

    // Determine range
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let monthsToInclude = 6;
    if (period === "12months") monthsToInclude = 12;
    if (period === "all") monthsToInclude = 24;

    // Build ordered list of months
    const monthKeys: { key: string; label: string; shortLabel: string; year: number; month: number }[] = [];
    for (let i = monthsToInclude - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = `${monthNames[m]} ${y}`;
      const shortLabel = `${monthShortNames[m]} '${String(y).slice(2)}`;
      monthKeys.push({ key, label, shortLabel, year: y, month: m });
    }

    // Initialize mapping
    const map: Record<
      string,
      {
        key: string;
        name: string;
        shortName: string;
        total: number;
        duzeltici: number;
        onleyici: number;
        yeni: number;
        inceleniyor: number;
        cozuldu: number;
        reddedildi: number;
      }
    > = {};

    monthKeys.forEach((mk) => {
      map[mk.key] = {
        key: mk.key,
        name: mk.label,
        shortName: mk.shortLabel,
        total: 0,
        duzeltici: 0,
        onleyici: 0,
        yeni: 0,
        inceleniyor: 0,
        cozuldu: 0,
        reddedildi: 0,
      };
    });

    let overallDuzeltici = 0;
    let overallOnleyici = 0;

    dofs.forEach((d) => {
      const isDuzeltici = (d.type || "").toLowerCase() === "düzeltici";
      if (isDuzeltici) {
        overallDuzeltici++;
      } else {
        overallOnleyici++;
      }

      const date = parseDate(d.createdAt);
      if (!date) return;

      const y = date.getFullYear();
      const m = date.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;

      if (map[key]) {
        map[key].total++;
        if (isDuzeltici) {
          map[key].duzeltici++;
        } else {
          map[key].onleyici++;
        }

        const st = (d.status || "").toLowerCase();
        if (st === "yeni") map[key].yeni++;
        else if (st === "inceleniyor") map[key].inceleniyor++;
        else if (st === "cozuldu") map[key].cozuldu++;
        else if (st === "reddedildi") map[key].reddedildi++;
      }
    });

    const data = monthKeys.map((mk) => map[mk.key]);

    // Current month and previous month
    const curKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const curCount = map[curKey] ? map[curKey].total : 0;
    const prvCount = map[prevKey] ? map[prevKey].total : 0;

    let trend = 0;
    if (prvCount > 0) {
      trend = Math.round(((curCount - prvCount) / prvCount) * 100);
    } else if (curCount > 0) {
      trend = 100;
    }

    // Top month calculation
    let maxMonthName = "-";
    let maxMonthCount = 0;
    data.forEach((item) => {
      if (item.total > maxMonthCount) {
        maxMonthCount = item.total;
        maxMonthName = item.name;
      }
    });

    // Average per month
    const totalInPeriod = data.reduce((acc, curr) => acc + curr.total, 0);
    const avg = monthsToInclude > 0 ? (totalInPeriod / monthsToInclude).toFixed(1) : "0";

    return {
      chartData: data,
      totalDofCount: totalCount,
      currentMonthCount: curCount,
      prevMonthCount: prvCount,
      monthlyAverage: avg,
      trendPercent: trend,
      topMonth: maxMonthCount > 0 ? { name: maxMonthName, count: maxMonthCount } : null,
      typeCounts: {
        duzeltici: overallDuzeltici,
        onleyici: overallOnleyici,
      },
    };
  }, [dofs, period]);

  return (
    <div
      className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-md hover:shadow-lg transition-all duration-300"
      id="dof-monthly-distribution-card"
    >
      {/* Kart Üst Başlık & Açıklama */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-bold text-slate-900 font-display tracking-tight">
              Toplam DÖF Sayıları ve Aylık Dağılım Grafiği
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Kalite yönetim sistemine bildirilen toplam düzeltici ve önleyici faaliyetlerin aylara göre hacim analizi ve gelişim trendi.
          </p>
        </div>

        {/* Kontrol Butonları & Filtreler (Anti-Slop Segmented Controls) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Zaman Aralığı Seçici */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl text-xs">
            <button
              onClick={() => setPeriod("6months")}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                period === "6months"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Son 6 Ay
            </button>
            <button
              onClick={() => setPeriod("12months")}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                period === "12months"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Son 12 Ay
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                period === "all"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tümü
            </button>
          </div>

          {/* Görünüm Modu */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl text-xs">
            <button
              onClick={() => setViewMode("total")}
              className={`px-2.5 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === "total"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Toplam Aylık DÖF Hacmi"
            >
              Toplam
            </button>
            <button
              onClick={() => setViewMode("type")}
              className={`px-2.5 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === "type"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Faaliyet Türüne Göre Dağılım"
            >
              Tür Bazlı
            </button>
            <button
              onClick={() => setViewMode("status")}
              className={`px-2.5 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === "status"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Durumlarına Göre Dağılım"
            >
              Durum Bazlı
            </button>
          </div>

          {/* Grafik Tipi (Çubuk vs Alan) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl text-xs">
            <button
              onClick={() => setChartType("area")}
              className={`px-2 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                chartType === "area"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Alan / Trend Görünümü"
            >
              <TrendingUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setChartType("bar")}
              className={`px-2 py-1.5 font-semibold rounded-lg transition-all cursor-pointer ${
                chartType === "bar"
                  ? "bg-white text-indigo-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Çubuk / Sütun Görünümü"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Kartları - Toplam DÖF Sayıları ve Dağılım Göstergeleri */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
        {/* 1. Toplam DÖF */}
        <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/70">
          <div className="flex items-center justify-between text-indigo-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">TOPLAM DÖF</span>
            <Activity className="h-4 w-4 text-indigo-500 opacity-80" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
              {totalDofCount}
            </span>
            <span className="text-xs font-semibold text-slate-500">Adet Kayıt</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-600">
            <span>Düzeltici: <strong>{typeCounts.duzeltici}</strong></span>
            <span>·</span>
            <span>Önleyici: <strong>{typeCounts.onleyici}</strong></span>
          </div>
        </div>

        {/* 2. Bu Ay Açılan */}
        <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">BU AY AÇILAN</span>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
              {currentMonthCount}
            </span>
            <span className="text-xs font-semibold text-slate-500">Bu Ay</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
            {trendPercent >= 0 ? (
              <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> +%{trendPercent}
              </span>
            ) : (
              <span className="text-rose-600 font-bold flex items-center gap-0.5">
                <TrendingDown className="h-3 w-3" /> %{trendPercent}
              </span>
            )}
            <span className="text-slate-400">geçen aya göre</span>
          </div>
        </div>

        {/* 3. Aylık Ortalama */}
        <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">AYLIK ORTALAMA</span>
            <BarChart3 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
              {monthlyAverage}
            </span>
            <span className="text-xs font-semibold text-slate-500">DÖF / Ay</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 truncate">
            {period === "6months" ? "Son 6 aylık ortalama" : period === "12months" ? "Yıllık ortalama" : "Genel ortalama"}
          </div>
        </div>

        {/* 4. En Yoğun Ay */}
        <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100/70">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">EN ÇOK DÖF AÇILAN</span>
            <AlertCircle className="h-4 w-4 text-amber-500 opacity-80" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
              {topMonth ? topMonth.count : 0}
            </span>
            <span className="text-xs font-semibold text-slate-500">Zirve</span>
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-amber-800 truncate">
            {topMonth ? topMonth.name : "Veri yok"}
          </div>
        </div>
      </div>

      {/* Recharts Görselleştirme Alanı */}
      <div className="h-72 w-full pt-2">
        {totalDofCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
            <HelpCircle className="h-8 w-8 text-slate-300 mb-2" />
            <span className="text-xs font-semibold text-slate-600">Henüz kayıtlı DÖF verisi bulunmuyor.</span>
            <span className="text-[11px] text-slate-400 mt-0.5">
              Yeni bildirimler oluşturuldukça aylık dağılım grafiği otomatik güncellenecektir.
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
              <defs>
                {/* Indigo Gradient */}
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                {/* Düzeltici Gradient */}
                <linearGradient id="colorDuzeltici" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
                {/* Önleyici Gradient */}
                <linearGradient id="colorOnleyici" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                {/* Çözüldü Gradient */}
                <linearGradient id="colorCozuldu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="shortName"
                tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs min-w-[200px]">
                        <div className="font-bold text-slate-200 border-b border-slate-800 pb-2 mb-2 flex items-center justify-between">
                          <span>{data.name}</span>
                          <span className="text-indigo-400 font-mono text-[11px] font-black">
                            Toplam: {data.total}
                          </span>
                        </div>

                        {viewMode === "total" && (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-indigo-500" /> Toplam Açılan
                              </span>
                              <span className="font-bold text-white">{data.total}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-400 text-[11px] pt-1">
                              <span>Düzeltici: {data.duzeltici}</span>
                              <span>·</span>
                              <span>Önleyici: {data.onleyici}</span>
                            </div>
                          </div>
                        )}

                        {viewMode === "type" && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-amber-400">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-amber-500" /> Düzeltici Faaliyet
                              </span>
                              <span className="font-bold">{data.duzeltici}</span>
                            </div>
                            <div className="flex justify-between items-center text-cyan-400">
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-cyan-500" /> Önleyici Faaliyet
                              </span>
                              <span className="font-bold">{data.onleyici}</span>
                            </div>
                          </div>
                        )}

                        {viewMode === "status" && (
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between items-center text-blue-400">
                              <span>Yeni Bildirim:</span>
                              <span className="font-bold">{data.yeni}</span>
                            </div>
                            <div className="flex justify-between items-center text-amber-400">
                              <span>İnceleniyor:</span>
                              <span className="font-bold">{data.inceleniyor}</span>
                            </div>
                            <div className="flex justify-between items-center text-emerald-400">
                              <span>Çözüldü / Kapalı:</span>
                              <span className="font-bold">{data.cozuldu}</span>
                            </div>
                            <div className="flex justify-between items-center text-rose-400">
                              <span>Reddedildi:</span>
                              <span className="font-bold">{data.reddedildi}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, fontWeight: "600", paddingTop: 12 }}
                iconType="circle"
              />

              {/* View Mode 1: Toplam DÖF Sayısı */}
              {viewMode === "total" && (
                chartType === "area" ? (
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Toplam DÖF Sayısı"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    activeDot={{ r: 6, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
                  />
                ) : (
                  <Bar
                    dataKey="total"
                    name="Toplam DÖF Sayısı"
                    fill="#6366f1"
                    radius={[6, 6, 0, 0]}
                  />
                )
              )}

              {/* View Mode 2: Faaliyet Türüne Göre Dağılım */}
              {viewMode === "type" && (
                chartType === "area" ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="duzeltici"
                      name="Düzeltici Faaliyet"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDuzeltici)"
                    />
                    <Area
                      type="monotone"
                      dataKey="onleyici"
                      name="Önleyici Faaliyet"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorOnleyici)"
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      dataKey="duzeltici"
                      name="Düzeltici Faaliyet"
                      fill="#f59e0b"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="onleyici"
                      name="Önleyici Faaliyet"
                      fill="#06b6d4"
                      radius={[4, 4, 0, 0]}
                    />
                  </>
                )
              )}

              {/* View Mode 3: Durumuna Göre Dağılım */}
              {viewMode === "status" && (
                <>
                  <Bar dataKey="yeni" name="Yeni" fill="#3b82f6" stackId="statusStack" />
                  <Bar dataKey="inceleniyor" name="İnceleniyor" fill="#f59e0b" stackId="statusStack" />
                  <Bar dataKey="cozuldu" name="Çözüldü" fill="#10b981" stackId="statusStack" />
                  <Bar dataKey="reddedildi" name="Reddedildi" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="statusStack" />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Alt Bilgi & Detaylı Aylık Tablo Geçişi */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="text-slate-500 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Grafik verileri gerçek zamanlı sistem veritabanından dinamik olarak hesaplanmaktadır.</span>
        </div>
        <button
          onClick={() => setShowTable(!showTable)}
          className="text-indigo-600 hover:text-indigo-800 font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
        >
          {showTable ? "Aylık Tabloyu Gizle ▲" : "Aylık Dağılım Tablosunu İncele ▼"}
        </button>
      </div>

      {/* Genişletilebilir Aylık Döküm Tablosu */}
      {showTable && (
        <div className="mt-4 overflow-x-auto border border-slate-100 rounded-2xl shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                <th className="py-2.5 px-4">Ay / Yıl</th>
                <th className="py-2.5 px-4 text-center">Toplam DÖF</th>
                <th className="py-2.5 px-4 text-center">Düzeltici</th>
                <th className="py-2.5 px-4 text-center">Önleyici</th>
                <th className="py-2.5 px-4 text-center">Açık (Yeni/İnceleme)</th>
                <th className="py-2.5 px-4 text-center">Kapalı (Çözüldü)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chartData.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 px-4 font-semibold text-slate-800">{row.name}</td>
                  <td className="py-2.5 px-4 text-center font-bold text-indigo-700">{row.total}</td>
                  <td className="py-2.5 px-4 text-center text-amber-600 font-medium">{row.duzeltici}</td>
                  <td className="py-2.5 px-4 text-center text-cyan-600 font-medium">{row.onleyici}</td>
                  <td className="py-2.5 px-4 text-center text-blue-600">{row.yeni + row.inceleniyor}</td>
                  <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">{row.cozuldu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
