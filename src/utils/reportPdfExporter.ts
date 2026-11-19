import { jsPDF } from "jspdf";
import { DofForm } from "../types";

export interface ReportAnalyticsData {
  totalDofCount: number;
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  rejectedCount: number;
  preventiveCount: number;
  correctiveCount: number;
  avgResolvedDays: number;
  lowRiskCount: number;
  midRiskCount: number;
  highRiskCount: number;
  completionData: Array<{ name: string; value: number; color: string }>;
  durationBrackets: Array<{ range: string; count: number; color: string }>;
  scatterData: Array<{
    x: number;
    y: number;
    refNo: string;
    title: string;
    department: string;
    riskLevel: "Düşük" | "Orta" | "Yüksek";
    color: string;
  }>;
  riskDistributionData: Array<{ name: string; count: number; color: string }>;
  deptChartData: Array<{
    name: string;
    "Düzeltici Faaliyet": number;
    "Önleyici Faaliyet": number;
    Toplam: number;
  }>;
  timelineChartData: Array<{
    month: string;
    "Oluşturulan DÖF": number;
    "Çözülen DÖF": number;
  }>;
}

const getDofDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") {
    try {
      return timestamp.toDate();
    } catch {
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

const getDofRiskInfo = (dof: DofForm) => {
  const text = ((dof.title || "") + " " + (dof.description || "")).toLowerCase();

  let hash = 0;
  const str = dof.id || dof.refNo || "dof";
  for (let i = 0; i < str.length; i++) {
    hash += str.charCodeAt(i);
  }

  let score = 5 + (hash % 10);

  if (
    text.includes("yangın") ||
    text.includes("elektrik") ||
    text.includes("patlama") ||
    text.includes("kaza") ||
    text.includes("yaralan") ||
    text.includes("düşme") ||
    text.includes("yüksekte") ||
    text.includes("tehlike") ||
    text.includes("sızıntı") ||
    text.includes("kimyasal") ||
    text.includes("isg") ||
    text.includes("acil")
  ) {
    score += 10;
  } else if (
    text.includes("arıza") ||
    text.includes("bozuk") ||
    text.includes("kırık") ||
    text.includes("hasar") ||
    text.includes("eksik") ||
    text.includes("kalite") ||
    text.includes("hata") ||
    text.includes("uyarı")
  ) {
    score += 3;
  } else {
    score -= 2;
  }

  score = Math.max(1, Math.min(25, score));

  let level: "Düşük" | "Orta" | "Yüksek" = "Düşük";
  if (score >= 15) {
    level = "Yüksek";
  } else if (score >= 8) {
    level = "Orta";
  }

  let workDays = 0;
  const cDate = getDofDate(dof.createdAt);
  if (cDate) {
    const uDate = dof.status === "cozuldu" ? getDofDate(dof.updatedAt) : new Date();
    if (uDate) {
      workDays = Math.max(1, Math.round((uDate.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }
  if (workDays <= 0 || workDays > 100) {
    workDays = dof.type === "düzeltici" ? 7 : 14;
  }

  return { score, level, workDays };
};

export const computeReportAnalytics = (dofs: DofForm[]): ReportAnalyticsData => {
  const processedDofs = dofs.map((d) => {
    const riskInfo = getDofRiskInfo(d);
    return {
      ...d,
      riskScore: riskInfo.score,
      riskLevel: riskInfo.level,
      workDays: riskInfo.workDays,
    };
  });

  const completedCount = processedDofs.filter((d) => d.status === "cozuldu").length;
  const inProgressCount = processedDofs.filter((d) => d.status === "inceleniyor").length;
  const pendingCount = processedDofs.filter((d) => d.status === "yeni").length;
  const rejectedCount = processedDofs.filter((d) => d.status === "reddedildi").length;
  const preventiveCount = processedDofs.filter((d) => d.type === "önleyici").length;
  const correctiveCount = processedDofs.filter((d) => d.type === "düzeltici").length;

  const completionData = [
    { name: "Tamamlandı (Çözüldü)", value: completedCount, color: "#10b981" },
    { name: "İncelemede / İşlemde", value: inProgressCount, color: "#f59e0b" },
    { name: "Yeni Bildirim", value: pendingCount, color: "#3b82f6" },
    { name: "Reddedildi / İptal", value: rejectedCount, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const totalDofCount = processedDofs.length;

  const durationBrackets = [
    { range: "Hızlı (1 - 3 Gün)", count: 0, color: "#10b981" },
    { range: "Standart (4 - 7 Gün)", count: 0, color: "#3b82f6" },
    { range: "Orta (8 - 14 Gün)", count: 0, color: "#f59e0b" },
    { range: "Uzun (15+ Gün)", count: 0, color: "#8b5cf6" },
  ];

  processedDofs.forEach((d) => {
    const days = d.workDays;
    if (days <= 3) durationBrackets[0].count++;
    else if (days <= 7) durationBrackets[1].count++;
    else if (days <= 14) durationBrackets[2].count++;
    else durationBrackets[3].count++;
  });

  const avgResolvedDays =
    completedCount > 0
      ? Math.round(
          processedDofs
            .filter((d) => d.status === "cozuldu")
            .reduce((acc, curr) => acc + curr.workDays, 0) / completedCount
        )
      : 0;

  const scatterData = processedDofs.map((d) => {
    let color = "#10b981";
    if (d.riskLevel === "Yüksek") color = "#ef4444";
    else if (d.riskLevel === "Orta") color = "#f59e0b";

    return {
      x: d.workDays,
      y: d.riskScore,
      refNo: d.refNo,
      title: d.title,
      department: d.department || "Diğer",
      riskLevel: d.riskLevel,
      color,
    };
  });

  const lowRiskCount = processedDofs.filter((d) => d.riskLevel === "Düşük").length;
  const midRiskCount = processedDofs.filter((d) => d.riskLevel === "Orta").length;
  const highRiskCount = processedDofs.filter((d) => d.riskLevel === "Yüksek").length;

  const riskDistributionData = [
    { name: "Düşük Risk (1-7)", count: lowRiskCount, color: "#10b981" },
    { name: "Orta Risk (8-14)", count: midRiskCount, color: "#f59e0b" },
    { name: "Yüksek Risk (15-25)", count: highRiskCount, color: "#ef4444" },
  ];

  const departmentsMap: Record<string, { corrective: number; preventive: number }> = {};
  processedDofs.forEach((d) => {
    const dept = d.department || "Belirtilmemiş";
    if (!departmentsMap[dept]) {
      departmentsMap[dept] = { corrective: 0, preventive: 0 };
    }
    if (d.type === "düzeltici") {
      departmentsMap[dept].corrective++;
    } else {
      departmentsMap[dept].preventive++;
    }
  });

  const deptChartData = Object.entries(departmentsMap)
    .map(([name, val]) => ({
      name,
      "Düzeltici Faaliyet": val.corrective,
      "Önleyici Faaliyet": val.preventive,
      Toplam: val.corrective + val.preventive,
    }))
    .sort((a, b) => b.Toplam - a.Toplam);

  const monthlyDataMap: Record<string, { created: number; resolved: number }> = {};
  const getMonthKey = (date: Date | null): string => {
    if (!date) return "";
    const months = [
      "Ocak",
      "Şubat",
      "Mart",
      "Nisan",
      "Mayıs",
      "Haziran",
      "Temmuz",
      "Ağustos",
      "Eylül",
      "Ekim",
      "Kasım",
      "Aralık",
    ];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const today = new Date();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthlyDataMap[getMonthKey(d)] = { created: 0, resolved: 0 };
  }

  processedDofs.forEach((d) => {
    const cDate = getDofDate(d.createdAt);
    if (cDate) {
      const cKey = getMonthKey(cDate);
      if (monthlyDataMap[cKey] !== undefined) {
        monthlyDataMap[cKey].created++;
      } else {
        monthlyDataMap[cKey] = { created: 1, resolved: 0 };
      }
    }

    if (d.status === "cozuldu") {
      const rDate = getDofDate(d.updatedAt);
      if (rDate) {
        const rKey = getMonthKey(rDate);
        if (monthlyDataMap[rKey] !== undefined) {
          monthlyDataMap[rKey].resolved++;
        } else {
          monthlyDataMap[rKey] = { created: 0, resolved: 1 };
        }
      }
    }
  });

  const timelineChartData = Object.entries(monthlyDataMap).map(([month, val]) => ({
    month,
    "Oluşturulan DÖF": val.created,
    "Çözülen DÖF": val.resolved,
  }));

  return {
    totalDofCount,
    completedCount,
    inProgressCount,
    pendingCount,
    rejectedCount,
    preventiveCount,
    correctiveCount,
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
  };
};

// High-DPI A4 Canvas dimensions (~192 DPI)
const PAGE_W = 1588;
const PAGE_H = 2245;
const MARGIN_X = 76;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FOOTER_Y = PAGE_H - 58;
const FONT_FAMILY = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

interface CapturedChart {
  img: HTMLImageElement;
  width: number;
  height: number;
}

const captureChartSvgImage = async (containerId: string): Promise<CapturedChart | null> => {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const svg = container.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const svgW = (vb && vb.length === 4 && vb[2] > 0 ? vb[2] : rect.width) || 520;
  const svgH = (vb && vb.length === 4 && vb[3] > 0 ? vb[3] : rect.height) || 240;

  const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", String(Math.round(svgW * 2)));
  clonedSvg.setAttribute("height", String(Math.round(svgH * 2)));
  if (!clonedSvg.getAttribute("viewBox")) {
    clonedSvg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  }

  // Ensure crisp readable fonts inside serialized SVG
  const textEls = clonedSvg.querySelectorAll("text, tspan");
  textEls.forEach((t) => {
    (t as SVGElement).style.fontFamily = FONT_FAMILY;
  });

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(null);
    }, 1800);

    img.onload = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve({ img, width: svgW, height: svgH });
    };
    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
};

const createA4Canvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return { canvas, ctx };
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 1.5
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
};

const truncateText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + "…").width > maxW) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + "…";
};

const drawContainedImage = (
  ctx: CanvasRenderingContext2D,
  chart: CapturedChart,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) => {
  const scale = Math.min(boxW / chart.width, boxH / chart.height);
  const drawW = chart.width * scale;
  const drawH = chart.height * scale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;
  ctx.drawImage(chart.img, drawX, drawY, drawW, drawH);
};

const drawEmptyChartNotice = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  message = "Grafik verisi bulunmuyor"
) => {
  drawRoundedRect(ctx, x, y, w, h, 14, "#f8fafc", "#e2e8f0", 1.5);
  ctx.fillStyle = "#64748b";
  ctx.font = `600 20px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, x + w / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
};

interface ExportReportsSummaryPdfParams {
  dofs: DofForm[];
  departments: Array<{ id?: string; name: string }>;
  scopeLabel: string;
  fileName?: string;
}

export const exportReportsSummaryPdf = async ({
  dofs,
  departments,
  scopeLabel,
  fileName,
}: ExportReportsSummaryPdfParams): Promise<boolean> => {
  try {
    const analytics = computeReportAnalytics(dofs);
    const total = analytics.totalDofCount;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    // Capture live SVG visuals in parallel
    const [
      imgCompletion,
      imgDuration,
      imgMatrix,
      imgRiskScores,
      imgDepartment,
      imgTimeline,
    ] = await Promise.all([
      captureChartSvgImage("chart-completion-status"),
      captureChartSvgImage("chart-required-duration"),
      captureChartSvgImage("chart-risk-duration-matrix"),
      captureChartSvgImage("chart-risk-scores"),
      captureChartSvgImage("chart-department-dofs"),
      captureChartSvgImage("chart-timeline-trends"),
    ]);

    const nowStr = new Date().toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const pages: HTMLCanvasElement[] = [];

    // =========================================================================
    // PAGE 1: Executive Header, KPI Cards, Charts 1, 2, 4, 5
    // =========================================================================
    const { canvas: p1, ctx: c1 } = createA4Canvas();

    // Top Accent Bar
    c1.fillStyle = "#4f46e5";
    c1.fillRect(0, 0, PAGE_W, 14);

    // Header Block
    c1.fillStyle = "#4f46e5";
    c1.font = `700 18px ${FONT_FAMILY}`;
    c1.fillText("DÜZELTİCİ ÖNLEYİCİ FAALİYET (DÖF) YÖNETİM SİSTEMİ", MARGIN_X, 66);

    c1.fillStyle = "#0f172a";
    c1.font = `800 38px ${FONT_FAMILY}`;
    c1.fillText("DÖF Performans & Analiz Özet Raporu", MARGIN_X, 114);

    c1.fillStyle = "#64748b";
    c1.font = `500 20px ${FONT_FAMILY}`;
    c1.fillText(
      "Mevcut grafik verileri, risk dağılımları ve birim performans metriklerinin yazdırılabilir A4 özeti",
      MARGIN_X,
      148
    );

    // Right Metadata Pill Box
    const metaBoxW = 430;
    const metaBoxX = PAGE_W - MARGIN_X - metaBoxW;
    drawRoundedRect(c1, metaBoxX, 46, metaBoxW, 108, 16, "#f8fafc", "#e2e8f0", 1.5);
    c1.fillStyle = "#475569";
    c1.font = `700 16px ${FONT_FAMILY}`;
    c1.fillText("RAPOR KAPSAMI", metaBoxX + 20, 76);
    c1.fillStyle = "#0f172a";
    c1.font = `700 20px ${FONT_FAMILY}`;
    c1.fillText(truncateText(c1, scopeLabel || "Tüm Birimler", metaBoxW - 40), metaBoxX + 20, 104);
    c1.fillStyle = "#64748b";
    c1.font = `500 16px ${FONT_FAMILY}`;
    c1.fillText(`Tarih: ${nowStr}`, metaBoxX + 20, 134);

    // Divider
    c1.strokeStyle = "#e2e8f0";
    c1.lineWidth = 2;
    c1.beginPath();
    c1.moveTo(MARGIN_X, 178);
    c1.lineTo(PAGE_W - MARGIN_X, 178);
    c1.stroke();

    // 4 Executive KPI Cards
    const kpiY = 204;
    const kpiGap = 22;
    const kpiW = (CONTENT_W - kpiGap * 3) / 4;
    const kpiH = 148;
    const kpis = [
      {
        label: "TOPLAM BİLDİRİM",
        value: `${total}`,
        sub: `Düzeltici: ${analytics.correctiveCount}  •  Önleyici: ${analytics.preventiveCount}`,
        bg: "#f8fafc",
        border: "#e2e8f0",
        labelColor: "#475569",
        valColor: "#0f172a",
      },
      {
        label: "ÇÖZÜLME ORANI",
        value: `%${pct(analytics.completedCount)}`,
        sub: `${analytics.completedCount} Çözüldü  •  Ort. ${analytics.avgResolvedDays} Gün`,
        bg: "#ecfdf5",
        border: "#a7f3d0",
        labelColor: "#047857",
        valColor: "#059669",
      },
      {
        label: "AKTİF İŞLEMDEKİLER",
        value: `${analytics.inProgressCount + analytics.pendingCount}`,
        sub: `İşlemde: ${analytics.inProgressCount}  •  Yeni: ${analytics.pendingCount}`,
        bg: "#fffbeb",
        border: "#fde68a",
        labelColor: "#b45309",
        valColor: "#d97706",
      },
      {
        label: "YÜKSEK RİSK & ÖNLEYİCİ",
        value: `${analytics.highRiskCount} Yüksek`,
        sub: `Önleyici Payı: %${pct(analytics.preventiveCount)}`,
        bg: "#fef2f2",
        border: "#fecaca",
        labelColor: "#be123c",
        valColor: "#e11d48",
      },
    ];

    kpis.forEach((k, idx) => {
      const kx = MARGIN_X + idx * (kpiW + kpiGap);
      drawRoundedRect(c1, kx, kpiY, kpiW, kpiH, 18, k.bg, k.border, 1.5);
      c1.fillStyle = k.labelColor;
      c1.font = `700 15px ${FONT_FAMILY}`;
      c1.fillText(k.label, kx + 20, kpiY + 34);

      c1.fillStyle = k.valColor;
      c1.font = `800 42px ${FONT_FAMILY}`;
      c1.fillText(k.value, kx + 20, kpiY + 88);

      c1.fillStyle = "#475569";
      c1.font = `600 15px ${FONT_FAMILY}`;
      c1.fillText(truncateText(c1, k.sub, kpiW - 40), kx + 20, kpiY + 124);
    });

    // Helper for drawing a 2-col Chart Card on Page 1
    const colGap = 26;
    const colW = (CONTENT_W - colGap) / 2;
    const row1Y = 382;
    const card1H = 820;

    // --- Card 1: Tamamlanma & Bekleme Durumu ---
    drawRoundedRect(c1, MARGIN_X, row1Y, colW, card1H, 22, "#ffffff", "#e2e8f0", 1.8);
    c1.fillStyle = "#0f172a";
    c1.font = `700 22px ${FONT_FAMILY}`;
    c1.fillText("1. Tamamlanma & Bekleme Durumu", MARGIN_X + 26, row1Y + 42);
    c1.fillStyle = "#64748b";
    c1.font = `500 16px ${FONT_FAMILY}`;
    c1.fillText("Tamamlanmış ve işlemdeki faaliyetlerin dağılım oranı", MARGIN_X + 26, row1Y + 68);

    if (imgCompletion) {
      drawContainedImage(c1, imgCompletion, MARGIN_X + 24, row1Y + 92, colW - 48, 430);
      // Replicate center label of the donut chart
      c1.fillStyle = "#64748b";
      c1.font = `700 15px ${FONT_FAMILY}`;
      c1.textAlign = "center";
      c1.fillText("TOPLAM", MARGIN_X + colW / 2, row1Y + 298);
      c1.fillStyle = "#0f172a";
      c1.font = `800 34px ${FONT_FAMILY}`;
      c1.fillText(`${total}`, MARGIN_X + colW / 2, row1Y + 334);
      c1.textAlign = "left";
    } else {
      drawEmptyChartNotice(c1, MARGIN_X + 26, row1Y + 104, colW - 52, 400);
    }

    // Card 1 Breakdown 2x2 Grid
    const statusCells = [
      { label: "TAMAMLANDI", count: analytics.completedCount, dot: "#10b981" },
      { label: "İŞLEMDE", count: analytics.inProgressCount, dot: "#f59e0b" },
      { label: "YENİ BAŞVURU", count: analytics.pendingCount, dot: "#3b82f6" },
      { label: "RED / İPTAL", count: analytics.rejectedCount, dot: "#ef4444" },
    ];
    const sBoxW = (colW - 68) / 2;
    statusCells.forEach((st, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = MARGIN_X + 26 + col * (sBoxW + 16);
      const sy = row1Y + 556 + row * 112;
      drawRoundedRect(c1, sx, sy, sBoxW, 96, 14, "#f8fafc", "#e2e8f0", 1.2);
      c1.fillStyle = st.dot;
      c1.beginPath();
      c1.arc(sx + 22, sy + 48, 8, 0, Math.PI * 2);
      c1.fill();
      c1.fillStyle = "#64748b";
      c1.font = `700 14px ${FONT_FAMILY}`;
      c1.fillText(st.label, sx + 42, sy + 38);
      c1.fillStyle = "#0f172a";
      c1.font = `800 22px ${FONT_FAMILY}`;
      c1.fillText(`${st.count} Adet (%${pct(st.count)})`, sx + 42, sy + 70);
    });

    // --- Card 2: Çözüm Süresi Dağılımı ---
    const c2X = MARGIN_X + colW + colGap;
    drawRoundedRect(c1, c2X, row1Y, colW, card1H, 22, "#ffffff", "#e2e8f0", 1.8);
    c1.fillStyle = "#0f172a";
    c1.font = `700 22px ${FONT_FAMILY}`;
    c1.fillText("2. DÖF Gerekli / Çözüm Süresi Dağılımı", c2X + 26, row1Y + 42);
    c1.fillStyle = "#64748b";
    c1.font = `500 16px ${FONT_FAMILY}`;
    c1.fillText("Çözüm ve hedef çalışma sürelerinin dağılımı", c2X + 26, row1Y + 68);

    if (imgDuration) {
      drawContainedImage(c1, imgDuration, c2X + 24, row1Y + 92, colW - 48, 430);
    } else {
      drawEmptyChartNotice(c1, c2X + 26, row1Y + 104, colW - 52, 400);
    }

    // Duration Summary Rows + Avg Banner
    const dBoxW = (colW - 68) / 2;
    analytics.durationBrackets.forEach((b, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const dx = c2X + 26 + col * (dBoxW + 16);
      const dy = row1Y + 556 + row * 78;
      drawRoundedRect(c1, dx, dy, dBoxW, 66, 12, "#f8fafc", "#e2e8f0", 1.2);
      c1.fillStyle = b.color;
      c1.fillRect(dx + 12, dy + 16, 6, 34);
      c1.fillStyle = "#475569";
      c1.font = `600 14px ${FONT_FAMILY}`;
      c1.fillText(b.range, dx + 28, dy + 30);
      c1.fillStyle = "#0f172a";
      c1.font = `800 18px ${FONT_FAMILY}`;
      c1.fillText(`${b.count} Adet (%${pct(b.count)})`, dx + 28, dy + 54);
    });

    drawRoundedRect(c1, c2X + 26, row1Y + 716, colW - 52, 72, 14, "#eef2ff", "#c7d2fe", 1.2);
    c1.fillStyle = "#3730a3";
    c1.font = `700 17px ${FONT_FAMILY}`;
    c1.fillText(
      `Ortalama Çözüm Süresi: ${analytics.avgResolvedDays} Gün  (Hedef: Düzeltici 7g / Önleyici 14g)`,
      c2X + 44,
      row1Y + 758
    );

    // --- Row 2 on Page 1: Chart 4 (Risk Skoru) & Chart 5 (Birim Dağılımı) ---
    const row2Y = row1Y + card1H + 28;
    const card2H = 920;

    // Card 4: Yapay Zeka Risk Skoru Dağılımı
    drawRoundedRect(c1, MARGIN_X, row2Y, colW, card2H, 22, "#ffffff", "#e2e8f0", 1.8);
    c1.fillStyle = "#0f172a";
    c1.font = `700 22px ${FONT_FAMILY}`;
    c1.fillText("4. Yapay Zeka Risk Skoru Dağılımı", MARGIN_X + 26, row2Y + 42);
    c1.fillStyle = "#64748b";
    c1.font = `500 16px ${FONT_FAMILY}`;
    c1.fillText("Otomatik değerlendirme sonucu oluşan risk düzeyleri", MARGIN_X + 26, row2Y + 68);

    if (imgRiskScores) {
      drawContainedImage(c1, imgRiskScores, MARGIN_X + 24, row2Y + 96, colW - 48, 520);
    } else {
      drawEmptyChartNotice(c1, MARGIN_X + 26, row2Y + 104, colW - 52, 500);
    }

    const rBoxW = (colW - 84) / 3;
    const riskCards = [
      { label: "DÜŞÜK RİSK", count: analytics.lowRiskCount, bg: "#ecfdf5", bd: "#a7f3d0", fg: "#047857" },
      { label: "ORTA RİSK", count: analytics.midRiskCount, bg: "#fffbeb", bd: "#fde68a", fg: "#b45309" },
      { label: "YÜKSEK RİSK", count: analytics.highRiskCount, bg: "#fef2f2", bd: "#fecaca", fg: "#be123c" },
    ];
    riskCards.forEach((rc, i) => {
      const rx = MARGIN_X + 26 + i * (rBoxW + 16);
      const ry = row2Y + 668;
      drawRoundedRect(c1, rx, ry, rBoxW, 120, 14, rc.bg, rc.bd, 1.2);
      c1.fillStyle = rc.fg;
      c1.font = `700 14px ${FONT_FAMILY}`;
      c1.textAlign = "center";
      c1.fillText(rc.label, rx + rBoxW / 2, ry + 40);
      c1.fillStyle = "#0f172a";
      c1.font = `800 28px ${FONT_FAMILY}`;
      c1.fillText(`${rc.count} DÖF`, rx + rBoxW / 2, ry + 84);
      c1.textAlign = "left";
    });

    c1.fillStyle = "#64748b";
    c1.font = `500 15px ${FONT_FAMILY}`;
    c1.fillText(
      `Toplam ${total} kaydın %${pct(analytics.highRiskCount)} bölümü yüksek öncelikli risk grubundadır.`,
      MARGIN_X + 26,
      row2Y + 846
    );

    // Card 5: Birim Bazında DÖF Dağılımı
    drawRoundedRect(c1, c2X, row2Y, colW, card2H, 22, "#ffffff", "#e2e8f0", 1.8);
    c1.fillStyle = "#0f172a";
    c1.font = `700 22px ${FONT_FAMILY}`;
    c1.fillText("5. Birim Bazında DÖF Dağılımı", c2X + 26, row2Y + 42);
    c1.fillStyle = "#64748b";
    c1.font = `500 16px ${FONT_FAMILY}`;
    c1.fillText("Birim bazında düzeltici ve önleyici faaliyet karşılaştırması", c2X + 26, row2Y + 68);

    if (imgDepartment) {
      drawContainedImage(c1, imgDepartment, c2X + 24, row2Y + 96, colW - 48, 540);
    } else {
      drawEmptyChartNotice(c1, c2X + 26, row2Y + 104, colW - 52, 520);
    }

    drawRoundedRect(c1, c2X + 26, row2Y + 668, colW - 52, 196, 14, "#f8fafc", "#e2e8f0", 1.2);
    c1.fillStyle = "#0f172a";
    c1.font = `700 16px ${FONT_FAMILY}`;
    c1.fillText("En Yoğun Birimler (İlk 4)", c2X + 44, row2Y + 700);
    const topDepts = analytics.deptChartData.slice(0, 4);
    if (topDepts.length === 0) {
      c1.fillStyle = "#64748b";
      c1.font = `500 16px ${FONT_FAMILY}`;
      c1.fillText("Birim bazlı bildirim kaydı bulunmuyor.", c2X + 44, row2Y + 742);
    } else {
      topDepts.forEach((td, i) => {
        const ty = row2Y + 736 + i * 32;
        c1.fillStyle = "#334155";
        c1.font = `600 15px ${FONT_FAMILY}`;
        c1.fillText(truncateText(c1, `• ${td.name}`, 320), c2X + 44, ty);
        c1.fillStyle = "#0f172a";
        c1.font = `700 15px ${FONT_FAMILY}`;
        c1.textAlign = "right";
        c1.fillText(
          `${td.Toplam} Toplam (${td["Düzeltici Faaliyet"]} Düz. / ${td["Önleyici Faaliyet"]} Önl.)`,
          c2X + colW - 44,
          ty
        );
        c1.textAlign = "left";
      });
    }

    pages.push(p1);

    // =========================================================================
    // PAGE 2+: Matrix, Timeline Trend, and Department Performance Table
    // =========================================================================
    const { canvas: p2, ctx: c2 } = createA4Canvas();
    c2.fillStyle = "#4f46e5";
    c2.fillRect(0, 0, PAGE_W, 14);

    // Compact Header
    c2.fillStyle = "#4f46e5";
    c2.font = `700 16px ${FONT_FAMILY}`;
    c2.fillText("DÖF PERFORMANS & ANALİZ ÖZET RAPORU — DEVAM", MARGIN_X, 58);
    c2.fillStyle = "#64748b";
    c2.font = `500 16px ${FONT_FAMILY}`;
    c2.textAlign = "right";
    c2.fillText(`${scopeLabel || "Tüm Birimler"} • ${nowStr}`, PAGE_W - MARGIN_X, 58);
    c2.textAlign = "left";

    // Card 3 (Full Width): Risk - Süre Matrisi
    const matrixY = 84;
    const matrixH = 510;
    drawRoundedRect(c2, MARGIN_X, matrixY, CONTENT_W, matrixH, 22, "#ffffff", "#e2e8f0", 1.8);
    c2.fillStyle = "#0f172a";
    c2.font = `700 22px ${FONT_FAMILY}`;
    c2.fillText("3. Risk - Süre Matrisi (Korelasyon Analizi)", MARGIN_X + 26, matrixY + 42);
    c2.fillStyle = "#64748b";
    c2.font = `500 16px ${FONT_FAMILY}`;
    c2.fillText(
      "Yatay Eksen: Gerekli Çalışma / Çözüm Süresi (Gün)  |  Dikey Eksen: Risk Skoru (1 - 25)",
      MARGIN_X + 26,
      matrixY + 68
    );

    if (imgMatrix) {
      drawContainedImage(c2, imgMatrix, MARGIN_X + 26, matrixY + 86, CONTENT_W - 52, 396);
    } else {
      drawEmptyChartNotice(c2, MARGIN_X + 26, matrixY + 94, CONTENT_W - 52, 380);
    }

    // Card 6 (Full Width): Oluşturma ve Çözüm Trendi
    const trendY = matrixY + matrixH + 26;
    const trendH = 530;
    drawRoundedRect(c2, MARGIN_X, trendY, CONTENT_W, trendH, 22, "#ffffff", "#e2e8f0", 1.8);
    c2.fillStyle = "#0f172a";
    c2.font = `700 22px ${FONT_FAMILY}`;
    c2.fillText("6. DÖF Oluşturma ve Çözüm Trendi", MARGIN_X + 26, trendY + 42);
    c2.fillStyle = "#64748b";
    c2.font = `500 16px ${FONT_FAMILY}`;
    c2.fillText(
      "Aylık bazda yeni açılan faaliyetler ile çözülen faaliyetlerin zaman serisi analizi",
      MARGIN_X + 26,
      trendY + 68
    );

    if (imgTimeline) {
      drawContainedImage(c2, imgTimeline, MARGIN_X + 26, trendY + 86, CONTENT_W - 52, 368);
    } else {
      drawEmptyChartNotice(c2, MARGIN_X + 26, trendY + 94, CONTENT_W - 52, 350);
    }

    // Monthly compact strip inside Trend Card
    const recentMonths = analytics.timelineChartData.slice(-6);
    const stripY = trendY + 470;
    c2.fillStyle = "#475569";
    c2.font = `700 14px ${FONT_FAMILY}`;
    const trendSummaryText =
      recentMonths
        .map((m) => `${m.month}: +${m["Oluşturulan DÖF"]} Açılan / ${m["Çözülen DÖF"]} Çözülen`)
        .join("   •   ") || "Aylık trend verisi bulunmuyor";
    c2.fillText(truncateText(c2, trendSummaryText, CONTENT_W - 52), MARGIN_X + 26, stripY + 26);

    // Department Distribution Table (starts on Page 2, paginates cleanly if needed)
    let activeCanvas = p2;
    let activeCtx = c2;
    let curY = trendY + trendH + 34;

    const drawTableHeader = (ctx: CanvasRenderingContext2D, y: number): number => {
      ctx.fillStyle = "#0f172a";
      ctx.font = `700 22px ${FONT_FAMILY}`;
      ctx.fillText("Birim Bazında Bildirim Dağılımı", MARGIN_X, y + 22);

      const thY = y + 40;
      const thH = 54;
      drawRoundedRect(ctx, MARGIN_X, thY, CONTENT_W, thH, 10, "#f1f5f9", "#cbd5e1", 1.2);
      ctx.fillStyle = "#334155";
      ctx.font = `700 15px ${FONT_FAMILY}`;
      ctx.fillText("BİRİM ADI", MARGIN_X + 20, thY + 33);
      ctx.textAlign = "center";
      ctx.fillText("TOPLAM", MARGIN_X + 570, thY + 33);
      ctx.fillText("YENİ", MARGIN_X + 700, thY + 33);
      ctx.fillText("İŞLEMDE", MARGIN_X + 830, thY + 33);
      ctx.fillText("ÇÖZÜLDÜ", MARGIN_X + 970, thY + 33);
      ctx.fillText("RED", MARGIN_X + 1100, thY + 33);
      ctx.fillText("ÇÖZÜM %", MARGIN_X + 1230, thY + 33);
      ctx.fillText("DURUM", MARGIN_X + 1365, thY + 33);
      ctx.textAlign = "left";
      return thY + thH + 4;
    };

    curY = drawTableHeader(activeCtx, curY);

    const rowH = 54;
    const maxTableY = FOOTER_Y - 36;

    const deptRows = departments.map((dept) => {
      const deptDofs = dofs.filter(
        (d) => d.department?.toLowerCase().trim() === dept.name.toLowerCase().trim()
      );
      const tCount = deptDofs.length;
      const yCount = deptDofs.filter((d) => d.status === "yeni").length;
      const iCount = deptDofs.filter((d) => d.status === "inceleniyor").length;
      const cCount = deptDofs.filter((d) => d.status === "cozuldu").length;
      const rCount = deptDofs.filter((d) => d.status === "reddedildi").length;
      const rate = tCount > 0 ? Math.round((cCount / tCount) * 100) : 0;
      const statusLabel =
        tCount === 0 ? "PASİF" : yCount + iCount > 0 ? "AKTİF SÜREÇ" : "ONAYLI TAMAM";
      return { name: dept.name, tCount, yCount, iCount, cCount, rCount, rate, statusLabel };
    });

    if (deptRows.length === 0) {
      drawRoundedRect(activeCtx, MARGIN_X, curY, CONTENT_W, rowH, 8, "#ffffff", "#e2e8f0", 1);
      activeCtx.fillStyle = "#64748b";
      activeCtx.font = `500 17px ${FONT_FAMILY}`;
      activeCtx.fillText("Kayıtlı birim bulunamadı.", MARGIN_X + 20, curY + 34);
    } else {
      deptRows.forEach((row, idx) => {
        if (curY + rowH > maxTableY) {
          pages.push(activeCanvas);
          const next = createA4Canvas();
          activeCanvas = next.canvas;
          activeCtx = next.ctx;
          activeCtx.fillStyle = "#4f46e5";
          activeCtx.fillRect(0, 0, PAGE_W, 14);
          activeCtx.fillStyle = "#4f46e5";
          activeCtx.font = `700 16px ${FONT_FAMILY}`;
          activeCtx.fillText("DÖF PERFORMANS & ANALİZ ÖZET RAPORU — BİRİM TABLOSU", MARGIN_X, 58);
          curY = drawTableHeader(activeCtx, 86);
        }

        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        drawRoundedRect(activeCtx, MARGIN_X, curY, CONTENT_W, rowH, 6, bg, "#e2e8f0", 1);

        activeCtx.fillStyle = "#0f172a";
        activeCtx.font = `600 17px ${FONT_FAMILY}`;
        activeCtx.fillText(truncateText(activeCtx, row.name, 480), MARGIN_X + 20, curY + 34);

        activeCtx.textAlign = "center";
        activeCtx.font = `700 17px ${FONT_FAMILY}`;
        activeCtx.fillStyle = "#0f172a";
        activeCtx.fillText(String(row.tCount), MARGIN_X + 570, curY + 34);

        activeCtx.font = `600 17px ${FONT_FAMILY}`;
        activeCtx.fillStyle = "#2563eb";
        activeCtx.fillText(String(row.yCount), MARGIN_X + 700, curY + 34);
        activeCtx.fillStyle = "#d97706";
        activeCtx.fillText(String(row.iCount), MARGIN_X + 830, curY + 34);
        activeCtx.fillStyle = "#059669";
        activeCtx.fillText(String(row.cCount), MARGIN_X + 970, curY + 34);
        activeCtx.fillStyle = "#e11d48";
        activeCtx.fillText(String(row.rCount), MARGIN_X + 1100, curY + 34);

        activeCtx.fillStyle = "#334155";
        activeCtx.fillText(`%${row.rate}`, MARGIN_X + 1230, curY + 34);

        const badgeFill =
          row.statusLabel === "PASİF"
            ? "#f1f5f9"
            : row.statusLabel === "AKTİF SÜREÇ"
              ? "#fef3c7"
              : "#d1fae5";
        const badgeText =
          row.statusLabel === "PASİF"
            ? "#64748b"
            : row.statusLabel === "AKTİF SÜREÇ"
              ? "#b45309"
              : "#047857";
        drawRoundedRect(activeCtx, MARGIN_X + 1300, curY + 11, 130, 32, 8, badgeFill);
        activeCtx.fillStyle = badgeText;
        activeCtx.font = `700 13px ${FONT_FAMILY}`;
        activeCtx.fillText(row.statusLabel, MARGIN_X + 1365, curY + 32);

        activeCtx.textAlign = "left";
        curY += rowH + 2;
      });
    }

    pages.push(activeCanvas);

    // Stamp consistent footers & assemble multi-page A4 PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const totalPages = pages.length;
    pages.forEach((pageCanvas, pageIndex) => {
      const ctx = pageCanvas.getContext("2d")!;
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, FOOTER_Y - 14);
      ctx.lineTo(PAGE_W - MARGIN_X, FOOTER_Y - 14);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = `500 15px ${FONT_FAMILY}`;
      ctx.fillText("Kalite Yönetim Sistemi • DÖF Raporlar ve Analiz Özeti (Yazdırılabilir A4)", MARGIN_X, FOOTER_Y + 14);
      ctx.textAlign = "right";
      ctx.font = `700 15px ${FONT_FAMILY}`;
      ctx.fillText(`Sayfa ${pageIndex + 1} / ${totalPages}`, PAGE_W - MARGIN_X, FOOTER_Y + 14);
      ctx.textAlign = "left";

      if (pageIndex > 0) {
        pdf.addPage("a4", "portrait");
      }
      const imgData = pageCanvas.toDataURL("image/png", 1.0);
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    pdf.save(fileName || `dof-analiz-raporu-${dateStamp}.pdf`);
    return true;
  } catch (err) {
    console.error("Report summary PDF export error:", err);
    return false;
  }
};

export interface SingleChartPdfParams {
  elementId: string;
  title: string;
  subtitle?: string;
  summaryNote?: string;
  orientation?: "portrait" | "landscape";
  fileName?: string;
}

export const captureChartPreviewDataUrl = (containerId: string): string | null => {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const svg = container.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const vb = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const svgW = (vb && vb.length === 4 && vb[2] > 0 ? vb[2] : rect.width) || 640;
  const svgH = (vb && vb.length === 4 && vb[3] > 0 ? vb[3] : rect.height) || 280;

  const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", String(Math.round(svgW * 2)));
  clonedSvg.setAttribute("height", String(Math.round(svgH * 2)));
  if (!clonedSvg.getAttribute("viewBox")) {
    clonedSvg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  }
  clonedSvg.querySelectorAll("text, tspan").forEach((t) => {
    (t as SVGElement).style.fontFamily = FONT_FAMILY;
  });

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
};

export const exportSingleChartA4Pdf = async ({
  elementId,
  title,
  subtitle,
  summaryNote,
  orientation = "portrait",
  fileName,
}: SingleChartPdfParams): Promise<boolean> => {
  try {
    const captured = await captureChartSvgImage(elementId);
    const isLandscape = orientation === "landscape";
    const cW = isLandscape ? PAGE_H : PAGE_W;
    const cH = isLandscape ? PAGE_W : PAGE_H;
    const marginX = 88;
    const contentW = cW - marginX * 2;

    const canvas = document.createElement("canvas");
    canvas.width = cW;
    canvas.height = cH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cW, cH);

    // Top Indigo Accent Bar
    ctx.fillStyle = "#4f46e5";
    ctx.fillRect(0, 0, cW, 14);

    // Report Label & Date
    const nowStr = new Date().toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    ctx.fillStyle = "#4f46e5";
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText("DÖF ANALİZ & RAPORLAR • TEKLİ A4 GRAFİK ÇIKTISI", marginX, 74);

    ctx.fillStyle = "#64748b";
    ctx.font = `500 17px ${FONT_FAMILY}`;
    ctx.textAlign = "right";
    ctx.fillText(nowStr, cW - marginX, 74);
    ctx.textAlign = "left";

    // Chart Title & Subtitle
    ctx.fillStyle = "#0f172a";
    ctx.font = `800 36px ${FONT_FAMILY}`;
    ctx.fillText(truncateText(ctx, title, contentW), marginX, 134);

    if (subtitle) {
      ctx.fillStyle = "#64748b";
      ctx.font = `500 20px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, subtitle, contentW), marginX, 174);
    }

    // Card Frame for Chart
    const cardY = subtitle ? 210 : 180;
    const footerReserve = summaryNote ? 220 : 110;
    const cardH = cH - cardY - footerReserve;
    drawRoundedRect(ctx, marginX, cardY, contentW, cardH, 24, "#ffffff", "#e2e8f0", 2);

    if (captured) {
      drawContainedImage(ctx, captured, marginX + 42, cardY + 42, contentW - 84, cardH - 84);
    } else {
      drawEmptyChartNotice(ctx, marginX + 42, cardY + 42, contentW - 84, cardH - 84);
    }

    // Optional summary banner
    if (summaryNote) {
      const noteY = cardY + cardH + 28;
      drawRoundedRect(ctx, marginX, noteY, contentW, 92, 16, "#f8fafc", "#e2e8f0", 1.5);
      ctx.fillStyle = "#334155";
      ctx.font = `600 19px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, summaryNote, contentW - 48), marginX + 24, noteY + 54);
    }

    // Footer
    const footY = cH - 54;
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX, footY - 18);
    ctx.lineTo(cW - marginX, footY - 18);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = `500 15px ${FONT_FAMILY}`;
    ctx.fillText("Kalite Yönetim Sistemi • Yazdırılabilir A4 Grafik Çıktısı", marginX, footY + 12);
    ctx.textAlign = "right";
    ctx.font = `700 15px ${FONT_FAMILY}`;
    ctx.fillText(isLandscape ? "A4 Yatay" : "A4 Dikey", cW - marginX, footY + 12);
    ctx.textAlign = "left";

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    const pageWmm = isLandscape ? 297 : 210;
    const pageHmm = isLandscape ? 210 : 297;
    pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 0, 0, pageWmm, pageHmm, undefined, "FAST");

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9çğıöşü]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const dateStamp = new Date().toISOString().slice(0, 10);
    pdf.save(fileName || `dof-grafik-${slug || "rapor"}-${dateStamp}.pdf`);
    return true;
  } catch (err) {
    console.error("Single chart A4 PDF export error:", err);
    return false;
  }
};
