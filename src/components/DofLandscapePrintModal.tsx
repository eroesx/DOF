import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Printer, 
  Download, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  ShieldCheck, 
  Calendar, 
  User, 
  Clock, 
  Building,
  Image as ImageIcon, 
  Layers
} from "lucide-react";
import { jsPDF } from "jspdf";
import { DofForm } from "../types";
import { printElement } from "../utils/posterExporter";

interface DofLandscapePrintModalProps {
  dof: DofForm | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DofLandscapePrintModal({
  dof,
  isOpen,
  onClose,
}: DofLandscapePrintModalProps) {
  if (!isOpen || !dof) return null;

  const beforeImg = dof.beforeImageUrl || dof.imageUrl || "";
  const afterImg = dof.afterImageUrl || "";

  const handlePrint = async () => {
    await printElement(
      "dof-landscape-print-document",
      `TTK_DOF_${dof.refNo}_Yatik_Cozum_Raporu`,
      "landscape"
    );
  };

  const handleDownloadLandscapePdf = () => {
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const cleanText = (str: any): string => {
        if (str === null || str === undefined) return "";
        return String(str)
          .replace(/ğ/g, "g").replace(/Ğ/g, "G")
          .replace(/ü/g, "u").replace(/Ü/g, "U")
          .replace(/ş/g, "s").replace(/Ş/g, "S")
          .replace(/ı/g, "i").replace(/İ/g, "I")
          .replace(/ö/g, "o").replace(/Ö/g, "O")
          .replace(/ç/g, "c").replace(/Ç/g, "C");
      };

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      // Header Banner
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(margin, margin, contentWidth, 16, "F");

      doc.setFillColor(79, 70, 229); // Indigo accent bar
      doc.rect(margin, margin, 4, 16, "F");

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.text("TURKIYE TASKOMURU KURUMU - DUZELTICI VE ONLEYICI FAALIYET (DOF) RAPORU", margin + 8, margin + 6.5);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text("A4 YATIK CIKTI (ONCE & SONRA FOTOGRAFLI COZUM VE KAPANIS BELGESI)", margin + 8, margin + 11.5);

      // Ref No on top right
      doc.setFont("Courier", "bold");
      doc.setFontSize(10);
      doc.setTextColor(254, 240, 138); // Yellow 200
      doc.text(`REF: ${cleanText(dof.refNo)}`, pageWidth - margin - 5, margin + 7.5, { align: "right" });

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(226, 232, 240);
      const dateStr = dof.createdAt ? (dof.createdAt.seconds ? new Date(dof.createdAt.seconds * 1000).toLocaleDateString("tr-TR") : new Date(dof.createdAt).toLocaleDateString("tr-TR")) : new Date().toLocaleDateString("tr-TR");
      doc.text(`Tarih: ${cleanText(dateStr)}`, pageWidth - margin - 5, margin + 12.5, { align: "right" });

      // Metadata Grid Bar
      let currentY = margin + 18;
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, contentWidth, 10, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(margin, currentY, contentWidth, 10, "S");

      doc.setFontSize(7);
      const colW = contentWidth / 5;

      const drawMetaCell = (label: string, val: string, colIndex: number) => {
        const x = margin + colIndex * colW + 2;
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text(cleanText(label) + ":", x, currentY + 4);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        const sub = cleanText(val).length > 22 ? cleanText(val).slice(0, 22) + "..." : cleanText(val);
        doc.text(sub, x, currentY + 8);
      };

      drawMetaCell("Birim / Departman", dof.department || "Genel", 0);
      drawMetaCell("Faaliyet Turu", dof.type === "düzeltici" ? "Düzeltici (3 İş Günü)" : "Önleyici (7 İş Günü)", 1);
      drawMetaCell("Mevcut Durum", dof.status === "cozuldu" ? "COZULDU / KAPANDI" : dof.status === "inceleniyor" ? "INCELENIYOR" : "YENI", 2);
      drawMetaCell("Atanan Sorumlu", dof.assignedUserName || "Atanmadi", 3);
      drawMetaCell("Bildiren Kisi", dof.reporterName || "Anonim", 4);

      // --- Split Layout ---
      // Left Column: Text description, 5 Whys, action steps, updates
      const leftColX = margin;
      const leftColW = 145;
      let leftY = currentY + 13;

      const drawSectionHeader = (title: string, yPos: number, accentColor: number[]) => {
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(leftColX, yPos, 2.5, 4.5, "F");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(cleanText(title), leftColX + 4.5, yPos + 3.5);
        return yPos + 7;
      };

      // 1. Problem Tanımı
      leftY = drawSectionHeader("1. TESPIT EDILEN UYGUNSUZLUK VE ACIKLAMA", leftY, [239, 68, 68]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Baslik: ${cleanText(dof.title)}`, leftColX + 2, leftY);
      leftY += 4;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const descLines = doc.splitTextToSize(cleanText(dof.description), leftColW - 6);
      descLines.slice(0, 5).forEach((line: string) => {
        doc.text(line, leftColX + 2, leftY);
        leftY += 3.4;
      });
      leftY += 2;

      // 2. 5 Kök Neden Analizi (varsa)
      if (dof.rootCauses && dof.rootCauses.some((c) => c && c.trim().length > 0)) {
        leftY = drawSectionHeader("2. 5 KOK NEDEN ANALIZI (5 WHYS)", leftY, [217, 119, 6]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(6.5);
        dof.rootCauses.forEach((rc, idx) => {
          if (rc && rc.trim()) {
            const isLast = idx === 4;
            doc.setFont("Helvetica", isLast ? "bold" : "normal");
            doc.setTextColor(isLast ? 180 : 71, isLast ? 83 : 85, isLast ? 9 : 105);
            const line = `${idx + 1}. Neden: ${cleanText(rc.trim())}`;
            const subLines = doc.splitTextToSize(line, leftColW - 6);
            subLines.slice(0, 2).forEach((l: string) => {
              doc.text(l, leftColX + 2, leftY);
              leftY += 3.2;
            });
          }
        });
        leftY += 2;
      }

      // 3. Aksiyon Planı ve Uygulama Notu
      leftY = drawSectionHeader("3. SORUNUN COZUMUNDE NELER YAPILDI? (AKSIYON & UYGULAMA)", leftY, [16, 185, 129]);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);

      const actionText = dof.referralResultNote || dof.proposedAction || "Henuz resmi aksiyon adimi girilmedi.";
      const actionLines = doc.splitTextToSize(cleanText(actionText), leftColW - 6);
      actionLines.slice(0, 9).forEach((line: string) => {
        doc.text(line, leftColX + 2, leftY);
        leftY += 3.3;
      });
      leftY += 2;

      // 4. Yönetici Kapanış Onay Notu (varsa)
      if (dof.adminFeedback) {
        leftY = drawSectionHeader("4. YONETICI DEGERLENDIRMESI VE SUREC ONAYI", leftY, [79, 70, 229]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        const fbLines = doc.splitTextToSize(cleanText(dof.adminFeedback), leftColW - 6);
        fbLines.slice(0, 4).forEach((line: string) => {
          doc.text(line, leftColX + 2, leftY);
          leftY += 3.2;
        });
      }

      // --- Right Column: Before & After Photos ---
      const rightColX = margin + leftColW + 6;
      const rightColW = contentWidth - leftColW - 6; // ~126 mm
      let rightY = currentY + 13;

      // Section Header for Photos
      doc.setFillColor(15, 23, 42);
      doc.rect(rightColX, rightY, rightColW, 6, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("GORSEL COZUM KANITI (ONCE & SONRA FOTOGRAFLARI)", rightColX + rightColW / 2, rightY + 4.2, { align: "center" });
      rightY += 8;

      const photoBoxH = 68;

      // 1. ÖNCE FOTOĞRAFI
      doc.setFillColor(254, 242, 242); // Rose 50
      doc.rect(rightColX, rightY, rightColW, photoBoxH, "F");
      doc.setDrawColor(254, 205, 211); // Rose 200
      doc.rect(rightColX, rightY, rightColW, photoBoxH, "S");

      // Önce Label Banner
      doc.setFillColor(225, 29, 72); // Rose 600
      doc.rect(rightColX, rightY, 32, 5, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text("1. ONCE (Sorun Hali)", rightColX + 2, rightY + 3.8);

      // Embed Before Image if base64 or valid
      if (beforeImg) {
        try {
          doc.addImage(beforeImg, "JPEG", rightColX + 2, rightY + 6, rightColW - 4, photoBoxH - 8, undefined, "FAST");
        } catch {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(150, 50, 50);
          doc.text("Once Fotografi Yuklendi (Goruntu PDF'e eklendi)", rightColX + 6, rightY + 30);
        }
      } else {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(156, 163, 175);
        doc.text("Faaliyet Oncesi Fotograf Eklenmedi", rightColX + rightColW / 2, rightY + photoBoxH / 2, { align: "center" });
      }

      rightY += photoBoxH + 4;

      // 2. SONRA FOTOĞRAFI
      doc.setFillColor(236, 253, 245); // Emerald 50
      doc.rect(rightColX, rightY, rightColW, photoBoxH, "F");
      doc.setDrawColor(167, 243, 208); // Emerald 200
      doc.rect(rightColX, rightY, rightColW, photoBoxH, "S");

      // Sonra Label Banner
      doc.setFillColor(5, 150, 105); // Emerald 600
      doc.rect(rightColX, rightY, 34, 5, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text("2. SONRA (Cozulen Hal)", rightColX + 2, rightY + 3.8);

      // Embed After Image if base64 or valid
      if (afterImg) {
        try {
          doc.addImage(afterImg, "JPEG", rightColX + 2, rightY + 6, rightColW - 4, photoBoxH - 8, undefined, "FAST");
        } catch {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(20, 120, 70);
          doc.text("Sonra Fotografi Yuklendi", rightColX + 6, rightY + 30);
        }
      } else {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(156, 163, 175);
        doc.text("Faaliyet Sonrasi Fotograf Henuz Eklenmedi", rightColX + rightColW / 2, rightY + photoBoxH / 2, { align: "center" });
      }

      // --- Bottom Signatures ---
      const bottomY = pageHeight - 16;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(margin, bottomY, pageWidth - margin, bottomY);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text("FAALIYETI UYGULAYAN / BIRIM SORUMLUSU", margin + 10, bottomY + 4);
      doc.text("KALITE YONETIM TEMSILCISI / SISTEM YONETICISI", pageWidth - margin - 85, bottomY + 4);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Imza / Tarih: .....................................................", margin + 10, bottomY + 10);
      doc.text("Elektronik Onay / Kapanis Tarihi: .......................................", pageWidth - margin - 85, bottomY + 10);

      doc.text("TTK Dijital DOF Surec Yonetim Sistemi - Isbu cikti resmi kalite kaydidir.", pageWidth / 2, pageHeight - 3, { align: "center" });

      doc.save(`TTK_DOF_${dof.refNo}_Yatik_Rapor.pdf`);
    } catch (err) {
      console.error("Landscape PDF generation error:", err);
      alert("Yatık PDF oluşturulurken bir hata oluştu.");
    }
  };

  return (
    <AnimatePresence>
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto cursor-pointer"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative bg-white rounded-3xl shadow-2xl max-w-6xl w-full overflow-hidden border border-slate-200 flex flex-col my-auto print:my-0 print:border-0 print:shadow-none print:rounded-none print:w-full print:max-w-none print:h-full cursor-default"
        >
          {/* Top Control Bar (Hidden on print) */}
          <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                <Printer className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                    DÖF Çözüm & Önce-Sonra Raporu (A4 Yatık Format)
                  </h3>
                  <span className="bg-indigo-500/40 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-400/40">
                    A4 Landscape
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Sorunun çözümünde neler yapıldığını ve Önce / Sonra fotoğraflarını içeren resmi kalite çıktısı
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md shadow-emerald-900/30"
                title="A4 Yatık Kağıda Yazdır"
                id="landscape-print-btn"
              >
                <Printer className="h-4 w-4" />
                <span>Yazdır (A4 Yatık)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadLandscapePdf}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md shadow-indigo-900/30"
                title="Yatık PDF Belgesi İndir"
                id="landscape-download-pdf-btn"
              >
                <Download className="h-4 w-4" />
                <span>Yatık PDF İndir</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Printable Document Area */}
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[85vh] bg-slate-100 flex justify-center">
            {/* The Actual A4 Landscape Document Box */}
            <div
              id="dof-landscape-print-document"
              className="bg-white w-full max-w-[1040px] shadow-lg rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between text-slate-800 print:shadow-none print:border-0 print:p-0 print:rounded-none"
              style={{
                minHeight: "680px",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              }}
            >
              {/* Header Box */}
              <div className="border-b-2 border-slate-800 pb-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md">
                      TTK
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                        TÜRKİYE TAŞKÖMÜRÜ KURUMU GENEL MÜDÜRLÜĞÜ
                      </span>
                      <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                        DÜZELTİCİ VE ÖNLEYİCİ FAALİYET (DÖF) ÇÖZÜM RAPORU
                      </h1>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                          FORM KODU: TTK-KYS-DOF-01
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          A4 YATIK SAYFA DÜZENİ (ISO 9001:2015 KYS)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-start sm:items-end bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DÖF KAYIT NUMARASI</span>
                    <span className="font-mono text-base font-black text-indigo-700 block tracking-wider">
                      {dof.refNo}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                      Rapor Tarihi: {dof.createdAt ? (dof.createdAt.seconds ? new Date(dof.createdAt.seconds * 1000).toLocaleDateString("tr-TR") : new Date(dof.createdAt).toLocaleDateString("tr-TR")) : new Date().toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                </div>

                {/* Metadata Horizontal Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs bg-slate-50/70 p-2.5 rounded-xl">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Birim / Departman</span>
                    <span className="font-extrabold text-slate-800 truncate block">{dof.department || "Genel"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Faaliyet Türü</span>
                    <span className="font-extrabold text-indigo-700 block">
                      {dof.type === "düzeltici" ? "Düzenleyici (3 İş Günü)" : "Önleyici (7 İş Günü)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Mevcut Durum</span>
                    <span className={`inline-block font-extrabold px-2 py-0.5 rounded text-[11px] ${
                      dof.status === "cozuldu" 
                        ? "bg-emerald-100 text-emerald-800" 
                        : dof.status === "inceleniyor" 
                        ? "bg-amber-100 text-amber-800" 
                        : "bg-slate-200 text-slate-800"
                    }`}>
                      {dof.status === "cozuldu" ? "✓ ÇÖZÜLDÜ" : dof.status === "inceleniyor" ? "⏳ İNCELENİYOR" : "YENİ"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Atanan Sorumlu</span>
                    <span className="font-extrabold text-slate-800 truncate block">{dof.assignedUserName || "Atanmadı"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Bildiren Kişi</span>
                    <span className="font-bold text-slate-700 truncate block">{dof.reporterName || "Gizli"}</span>
                  </div>
                </div>
              </div>

              {/* Main 2-Column Split: Solution Details on Left, Before/After Photos on Right */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-4">
                
                {/* Sol Kolon (7/12): Sorunun Çözümünde Neler Yapıldı? */}
                <div className="md:col-span-7 space-y-3.5 pr-0 md:pr-2 border-b md:border-b-0 md:border-r border-slate-200 pb-4 md:pb-0">
                  
                  {/* 1. Tespit Edilen Problem */}
                  <div className="bg-rose-50/40 border border-rose-200/80 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1 text-rose-800">
                      <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>
                      <h4 className="text-[11px] font-extrabold uppercase tracking-wide">
                        1. Tespit Edilen Problem & Uygunsuzluk Açıklaması
                      </h4>
                    </div>
                    <span className="font-bold text-slate-900 block text-xs mb-1">{dof.title}</span>
                    <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                      {dof.description}
                    </p>
                  </div>

                  {/* 2. 5 Kök Neden Analizi (Varsa) */}
                  {dof.rootCauses && dof.rootCauses.some((c) => c && c.trim().length > 0) && (
                    <div className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2 text-amber-900">
                        <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0"></span>
                        <h4 className="text-[11px] font-extrabold uppercase tracking-wide">
                          2. 5 Kök Neden Analizi (5 Whys)
                        </h4>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {dof.rootCauses.map((rc, idx) => {
                          if (!rc || !rc.trim()) return null;
                          const isLast = idx === 4;
                          return (
                            <div 
                              key={idx}
                              className={`flex items-start gap-2 p-1.5 rounded-lg border text-[11px] ${
                                isLast 
                                  ? "bg-amber-100/70 border-amber-300 font-bold text-amber-950" 
                                  : "bg-white/80 border-slate-100 text-slate-700"
                              }`}
                            >
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                isLast ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-700"
                              }`}>
                                {isLast ? "Temel Neden" : `${idx + 1}. Neden`}
                              </span>
                              <span className="leading-tight">{rc.trim()}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. Sorunun Çözümünde Neler Yapıldı? (Aksiyon & Uygulama Güncellemeleri) */}
                  <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5 text-emerald-900">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                      <h4 className="text-[11px] font-extrabold uppercase tracking-wide">
                        3. Sorunun Çözümünde Neler Yapıldı? (Uygulanan Aksiyon ve Faaliyetler)
                      </h4>
                    </div>

                    {dof.referralResultNote ? (
                      <div className="bg-white/90 p-2.5 rounded-lg border border-emerald-100 text-slate-800 text-xs leading-relaxed whitespace-pre-line">
                        {dof.referralResultNote}
                      </div>
                    ) : dof.proposedAction ? (
                      <div className="bg-white/90 p-2.5 rounded-lg border border-emerald-100 text-slate-800 text-xs leading-relaxed whitespace-pre-line">
                        {dof.proposedAction}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">
                        Sorumlu birim tarafından henüz detaylı çözüm notu girilmemiş.
                      </p>
                    )}
                  </div>

                  {/* 4. Yönetici Kararı & Kapanış Değerlendirmesi */}
                  {dof.adminFeedback && (
                    <div className="bg-indigo-50/40 border border-indigo-200/70 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1 text-indigo-900">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>
                        <h4 className="text-[11px] font-extrabold uppercase tracking-wide">
                          4. Yönetici / Kalite Temsilcisi Kapanış Kararı
                        </h4>
                      </div>
                      <p className="text-slate-800 text-xs leading-relaxed whitespace-pre-line bg-white/80 p-2 rounded-lg border border-indigo-100">
                        {dof.adminFeedback}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sağ Kolon (5/12): Önce ve Sonra Durum Fotoğrafları */}
                <div className="md:col-span-5 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-900">
                      <ImageIcon className="h-4 w-4 text-indigo-600" />
                      <h4 className="text-xs font-black uppercase tracking-wide">
                        Görsel Çözüm Kanıtı (Önce & Sonra)
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Karşılaştırma
                    </span>
                  </div>

                  {/* 1. ÖNCE FOTOĞRAFI */}
                  <div className="bg-rose-50/40 rounded-xl border border-rose-200 overflow-hidden flex flex-col flex-1">
                    <div className="bg-rose-600 text-white px-3 py-1 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        1. ÖNCE (Sorun / Uygunsuzluk Hali)
                      </span>
                      <span className="text-[9px] bg-rose-700 px-1.5 py-0.2 rounded font-bold">İlk Durum</span>
                    </div>

                    <div className="p-2 flex-1 flex items-center justify-center bg-slate-50 min-h-[140px] max-h-[190px] overflow-hidden">
                      {beforeImg ? (
                        <img 
                          src={beforeImg} 
                          alt="Önce Durumu" 
                          className="w-full h-full object-contain max-h-[180px] rounded-lg border border-slate-200" 
                        />
                      ) : (
                        <div className="text-center p-4">
                          <ImageIcon className="h-8 w-8 text-rose-300 mx-auto mb-1" />
                          <span className="text-xs font-bold text-rose-800 block">Fotoğraf Eklenmedi</span>
                          <span className="text-[10px] text-slate-400 block">Faaliyet öncesi ilk durum görseli bulunmuyor.</span>
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-1 bg-white border-t border-rose-100 text-[10px] text-slate-500 italic">
                      Sorunun sahada tespit edildiği ilk ana ait görsel kayıt.
                    </div>
                  </div>

                  {/* 2. SONRA FOTOĞRAFI */}
                  <div className="bg-emerald-50/40 rounded-xl border border-emerald-200 overflow-hidden flex flex-col flex-1">
                    <div className="bg-emerald-600 text-white px-3 py-1 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        2. SONRA (Çözüm / Nihai Durum)
                      </span>
                      <span className="text-[9px] bg-emerald-700 px-1.5 py-0.2 rounded font-bold">Çözülen Hal</span>
                    </div>

                    <div className="p-2 flex-1 flex items-center justify-center bg-slate-50 min-h-[140px] max-h-[190px] overflow-hidden">
                      {afterImg ? (
                        <img 
                          src={afterImg} 
                          alt="Sonra Durumu" 
                          className="w-full h-full object-contain max-h-[180px] rounded-lg border border-slate-200" 
                        />
                      ) : (
                        <div className="text-center p-4">
                          <ImageIcon className="h-8 w-8 text-emerald-300 mx-auto mb-1" />
                          <span className="text-xs font-bold text-emerald-800 block">Fotoğraf Henüz Eklenmedi</span>
                          <span className="text-[10px] text-slate-400 block">Sahadaki düzeltme sonrası nihai durum fotoğrafı.</span>
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-1 bg-white border-t border-emerald-100 text-[10px] text-slate-500 italic">
                      Düzeltici/önleyici faaliyetler uygulanarak giderilmiş nihai durum.
                    </div>
                  </div>
                </div>
              </div>

              {/* Approval and Signature Section at Bottom */}
              <div className="border-t-2 border-slate-800 pt-3 mt-auto">
                <div className="grid grid-cols-2 gap-8 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                      FAALİYETİ YÜRÜTEN / BİRİM SORUMLUSU
                    </span>
                    <span className="font-bold text-slate-900 block">
                      {dof.assignedUserName || "Birim Görevlisi"}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Uygulama Sahası & Birim Yetkilisi
                    </span>
                    <div className="pt-3 border-b border-dashed border-slate-300 w-44"></div>
                    <span className="text-[9px] text-slate-400 block">İmza / Tarih</span>
                  </div>

                  <div className="text-right space-y-1 flex flex-col items-end">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                      KALİTE YÖNETİM TEMSİLCİSİ / SİSTEM YÖNETİCİSİ
                    </span>
                    <span className="font-bold text-indigo-700 block">
                      TTK Kalite Güvence ve Denetim Onayı
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Elektronik Doğrulanmış Belge
                    </span>
                    <div className="pt-3 border-b border-dashed border-slate-300 w-44"></div>
                    <span className="text-[9px] text-slate-400 block">Resmi Onay / Kaşe</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 text-center text-[9px] text-slate-400">
                  Bu belge Türkiye Taşkömürü Kurumu DÖF Dijital Takip Sistemi tarafından otomatik üretilmiştir. Resmi denetimlerde ve ISO 9001:2015 tetkiklerinde geçerlidir.
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
