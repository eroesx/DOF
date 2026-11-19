import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  AreaChart,
  Area,
} from "recharts";
import {
  Clock,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Sparkles,
  Zap,
  Printer,
  Download,
  X,
  RefreshCw,
} from "lucide-react";
import { DofForm } from "../types";
import { SafeResponsiveContainer } from "./SafeResponsiveContainer";
import { printElementWithStatus } from "../utils/posterExporter";
import {
  computeReportAnalytics,
  captureChartPreviewDataUrl,
  exportSingleChartA4Pdf,
} from "../utils/reportPdfExporter";

interface DofReportChartsProps {
  dofs: DofForm[];
}

export const DofReportCharts: React.FC<DofReportChartsProps> = ({ dofs }) => {
  const {
    totalDofCount,
    completedCount,
    inProgressCount,
    pendingCount,
    rejectedCount,
    avgResolvedDays,
    lowRiskCount,
    midRiskCount,
    highRiskCount,
    completionData,
    durationBrackets,
    scatterData,
    riskDistributionData,
    deptChartData,
    timelineChartData,
  } = computeReportAnalytics(dofs);

  const [printPreviewModal, setPrintPreviewModal] = useState<{
    elementId: string;
    title: string;
    subtitle: string;
    summaryNote?: string;
    orientation: "portrait" | "landscape";
    previewSvgUrl: string | null;
    blockedBySandbox: boolean;
  } | null>(null);
  const [isSingleChartPdfLoading, setIsSingleChartPdfLoading] = useState(false);
  const [singleChartError, setSingleChartError] = useState<string | null>(null);

  const handlePrintChart = async (
    elementId: string,
    title: string,
    orientation: "portrait" | "landscape" = "portrait",
    subtitle: string = "",
    summaryNote?: string
  ) => {
    setSingleChartError(null);
    const result = await printElementWithStatus(
      elementId,
      `DÖF Analiz Grafiği - ${title}`,
      orientation
    );
    if (result.status !== "printed") {
      const previewSvgUrl = captureChartPreviewDataUrl(elementId);
      setPrintPreviewModal({
        elementId,
        title,
        subtitle,
        summaryNote,
        orientation,
        previewSvgUrl,
        blockedBySandbox: result.status === "blocked",
      });
    }
  };

  const printDateStr = new Date().toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const renderChartPrintButton = (
    elementId: string,
    title: string,
    orientation: "portrait" | "landscape" = "portrait",
    subtitle: string = "",
    summaryNote?: string
  ) => (
    <button
      type="button"
      onClick={() => void handlePrintChart(elementId, title, orientation, subtitle, summaryNote)}
      title={`${title} grafiğini A4 olarak yazdır`}
      aria-label={`${title} grafiğini A4 olarak yazdır`}
      className="print:hidden inline-flex items-center justify-center p-2 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition shrink-0 cursor-pointer"
    >
      <Printer className="h-4 w-4" />
    </button>
  );

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

  if (totalDofCount === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl p-16 text-center text-slate-400 min-h-[400px] flex flex-col items-center justify-center">
        <div className="p-4 bg-white border border-slate-100 rounded-full shadow-sm mb-4">
          <Sparkles className="h-8 w-8 text-indigo-500" />
        </div>
        <h3 className="font-semibold text-slate-700 text-lg">Yetersiz Analitik Veri</h3>
        <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
          Sistemde henüz kayıtlı DÖF bildirimi bulunmadığından grafikler oluşturulamadı. Yeni bildirimler ekledikçe bu panel otomatik olarak güncellenecektir.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="dof-advanced-reports">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">TOPLAM BİLDİRİM</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-display font-black text-slate-800 tabular-nums">{totalDofCount}</span>
            <span className="text-[10px] text-slate-400 font-semibold">Adet DÖF</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Sisteme kayıtlı düzeltici ve önleyici faaliyetler.</p>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">TAMAMLANAN (ÇÖZÜLEN)</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-display font-black text-emerald-600 tabular-nums">{completedCount}</span>
            <span className="text-[10px] text-emerald-600 font-mono font-bold tabular-nums">
              %{Math.round((completedCount / totalDofCount) * 100)}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Sorunsuz çözülmüş ve arşive alınmış faaliyetler.</p>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block">AKTİF İŞLEMEDEKİLER</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-display font-black text-amber-600 tabular-nums">{inProgressCount + pendingCount}</span>
            <span className="text-[10px] text-amber-600 font-mono font-bold tabular-nums">
              %{Math.round(((inProgressCount + pendingCount) / totalDofCount) * 100)}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">İşlemde veya ilk değerlendirme sırasındaki kayıtlar.</p>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest block">YÜKSEK RİSKLİ FAALİYETLER</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-display font-black text-rose-600 tabular-nums">{highRiskCount}</span>
            <span className="text-[10px] text-rose-600 font-mono font-bold tabular-nums">
              %{Math.round((highRiskCount / totalDofCount) * 100)}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Kalite yönetimi kapsamında acil önlem alınması gerekenler.</p>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: TAMAMLANMA DURUMU */}
        <div id="chart-completion-status" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
              <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
              <span>{printDateStr}</span>
            </div>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 1. Tamamlanma & Bekleme Durumu
                </h3>
                <p className="text-[10px] text-slate-400">Tamamlanmış ve tamamlanmamış (işlemde, yeni) faaliyetlerin genel oranı</p>
              </div>
              {renderChartPrintButton(
                "chart-completion-status",
                "1. Tamamlanma & Bekleme Durumu",
                "portrait",
                "Tamamlanmış ve işlemdeki faaliyetlerin dağılım oranı",
                `Toplam: ${totalDofCount} • Tamamlandı: ${completedCount} • İşlemde: ${inProgressCount} • Yeni: ${pendingCount} • Red: ${rejectedCount}`
              )}
            </div>
            
            <div className="h-60 w-full relative">
              <SafeResponsiveContainer>
                <PieChart>
                  <Pie
                    data={completionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {completionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...customTooltipStyle} />
                </PieChart>
              </SafeResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TOPLAM</span>
                <span className="text-2xl font-black text-slate-800 font-display tabular-nums">{totalDofCount}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-slate-50 text-[11px]">
            <div className="flex items-center gap-2 p-2 bg-slate-50/50 border border-slate-100 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 block text-[9px] font-bold uppercase">TAMAMLANDI</span>
                <span className="font-extrabold text-slate-800 font-mono tabular-nums">{completedCount} Adet ({Math.round((completedCount/totalDofCount)*100)}%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50/50 border border-slate-100 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 block text-[9px] font-bold uppercase">İŞLEMDE</span>
                <span className="font-extrabold text-slate-800 font-mono tabular-nums">{inProgressCount} Adet ({Math.round((inProgressCount/totalDofCount)*100)}%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50/50 border border-slate-100 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 block text-[9px] font-bold uppercase">YENİ BAŞVURU</span>
                <span className="font-extrabold text-slate-800 font-mono tabular-nums">{pendingCount} Adet ({Math.round((pendingCount/totalDofCount)*100)}%)</span>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50/50 border border-slate-100 rounded-xl">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div className="truncate">
                <span className="text-slate-500 block text-[9px] font-bold uppercase">RED / İPTAL</span>
                <span className="font-extrabold text-slate-800 font-mono tabular-nums">{rejectedCount} Adet ({Math.round((rejectedCount/totalDofCount)*100)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 2: GEREKLİ SÜRE DAĞILIMI */}
        <div id="chart-required-duration" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
              <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
              <span>{printDateStr}</span>
            </div>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <Clock className="h-4 w-4 text-indigo-500" /> 2. DÖF Gerekli / Çözüm Süresi Dağılımı
                </h3>
                <p className="text-[10px] text-slate-400">Kayıtların çözüme ulaşma süreleri ve hedef çalışma sürelerinin dağılımı</p>
              </div>
              {renderChartPrintButton(
                "chart-required-duration",
                "2. DÖF Gerekli / Çözüm Süresi Dağılımı",
                "portrait",
                "Kayıtların çözüme ulaşma ve hedef çalışma sürelerinin dağılımı",
                `Ortalama Çözüm Süresi: ${avgResolvedDays} Gün (Hedef: Düzeltici 7 Gün / Önleyici 14 Gün)`
              )}
            </div>

            <div className="h-60 w-full">
              <SafeResponsiveContainer>
                <BarChart data={durationBrackets}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...customTooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {durationBrackets.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </SafeResponsiveContainer>
            </div>
          </div>

          <div className="bg-indigo-50/40 border border-indigo-100 p-3 rounded-2xl text-[10px] text-indigo-700 font-semibold mt-4">
            💡 <b>Analitik Özet:</b> Düzeltici faaliyetler için standart hedef süre 7 gün, önleyici faaliyetler için ise 14 gündür. Çözülen DÖF'lerin genel ortalama çözüm süresi: <span className="font-mono text-xs font-black tabular-nums">
              {avgResolvedDays} Gün
            </span>
          </div>
        </div>

        {/* CHART 3: RİSK - SÜRE MATRİSİ */}
        <div id="chart-risk-duration-matrix" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm lg:col-span-2">
          <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
            <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
            <span>{printDateStr}</span>
          </div>
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <Zap className="h-4 w-4 text-violet-500" /> 3. Risk - Süre Matrisi (Korelasyon Analizi)
                </h3>
                <p className="text-[10px] text-slate-400">Yatay Eksen: Gerekli Çalışma / Çözüm Süresi (Gün)  |  Dikey Eksen: Yapay Zeka Risk Skoru (1 - 25)</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[9px] font-bold">
                <span className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">Kırmızı: Yüksek Risk</span>
                <span className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">Sarı: Orta Risk</span>
                <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg">Yeşil: Düşük Risk</span>
              </div>
            </div>
            {renderChartPrintButton(
              "chart-risk-duration-matrix",
              "3. Risk - Süre Matrisi",
              "landscape",
              "Yatay Eksen: Çalışma Süresi (Gün) | Dikey Eksen: Risk Skoru (1 - 25)",
              `Toplam ${totalDofCount} kayıt • Yüksek Risk: ${highRiskCount} • Orta Risk: ${midRiskCount} • Düşük Risk: ${lowRiskCount}`
            )}
          </div>

          <div className="h-72 w-full">
            <SafeResponsiveContainer>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="Süre" 
                  unit=" Gün" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  label={{ value: 'Çalışma / Çözüm Süresi (Gün)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name="Risk Skoru" 
                  domain={[0, 25]} 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} 
                  label={{ value: 'Yapay Zeka Risk Derecesi (1-25)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                />
                <ZAxis type="number" range={[100, 100]} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }} 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-[10px] text-slate-200 font-sans shadow-lg max-w-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5 mb-1.5">
                            <span className="font-mono font-bold bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded text-[9px]">{data.refNo}</span>
                            <span className="font-bold truncate">{data.department}</span>
                          </div>
                          <p className="font-bold text-white text-xs truncate">{data.title}</p>
                          <p className="text-slate-400 leading-relaxed">Risk Seviyesi: <span className="text-white font-extrabold">{data.riskLevel} ({data.y} Puan)</span></p>
                          <p className="text-slate-400 leading-relaxed">Çözüm Süresi: <span className="text-white font-extrabold">{data.x} Gün</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="DÖF Kayıtları" data={scatterData}>
                  {scatterData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </SafeResponsiveContainer>
          </div>
        </div>

        {/* CHART 4: RİSK SKORU DAĞILIMI */}
        <div id="chart-risk-scores" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
              <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
              <span>{printDateStr}</span>
            </div>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <AlertTriangle className="h-4 w-4 text-rose-500" /> 4. Yapay Zeka Risk Skoru Dağılımı
                </h3>
                <p className="text-[10px] text-slate-400">Gemini AI tarafından belirlenen risk dağılımları</p>
              </div>
              {renderChartPrintButton(
                "chart-risk-scores",
                "4. Yapay Zeka Risk Skoru Dağılımı",
                "portrait",
                "Otomatik değerlendirme sonucu oluşan risk düzeyi dağılımı",
                `Düşük Risk: ${lowRiskCount} DÖF • Orta Risk: ${midRiskCount} DÖF • Yüksek Risk: ${highRiskCount} DÖF`
              )}
            </div>

            <div className="h-60 w-full">
              <SafeResponsiveContainer>
                <BarChart data={riskDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...customTooltipStyle} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {riskDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </SafeResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="p-2 bg-emerald-50 border border-emerald-100/50 rounded-xl">
              <span className="text-[9px] font-bold text-emerald-600 block uppercase">DÜŞÜK RİSK</span>
              <span className="text-sm font-black text-slate-800 font-mono mt-0.5 block tabular-nums">{lowRiskCount} DÖF</span>
            </div>
            <div className="p-2 bg-amber-50 border border-amber-100/50 rounded-xl">
              <span className="text-[9px] font-bold text-amber-600 block uppercase">ORTA RİSK</span>
              <span className="text-sm font-black text-slate-800 font-mono mt-0.5 block tabular-nums">{midRiskCount} DÖF</span>
            </div>
            <div className="p-2 bg-rose-50 border border-rose-100/50 rounded-xl">
              <span className="text-[9px] font-bold text-rose-600 block uppercase">YÜKSEK RİSK</span>
              <span className="text-sm font-black text-slate-800 font-mono mt-0.5 block tabular-nums">{highRiskCount} DÖF</span>
            </div>
          </div>
        </div>

        {/* CHART 5: BİRİM BAZINDA DÖF */}
        <div id="chart-department-dofs" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
              <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
              <span>{printDateStr}</span>
            </div>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <Building className="h-4 w-4 text-indigo-500" /> 5. Birim Bazında DÖF Dağılımı (Tür Segmentli)
                </h3>
                <p className="text-[10px] text-slate-400">Birim bazında düzeltici ve önleyici faaliyet sayılarının karşılaştırması</p>
              </div>
              {renderChartPrintButton(
                "chart-department-dofs",
                "5. Birim Bazında DÖF Dağılımı",
                "landscape",
                "Birim bazında düzeltici ve önleyici faaliyet sayılarının karşılaştırması",
                deptChartData.length > 0 ? `Listelenen Birim Sayısı: ${deptChartData.length}` : undefined
              )}
            </div>

            <div className="h-60 w-full">
              {deptChartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Building className="h-8 w-8 text-slate-300 mb-1" />
                  <span className="text-xs font-semibold">Birim kaydı bulunamadı</span>
                </div>
              ) : (
                <SafeResponsiveContainer>
                  <BarChart data={deptChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip {...customTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 9, fontWeight: 'bold', paddingTop: 10 }} />
                    <Bar dataKey="Düzeltici Faaliyet" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Önleyici Faaliyet" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </SafeResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl text-[9px] text-slate-500 leading-relaxed mt-4">
            📌 <b>Açıklama:</b> Yüksek performanslı kurumlar önleyici faaliyet oranını artırmayı hedefler. Grafik üzerinden düzeltici (reaktif) ve önleyici (proaktif) dağılımınızı analiz edebilirsiniz.
          </div>
        </div>

        {/* CHART 6: OLUŞTURMA VE ÇÖZÜM TARİHLİ BİTİRME TRENDİ */}
        <div id="chart-timeline-trends" className="bg-white border border-slate-100 p-5 sm:p-6 rounded-3xl shadow-sm lg:col-span-2">
          <div>
            <div className="hidden print:flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200 pb-2 mb-3">
              <span className="font-bold uppercase tracking-wider text-indigo-700">DÖF Analiz & Raporlar • A4 Grafik Çıktısı</span>
              <span>{printDateStr}</span>
            </div>
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display mb-1">
                  <Calendar className="h-4 w-4 text-emerald-500" /> 6. DÖF Oluşturma ve Çözüm Trendi
                </h3>
                <p className="text-[10px] text-slate-400">Aylık bazda yeni açılan düzeltici/önleyici faaliyetler ile başarılı şekilde çözülen faaliyetlerin zaman serisi analizi</p>
              </div>
              {renderChartPrintButton(
                "chart-timeline-trends",
                "6. DÖF Oluşturma ve Çözüm Trendi",
                "landscape",
                "Aylık bazda yeni açılan faaliyetler ile çözülen faaliyetlerin zaman serisi analizi"
              )}
            </div>

            <div className="h-72 w-full">
              <SafeResponsiveContainer>
                <AreaChart data={timelineChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...customTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 9, fontWeight: 'bold', paddingTop: 10 }} />
                  <Area type="monotone" dataKey="Oluşturulan DÖF" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCreated)" />
                  <Area type="monotone" dataKey="Çözülen DÖF" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorResolved)" />
                </AreaChart>
              </SafeResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* Built-in A4 Baskı & PDF Önizleme Modalı (Iframe yazdırma engellendiğinde veya A4 PDF çıktı istendiğinde açılır) */}
      {printPreviewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs print:hidden"
          onClick={() => setPrintPreviewModal(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-indigo-600 rounded-xl shrink-0">
                  <Printer className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold truncate">A4 Baskı & PDF Çıktısı</h4>
                  <p className="text-[11px] text-slate-300 truncate">{printPreviewModal.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrintPreviewModal(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 bg-slate-50">
              {printPreviewModal.blockedBySandbox && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
                  Önizleme penceresi tarayıcı yazdırma iletişim kutusunu kısıtlıyor. Aşağıdan bu grafiği doğrudan{" "}
                  <strong>A4 ({printPreviewModal.orientation === "landscape" ? "Yatay" : "Dikey"}) PDF</strong> olarak indirip yazdırabilirsiniz.
                </div>
              )}

              {singleChartError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 font-medium">
                  {singleChartError}
                </div>
              )}

              {/* A4 Sheet Preview */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-wider text-indigo-700">
                    DÖF Analiz & Raporlar • A4 {printPreviewModal.orientation === "landscape" ? "Yatay" : "Dikey"}
                  </span>
                  <span>{printDateStr}</span>
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900">{printPreviewModal.title}</h5>
                  {printPreviewModal.subtitle && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{printPreviewModal.subtitle}</p>
                  )}
                </div>

                {printPreviewModal.previewSvgUrl ? (
                  <div className="border border-slate-100 rounded-xl p-3 bg-white flex items-center justify-center">
                    <img
                      src={printPreviewModal.previewSvgUrl}
                      alt={printPreviewModal.title}
                      className="w-full max-h-72 object-contain"
                    />
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center text-xs text-slate-400">
                    Grafik önizlemesi A4 PDF çıktısı oluşturulurken eklenecektir.
                  </div>
                )}

                {printPreviewModal.summaryNote && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 font-medium">
                    {printPreviewModal.summaryNote}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setPrintPreviewModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Kapat
              </button>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    void printElementWithStatus(
                      printPreviewModal.elementId,
                      `DÖF Analiz Grafiği - ${printPreviewModal.title}`,
                      printPreviewModal.orientation
                    );
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Yazıcıyla Dene
                </button>
                <button
                  type="button"
                  disabled={isSingleChartPdfLoading}
                  onClick={async () => {
                    setIsSingleChartPdfLoading(true);
                    setSingleChartError(null);
                    try {
                      const ok = await exportSingleChartA4Pdf({
                        elementId: printPreviewModal.elementId,
                        title: printPreviewModal.title,
                        subtitle: printPreviewModal.subtitle,
                        summaryNote: printPreviewModal.summaryNote,
                        orientation: printPreviewModal.orientation,
                      });
                      if (!ok) {
                        setSingleChartError("Tekli grafik A4 PDF dosyası oluşturulamadı.");
                      }
                    } finally {
                      setIsSingleChartPdfLoading(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {isSingleChartPdfLoading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      PDF Hazırlanıyor...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      A4 PDF Olarak İndir
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
