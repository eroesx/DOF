import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  X,
  ChevronRight,
  Search,
  ExternalLink,
  Building2,
  User,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { DofForm } from "../types";

export type StatusCategory = "cozuldu" | "yeni" | "inceleniyor" | "reddedildi";

interface DofPieChartProps {
  completed: number;
  pending: number;
  processing: number;
  rejected: number;
  dofs?: DofForm[];
  activeStatus?: string;
  onSelectStatus?: (statusKey: StatusCategory, statusName: string) => void;
  onSelectDof?: (dof: DofForm) => void;
}

interface ChartDataItem {
  name: string;
  statusKey: StatusCategory;
  value: number;
  color: string;
  hoverColor: string;
}

export const DofPieChart: React.FC<DofPieChartProps> = ({
  completed,
  pending,
  processing,
  rejected,
  dofs = [],
  activeStatus,
  onSelectStatus,
  onSelectDof,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const recordsSectionRef = useRef<HTMLDivElement | null>(null);

  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [activeHovered, setActiveHovered] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusCategory | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");

  const total = completed + pending + processing + rejected;

  // Percentages
  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.round((pending / total) * 100) : 0;
  const processingPct = total > 0 ? Math.round((processing / total) * 100) : 0;
  const rejectedPct = total > 0 ? Math.round((rejected / total) * 100) : 0;

  // Sync with activeStatus prop if passed
  useEffect(() => {
    if (activeStatus && ["cozuldu", "yeni", "inceleniyor", "reddedildi"].includes(activeStatus)) {
      setSelectedStatus(activeStatus as StatusCategory);
    }
  }, [activeStatus]);

  // Handle selecting or toggling status
  const handleToggleStatus = (statusKey: StatusCategory, statusName: string) => {
    if (selectedStatus === statusKey) {
      // Toggle off or keep active
      setSelectedStatus(null);
    } else {
      setSelectedStatus(statusKey);
      setSearchFilter("");
      // Scroll smoothly to records section
      setTimeout(() => {
        if (recordsSectionRef.current) {
          recordsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    }
  };

  // Direct navigation to main table
  const handleOpenInMainTable = (statusKey: StatusCategory, statusName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onSelectStatus) {
      onSelectStatus(statusKey, statusName);
    }
  };

  // D3 Chart Rendering
  useEffect(() => {
    if (!svgRef.current) return;

    // Clear previous SVG contents
    d3.select(svgRef.current).selectAll("*").remove();

    const data: ChartDataItem[] = [
      { name: "Tamamlandı", statusKey: "cozuldu" as StatusCategory, value: completed, color: "#10b981", hoverColor: "#059669" },
      { name: "Bekleyen", statusKey: "yeni" as StatusCategory, value: pending, color: "#3b82f6", hoverColor: "#2563eb" },
      { name: "İnceleniyor", statusKey: "inceleniyor" as StatusCategory, value: processing, color: "#f59e0b", hoverColor: "#d97706" },
      { name: "İptal", statusKey: "reddedildi" as StatusCategory, value: rejected, color: "#ef4444", hoverColor: "#dc2626" },
    ].filter((item) => item.value > 0);

    // If no data, draw gray placeholder
    if (data.length === 0) {
      const svg = d3.select(svgRef.current);
      svg.append("circle").attr("cx", 100).attr("cy", 100).attr("r", 70).attr("fill", "#f1f5f9");
      svg.append("circle").attr("cx", 100).attr("cy", 100).attr("r", 45).attr("fill", "#ffffff");
      svg.append("text")
        .attr("x", 100)
        .attr("y", 104)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", "#94a3b8")
        .attr("font-family", "system-ui, sans-serif")
        .text("Kayıt Yok");
      return;
    }

    const width = 200;
    const height = 200;
    const radius = Math.min(width, height) / 2;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const pie = d3
      .pie<ChartDataItem>()
      .value((d) => d.value)
      .sort(null);

    const arc = d3
      .arc<d3.PieArcDatum<ChartDataItem>>()
      .innerRadius(radius * 0.54)
      .outerRadius((d) => (selectedStatus === d.data.statusKey ? radius * 0.96 : radius * 0.88));

    const arcHover = d3
      .arc<d3.PieArcDatum<ChartDataItem>>()
      .innerRadius(radius * 0.54)
      .outerRadius(radius * 0.98);

    const arcs = svg
      .selectAll(".arc")
      .data(pie(data))
      .enter()
      .append("g")
      .attr("class", "arc");

    // Draw slices
    arcs
      .append("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", (d) => (selectedStatus === d.data.statusKey ? "#0f172a" : "#ffffff"))
      .attr("stroke-width", (d) => (selectedStatus === d.data.statusKey ? "3.5px" : "2.5px"))
      .style("cursor", "pointer")
      .style("transition", "all 0.3s ease")
      .on("mouseover", function (event, d) {
        d3.select(this).transition().duration(180).attr("d", arcHover);
        const pct = total > 0 ? Math.round((d.data.value / total) * 100) : 0;
        setHoveredSlice(`${d.data.name}: ${d.data.value} Adet (%${pct}) - Tıkla ve Listele`);
        setActiveHovered(d.data.name);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).transition().duration(180).attr("d", arc);
        setHoveredSlice(null);
        setActiveHovered(null);
      })
      .on("click", function (event, d) {
        handleToggleStatus(d.data.statusKey, d.data.name);
      });

    // Center summary
    const centerGroup = svg
      .append("g")
      .attr("class", "center-text")
      .style("cursor", "pointer")
      .on("click", () => {
        setSelectedStatus(null);
      });

    centerGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-2px")
      .attr("font-size", "10px")
      .attr("font-weight", "700")
      .attr("fill", "#94a3b8")
      .attr("font-family", "system-ui, sans-serif")
      .text(selectedStatus ? "FİLTRE" : "TOPLAM");

    centerGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "18px")
      .attr("font-size", "22px")
      .attr("font-weight", "800")
      .attr("fill", "#1e293b")
      .attr("font-family", "system-ui, sans-serif")
      .text(
        selectedStatus === "cozuldu"
          ? completed
          : selectedStatus === "yeni"
          ? pending
          : selectedStatus === "inceleniyor"
          ? processing
          : selectedStatus === "reddedildi"
          ? rejected
          : total
      );
  }, [completed, pending, processing, rejected, total, selectedStatus]);

  // Date parsing helper
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "-";
    let date: Date | null = null;
    try {
      if (typeof timestamp.toDate === "function") {
        date = timestamp.toDate();
      } else if (timestamp.seconds !== undefined) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }
    } catch (e) {
      return "-";
    }
    if (!date || isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Filter records corresponding to the selected status category
  const filteredRecords = useMemo(() => {
    if (!selectedStatus || !dofs) return [];

    let list = dofs.filter((d) => {
      const st = (d.status || "").toLowerCase();
      if (selectedStatus === "cozuldu") return st === "cozuldu";
      if (selectedStatus === "yeni") return st === "yeni";
      if (selectedStatus === "inceleniyor") return st === "inceleniyor";
      if (selectedStatus === "reddedildi") return st === "reddedildi" || st === "iptal";
      return false;
    });

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.refNo?.toLowerCase().includes(q) ||
          d.title?.toLowerCase().includes(q) ||
          d.department?.toLowerCase().includes(q) ||
          d.reporterName?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [dofs, selectedStatus, searchFilter]);

  const statusMeta: Record<
    StatusCategory,
    {
      title: string;
      subtitle: string;
      colorClass: string;
      bgClass: string;
      borderClass: string;
      activeRingClass: string;
      badgeClass: string;
      icon: any;
      count: number;
    }
  > = {
    cozuldu: {
      title: "Tamamlandı",
      subtitle: "Çözüme kavuşan ve onaylananlar",
      colorClass: "text-emerald-700",
      bgClass: "bg-emerald-500",
      borderClass: "border-emerald-200",
      activeRingClass: "bg-emerald-50 border-emerald-500 ring-4 ring-emerald-500/20 shadow-md",
      badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200",
      icon: CheckCircle2,
      count: completed,
    },
    yeni: {
      title: "Bekleyen",
      subtitle: "Kuyruktaki yeni bildirimler",
      colorClass: "text-blue-700",
      bgClass: "bg-blue-500",
      borderClass: "border-blue-200",
      activeRingClass: "bg-blue-50 border-blue-500 ring-4 ring-blue-500/20 shadow-md",
      badgeClass: "bg-blue-100 text-blue-800 border border-blue-200",
      icon: Clock,
      count: pending,
    },
    inceleniyor: {
      title: "İnceleniyor",
      subtitle: "İncelenen ve aksiyon alınanlar",
      colorClass: "text-amber-700",
      bgClass: "bg-amber-500",
      borderClass: "border-amber-200",
      activeRingClass: "bg-amber-50 border-amber-500 ring-4 ring-amber-500/20 shadow-md",
      badgeClass: "bg-amber-100 text-amber-800 border border-amber-200",
      icon: AlertCircle,
      count: processing,
    },
    reddedildi: {
      title: "İptal",
      subtitle: "Uygun görülmeyen bildirimler",
      colorClass: "text-rose-700",
      bgClass: "bg-rose-500",
      borderClass: "border-rose-200",
      activeRingClass: "bg-rose-50 border-rose-500 ring-4 ring-rose-500/20 shadow-md",
      badgeClass: "bg-rose-100 text-rose-800 border border-rose-200",
      icon: AlertCircle,
      count: rejected,
    },
  };

  const currentMeta = selectedStatus ? statusMeta[selectedStatus] : null;

  return (
    <div
      ref={containerRef}
      className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-300"
      id="dof-pie-chart-card"
    >
      {/* Kart Üst Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display">
            <TrendingUp className="h-4 w-4 text-indigo-500" /> DÖF Durum Dağılımı (Halka Grafik)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Durum kartlarına veya grafikteki dilimlere tıklayarak ilgili kayıtları anında listeleyebilirsiniz.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedStatus && (
            <button
              onClick={() => setSelectedStatus(null)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-xl transition cursor-pointer flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Filtreyi Kaldır
            </button>
          )}
          <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
            İnteraktif
          </span>
        </div>
      </div>

      {/* Grid: Sol Taraf Metrik Kartları + Sağ Taraf Donut Grafik */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Sol Taraf: Tıklanabilir Durum Kartları */}
        <div className="lg:col-span-7 space-y-3 w-full">
          {/* 1. Tamamlandı */}
          <div
            onClick={() => handleToggleStatus("cozuldu", "Tamamlandı")}
            onMouseEnter={() => setActiveHovered("Tamamlandı")}
            onMouseLeave={() => setActiveHovered(null)}
            className={`p-3.5 rounded-2xl border transition-all duration-300 relative cursor-pointer ${
              selectedStatus === "cozuldu"
                ? statusMeta.cozuldu.activeRingClass
                : activeHovered === "Tamamlandı"
                ? "bg-emerald-50/70 border-emerald-300 shadow-sm scale-[1.01]"
                : "bg-slate-50/50 hover:bg-slate-50/80 border-slate-100/70 hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`p-1.5 rounded-xl border transition-colors shrink-0 ${
                    selectedStatus === "cozuldu" || activeHovered === "Tamamlandı"
                      ? "bg-emerald-500 border-emerald-600 text-white"
                      : "bg-emerald-50 border-emerald-100 text-emerald-600"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">Tamamlandı</span>
                    {selectedStatus === "cozuldu" && (
                      <span className="bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-md animate-pulse">
                        Seçili · Aşağıda Açık ↓
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Çözüme kavuşan ve onaylananlar</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-sm font-bold font-display text-slate-800 block">{completed} Adet</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600">%{completedPct}</span>
                </div>
                {onSelectStatus && (
                  <button
                    onClick={(e) => handleOpenInMainTable("cozuldu", "Tamamlandı", e)}
                    className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/70 transition cursor-pointer"
                    title="Bu durumdaki kayıtları ana DÖF tablosunda aç"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${completedPct}%` }}
              />
            </div>
          </div>

          {/* 2. Bekleyen */}
          <div
            onClick={() => handleToggleStatus("yeni", "Bekleyen")}
            onMouseEnter={() => setActiveHovered("Bekleyen")}
            onMouseLeave={() => setActiveHovered(null)}
            className={`p-3.5 rounded-2xl border transition-all duration-300 relative cursor-pointer ${
              selectedStatus === "yeni"
                ? statusMeta.yeni.activeRingClass
                : activeHovered === "Bekleyen"
                ? "bg-blue-50/70 border-blue-300 shadow-sm scale-[1.01]"
                : "bg-slate-50/50 hover:bg-slate-50/80 border-slate-100/70 hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`p-1.5 rounded-xl border transition-colors shrink-0 ${
                    selectedStatus === "yeni" || activeHovered === "Bekleyen"
                      ? "bg-blue-500 border-blue-600 text-white"
                      : "bg-blue-50 border-blue-100 text-blue-600"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">Bekleyen</span>
                    {selectedStatus === "yeni" && (
                      <span className="bg-blue-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-md animate-pulse">
                        Seçili · Aşağıda Açık ↓
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Kuyruktaki yeni bildirimler</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-sm font-bold font-display text-slate-800 block">{pending} Adet</span>
                  <span className="text-[10px] font-mono font-bold text-blue-600">%{pendingPct}</span>
                </div>
                {onSelectStatus && (
                  <button
                    onClick={(e) => handleOpenInMainTable("yeni", "Bekleyen", e)}
                    className="p-1 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-100/70 transition cursor-pointer"
                    title="Bu durumdaki kayıtları ana DÖF tablosunda aç"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${pendingPct}%` }}
              />
            </div>
          </div>

          {/* 3. İnceleniyor */}
          <div
            onClick={() => handleToggleStatus("inceleniyor", "İnceleniyor")}
            onMouseEnter={() => setActiveHovered("İnceleniyor")}
            onMouseLeave={() => setActiveHovered(null)}
            className={`p-3.5 rounded-2xl border transition-all duration-300 relative cursor-pointer ${
              selectedStatus === "inceleniyor"
                ? statusMeta.inceleniyor.activeRingClass
                : activeHovered === "İnceleniyor"
                ? "bg-amber-50/70 border-amber-300 shadow-sm scale-[1.01]"
                : "bg-slate-50/50 hover:bg-slate-50/80 border-slate-100/70 hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`p-1.5 rounded-xl border transition-colors shrink-0 ${
                    selectedStatus === "inceleniyor" || activeHovered === "İnceleniyor"
                      ? "bg-amber-500 border-amber-600 text-white"
                      : "bg-amber-50 border-amber-100 text-amber-600"
                  }`}
                >
                  <AlertCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">İnceleniyor</span>
                    {selectedStatus === "inceleniyor" && (
                      <span className="bg-amber-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-md animate-pulse">
                        Seçili · Aşağıda Açık ↓
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">İncelenen ve aksiyon alınanlar</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-sm font-bold font-display text-slate-800 block">{processing} Adet</span>
                  <span className="text-[10px] font-mono font-bold text-amber-600">%{processingPct}</span>
                </div>
                {onSelectStatus && (
                  <button
                    onClick={(e) => handleOpenInMainTable("inceleniyor", "İnceleniyor", e)}
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-100/70 transition cursor-pointer"
                    title="Bu durumdaki kayıtları ana DÖF tablosunda aç"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${processingPct}%` }}
              />
            </div>
          </div>

          {/* 4. İptal */}
          <div
            onClick={() => handleToggleStatus("reddedildi", "İptal")}
            onMouseEnter={() => setActiveHovered("İptal")}
            onMouseLeave={() => setActiveHovered(null)}
            className={`p-3.5 rounded-2xl border transition-all duration-300 relative cursor-pointer ${
              selectedStatus === "reddedildi"
                ? statusMeta.reddedildi.activeRingClass
                : activeHovered === "İptal"
                ? "bg-rose-50/70 border-rose-300 shadow-sm scale-[1.01]"
                : "bg-slate-50/50 hover:bg-slate-50/80 border-slate-100/70 hover:border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`p-1.5 rounded-xl border transition-colors shrink-0 ${
                    selectedStatus === "reddedildi" || activeHovered === "İptal"
                      ? "bg-rose-500 border-rose-600 text-white"
                      : "bg-rose-50 border-rose-100 text-rose-600"
                  }`}
                >
                  <AlertCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">İptal</span>
                    {selectedStatus === "reddedildi" && (
                      <span className="bg-rose-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-md animate-pulse">
                        Seçili · Aşağıda Açık ↓
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate">Uygun görülmeyen bildirimler</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-sm font-bold font-display text-slate-800 block">{rejected} Adet</span>
                  <span className="text-[10px] font-mono font-bold text-rose-600">%{rejectedPct}</span>
                </div>
                {onSelectStatus && (
                  <button
                    onClick={(e) => handleOpenInMainTable("reddedildi", "İptal", e)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-100/70 transition cursor-pointer"
                    title="Bu durumdaki kayıtları ana DÖF tablosunda aç"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${rejectedPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Sağ Taraf: D3 Halka Grafik Görselleştirmesi */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-4">
          <div className="relative">
            <svg ref={svgRef} className="mx-auto select-none"></svg>

            {hoveredSlice && (
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-1.5 px-3 rounded-xl shadow-xl pointer-events-none transition-all z-20 whitespace-nowrap">
                {hoveredSlice}
              </div>
            )}
          </div>

          {/* Hızlı Butonlar & Lejant */}
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            <button
              onClick={() => handleToggleStatus("cozuldu", "Tamamlandı")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                selectedStatus === "cozuldu"
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              Tamamlandı ({completed})
            </button>
            <button
              onClick={() => handleToggleStatus("yeni", "Bekleyen")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                selectedStatus === "yeni"
                  ? "bg-blue-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
              Bekleyen ({pending})
            </button>
            <button
              onClick={() => handleToggleStatus("inceleniyor", "İnceleniyor")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                selectedStatus === "inceleniyor"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
              İnceleniyor ({processing})
            </button>
            {rejected > 0 && (
              <button
                onClick={() => handleToggleStatus("reddedildi", "İptal")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  selectedStatus === "reddedildi"
                    ? "bg-rose-500 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                İptal ({rejected})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇİLİ DURUMA AİT KAYITLAR PANELİ (TIKLANDIĞINDA AÇILAN CANLI KAYIT LİSTESİ) */}
      {/* ========================================================================= */}
      {selectedStatus && currentMeta && (
        <div
          ref={recordsSectionRef}
          className="mt-6 pt-5 border-t border-slate-200 animate-fade-in"
          id="dof-pie-chart-records-panel"
        >
          {/* Başlık ve Aksiyon Araç Çubuğu */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2.5">
              <span className={`p-2 rounded-xl text-white ${currentMeta.bgClass}`}>
                <currentMeta.icon className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 font-display">
                    {currentMeta.title} DÖF Kayıtları
                  </h4>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${currentMeta.badgeClass}`}>
                    {filteredRecords.length} / {currentMeta.count} Kayıt
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {currentMeta.subtitle} listelenmektedir.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Hızlı Arama */}
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Kayıtlar içinde ara..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* DÖF Yönetim Tablosunda Aç Butonu */}
              {onSelectStatus && (
                <button
                  onClick={() => handleOpenInMainTable(selectedStatus, currentMeta.title)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0"
                >
                  <span>DÖF Tablosunda Aç</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}

              {/* Kapat Butonu */}
              <button
                onClick={() => setSelectedStatus(null)}
                className="p-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 transition cursor-pointer"
                title="Listeyi Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Kayıt Listesi Görünümü */}
          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
              <Layers className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">
                {searchFilter ? "Arama kriterine uygun kayıt bulunamadı." : `Bu aşamada (${currentMeta.title}) kayıtlı DÖF bulunmuyor.`}
              </p>
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter("")}
                  className="mt-2 text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Aramayı Temizle
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredRecords.map((dof) => (
                <div
                  key={dof.id || dof.refNo}
                  onClick={() => onSelectDof && onSelectDof(dof)}
                  className="p-3.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-2xl shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    {/* Üst Satır: Ref No & Faaliyet Türü */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                        {dof.refNo}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          (dof.type || "").toLowerCase() === "düzeltici"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-cyan-50 text-cyan-700 border border-cyan-200"
                        }`}
                      >
                        {dof.type}
                      </span>
                    </div>

                    {/* Başlık */}
                    <h5 className="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition mb-1">
                      {dof.title}
                    </h5>

                    {/* Açıklama Özeti */}
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                      {dof.description}
                    </p>
                  </div>

                  {/* Alt Bilgiler & Aksiyon */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                    <div className="flex items-center gap-1.5 truncate">
                      <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{dof.department || "Birim Belirtilmemiş"}</span>
                    </div>

                    <div className="flex items-center gap-1 text-indigo-600 font-bold group-hover:translate-x-0.5 transition shrink-0 ml-2">
                      <span>İncele</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alt Bilgi & Hızlı Tablo Bağlantısı */}
          {filteredRecords.length > 0 && onSelectStatus && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Toplam {filteredRecords.length} adet {currentMeta.title.toLowerCase()} kayıt gösteriliyor.</span>
              <button
                onClick={() => handleOpenInMainTable(selectedStatus, currentMeta.title)}
                className="text-indigo-600 hover:text-indigo-800 font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <span>DÖF Yönetim Tablosunda Ayrıntılı Yönet</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
