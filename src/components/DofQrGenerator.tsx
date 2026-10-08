import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  QrCode, 
  Printer, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  X, 
  Info, 
  Globe, 
  FileDown,
  Building,
  Check,
  Layers,
  ChevronDown,
  Sparkles
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { Department } from "../types";
import { printElement, exportPosterPdf } from "../utils/posterExporter";

interface DofQrGeneratorProps {
  onClose: () => void;
}

export default function DofQrGenerator({ onClose }: DofQrGeneratorProps) {
  // Defined departments list
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptName, setSelectedDeptName] = useState<string>("all");
  const [isLoadingDepts, setIsLoadingDepts] = useState(true);

  // Custom base domain or default origin
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);
  const [posterTitle, setPosterTitle] = useState("DÜZELTİCİ ÖNLEYİCİ FAALİYET (DÖF)");
  const [posterSubTitle, setPosterSubTitle] = useState("BİLDİRİM FORMU");

  const [isPrinting, setIsPrinting] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // Fetch defined departments from Firestore on mount
  useEffect(() => {
    const fetchDepartments = async () => {
      setIsLoadingDepts(true);
      try {
        const snap = await getDocs(collection(db, "departments"));
        const list: Department[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as any) });
        });

        if (list.length > 0) {
          list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
          setDepartments(list);
        } else {
          // Standard default departments if none in database yet
          const defaults = [
            "Destek Hizmetleri",
            "Hukuk Müşavirliği",
            "Bilgi İşlem",
            "Müesseseler",
            "İnsan Kaynakları",
            "Mali İşler",
            "Üretim / Saha",
            "Kalite Güvence"
          ];
          setDepartments(defaults.map((name, i) => ({ id: `default-${i}`, name, isCustomQr: true })));
        }
      } catch (err) {
        console.error("Departments fetch error:", err);
        const defaults = [
          "Destek Hizmetleri",
          "Hukuk Müşavirliği",
          "Bilgi İşlem",
          "Müesseseler",
          "İnsan Kaynakları",
          "Mali İşler",
          "Üretim / Saha",
          "Kalite Güvence"
        ];
        setDepartments(defaults.map((name, i) => ({ id: `default-${i}`, name, isCustomQr: true })));
      } finally {
        setIsLoadingDepts(false);
      }
    };

    fetchDepartments();
  }, []);

  // Compute active department
  const activeDept = selectedDeptName !== "all" 
    ? departments.find(d => d.name === selectedDeptName) || null
    : null;

  // When selected department changes, adjust title and subtitle
  const handleDepartmentChange = (deptName: string) => {
    setSelectedDeptName(deptName);
    if (deptName === "all") {
      setPosterTitle("DÜZELTİCİ ÖNLEYİCİ FAALİYET (DÖF)");
      setPosterSubTitle("BİLDİRİM FORMU");
    } else {
      setPosterTitle(`${deptName.toUpperCase()} DÖF BİLDİRİM FORMU`);
      setPosterSubTitle("HIZLI BİLDİRİM KANALI");
    }
  };

  // Compute active target URL based on selection
  const computedTargetUrl = activeDept
    ? `${baseUrl}?view=submit&dept=${encodeURIComponent(activeDept.name)}`
    : `${baseUrl}?view=submit`;

  // Color theme
  const qrThemeColor = activeDept ? "059669" : "4f46e5";
  const qrHexColor = activeDept ? "#059669" : "#4f46e5";

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(computedTargetUrl)}&color=${qrThemeColor}`;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const docTitle = activeDept 
        ? `${activeDept.name} DÖF Afiş ve QR Posteri`
        : "DÖF Bildirim Formu Afiş ve QR Posteri";
      await printElement("qr-poster-printable-content", docTitle);
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
      const safeSlug = activeDept 
        ? activeDept.name.toLowerCase().replace(/[^a-z0-9]/g, "-") 
        : "genel";
      const fileName = `dof-poster-${safeSlug}.pdf`;

      await exportPosterPdf(
        "qr-poster-printable-content",
        fileName,
        {
          title: posterTitle,
          subTitle: posterSubTitle,
          departmentName: activeDept ? activeDept.name : undefined,
          targetUrl: computedTargetUrl,
          qrColor: qrHexColor,
          fileName,
        }
      );
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsPdfLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      {/* Department Selector Card (Listbox) */}
      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm print:hidden space-y-3" id="department-qr-selector-card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="dept-listbox-select" className="font-bold text-sm text-slate-800 block">
                Yazdırılabilir Form QR Kodu ve Departman Seçimi
              </label>
              <span className="text-[11px] text-slate-400 block">
                Tanımlı departmanların özel QR kodlarını liste kutusundan seçebilirsiniz ({departments.length} Birim Tanımlı)
              </span>
            </div>
          </div>
          {activeDept && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg animate-in fade-in">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {activeDept.name} Seçili
            </span>
          )}
        </div>

        {/* List Box Dropdown */}
        <div className="relative">
          <select
            id="dept-listbox-select"
            value={selectedDeptName}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            disabled={isLoadingDepts}
            className="w-full appearance-none bg-slate-50 hover:bg-slate-100/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-3 pl-4 pr-10 text-xs sm:text-sm font-semibold text-slate-800 transition cursor-pointer"
          >
            <option value="all">
              🌐 Genel DÖF Bildirim Formu (Tüm Birimler ve Ortak Alanlar)
            </option>
            <optgroup label="Tanımlı Departmanlar / Birimler">
              {departments.map((dept) => (
                <option key={dept.id || dept.name} value={dept.name}>
                  🏢 {dept.name} (Birim Özel QR Formu)
                </option>
              ))}
            </optgroup>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        {/* Quick hint for department selection */}
        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
          <span>
            {activeDept ? (
              <span className="text-emerald-700 font-medium">
                ✓ Bu QR kod okutulduğunda form otomatik olarak <strong>"{activeDept.name}"</strong> seçili olarak açılacaktır.
              </span>
            ) : (
              <span className="text-slate-500">
                • Genel form QR kodu okutulduğunda kullanıcı tüm departmanlar arasından seçim yapabilir.
              </span>
            )}
          </span>
          {activeDept && (
            <button
              type="button"
              onClick={() => handleDepartmentChange("all")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
            >
              Genel Forma Dön
            </button>
          )}
        </div>
      </div>

      {/* Target URL Customizer Input (Hidden during print) */}
      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm print:hidden space-y-3" id="qr-url-customizer-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-800">
            <Globe className="h-4.5 w-4.5 text-indigo-500" />
            <label className="font-semibold text-xs uppercase tracking-wider text-slate-500">
              QR Kod Hedef Bağlantısı (URL & Alan Adı)
            </label>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {activeDept ? `dept=${activeDept.name}` : "genel"}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Örn: https://dof.sirketiniz.com"
            className="flex-1 bg-slate-50 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-mono transition"
          />
          <button
            onClick={() => setBaseUrl(window.location.origin)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
            title="Mevcut origin adresine sıfırla"
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Poster Title Editor (Hidden during print) */}
      <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm print:hidden space-y-2" id="poster-title-customizer-card">
        <label className="font-semibold text-xs uppercase tracking-wider text-slate-500 block">
          Afiş Üst Başlığı (Düzenlenebilir)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={posterTitle}
            onChange={(e) => setPosterTitle(e.target.value)}
            placeholder="Afiş Başlığı..."
            className="bg-slate-50 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold transition"
          />
          <input
            type="text"
            value={posterSubTitle}
            onChange={(e) => setPosterSubTitle(e.target.value)}
            placeholder="Afiş Alt Başlığı..."
            className="bg-slate-50 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold transition"
          />
        </div>
      </div>

      {/* Poster Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-150 rounded-2xl shadow-2xl overflow-hidden print:border-0 print:shadow-none"
        id="qr-poster-card"
      >
        {/* Top Control Bar (Hidden during printing) */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between print:hidden flex-wrap gap-3">
          <div className="flex items-center gap-2 text-slate-700">
            <QrCode className={`h-5 w-5 ${activeDept ? "text-emerald-600" : "text-indigo-600"}`} />
            <div>
              <span className="font-bold text-sm block">
                {activeDept ? `${activeDept.name} QR Posteri` : "Genel DÖF Form QR Posteri"}
              </span>
              <span className="text-[10px] text-slate-400 block">
                Yazıcıya gönderin veya A4 formatında PDF olarak kaydedin
              </span>
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition duration-150 cursor-pointer border border-emerald-600 shadow-xs disabled:opacity-50"
              id="print-poster-btn"
              title="Doğrudan yazıcıya gönder"
            >
              <Printer className="h-4 w-4" />
              {isPrinting ? "Yazıcıya Gönderiliyor..." : "Yazıcıya Gönder (Yazdır)"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={isPdfLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition duration-150 cursor-pointer border border-indigo-600 shadow-xs disabled:opacity-50"
              id="save-pdf-poster-btn"
              title="A4 formatında PDF olarak kaydet ve indir"
            >
              <FileDown className="h-4 w-4" />
              {isPdfLoading ? "PDF Hazırlanıyor..." : "PDF Olarak Kaydet"}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              title="Kapat"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Poster Printable Content */}
        <div id="qr-poster-printable-content" className="p-8 sm:p-12 text-center bg-white space-y-8 print:p-0 print:space-y-6">
          {/* Header Badge */}
          <div className="space-y-2">
            <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 border rounded-full text-xs font-bold tracking-wider uppercase ${
              activeDept 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-indigo-50 text-indigo-700 border-indigo-100"
            }`}>
              {activeDept ? (
                <>
                  <Building className="h-4 w-4 text-emerald-600" />
                  <span>{activeDept.name} Kalite Güvence & Bildirim</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <span>Kalite Yönetim Sistemi</span>
                </>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-slate-900 uppercase leading-tight max-w-xl mx-auto">
              {posterTitle}
            </h1>
            <h2 className={`text-xl sm:text-2xl font-display font-bold uppercase tracking-widest ${
              activeDept ? "text-emerald-600" : "text-indigo-600"
            }`}>
              {posterSubTitle}
            </h2>
          </div>

          <div className="w-full border-b border-slate-100 border-dashed" />

          {/* QR Code Container with nice frames */}
          <div className="flex flex-col items-center justify-center">
            <div className={`p-5 bg-slate-50 border-4 rounded-[32px] inline-block shadow-inner relative group ${
              activeDept ? "border-emerald-600" : "border-indigo-600"
            }`}>
              <img
                src={qrCodeUrl}
                alt="DOF Formu QR Kodu"
                className="w-60 h-60 object-contain rounded-2xl border border-white bg-white shadow"
              />
              {/* Corner brackets */}
              <div className={`absolute top-3 left-3 w-5 h-5 border-t-4 border-l-4 rounded-tl-xl ${
                activeDept ? "border-emerald-600" : "border-indigo-600"
              }`} />
              <div className={`absolute top-3 right-3 w-5 h-5 border-t-4 border-r-4 rounded-tr-xl ${
                activeDept ? "border-emerald-600" : "border-indigo-600"
              }`} />
              <div className={`absolute bottom-3 left-3 w-5 h-5 border-b-4 border-l-4 rounded-bl-xl ${
                activeDept ? "border-emerald-600" : "border-indigo-600"
              }`} />
              <div className={`absolute bottom-3 right-3 w-5 h-5 border-b-4 border-r-4 rounded-br-xl ${
                activeDept ? "border-emerald-600" : "border-indigo-600"
              }`} />
            </div>

            <div className="mt-4 space-y-1.5">
              <span className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase">
                KAMERANIZ İLE TARATIN VE BİLDİRİN
              </span>
              <p className={`text-xs font-semibold flex items-center gap-1 justify-center underline select-all font-mono ${
                activeDept ? "text-emerald-700" : "text-indigo-600"
              }`}>
                {computedTargetUrl} <ExternalLink className="h-3 w-3 inline" />
              </p>
            </div>
          </div>

          <div className="w-full border-b border-slate-100 border-dashed" />

          {/* Instructions Block */}
          <div className="max-w-md mx-auto space-y-3">
            <h3 className="text-lg font-bold text-slate-800">Sürekli İyileştirmeye Katkı Sağlayın</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              {activeDept ? (
                <>
                  <strong>{activeDept.name}</strong> birimi dahilindeki uygunsuzlukları, aksaklıkları veya olası riskleri doğrudan iletmek için yukarıdaki QR kodu telefonunuzun kamerası ile okutabilirsiniz.
                </>
              ) : (
                <>
                  İş yerimizdeki uygunsuzlukları, aksaklıkları veya olası riskleri önlemek için yukarıdaki QR kodu telefonunuzun kamerası ile okutarak hızlıca bildirim yapabilirsiniz.
                </>
              )}
            </p>
            <div className="pt-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                "Güvenli ve Kaliteli Bir Çalışma Ortamı Sizin Bildiriminizle Başlar."
              </p>
            </div>
          </div>
        </div>

        {/* Info footer (Hidden during printing) */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-400 print:hidden flex flex-col sm:flex-row sm:justify-between items-center gap-2">
          <span>Bu posteri iş yerinizdeki pano, depo, ofis ve ortak alanlara asabilirsiniz.</span>
          <a
            href={qrCodeUrl}
            target="_blank"
            rel="noreferrer"
            download={`dof-qr-${activeDept ? activeDept.name.toLowerCase().replace(/[^a-z0-9]/g, "-") : "genel"}.png`}
            className="inline-flex items-center gap-1 text-indigo-600 font-bold hover:underline"
            id="download-qr-link"
          >
            <Download className="h-3.5 w-3.5" /> Sadece QR Görselini İndir
          </a>
        </div>
      </motion.div>
    </div>
  );
}
