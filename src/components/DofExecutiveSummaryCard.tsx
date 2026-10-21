import React from "react";
import { 
  CheckCircle2, 
  Clock, 
  FolderKanban, 
  Wrench, 
  ShieldCheck, 
  TrendingUp, 
  AlertTriangle,
  ArrowRight,
  Filter,
  Layers
} from "lucide-react";

interface DofExecutiveSummaryCardProps {
  totalCount: number;
  resolvedCount: number; // Tamamlanan
  openCount: number;     // Devam Eden (Yeni + İnceleniyor)
  newCount: number;      // Yeni Başvuru
  reviewCount: number;   // İnceleniyor / İşlemde
  rejectedCount: number; // Kapatılan / Reddedildi
  correctiveCount: number;
  preventiveCount: number;
  urgentCount?: number;
  correctiveDays?: number;
  preventiveDays?: number;
  onFilterClick?: (status: string, type?: string) => void;
  statusFilter?: string;
  typeFilter?: string;
}

export const DofExecutiveSummaryCard: React.FC<DofExecutiveSummaryCardProps> = ({
  totalCount,
  resolvedCount,
  openCount,
  newCount,
  reviewCount,
  rejectedCount,
  correctiveCount,
  preventiveCount,
  urgentCount = 0,
  correctiveDays = 3,
  preventiveDays = 7,
  onFilterClick,
  statusFilter = "acik",
  typeFilter = "all",
}) => {
  // Calculations
  const completedRate = totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0;
  const ongoingRate = totalCount > 0 ? (openCount / totalCount) * 100 : 0;
  const rejectedRate = totalCount > 0 ? (rejectedCount / totalCount) * 100 : 0;

  const completedPercentStr = completedRate.toFixed(1);
  const ongoingPercentStr = ongoingRate.toFixed(1);
  const rejectedPercentStr = rejectedRate.toFixed(1);

  // SVG Radial Gauge Calculations
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const completedDashoffset = circumference - (completedRate / 100) * circumference;
  const ongoingDashoffset = circumference - (ongoingRate / 100) * circumference;

  return (
    <div 
      id="dof-executive-summary-card"
      className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden"
    >
      {/* Subtle background decorative aura */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-50/50 via-emerald-50/30 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                DÖF Faaliyet & Süreç Genel Özeti
              </h2>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                Canlı Portföy
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Toplam DÖF hacmi, açık/devam eden aksiyonlar ve tamamlanma başarı oranları
            </p>
          </div>
        </div>

        {/* Quick Summary Pill / Action */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              <span>{urgentCount} Acil Termin</span>
            </span>
          )}
          {onFilterClick && (
            <button
              type="button"
              onClick={() => onFilterClick("all", "all")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
              title="Tüm filtreleri sıfırla ve tüm listeyi göster"
            >
              <Filter className="h-3 w-3 text-slate-500" />
              <span>Tümünü Göster ({totalCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stats Grid with Visual Gauge and Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5 items-center">
        {/* Left Column: Visual Donut / Health Gauge (4 cols on lg) */}
        <div className="lg:col-span-4 flex items-center gap-4 bg-slate-50/60 p-4 rounded-2xl border border-slate-100">
          {/* Radial Progress Ring */}
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background Track */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-slate-200 stroke-current"
                strokeWidth="8"
                fill="transparent"
              />
              {/* Completed Arc (Emerald) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-emerald-500 stroke-current transition-all duration-1000 ease-out"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={completedDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
              {/* Ongoing Arc (Amber) - inner ring */}
              <circle
                cx="50"
                cy="50"
                r={radius - 9}
                className="text-amber-500 stroke-current transition-all duration-1000 ease-out"
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * (radius - 9)}
                strokeDashoffset={2 * Math.PI * (radius - 9) - (ongoingRate / 100) * 2 * Math.PI * (radius - 9)}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Inner Percentage Center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-black font-display text-slate-900 leading-none">
                %{completedPercentStr}
              </span>
              <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-tighter mt-1">
                Kapanış
              </span>
            </div>
          </div>

          {/* Radial Legend */}
          <div className="flex-1 space-y-2">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  Tamamlandı
                </span>
                <span className="text-emerald-700 font-mono">%{completedPercentStr}</span>
              </div>
              <p className="text-[10px] text-slate-400 pl-4">{resolvedCount} adet DÖF çözüldü</p>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  Devam Eden
                </span>
                <span className="text-amber-700 font-mono">%{ongoingPercentStr}</span>
              </div>
              <p className="text-[10px] text-slate-400 pl-4">{openCount} adet faaliyet açık</p>
            </div>

            {rejectedCount > 0 && (
              <div className="space-y-0.5 pt-0.5 border-t border-slate-200/60">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                    Kapatıldı (Red)
                  </span>
                  <span className="font-mono text-slate-600">%{rejectedPercentStr}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Middle & Right: Interactive Metric Cards & Progress Bars (8 cols on lg) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* 3 Metric Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Toplam DÖF */}
            <div 
              onClick={() => onFilterClick && onFilterClick("all", "all")}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === "all" && typeFilter === "all"
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200/70 text-slate-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  statusFilter === "all" && typeFilter === "all" ? "text-slate-300" : "text-slate-500"
                }`}>
                  Toplam DÖF
                </span>
                <Layers className={`h-4 w-4 ${statusFilter === "all" && typeFilter === "all" ? "text-indigo-400" : "text-slate-400"}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl font-black font-display tracking-tight">
                  {totalCount}
                </span>
                <span className={`text-[10px] font-medium ${statusFilter === "all" && typeFilter === "all" ? "text-slate-300" : "text-slate-500"}`}>
                  Kayıt
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-black/5 text-[10px]">
                <span className={statusFilter === "all" && typeFilter === "all" ? "text-indigo-200" : "text-indigo-700 font-semibold"}>
                  {correctiveCount} Düzeltici
                </span>
                <span className="opacity-40">·</span>
                <span className={statusFilter === "all" && typeFilter === "all" ? "text-teal-200" : "text-teal-800 font-semibold"}>
                  {preventiveCount} Önleyici
                </span>
              </div>
            </div>

            {/* Card 2: Devam Eden Faaliyetler */}
            <div 
              onClick={() => onFilterClick && onFilterClick("acik")}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === "acik" || statusFilter === "bekleyen"
                  ? "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-100"
                  : "bg-amber-50/50 hover:bg-amber-50 border-amber-200/70 text-amber-950"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  statusFilter === "acik" || statusFilter === "bekleyen" ? "text-amber-100" : "text-amber-800"
                }`}>
                  Devam Eden Faaliyetler
                </span>
                <Clock className={`h-4 w-4 ${statusFilter === "acik" || statusFilter === "bekleyen" ? "text-amber-200" : "text-amber-600"}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl font-black font-display tracking-tight">
                  {openCount}
                </span>
                <span className={`text-xs font-bold font-mono ${
                  statusFilter === "acik" || statusFilter === "bekleyen" ? "text-amber-100" : "text-amber-700"
                }`}>
                  (%{ongoingPercentStr})
                </span>
              </div>
              <div className={`flex items-center justify-between mt-2 pt-2 border-t text-[10px] ${
                statusFilter === "acik" || statusFilter === "bekleyen" ? "border-amber-500/50 text-amber-100" : "border-amber-200/50 text-amber-900"
              }`}>
                <span>{newCount} Yeni</span>
                <span>{reviewCount} İnceleniyor</span>
              </div>
            </div>

            {/* Card 3: Tamamlanan Faaliyetler */}
            <div 
              onClick={() => onFilterClick && onFilterClick("cozuldu")}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === "cozuldu" || statusFilter === "tamamlandi"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100"
                  : "bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200/70 text-emerald-950"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  statusFilter === "cozuldu" || statusFilter === "tamamlandi" ? "text-emerald-100" : "text-emerald-800"
                }`}>
                  Tamamlanan Faaliyetler
                </span>
                <CheckCircle2 className={`h-4 w-4 ${statusFilter === "cozuldu" || statusFilter === "tamamlandi" ? "text-emerald-200" : "text-emerald-600"}`} />
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-2xl font-black font-display tracking-tight">
                  {resolvedCount}
                </span>
                <span className={`text-xs font-bold font-mono ${
                  statusFilter === "cozuldu" || statusFilter === "tamamlandi" ? "text-emerald-100" : "text-emerald-700"
                }`}>
                  (%{completedPercentStr})
                </span>
              </div>
              <div className={`flex items-center justify-between mt-2 pt-2 border-t text-[10px] ${
                statusFilter === "cozuldu" || statusFilter === "tamamlandi" ? "border-emerald-500/50 text-emerald-100" : "border-emerald-200/50 text-emerald-900"
              }`}>
                <span>Çözüm Onaylandı</span>
                <span className="font-bold">Kapatıldı</span>
              </div>
            </div>
          </div>

          {/* Continuous Proportional Distribution Bar */}
          <div className="space-y-1.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                Faaliyet Durum Dağılım Oranları
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Tamamlanma: %{completedPercentStr} · Devam: %{ongoingPercentStr}
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="h-3.5 w-full bg-slate-200 rounded-full overflow-hidden flex p-0.5 gap-0.5">
              {/* Tamamlanan Segment */}
              <div
                style={{ width: `${completedRate}%` }}
                className="h-full bg-emerald-500 hover:bg-emerald-600 rounded-full transition-all duration-500 cursor-pointer relative group"
                onClick={() => onFilterClick && onFilterClick("cozuldu")}
                title={`Tamamlanan / Çözüldü: ${resolvedCount} adet (%${completedPercentStr})`}
              />

              {/* Devam Eden Segment */}
              <div
                style={{ width: `${ongoingRate}%` }}
                className="h-full bg-amber-500 hover:bg-amber-600 rounded-full transition-all duration-500 cursor-pointer relative group"
                onClick={() => onFilterClick && onFilterClick("acik")}
                title={`Devam Eden / İşlemde: ${openCount} adet (%${ongoingPercentStr})`}
              />

              {/* Reddedilen Segment (varsa) */}
              {rejectedRate > 0 && (
                <div
                  style={{ width: `${rejectedRate}%` }}
                  className="h-full bg-rose-400 hover:bg-rose-500 rounded-full transition-all duration-500 cursor-pointer relative group"
                  onClick={() => onFilterClick && onFilterClick("reddedildi")}
                  title={`Kapatıldı (Reddedildi): ${rejectedCount} adet (%${rejectedPercentStr})`}
                />
              )}
            </div>

            {/* Interactive Sub-legend Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onFilterClick && onFilterClick("cozuldu")}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700 font-semibold transition cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Tamamlanan: {resolvedCount} (%{completedPercentStr})</span>
                </button>

                <button
                  type="button"
                  onClick={() => onFilterClick && onFilterClick("acik")}
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-amber-700 font-semibold transition cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Devam Eden: {openCount} (%{ongoingPercentStr})</span>
                </button>

                {rejectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onFilterClick && onFilterClick("reddedildi")}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-700 font-semibold transition cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>Kapatıldı: {rejectedCount} (%{rejectedPercentStr})</span>
                  </button>
                )}
              </div>

              {/* Termin Bilgisi */}
              <div className="flex items-center gap-2 text-slate-400 text-[10px]">
                <span className="flex items-center gap-1 text-indigo-700 font-semibold">
                  <Wrench className="h-3 w-3" /> Düzenleyici {correctiveDays} İş Günü
                </span>
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1 text-teal-700 font-semibold">
                  <ShieldCheck className="h-3 w-3" /> Önleyici {preventiveDays} İş Günü
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DofExecutiveSummaryCard;
