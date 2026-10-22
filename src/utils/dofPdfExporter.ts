import { jsPDF } from "jspdf";
import { DofForm } from "../types";
import { maskKvkkText } from "../lib/settings";

/**
 * Helper to clean and normalize Turkish characters for standard Helvetica/Arial in jsPDF
 */
const cleanPdfText = (str: any): string => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C");
};

/**
 * Formats date into readable string for PDF
 */
const formatPdfDate = (timestamp: any): string => {
  if (!timestamp) return "-";
  try {
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return new Date(timestamp).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
};

/**
 * Generates and downloads a clean, professional PDF report for a single DÖF entry.
 */
export const exportDofPdf = async (dof: DofForm): Promise<void> => {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Theme Color Palette
    const primaryColor = [79, 70, 229];      // Indigo 600
    const darkColor = [30, 41, 59];          // Slate 800
    const lightBg = [248, 250, 252];         // Slate 50
    const borderLineColor = [226, 232, 240]; // Slate 200

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // 1. Top Decorative Brand Bar
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(margin, 12, contentWidth, 6, "F");

    // 2. Organization / ISO Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("ISO 9001:2015 KALITE YONETIM SISTEMI", margin, 24);

    const todayStr = new Date().toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Rapor Tarihi: ${cleanPdfText(todayStr)}`, pageWidth - margin, 24, { align: "right" });

    // 3. Document Title & Reference Code
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.text("DUZELTICI VE ONLEYICI FAALIYET (DOF) RAPORU", margin, 32);

    // Ref No in badge-like box
    const refCode = cleanPdfText(dof.refNo || "BELIRTILMEMIS");
    doc.setFillColor(238, 242, 255); // Indigo 50
    doc.roundedRect(pageWidth - margin - 52, 27, 52, 8, 2, 2, "F");
    doc.setFont("Courier", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`REF: ${refCode}`, pageWidth - margin - 26, 32.5, { align: "center" });

    // Dividing rule
    doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    // 4. Metadata Summary Table
    let y = 43;

    const drawMetaRow = (label1: string, val1: string, label2: string, val2: string, currentY: number) => {
      // Row Background
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(margin, currentY, contentWidth, 7.5, "F");

      // Left Column
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(cleanPdfText(label1) + ":", margin + 3, currentY + 5.2);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(cleanPdfText(val1), margin + 34, currentY + 5.2);

      // Right Column
      doc.setFont("Helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text(cleanPdfText(label2) + ":", margin + contentWidth / 2 + 3, currentY + 5.2);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(cleanPdfText(val2), margin + contentWidth / 2 + 36, currentY + 5.2);

      // Bottom border for row
      doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
      doc.line(margin, currentY + 7.5, pageWidth - margin, currentY + 7.5);
    };

    const getStatusLabel = (st: string) => {
      const s = (st || "").toLowerCase().trim();
      if (s === "yeni") return "Yeni Bildirim (Beklemede)";
      if (s === "inceleniyor" || s === "islemde") return "Inceleniyor / Islemde";
      if (s === "cozuldu" || s === "çözüldü" || s === "tamamlandi" || s === "kapali") return "Cozuldu & Tamamlandi";
      if (s === "reddedildi" || s === "iptal") return "Reddedildi / Iptal";
      return s || "Bilinmiyor";
    };

    drawMetaRow(
      "Faaliyet Turu",
      dof.type === "düzeltici" ? "Duzeltici Faaliyet (DF)" : "Onleyici Faaliyet (OF)",
      "Mevcut Durum",
      getStatusLabel(dof.status),
      y
    );
    y += 7.5;

    drawMetaRow(
      "Ilgili Birim/Bolum",
      dof.department || "Genel Fabrika / Tesis",
      "Sorumlu Yetkili",
      dof.assignedUserName || "Atanmamis / Surec Sahibi",
      y
    );
    y += 7.5;

    drawMetaRow(
      "Bildiren Kisi",
      maskKvkkText(dof.reporterName) || "Anonim / Belirtilmemis",
      "Iletisim Bilgisi",
      maskKvkkText(dof.reporterContact) || "Belirtilmemis",
      y
    );
    y += 7.5;

    drawMetaRow(
      "Bildirim Tarihi",
      formatPdfDate(dof.createdAt),
      "Termin Suresi",
      dof.deadlineDate ? cleanPdfText(dof.deadlineDate) : (dof.type === "düzeltici" ? "Standart 3 Gun" : "Standart 7 Gun"),
      y
    );
    y += 12;

    // Helper to draw text block with colored accent bar
    const drawTextBlock = (title: string, content: string, startY: number, accentColor: number[]) => {
      // Check if page overflow
      if (startY > pageHeight - 35) {
        doc.addPage();
        startY = 20;
      }

      // Accent color indicator bar
      doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.rect(margin, startY, 3, 5.5, "F");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text(cleanPdfText(title), margin + 5, startY + 4.2);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);

      const textLines = doc.splitTextToSize(cleanPdfText(content || "Belirtilmemis"), contentWidth - 8);
      let textY = startY + 9;

      textLines.forEach((line: string) => {
        if (textY > pageHeight - 25) {
          doc.addPage();
          textY = 20;
        }
        doc.text(line, margin + 2, textY);
        textY += 4.5;
      });

      return textY + 3.5;
    };

    // 5. Title & Description
    y = drawTextBlock("DÖF Konusu / Baslik", dof.title, y, primaryColor);
    y = drawTextBlock("Tespit Edilen Uygunsuzluk / Problem Tanimi", dof.description, y, [225, 29, 72]); // Rose

    // 6. Proposed Action
    if (dof.proposedAction) {
      y = drawTextBlock("Bildiren Tarafindan Onerilen Cozum Aksiyonu", dof.proposedAction, y, [14, 165, 233]); // Sky
    }

    // 7. Referral Result / Action Note
    if (dof.referralResultNote) {
      y = drawTextBlock("Uygulanan Duzeltici / Onleyici Faaliyet Raporu", dof.referralResultNote, y, [16, 185, 129]); // Emerald
    }

    // 8. 5 Whys Root Cause Analysis
    if (dof.rootCauses && dof.rootCauses.some((c) => c && c.trim().length > 0)) {
      const rootCausesSummary = dof.rootCauses
        .map((c, i) => (c && c.trim() ? `${i + 1}. Neden: ${c.trim()}` : null))
        .filter(Boolean)
        .join("\n");
      if (rootCausesSummary) {
        y = drawTextBlock("5 Kok Neden Analizi (5 Whys Analysis)", rootCausesSummary, y, [245, 158, 11]); // Amber
      }
    }

    // 9. Admin Feedback / Notes
    if (dof.adminFeedback) {
      y = drawTextBlock("Kalite Yonetim Degerlendirmesi ve Notlar", dof.adminFeedback, y, [100, 116, 139]); // Slate
    }

    // 10. Photo Status Note
    const hasBeforePhoto = Boolean(dof.beforeImageUrl || dof.imageUrl);
    const hasAfterPhoto = Boolean(dof.afterImageUrl);
    const photoSummary = `Faaliyet Oncesi (Ilk Durum) Fotografi: ${hasBeforePhoto ? "Mevcut (Sisteme Kaydedildi)" : "Fotograf Eklenmedi"}\nFaaliyet Sonrasi (Cozum) Fotografi: ${hasAfterPhoto ? "Mevcut (Sisteme Kaydedildi)" : "Henuz Eklenmedi"}`;
    y = drawTextBlock("Gorsel Kanit ve Fotograf Durumu", photoSummary, y, [99, 102, 241]);

    // 11. Signature / Authorization Footer
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 30;
    }

    y = Math.max(y, pageHeight - 48);

    doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Two Sign-off Boxes
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("BILDIREN PERSONEL / BIRIM", margin, y);
    doc.text("KALITE GUVENCE VE SUREC ONAYI", pageWidth - margin - 65, y);

    y += 4.5;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.text(cleanPdfText(maskKvkkText(dof.reporterName) || "Saha Personeli"), margin, y);
    doc.text(cleanPdfText(dof.assignedUserName || "Kalite Yonetim Sorumlusu"), pageWidth - margin - 65, y);

    y += 4;
    doc.setFont("Courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Dijital Sistem Uzerinden Olusturulmustur.", margin, y);
    doc.text("ISO 9001:2015 KYS Onayli Faaliyet Belgesi", pageWidth - margin - 65, y);

    // Bottom Footer Watermark
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(160, 174, 192);
    doc.text(
      `DÖF Otomasyon Portalı • Belge ID: ${cleanPdfText(dof.id || dof.refNo)} • Sayfa 1/1`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );

    // Save File
    const sanitizedRef = (dof.refNo || "KAYIT").replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`DOF_${sanitizedRef}_Takip_Raporu.pdf`);
  } catch (error) {
    console.error("PDF Export failed:", error);
    throw error;
  }
};
