import React, { useState, useEffect, useRef } from "react";
import {
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Maximize2,
  Minimize2,
  BarChart3,
  PieChart,
  Activity,
  Clock,
  Building2,
  AlertCircle,
  HelpCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { DofForm } from "../types";
import { DofMonthlyDistributionChart } from "./DofMonthlyDistributionChart";
import { DofPieChart } from "./DofPieChart";
import { DofDashboardChart } from "./DofDashboardChart";
import { DofDeadlineSummaryChart } from "./DofDeadlineSummaryChart";
import { DofDeptChart } from "./DofDeptChart";
import { DofUpcomingDeadlines } from "./DofUpcomingDeadlines";

export type ChartId =
  | "monthly_distribution"
  | "status_donut"
  | "status_summary"
  | "deadline_summary"
  | "dept_distribution"
  | "upcoming_deadlines";

export interface ChartConfigItem {
  id: ChartId;
  title: string;
  shortTitle: string;
  description: string;
  defaultColSpan: 1 | 2;
  icon: any;
  category: "genel" | "durum" | "surec";
}

export const ALL_CHARTS_CONFIG: ChartConfigItem[] = [
  {
    id: "monthly_distribution",
    title: "Toplam DÖF Sayıları ve Aylık Dağılım Grafiği",
    shortTitle: "Aylık Dağılım & Trend",
    description: "Aylara göre toplam, tür ve durum bazlı hacim analizi",
    defaultColSpan: 2,
    icon: BarChart3,
    category: "genel",
  },
  {
    id: "status_donut",
    title: "DÖF Durum Dağılımı (Halka Grafik)",
    shortTitle: "Durum Dağılımı (Halka)",
    description: "Tamamlandı, bekleyen, inceleniyor ve iptal kayıtları",
    defaultColSpan: 2,
    icon: PieChart,
    category: "durum",
  },
  {
    id: "status_summary",
    title: "DÖF Durum & Aktivite Grafiği",
    shortTitle: "Durum & Aktivite Çubuk",
    description: "Genel durum özet grafiği ve KPI göstergeleri",
    defaultColSpan: 2,
    icon: Activity,
    category: "durum",
  },
  {
    id: "deadline_summary",
    title: "DÖF Termin ve Süre Özeti",
    shortTitle: "Termin & Süre Özeti",
    description: "Kritik terminler, geciken ve kalan gün analizleri",
    defaultColSpan: 2,
    icon: Clock,
    category: "surec",
  },
  {
    id: "dept_distribution",
    title: "Departman Bazlı DÖF Dağılımı",
    shortTitle: "Departman Dağılımı",
    description: "Bölümler arası uygunsuzluk ve bildirim dağılımı",
    defaultColSpan: 1,
    icon: Building2,
    category: "surec",
  },
  {
    id: "upcoming_deadlines",
    title: "Yaklaşan Terminler ve Kritik Bildirimler",
    shortTitle: "Yaklaşan Terminler",
    description: "Vadesi yaklaşan düzeltici faaliyet listesi",
    defaultColSpan: 1,
    icon: AlertCircle,
    category: "surec",
  },
];

const STORAGE_KEYS = {
  ORDER: "dof_dashboard_charts_order_v2",
  HIDDEN: "dof_dashboard_charts_hidden_v2",
  SPANS: "dof_dashboard_charts_spans_v2",
};

interface DashboardChartsGridProps {
  visibleDofs: DofForm[];
  resolvedCount: number;
  newCount: number;
  reviewCount: number;
  rejectedCount: number;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  setSearchTerm: (term: string) => void;
  setDeptFilter: (dept: string) => void;
  setAdminSubTab: (tab: any) => void;
  handleSelectDof: (dof: DofForm | null) => void;
}

export const DashboardChartsGrid: React.FC<DashboardChartsGridProps> = ({
  visibleDofs,
  resolvedCount,
  newCount,
  reviewCount,
  rejectedCount,
  statusFilter,
  setStatusFilter,
  setSearchTerm,
  setDeptFilter,
  setAdminSubTab,
  handleSelectDof,
}) => {
  // Chart order state (persisted in localStorage)
  const [chartsOrder, setChartsOrder] = useState<ChartId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ORDER);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter valid IDs and append any missing ones
          const validIds = parsed.filter((id): id is ChartId =>
            ALL_CHARTS_CONFIG.some((c) => c.id === id)
          );
          const missingIds = ALL_CHARTS_CONFIG.map((c) => c.id).filter(
            (id) => !validIds.includes(id)
          );
          return [...validIds, ...missingIds];
        }
      }
    } catch (e) {
      console.warn("Error reading charts order from localStorage:", e);
    }
    return ALL_CHARTS_CONFIG.map((c) => c.id);
  });

  // Hidden charts state (persisted in localStorage)
  const [hiddenCharts, setHiddenCharts] = useState<ChartId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HIDDEN);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is ChartId =>
            ALL_CHARTS_CONFIG.some((c) => c.id === id)
          );
        }
      }
    } catch (e) {
      console.warn("Error reading hidden charts from localStorage:", e);
    }
    return [];
  });

  // Custom column spans (1 or 2)
  const [customSpans, setCustomSpans] = useState<Record<ChartId, 1 | 2>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SPANS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Error reading chart spans from localStorage:", e);
    }
    const defaultSpans: Record<string, 1 | 2> = {};
    ALL_CHARTS_CONFIG.forEach((c) => {
      defaultSpans[c.id] = c.defaultColSpan;
    });
    return defaultSpans as Record<ChartId, 1 | 2>;
  });

  // UI state for customization modal / panel
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // Drag & drop state
  const [draggedChartId, setDraggedChartId] = useState<ChartId | null>(null);
  const [dragOverChartId, setDragOverChartId] = useState<ChartId | null>(null);

  // Save to localStorage whenever order, hidden, or spans change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ORDER, JSON.stringify(chartsOrder));
    } catch (e) {
      console.error("Failed to save charts order:", e);
    }
  }, [chartsOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HIDDEN, JSON.stringify(hiddenCharts));
    } catch (e) {
      console.error("Failed to save hidden charts:", e);
    }
  }, [hiddenCharts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SPANS, JSON.stringify(customSpans));
    } catch (e) {
      console.error("Failed to save chart spans:", e);
    }
  }, [customSpans]);

  const showToast = (msg: string) => {
    setNotificationMessage(msg);
    setTimeout(() => {
      setNotificationMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Reorder functions
  const moveChart = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= chartsOrder.length || fromIndex === toIndex) return;
    const newOrder = [...chartsOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setChartsOrder(newOrder);
  };

  const moveChartById = (id: ChartId, direction: "up" | "down") => {
    const currentIndex = chartsOrder.indexOf(id);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    moveChart(currentIndex, targetIndex);
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, id: ChartId) => {
    setDraggedChartId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: ChartId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverChartId !== targetId) {
      setDragOverChartId(targetId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, targetId: ChartId) => {
    e.preventDefault();
    if (dragOverChartId === targetId) {
      setDragOverChartId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: ChartId) => {
    e.preventDefault();
    const sourceId = (e.dataTransfer.getData("text/plain") as ChartId) || draggedChartId;
    if (sourceId && sourceId !== targetId) {
      const fromIndex = chartsOrder.indexOf(sourceId);
      const toIndex = chartsOrder.indexOf(targetId);
      if (fromIndex !== -1 && toIndex !== -1) {
        moveChart(fromIndex, toIndex);
        const itemInfo = ALL_CHARTS_CONFIG.find((c) => c.id === sourceId);
        showToast(`"${itemInfo?.shortTitle || "Grafik"}" yeni konumuna taşındı.`);
      }
    }
    setDraggedChartId(null);
    setDragOverChartId(null);
  };

  const handleDragEnd = () => {
    setDraggedChartId(null);
    setDragOverChartId(null);
  };

  // Toggle visibility of a chart
  const toggleChartVisibility = (id: ChartId) => {
    const isCurrentlyHidden = hiddenCharts.includes(id);
    const item = ALL_CHARTS_CONFIG.find((c) => c.id === id);
    if (isCurrentlyHidden) {
      setHiddenCharts(hiddenCharts.filter((item) => item !== id));
      showToast(`"${item?.shortTitle || "Grafik"}" panoya geri yüklendi.`);
    } else {
      setHiddenCharts([...hiddenCharts, id]);
      showToast(`"${item?.shortTitle || "Grafik"}" gizlendi. "Grafikleri Özelleştir" menüsünden tekrar açabilirsiniz.`);
    }
  };

  const showAllCharts = () => {
    setHiddenCharts([]);
    showToast("Tüm grafikler görünür hale getirildi.");
  };

  const toggleSpan = (id: ChartId) => {
    setCustomSpans((prev) => ({
      ...prev,
      [id]: prev[id] === 2 ? 1 : 2,
    }));
  };

  const resetToDefaultLayout = () => {
    const defaultOrder = ALL_CHARTS_CONFIG.map((c) => c.id);
    const defaultSpans: Record<string, 1 | 2> = {};
    ALL_CHARTS_CONFIG.forEach((c) => {
      defaultSpans[c.id] = c.defaultColSpan;
    });

    setChartsOrder(defaultOrder);
    setHiddenCharts([]);
    setCustomSpans(defaultSpans as Record<ChartId, 1 | 2>);
    showToast("Grafik yerleşimi ve görünürlüğü varsayılan ayarlara sıfırlandı.");
  };

  // Render chart component based on ID
  const renderChartComponent = (id: ChartId) => {
    switch (id) {
      case "monthly_distribution":
        return <DofMonthlyDistributionChart dofs={visibleDofs} />;
      case "status_donut":
        return (
          <DofPieChart
            completed={resolvedCount}
            pending={newCount}
            processing={reviewCount}
            rejected={rejectedCount}
            dofs={visibleDofs}
            activeStatus={statusFilter}
            onSelectStatus={(statusKey) => {
              setStatusFilter(statusKey);
              setSearchTerm("");
              setAdminSubTab("dofs");
              setTimeout(() => {
                window.scrollTo({ top: 350, behavior: "smooth" });
              }, 100);
            }}
            onSelectDof={(dof) => {
              handleSelectDof(dof);
              setAdminSubTab("dofs");
            }}
          />
        );
      case "status_summary":
        return <DofDashboardChart dofs={visibleDofs} />;
      case "deadline_summary":
        return <DofDeadlineSummaryChart dofs={visibleDofs} />;
      case "dept_distribution":
        return (
          <DofDeptChart
            dofs={visibleDofs}
            onSelectDept={(deptName) => {
              setDeptFilter(deptName);
              setSearchTerm("");
              setStatusFilter("all");
              setAdminSubTab("dofs");
            }}
          />
        );
      case "upcoming_deadlines":
        return (
          <DofUpcomingDeadlines
            dofs={visibleDofs}
            onSelectDof={(dof) => {
              handleSelectDof(dof);
              setAdminSubTab("dofs");
            }}
          />
        );
      default:
        return null;
    }
  };

  // Calculate visible charts list in order
  const visibleCharts = chartsOrder.filter((id) => !hiddenCharts.includes(id));

  return (
    <div className="w-full space-y-4" id="dof-dashboard-charts-container">
      {/* ========================================================================= */}
      {/* ÜST GRAFİK KONTROL BAR VE BİLGİLENDİRME (DASHBOARD CHARTS TOOLBAR) */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-3.5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold font-display tracking-tight text-white">
                Dashboard Grafik Paneli
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/20">
                {visibleCharts.length} / {ALL_CHARTS_CONFIG.length} Grafik Aktif
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Grafikleri <strong className="text-indigo-300">sürükleyip bırakarak</strong> sıralayabilir veya istenmeyenleri gizleyebilirsiniz.
            </p>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {hiddenCharts.length > 0 && (
            <button
              onClick={showAllCharts}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 text-indigo-100 transition cursor-pointer flex items-center gap-1 border border-indigo-500/40"
              title="Gizlenen tüm grafikleri göster"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Gizlenenleri Aç ({hiddenCharts.length})</span>
            </button>
          )}

          <button
            onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              isCustomizeOpen
                ? "bg-white text-slate-900 shadow-sm"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{isCustomizeOpen ? "Düzenlemeyi Bitir" : "Grafikleri Özelleştir"}</span>
          </button>
        </div>
      </div>

      {/* Toast Bildirim Kutusu */}
      {notificationMessage && (
        <div className="flex items-center justify-between gap-2 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>{notificationMessage}</span>
          </div>
          <button
            onClick={() => setNotificationMessage(null)}
            className="text-slate-400 hover:text-white transition cursor-pointer p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GRAFİKLERİ ÖZELLEŞTİRME & SIRALAMA PANELİ (EXPANDABLE CUSTOMIZER) */}
      {/* ========================================================================= */}
      {isCustomizeOpen && (
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-inner animate-fade-in space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-2 font-display">
                <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                Grafik Sıralaması ve Görünürlük Ayarları
              </h5>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Aşağıdaki butonlarla grafikleri yukarı/aşağı taşıyabilir, görünürlüklerini açıp kapatabilir veya genişliklerini ayarlayabilirsiniz.
                Değişiklikler otomatik olarak kaydedilir.
              </p>
            </div>
            <button
              onClick={resetToDefaultLayout}
              className="text-[11px] font-bold text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Varsayılana Sıfırla</span>
            </button>
          </div>

          {/* Grafik Öğeleri Listesi */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {chartsOrder.map((chartId, index) => {
              const config = ALL_CHARTS_CONFIG.find((c) => c.id === chartId);
              if (!config) return null;
              const isHidden = hiddenCharts.includes(chartId);
              const currentSpan = customSpans[chartId] || config.defaultColSpan;

              return (
                <div
                  key={chartId}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    isHidden
                      ? "bg-slate-100/70 border-slate-200 text-slate-400 opacity-70"
                      : "bg-white border-slate-200 shadow-xs text-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-bold block truncate text-slate-800">
                          {config.shortTitle}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {config.description}
                        </span>
                      </div>
                    </div>

                    {/* Gizle / Göster Butonu */}
                    <button
                      onClick={() => toggleChartVisibility(chartId)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 ${
                        isHidden
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                      }`}
                      title={isHidden ? "Grafiği Göster" : "Grafiği Gizle"}
                    >
                      {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Alt Kontroller: Sıralama & Genişlik */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    {/* Sıralama Butonları */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveChartById(chartId, "up")}
                        disabled={index === 0}
                        className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title="Yukarı / Öne Taşı"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveChartById(chartId, "down")}
                        disabled={index === chartsOrder.length - 1}
                        className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title="Aşağı / Sona Taşı"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <span className="text-[10px] text-slate-400 ml-1">Sıra: {index + 1}</span>
                    </div>

                    {/* Genişlik Değiştirici */}
                    <button
                      onClick={() => toggleSpan(chartId)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer flex items-center gap-1"
                      title={currentSpan === 2 ? "Tek sütuna düşür" : "Tam genişlik yap (2 sütun)"}
                    >
                      {currentSpan === 2 ? (
                        <>
                          <Minimize2 className="h-2.5 w-2.5" />
                          <span>Tam Genişlik</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-2.5 w-2.5" />
                          <span>Yarım Genişlik</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GİZLENEN GRAFİKLER BİLGİ ŞERİDİ (QUICK RESTORE BAR) */}
      {/* ========================================================================= */}
      {hiddenCharts.length > 0 && !isCustomizeOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-amber-50/70 border border-amber-200/80 p-3 rounded-2xl text-xs text-amber-900">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold flex items-center gap-1 text-amber-800">
              <EyeOff className="h-3.5 w-3.5" /> Gizlenen Grafikler ({hiddenCharts.length}):
            </span>
            {hiddenCharts.map((hid) => {
              const conf = ALL_CHARTS_CONFIG.find((c) => c.id === hid);
              if (!conf) return null;
              return (
                <button
                  key={hid}
                  onClick={() => toggleChartVisibility(hid)}
                  className="inline-flex items-center gap-1 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-900 px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer shadow-2xs"
                  title="Tıklayarak panoya geri ekleyin"
                >
                  <Eye className="h-3 w-3 text-amber-700" />
                  <span>{conf.shortTitle}</span>
                  <span className="text-amber-500 font-normal ml-0.5">+ Göster</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={showAllCharts}
            className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer shrink-0"
          >
            Tümünü Aç
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ANA GRAFİK IZGARASI (GRID WITH DRAG & DROP SUPPORT) */}
      {/* ========================================================================= */}
      {visibleCharts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
          <div className="p-3.5 rounded-2xl bg-indigo-50 text-indigo-600 mb-3">
            <EyeOff className="h-8 w-8" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 font-display">Tüm Grafikler Gizlendi</h4>
          <p className="text-xs text-slate-500 max-w-md mt-1 mb-5">
            Dashboard üzerindeki tüm grafikler gizlenmiş durumdadır. Grafikleri tekrar görüntülemek için aşağıdaki butona tıklayabilirsiniz.
          </p>
          <button
            onClick={showAllCharts}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            <span>Tüm Grafikleri Göster</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="dashboard-charts-grid">
          {visibleCharts.map((chartId, index) => {
            const config = ALL_CHARTS_CONFIG.find((c) => c.id === chartId);
            if (!config) return null;

            const isDraggingThis = draggedChartId === chartId;
            const isDragOverThis = dragOverChartId === chartId && draggedChartId !== chartId;
            const span = customSpans[chartId] || config.defaultColSpan;

            return (
              <div
                key={chartId}
                draggable
                onDragStart={(e) => handleDragStart(e, chartId)}
                onDragOver={(e) => handleDragOver(e, chartId)}
                onDragLeave={(e) => handleDragLeave(e, chartId)}
                onDrop={(e) => handleDrop(e, chartId)}
                onDragEnd={handleDragEnd}
                className={`transition-all duration-300 relative group flex flex-col ${
                  span === 2 ? "lg:col-span-2" : "lg:col-span-1"
                } ${
                  isDraggingThis
                    ? "opacity-40 scale-[0.98] ring-2 ring-indigo-500 rounded-3xl"
                    : isDragOverThis
                    ? "ring-4 ring-indigo-500/40 rounded-3xl bg-indigo-50/10 scale-[1.01]"
                    : ""
                }`}
              >
                {/* Drag-over drop line indicator */}
                {isDragOverThis && (
                  <div className="absolute -top-3 left-0 right-0 h-1.5 bg-indigo-600 rounded-full shadow-md z-30 animate-pulse pointer-events-none" />
                )}

                {/* =============================================================== */}
                {/* GRAFİK ÜST KONTROL ŞERİDİ (DRAG HANDLE & ACTION BUTTONS) */}
                {/* =============================================================== */}
                <div className="w-full bg-slate-50/90 border-t border-l border-r border-slate-200/90 px-4 py-2 rounded-t-3xl flex items-center justify-between text-xs text-slate-600 select-none group-hover:bg-slate-100/90 transition-colors">
                  {/* Sol Taraf: Sürükleme Tutamacı ve Başlık */}
                  <div
                    className="flex items-center gap-2 cursor-grab active:cursor-grabbing grow min-w-0"
                    title="Basılı tutup sürükleyerek grafiğin sırasını değiştirin"
                  >
                    <span className="p-1 rounded-md text-slate-400 group-hover:text-indigo-600 transition">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 truncate font-display">
                      {config.shortTitle}
                    </span>
                    <span className="text-[9px] font-extrabold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.2 rounded-md">
                      #{index + 1}
                    </span>
                  </div>

                  {/* Sağ Taraf: Hızlı Yukarı/Aşağı & Genişlik & Gizle Butonları */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* Yukarı Taşı */}
                    <button
                      onClick={() => moveChartById(chartId, "up")}
                      disabled={index === 0}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-white transition cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                      title="Grafiği yukarı/öne taşı"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>

                    {/* Aşağı Taşı */}
                    <button
                      onClick={() => moveChartById(chartId, "down")}
                      disabled={index === visibleCharts.length - 1}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-white transition cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                      title="Grafiği aşağı/sona taşı"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>

                    {/* Genişlik Değiştir */}
                    <button
                      onClick={() => toggleSpan(chartId)}
                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-white transition cursor-pointer hidden sm:block"
                      title={span === 2 ? "Tek sütuna küçült" : "Tam genişlik yap"}
                    >
                      {span === 2 ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                    </button>

                    {/* Bu Grafiği Gizle */}
                    <button
                      onClick={() => toggleChartVisibility(chartId)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer ml-1"
                      title="Bu grafiği panodan gizle"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Gerçek Grafik Bileşeni */}
                <div className="grow [&>div]:rounded-t-none [&>div]:border-t-0">
                  {renderChartComponent(chartId)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
