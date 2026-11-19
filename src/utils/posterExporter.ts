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

export interface PrintElementResult {
  status: "printed" | "blocked" | "error";
}

const cleanupPrintPortal = (
  originalTitle: string,
  portal: HTMLElement | null,
  pageStyleEl: HTMLStyleElement | null
) => {
  document.body.classList.remove("dof-custom-printing");
  if (portal && portal.parentNode) {
    portal.parentNode.removeChild(portal);
  }
  if (pageStyleEl && pageStyleEl.parentNode) {
    pageStyleEl.parentNode.removeChild(pageStyleEl);
  }
  if (document.title !== originalTitle) {
    document.title = originalTitle;
  }
};

/**
 * Prints a target DOM element using an active-document print portal (#dof-print-sheet-portal).
 * Preserves live Tailwind styles & user activation, normalizes Recharts SVG viewBoxes for A4,
 * and reliably detects sandbox-blocked window.print() calls so callers can offer an A4 preview/PDF fallback.
 */
export const printElementWithStatus = async (
  elementId: string,
  docTitle: string = "DÖF A4 Çıktı",
  orientation: "portrait" | "landscape" = "portrait"
): Promise<PrintElementResult> => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element #${elementId} not found.`);
    return { status: "error" };
  }

  // Remove any leftover portal / style
  document.getElementById("dof-print-sheet-portal")?.remove();
  document.getElementById("dof-print-page-style")?.remove();
  document.body.classList.remove("dof-custom-printing");

  // Measure live SVGs before cloning so missing viewBoxes preserve exact aspect ratio
  const liveSvgRects = Array.from(
    element.querySelectorAll<SVGSVGElement>("svg.recharts-surface")
  ).map((svg) => svg.getBoundingClientRect());

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".print\\:hidden").forEach((el) => el.remove());

  // Normalize Recharts wrappers & SVGs so charts fit cleanly on A4 without clipping
  clone.querySelectorAll<HTMLElement>(".recharts-responsive-container").forEach((container) => {
    container.style.width = "100%";
    container.style.minWidth = "0";
  });

  clone.querySelectorAll<HTMLElement>(".recharts-wrapper").forEach((wrapper) => {
    wrapper.style.width = "100%";
    wrapper.style.maxWidth = "100%";
    wrapper.style.height = "auto";
  });

  clone.querySelectorAll<SVGSVGElement>("svg.recharts-surface").forEach((svg, idx) => {
    const wAttr = Number(svg.getAttribute("width"));
    const hAttr = Number(svg.getAttribute("height"));
    const liveRect = liveSvgRects[idx];
    const w = wAttr > 0 ? wAttr : Math.round(liveRect?.width || 640);
    const h = hAttr > 0 ? hAttr : Math.round(liveRect?.height || 260);
    if (!svg.getAttribute("viewBox") && w > 0 && h > 0) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = orientation === "landscape" ? "135mm" : "150mm";
    svg.style.display = "block";
    svg.style.margin = "0 auto";
  });

  // Create active-document portal
  const portal = document.createElement("div");
  portal.id = "dof-print-sheet-portal";

  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.maxWidth = orientation === "landscape" ? "277mm" : "190mm";
  wrapper.style.margin = "0 auto";
  wrapper.style.background = "#ffffff";
  wrapper.appendChild(clone);
  portal.appendChild(wrapper);

  const pageStyleEl = document.createElement("style");
  pageStyleEl.id = "dof-print-page-style";
  pageStyleEl.textContent = `
    @page {
      size: A4 ${orientation};
      margin: ${orientation === "landscape" ? "8mm" : "10mm"};
    }
    #dof-print-sheet-portal * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  `;

  document.head.appendChild(pageStyleEl);
  document.body.appendChild(portal);

  const originalTitle = document.title;
  document.title = docTitle;
  document.body.classList.add("dof-custom-printing");

  // Wait for incomplete <img> tags only if needed; vector SVG charts trigger print synchronously
  const pendingImages: Promise<void>[] = [];
  const imgs = portal.getElementsByTagName("img");
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    if (!img.complete) {
      pendingImages.push(
        new Promise((res) => {
          img.onload = () => res();
          img.onerror = () => res();
        })
      );
    }
  }

  if (pendingImages.length > 0) {
    await Promise.all(pendingImages);
  }

  const executePrint = (): PrintElementResult => {
    let beforePrintFired = false;
    let cleaned = false;

    const handleBeforePrint = () => {
      beforePrintFired = true;
    };

    const doCleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", doCleanup);
      cleanupPrintPortal(originalTitle, portal, pageStyleEl);
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", doCleanup);

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      window.print();
    } catch {
      doCleanup();
      return { status: "blocked" };
    }
    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;

    // Chrome blocks window.print() silently in sandboxed iframes without allow-modals:
    // beforeprint never fires and window.print() returns in < 50ms.
    if (!beforePrintFired && elapsed < 80) {
      doCleanup();
      return { status: "blocked" };
    }

    // Fallback cleanup if afterprint isn't emitted by browser
    setTimeout(doCleanup, 1500);
    return { status: "printed" };
  };

  return executePrint();
};

export const printElement = async (
  elementId: string,
  docTitle: string = "DÖF QR Poster",
  orientation: "portrait" | "landscape" = "portrait"
): Promise<boolean> => {
  const result = await printElementWithStatus(elementId, docTitle, orientation);
  return result.status === "printed";
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
      "Surekli Iyilestirme ve Duzeltici Onleyici Faaliyet Posteri",
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
