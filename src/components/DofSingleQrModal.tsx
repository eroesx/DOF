import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  QrCode, 
  X, 
  Copy, 
  Check, 
  Download, 
  Printer, 
  ExternalLink, 
  Smartphone, 
  Share2,
  ShieldCheck,
  Edit3,
  FileDown
} from "lucide-react";
import { DofForm } from "../types";
import { printElement, exportPosterPdf } from "../utils/posterExporter";

interface DofSingleQrModalProps {
  dof: DofForm | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenMobileEdit?: (dof: DofForm) => void;
}

export const DofSingleQrModal: React.FC<DofSingleQrModalProps> = ({
  dof,
  isOpen,
  onClose,
  onOpenMobileEdit,
}) => {
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  if (!isOpen || !dof) return null;

  // Direct edit URL targeting this specific DOF
  const directEditUrl = `${window.location.origin}?view=edit&refNo=${encodeURIComponent(dof.refNo)}`;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(directEditUrl)}&color=4f46e5`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directEditUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintLabel = async () => {
    setIsPrinting(true);
    try {
      await printElement("dof-single-label-content", `DÖF ${dof.refNo} Mobil Düzenleme Etiketi`);
    } catch (err) {
      console.error("Print error:", err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsPdfLoading(true);
    try {
      await exportPosterPdf(
        "dof-single-label-content",
        `dof-etiket-${dof.refNo.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`,
        {
          title: `DÖF ${dof.refNo} MOBİL DÜZENLEME ETİKETİ`,
          departmentName: dof.department,
          targetUrl: directEditUrl,
          subTitle: dof.title,
          qrColor: "#4f46e5",
          fileName: `dof-etiket-${dof.refNo}.pdf`,
        }
      );
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `DÖF Formu: ${dof.refNo}`,
          text: `${dof.refNo} - ${dof.title} mobil düzenleme bağlantısı:`,
          url: directEditUrl,
        });
      } catch (err) {
        // user cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm print:p-0 print:bg-white print:static"
        id="dof-single-qr-backdrop"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white border border-slate-150 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh] print:max-w-none print:shadow-none print:border-0 print:rounded-none"
          id="dof-single-qr-card"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 rounded-xl text-white">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-display">Mobil Düzenleme QR Kodu</h3>
                <span className="text-[11px] font-mono text-indigo-300">{dof.refNo}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Printable Label Container */}
          <div id="dof-single-label-content" className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-6 text-center print:p-4">
            
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-700 text-xs font-semibold">
              <Smartphone className="h-3.5 w-3.5" />
              Akıllı Telefon ile Tara & Düzenle
            </div>

            {/* DÖF Title & Details */}
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 line-clamp-2">
                {dof.title}
              </h2>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 flex-wrap">
                <span className="font-mono font-bold text-indigo-600 bg-indigo-50/70 px-2 py-0.5 rounded-md">
                  {dof.refNo}
                </span>
                <span>•</span>
                <span className="font-semibold text-slate-700">{dof.department}</span>
                <span>•</span>
                <span className="capitalize">{dof.type} Faaliyet</span>
              </div>
            </div>

            {/* QR Code Frame */}
            <div className="flex flex-col items-center justify-center">
              <div className="p-4 bg-slate-50 border-2 border-indigo-500/30 rounded-3xl inline-block shadow-inner relative group">
                <img
                  src={qrCodeImageUrl}
                  alt={`DÖF ${dof.refNo} QR Kodu`}
                  className="w-52 h-52 sm:w-60 sm:h-60 object-contain rounded-2xl border border-white bg-white shadow-sm"
                />
                {/* Decorative corner brackets */}
                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-indigo-600 rounded-tl-lg" />
                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-indigo-600 rounded-tr-lg" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-indigo-600 rounded-bl-lg" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-indigo-600 rounded-br-lg" />
              </div>

              <p className="text-[11px] text-slate-400 mt-3 font-medium">
                Telefonunuzun standart kamera uygulamasını veya tarayıcıyı bu koda tutun
              </p>
            </div>

            {/* Direct URL Card */}
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 flex items-center justify-between gap-2 text-left print:hidden">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Mobil Düzenleme Bağlantısı
                </span>
                <p className="text-xs font-mono text-indigo-600 truncate">
                  {directEditUrl}
                </p>
              </div>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>

            {/* Print Note */}
            <div className="hidden print:block text-xs text-slate-500 pt-4 border-t border-slate-200 text-center">
              <p className="font-semibold">ISO 9001:2015 Düzeltici Önleyici Faaliyet Takip ve Düzenleme Etiketi</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Bu barkod / QR kod doğrudan sahada mobil cihazlar ile formu güncellemek için tasarlanmıştır.
              </p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-2 print:hidden flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePrintLabel}
                disabled={isPrinting}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                title="Doğrudan yazıcıya gönder"
              >
                <Printer className="h-3.5 w-3.5" />
                {isPrinting ? "Yazdırılıyor..." : "Yazıcıya Gönder (Yazdır)"}
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isPdfLoading}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                title="A4 formatında PDF olarak kaydet ve indir"
              >
                <FileDown className="h-3.5 w-3.5" />
                {isPdfLoading ? "PDF Hazırlanıyor..." : "PDF Olarak Kaydet"}
              </button>
              <a
                href={qrCodeImageUrl}
                download={`dof-qr-${dof.refNo}.png`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                QR İndir
              </a>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="px-3.5 py-2 bg-slate-200/70 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                Paylaş
              </button>

              {onOpenMobileEdit && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenMobileEdit(dof);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Formu Aç & Düzenle
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
