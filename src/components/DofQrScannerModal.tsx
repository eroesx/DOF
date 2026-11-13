import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Camera, 
  X, 
  Upload, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  Search, 
  HelpCircle,
  FlipHorizontal,
  Smartphone
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

export interface ScanResult {
  refNo?: string;
  id?: string;
  raw: string;
}

interface DofQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (result: ScanResult) => void;
}

export const DofQrScannerModal: React.FC<DofQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "manual">("camera");
  const [hasScanned, setHasScanned] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCleaningUpRef = useRef(false);

  // Helper to parse scanned content
  const parseScannedText = (text: string): ScanResult => {
    const trimmed = text.trim();
    let refNo: string | undefined;
    let id: string | undefined;

    try {
      // Check if it's a URL
      const url = new URL(trimmed);
      const urlRef = url.searchParams.get("refNo") || url.searchParams.get("ref");
      const urlId = url.searchParams.get("id");
      if (urlRef) refNo = urlRef.trim();
      if (urlId) id = urlId.trim();
    } catch {
      // Not a standard URL
      if (trimmed.includes("refNo=")) {
        const match = trimmed.match(/refNo=([^&]+)/);
        if (match && match[1]) refNo = decodeURIComponent(match[1]).trim();
      }
      if (trimmed.includes("id=")) {
        const match = trimmed.match(/id=([^&]+)/);
        if (match && match[1]) id = decodeURIComponent(match[1]).trim();
      }
    }

    // Direct string heuristic
    if (!refNo && !id) {
      if (/^DOF-[A-Z0-9_-]+/i.test(trimmed)) {
        refNo = trimmed.toUpperCase();
      } else if (trimmed.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        id = trimmed;
      } else {
        refNo = trimmed;
      }
    }

    return { refNo, id, raw: trimmed };
  };

  const handleSuccessfulScan = async (decodedText: string) => {
    if (hasScanned) return;
    setHasScanned(true);

    // Provide haptic feedback on mobile if supported
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch {}
    }

    // Stop camera
    await stopScanner();

    const parsed = parseScannedText(decodedText);
    onScanSuccess(parsed);
  };

  const startScanner = async () => {
    if (!isOpen) return;
    setScannerError(null);
    setHasScanned(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsScanning(false);
      setScannerError("Bu tarayıcı/ekran canlı kamera akışını desteklemiyor veya engelliyor. Aşağıdaki 'Kamera ile Fotoğraf Çek' butonunu kullanabilirsiniz.");
      return;
    }

    try {
      // Ensure any previous instance is stopped
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch {}
      }

      const scanner = new Html5Qrcode("dof-qr-scanner-viewport", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      const scanConfig = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(160, Math.min(260, Math.floor(minEdge * 0.75)));
          return { width: size, height: size };
        },
      };

      const onDecoded = (decodedText: string) => {
        handleSuccessfulScan(decodedText);
      };
      const onFrameErr = () => {};

      // Try 1: Preferred facingMode without rigid aspectRatio (avoids OverconstrainedError on Opera/Android/iOS)
      try {
        await scanner.start({ facingMode }, scanConfig, onDecoded, onFrameErr);
        setIsScanning(true);
        return;
      } catch (primaryErr: any) {
        // Try 2: Enumerate available camera devices explicitly and start by deviceId
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            const preferredCam =
              facingMode === "environment"
                ? cameras.find((c) => /back|rear|arka|environment/i.test(c.label)) || cameras[cameras.length - 1]
                : cameras.find((c) => /front|ön|user|face/i.test(c.label)) || cameras[0];
            await scanner.start(preferredCam.id, scanConfig, onDecoded, onFrameErr);
            setIsScanning(true);
            return;
          }
        } catch (enumErr) {
          // Try 3: Opposite facingMode fallback (e.g. device only has front camera)
          try {
            const fallbackMode = facingMode === "environment" ? "user" : "environment";
            await scanner.start({ facingMode: fallbackMode }, scanConfig, onDecoded, onFrameErr);
            setIsScanning(true);
            return;
          } catch {
            throw primaryErr;
          }
        }
        throw primaryErr;
      }
    } catch (err: any) {
      console.warn("QR Camera error:", err);
      setIsScanning(false);
      const errName = err?.name || "";
      const errMsg = String(err?.message || err || "");
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError" || /permission|denied|notallowed/i.test(errMsg)) {
        setScannerError("Kamera erişim izni verilmedi veya tarayıcı tarafından engellendi. İzin verip 'Tekrar Dene'ye dokunun ya da aşağıdan doğrudan telefon kamerasıyla fotoğraf çekip taratın.");
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError" || /notfound|no camera/i.test(errMsg)) {
        setScannerError("Cihazınızda kullanılabilir kamera bulunamadı. Fotoğraf çekerek/yükleyerek tarayabilirsiniz.");
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        setScannerError("Kamera şu anda başka bir uygulama tarafından kullanılıyor. Diğer uygulamayı kapatıp tekrar deneyin veya fotoğraf çekerek taratın.");
      } else {
        setScannerError("Canlı kamera başlatılamadı. Aşağıdaki 'Kamera ile Fotoğraf Çek' butonunu kullanarak veya referans kodunu yazarak devam edebilirsiniz.");
      }
    }
  };

  const stopScanner = async () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      }
    } catch (e) {
      console.warn("Error stopping scanner:", e);
    } finally {
      setIsScanning(false);
      isCleaningUpRef.current = false;
    }
  };

  // Toggle camera between environment (back) and user (front)
  const handleToggleFacingMode = async () => {
    await stopScanner();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Handle image file scan
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScannerError(null);
    try {
      // Create temporary scanner instance for file
      const tempScanner = new Html5Qrcode("dof-qr-file-scanner-temp", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const decodedText = await tempScanner.scanFile(file, true);
      tempScanner.clear();
      handleSuccessfulScan(decodedText);
    } catch (err: any) {
      console.warn("File scan error:", err);
      setScannerError("Seçilen fotoğrafta geçerli bir DÖF QR kodu bulunamadı. Lütfen QR kodu ortalayan daha net ve aydınlık bir fotoğraf çekin.");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  // Manual code submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const parsed = parseScannedText(manualCode);
    stopScanner();
    onScanSuccess(parsed);
  };

  useEffect(() => {
    if (isOpen && activeTab === "camera") {
      // Small delay to ensure DOM element is mounted
      const timer = setTimeout(() => {
        startScanner();
      }, 250);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, activeTab, facingMode]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        id="dof-qr-scanner-modal-backdrop"
      >
        {/* Hidden container for file-based scanner */}
        <div id="dof-qr-file-scanner-temp" className="hidden" />
        {/* Native mobile OS camera capture fallback */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={nativeCameraInputRef}
          onChange={handleFileScan}
          className="hidden"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white border border-slate-150 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[92vh]"
          id="dof-qr-scanner-card"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600/80 rounded-xl text-white">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-display">DÖF QR Kod Okuyucu</h3>
                <p className="text-[11px] text-slate-400">Mobil kamera veya görsel ile anında forma erişin</p>
              </div>
            </div>
            <button
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50 p-1">
            <button
              onClick={() => setActiveTab("camera")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "camera"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              Kamera ile Tara
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "upload"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Fotoğraf Yükle
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "manual"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Kod / No Gir
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {activeTab === "camera" && (
              <div className="space-y-3.5">
                {/* Viewport Frame */}
                <div className="relative w-full aspect-square max-w-[280px] mx-auto bg-slate-950 rounded-2xl overflow-hidden shadow-inner border-2 border-slate-800">
                  <div
                    id="dof-qr-scanner-viewport"
                    className="w-full h-full object-cover"
                  />

                  {/* Laser Beam Animation overlay */}
                  {isScanning && !hasScanned && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
                      <div className="flex justify-between">
                        <div className="w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl shadow-sm" />
                        <div className="w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl shadow-sm" />
                      </div>
                      {/* Animated laser line */}
                      <motion.div
                        animate={{ y: [0, 160, 0] }}
                        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                        className="h-0.5 w-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#6366f1]"
                      />
                      <div className="flex justify-between">
                        <div className="w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl shadow-sm" />
                        <div className="w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl shadow-sm" />
                      </div>
                    </div>
                  )}

                  {/* Success Overlay */}
                  {hasScanned && (
                    <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2">
                      <CheckCircle2 className="h-12 w-12 text-emerald-400 animate-bounce" />
                      <span className="text-xs font-bold font-display">QR Kod Başarıyla Okundu!</span>
                      <span className="text-[10px] text-emerald-200">Forma yönlendiriliyorsunuz...</span>
                    </div>
                  )}
                </div>

                {/* Camera controls */}
                <div className="flex items-center justify-between px-2 gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                    QR kodu kare içine hizalayın
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="px-2.5 py-1 text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                      title="Telefonun dahili kamera uygulamasıyla fotoğraf çekerek tara"
                    >
                      <Camera className="h-3 w-3" />
                      Fotoğraf Çek
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleFacingMode}
                      className="px-2.5 py-1 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                      title="Kamerayı Değiştir"
                    >
                      <FlipHorizontal className="h-3 w-3" />
                      {facingMode === "environment" ? "Ön Kamera" : "Arka Kamera"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "upload" && (
              <div className="space-y-4 py-3">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileScan}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/30 rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-2 group"
                >
                  <div className="p-3 bg-white rounded-2xl shadow-xs border border-slate-150 group-hover:scale-105 transition">
                    <Upload className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Galeriden QR Fotoğrafı Seçin</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      PNG, JPG, JPEG veya çekilmiş ekran görüntüsü
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-indigo-700 transition"
                  >
                    Görsel Seç
                  </button>
                </div>
              </div>
            )}

            {activeTab === "manual" && (
              <form onSubmit={handleManualSubmit} className="space-y-3.5 py-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    DÖF Referans Kodu veya Bağlantı
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    QR kod altındaki referans kodunu (Örn: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">DOF-26-XXXXX</code>) veya taranan bağlantıyı girin.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Örn: DOF-26-81924 veya tam URL"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none transition font-mono"
                      autoFocus
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Search className="h-4 w-4" />
                  Formu Aç ve Düzenle
                </button>
              </form>
            )}

            {/* Error message */}
            {scannerError && (
              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="font-semibold leading-relaxed">{scannerError}</p>
                  {activeTab === "camera" && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={startScanner}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-rose-200 rounded-lg text-[11px] font-bold text-rose-800 hover:bg-rose-100 transition cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" /> Tekrar Dene
                      </button>
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold hover:bg-indigo-700 transition cursor-pointer"
                      >
                        <Camera className="h-3 w-3" /> Kamera ile Fotoğraf Çek
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info notice */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start gap-2 text-slate-500 text-[11px] leading-relaxed">
              <HelpCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                QR kod tarandığında, ilgili DÖF formu mobil cihazınızda anında açılır. Durumunu, faaliyet açıklamasını, ek fotoğrafını ve aksiyon detaylarını zahmetsizce güncelleyebilirsiniz.
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
