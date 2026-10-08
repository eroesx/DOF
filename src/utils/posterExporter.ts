import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";

interface VectorPosterOptions {
  title: string;
  departmentName?: string;
  targetUrl: string;
  subTitle?: string;
  motto?: string;
  qrColor?: string;
  fileName?: string;
}

/**
 * Triggers clean print dialog targeting specifically the poster element via an isolated hidden iframe.
 * Prevents dark backdrop overlays, fixed container clipping, and browser iframe issues.
 */
export const printElement = async (
  elementId: string,
  docTitle: string = "DÖF QR Poster"
): Promise<boolean> => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element #${elementId} not found, falling back to window.print()`);
    window.print();
    return false;
  }

  // Remove existing frame if any
  const oldFrame = document.getElementById("dof-print-isolated-frame");
  if (oldFrame) {
    oldFrame.remove();
  }

  // Clone element so we can clean up any print:hidden controls
  const clone = element.cloneNode(true) as HTMLElement;
  const hiddenElements = clone.querySelectorAll(".print\\:hidden");
  hiddenElements.forEach((el) => el.remove());

  // Create isolated iframe
  const iframe = document.createElement("iframe");
  iframe.id = "dof-print-isolated-frame";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!iframeDoc) {
    window.print();
    return false;
  }

  // Gather stylesheet links and inline styles from main document
  let stylesHtml = "";
  const styleElements = document.querySelectorAll("style, link[rel='stylesheet']");
  styleElements.forEach((el) => {
    stylesHtml += el.outerHTML;
  });

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${docTitle}</title>
        ${stylesHtml}
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            width: 100%;
          }
          .poster-print-wrapper {
            width: 100%;
            max-width: 680px;
            margin: 0 auto;
            padding: 20px;
            background: #ffffff;
            box-sizing: border-box;
          }
          @media print {
            body {
              display: flex;
              justify-content: center;
              align-items: flex-start;
              min-height: 100vh;
            }
            .poster-print-wrapper {
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="poster-print-wrapper">
          ${clone.outerHTML}
        </div>
      </body>
    </html>
  `);
  iframeDoc.close();

  return new Promise((resolve) => {
    // Wait for images to load
    const images = iframeDoc.getElementsByTagName("img");
    const imagePromises: Promise<any>[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img.complete) {
        imagePromises.push(
          new Promise((imgResolve) => {
            img.onload = imgResolve;
            img.onerror = imgResolve;
          })
        );
      }
    }

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        resolve(true);
      } catch (err) {
        console.error("Print frame error:", err);
        window.print();
        resolve(false);
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 4000);
      }
    };

    if (imagePromises.length > 0) {
      Promise.all(imagePromises).then(() => {
        setTimeout(triggerPrint, 350);
      });
    } else {
      setTimeout(triggerPrint, 350);
    }
  });
};

/**
 * Exports a poster DOM element directly to a downloadable A4 PDF.
 * Uses html2canvas for 100% visual fidelity and falls back to vector jsPDF if necessary.
 */
export const exportPosterPdf = async (
  elementId: string,
  fileName: string = "dof-poster.pdf",
  fallbackOptions?: VectorPosterOptions
): Promise<boolean> => {
  const element = document.getElementById(elementId);

  if (element) {
    try {
      // Temporarily hide elements marked as print:hidden during capture
      const hiddenElements = element.querySelectorAll<HTMLElement>(".print\\:hidden");
      hiddenElements.forEach((el) => {
        el.style.display = "none";
      });

      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      // Restore hidden elements
      hiddenElements.forEach((el) => {
        el.style.display = "";
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      let imgWidth = maxWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Fit to single A4 page
      if (imgHeight > maxHeight) {
        imgHeight = maxHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
      }

      const xPos = (pageWidth - imgWidth) / 2;
      const yPos = (pageHeight - imgHeight) / 2;

      const imgData = canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", xPos, yPos, imgWidth, imgHeight, undefined, "FAST");
      pdf.save(fileName);
      return true;
    } catch (err) {
      console.error("html2canvas PDF export failed, using vector fallback:", err);
    }
  }

  // Vector fallback if element is missing or canvas failed
  if (fallbackOptions) {
    return generateVectorPosterPdf(fallbackOptions);
  }

  return false;
};

/**
 * Generates an ultra clean vector A4 PDF with high resolution QR code and ISO KYS styling
 */
export const generateVectorPosterPdf = async ({
  title,
  departmentName,
  targetUrl,
  subTitle = "HIZLI BİLDİRİM KANALI",
  motto = "Güvenli, kaliteli ve sıfır hatalı bir çalışma ortamı sizin bildiriminizle başlar.",
  qrColor = "#059669",
  fileName = "dof-qr-poster.pdf",
}: VectorPosterOptions): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Generate high resolution QR Data URL
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 600,
      margin: 1,
      color: {
        dark: qrColor,
        light: "#ffffff",
      },
    });

    const pageWidth = 210;
    const pageHeight = 297;

    // Helper to sanitize Turkish characters for basic fonts if needed
    const cleanStr = (s: string) => {
      return (s || "")
        .replace(/ğ/g, "g").replace(/Ğ/g, "G")
        .replace(/ü/g, "u").replace(/Ü/g, "U")
        .replace(/ş/g, "s").replace(/Ş/g, "S")
        .replace(/ı/g, "i").replace(/İ/g, "I")
        .replace(/ö/g, "o").replace(/Ö/g, "O")
        .replace(/ç/g, "c").replace(/Ç/g, "C");
    };

    // Decorative outer double frame
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(1);
    doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 6, 6);

    doc.setDrawColor(5, 150, 105); // emerald-600
    doc.setLineWidth(0.5);
    doc.roundedRect(13, 13, pageWidth - 26, pageHeight - 26, 4, 4);

    // Top Header Badge
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.roundedRect(45, 22, 120, 10, 5, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87); // emerald-700
    const badgeText = cleanStr(
      departmentName
        ? `${departmentName.toUpperCase()} KALİTE GÜVENCE`
        : "KALİTE YÖNETİM SİSTEMİ"
    );
    doc.text(badgeText, pageWidth / 2, 28.5, { align: "center" });

    // Main Title
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // slate-900
    const mainTitle = cleanStr(title || "DÖF BİLDİRİM FORMU");
    doc.text(mainTitle, pageWidth / 2, 46, { align: "center" });

    // Subtitle
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(cleanStr(subTitle), pageWidth / 2, 54, { align: "center" });

    // Divider
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.5);
    doc.line(30, 62, pageWidth - 30, 62);

    // QR Container Frame
    const qrBoxSize = 96;
    const qrBoxX = (pageWidth - qrBoxSize) / 2;
    const qrBoxY = 72;

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(1.5);
    doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 8, 8, "FD");

    // QR Code Image
    const qrImgSize = 80;
    const qrImgX = (pageWidth - qrImgSize) / 2;
    const qrImgY = qrBoxY + 8;
    doc.addImage(qrDataUrl, "PNG", qrImgX, qrImgY, qrImgSize, qrImgSize);

    // Under QR instruction
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("KAMERANIZ ILE TARATIN", pageWidth / 2, qrBoxY + qrBoxSize + 10, {
      align: "center",
    });

    // Target URL
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(5, 150, 105);
    const displayUrl = targetUrl.length > 60 ? targetUrl.substring(0, 58) + "..." : targetUrl;
    doc.text(displayUrl, pageWidth / 2, qrBoxY + qrBoxSize + 16, { align: "center" });

    // Divider
    doc.setDrawColor(241, 245, 249);
    doc.line(30, qrBoxY + qrBoxSize + 24, pageWidth - 30, qrBoxY + qrBoxSize + 24);

    // Information and Motivation Box
    const infoY = qrBoxY + qrBoxSize + 34;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("Surekli Iyilestirmeye Katki Saglayin", pageWidth / 2, infoY, {
      align: "center",
    });

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    const infoText = cleanStr(
      departmentName
        ? `Is yerimizdeki uygunsuzluklari, aksakliklari, ramak kala olaylari veya iyilestirme onerilerinizi bu QR kodu okutarak dogrudan ${departmentName} birimine bildirebilirsiniz.`
        : "Is yerimizdeki uygunsuzluklari, aksakliklari veya olasi riskleri onlemek icin yukaridaki QR kodu telefonunuzun kamerasi ile okutarak hizlica bildirim yapabilirsiniz."
    );
    const splitInfo = doc.splitTextToSize(infoText, 140);
    doc.text(splitInfo, pageWidth / 2, infoY + 7, { align: "center" });

    // Quote Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(35, infoY + 22, 140, 14, 4, 4, "FD");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    const quoteText = `"${cleanStr(motto)}"`;
    doc.text(quoteText, pageWidth / 2, infoY + 30, { align: "center" });

    // Footer
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      "ISO 9001:2015 Kalite Yonetim Sistemi - Surekli Iyilestirme ve Duzeltici Onleyici Faaliyet Posteri",
      pageWidth / 2,
      pageHeight - 16,
      { align: "center" }
    );

    doc.save(fileName);
    return true;
  } catch (err) {
    console.error("Vector PDF generation error:", err);
    return false;
  }
};
