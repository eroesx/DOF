import React, { useState, useEffect } from "react";
import { 
  FileEdit, 
  Search, 
  Camera, 
  Lock, 
  ShieldAlert, 
  Smartphone, 
  Download, 
  CheckCircle2, 
  ArrowRight, 
  Share2, 
  PlusSquare, 
  Sparkles, 
  AlertCircle, 
  Wrench, 
  ShieldCheck, 
  Clock, 
  HelpCircle,
  X,
  ExternalLink
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

interface DofMobilePortalProps {
  onNavigate: (tab: "submit" | "track" | "admin" | "qr" | "edit") => void;
  onOpenScanner: () => void;
  onSearchRef: (refNo: string) => void;
}

export const DofMobilePortal: React.FC<DofMobilePortalProps> = ({
  onNavigate,
  onOpenScanner,
  onSearchRef,
}) => {
  const [quickRefInput, setQuickRefInput] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Check if running as standalone PWA
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for PWA beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Fetch brief stats
    const fetchQuickStats = async () => {
      try {
        const snap = await getDocs(collection(db, "dofs"));
        let total = 0;
        let open = 0;
        let resolved = 0;
        snap.forEach((doc) => {
          total++;
          const data = doc.data();
          if (data.status === "cozuldu") {
            resolved++;
          } else if (data.status === "yeni" || data.status === "inceleniyor") {
            open++;
          }
        });
        setStats({ total, open, resolved });
      } catch (err) {
        console.warn("Could not load stats for portal (non-fatal):", err);
      } finally {
        setIsStatsLoading(false);
      }
    };
    fetchQuickStats();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        setIsInstallable(false);
      } catch (err) {
        console.error("Install prompt error:", err);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      setShowIosGuide(true);
    }
  };

  const handleQuickSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRefInput.trim()) return;
    onSearchRef(quickRefInput.trim().toUpperCase());
  };

  return (
    <div className="space-y-5 pb-20 md:pb-6 animate-fade-in">
      
      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl">
        {/* Subtle decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/15 rounded-full blur-xl -ml-12 -mb-12 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/15 text-[11px] font-bold text-indigo-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ISO 9001:2015 KYS</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-300 bg-slate-950/40 px-2.5 py-1 rounded-lg border border-slate-700/50">
              Mobil Giriş Portalı
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-black font-display tracking-tight text-white leading-tight">
              DÖF Hızlı İşlem & Bildirim Merkezi
            </h1>
            <p className="text-xs text-indigo-200/90 mt-1 leading-relaxed">
              Sahada tespit ettiğiniz uygunsuzlukları bildirin, QR kod ile aksiyon alın veya mevcut DÖF durumunu sorgulayın.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          {!isStatsLoading && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/15">
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 text-center border border-white/10">
                <span className="text-[10px] text-indigo-200 font-bold block uppercase tracking-wider">Toplam</span>
                <span className="text-lg font-black text-white">{stats.total}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 text-center border border-white/10">
                <span className="text-[10px] text-amber-200 font-bold block uppercase tracking-wider">Devam Eden</span>
                <span className="text-lg font-black text-amber-300">{stats.open}</span>
              </div>
              <div className="bg-white/10 backdrop-blur-xs rounded-xl p-2.5 text-center border border-white/10">
                <span className="text-[10px] text-emerald-200 font-bold block uppercase tracking-wider">Tamamlanan</span>
                <span className="text-lg font-black text-emerald-300">{stats.resolved}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobil Uygulama Kısayolu (PWA Ekle) Kartı */}
      {!isInstalled && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200 shrink-0">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                    Mobil Uygulama Kısayolu Ekle
                  </h3>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                    Önerilen
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Uygulamayı telefonunuzun ana ekranına ekleyerek tek dokunuşla ve tam ekran hızında kullanın.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-md shadow-emerald-200 transition cursor-pointer active:scale-95 shrink-0"
              id="pwa-install-btn"
            >
              <Download className="h-4 w-4" />
              <span>Ana Ekrana Ekle</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 Büyük Dokunmatik Ana Aksiyon Kartı */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Hızlı Menü & Saha İşlemleri
          </h2>
          <span className="text-[10px] text-slate-400">Dokunarak başlatın</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          
          {/* Action 1: Yeni DÖF Bildir */}
          <div 
            onClick={() => onNavigate("submit")}
            className="group bg-white border border-slate-200/90 hover:border-indigo-500 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] flex flex-col justify-between relative overflow-hidden"
            id="portal-card-submit"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-6 -mt-6 transition group-hover:scale-125" />
            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 group-hover:bg-indigo-700 transition">
                  <FileEdit className="h-6 w-6" />
                </div>
                <span className="p-1.5 rounded-xl bg-slate-50 group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600 transition">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                  Yeni DÖF Bildir
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Sahada tespit ettiğiniz uygunsuzluk veya iyileştirmeyi fotoğraflı olarak hemen bildirin.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-600">
              <span>Hızlı Formu Aç</span>
              <span className="text-slate-400 font-normal">Kamera destekli</span>
            </div>
          </div>

          {/* Action 2: QR Kod Okut */}
          <div 
            onClick={onOpenScanner}
            className="group bg-white border border-slate-200/90 hover:border-purple-500 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] flex flex-col justify-between relative overflow-hidden"
            id="portal-card-qr-scan"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-full -mr-6 -mt-6 transition group-hover:scale-125" />
            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-100 group-hover:bg-purple-700 transition">
                  <Camera className="h-6 w-6" />
                </div>
                <span className="p-1.5 rounded-xl bg-slate-50 group-hover:bg-purple-50 text-slate-400 group-hover:text-purple-600 transition">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-600 transition">
                  Kamera ile QR Kod Okut
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Afiş, makine veya hat üzerindeki DÖF QR etiketini kamerayla tarayarak anında işlem yapın.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-purple-600">
              <span>Kamerayı Aç</span>
              <span className="text-slate-400 font-normal">Otomatik algılama</span>
            </div>
          </div>

          {/* Action 3: DÖF Durumu Takip */}
          <div 
            className="group bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs transition-all duration-200 flex flex-col justify-between relative overflow-hidden"
            id="portal-card-track"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div 
                  onClick={() => onNavigate("track")} 
                  className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-100 cursor-pointer"
                >
                  <Search className="h-6 w-6" />
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate("track")}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>Takip Ekranı</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  DÖF Durumu Sorgula
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Referans numaranız ile bildirimin durumunu, sorumlu birimi ve çözüm aşamalarını sorgulayın.
                </p>
              </div>

              {/* In-Card Quick Search Form */}
              <form onSubmit={handleQuickSubmitSearch} className="pt-2 flex gap-2">
                <input
                  type="text"
                  value={quickRefInput}
                  onChange={(e) => setQuickRefInput(e.target.value)}
                  placeholder="Örn: DOF-2026-..."
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  Sorgula
                </button>
              </form>
            </div>
          </div>

          {/* Action 4: Yönetici & Birim Girişi */}
          <div 
            onClick={() => onNavigate("admin")}
            className="group bg-white border border-slate-200/90 hover:border-slate-800 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99] flex flex-col justify-between relative overflow-hidden"
            id="portal-card-admin"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-100 rounded-full -mr-6 -mt-6 transition group-hover:scale-125" />
            <div className="space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-300 group-hover:bg-slate-800 transition">
                  <Lock className="h-6 w-6" />
                </div>
                <span className="p-1.5 rounded-xl bg-slate-50 group-hover:bg-slate-200 text-slate-400 group-hover:text-slate-900 transition">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Yönetici & Birim Girişi
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Kalite yöneticisi veya ilgili departman sorumlusu paneline erişin, aksiyonları yönetin ve onaylayın.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-800">
              <span>Panele Giriş Yap</span>
              <span className="text-slate-400 font-normal">Şifre / Yetkili</span>
            </div>
          </div>

        </div>
      </div>

      {/* Standart & Termin Süresi Bilgilendirmesi */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            DÖF Çözüm Süresi Standartları
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100">
            <Wrench className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-indigo-950 block">Düzeltici Faaliyet</span>
              <span className="text-[11px] text-indigo-800">Varsayılan Termin: <strong>3 İş Günü</strong> (Haftasonu hariç)</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-teal-50/70 border border-teal-100">
            <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-teal-950 block">Önleyici Faaliyet</span>
              <span className="text-[11px] text-teal-800">Varsayılan Termin: <strong>7 İş Günü</strong> (Haftasonu hariç)</span>
            </div>
          </div>
        </div>
      </div>

      {/* iOS & Android PWA Installation Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-slide-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {isIos ? "iPhone / iPad Ana Ekrana Ekle" : "Telefona Uygulama Olarak Ekle"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
              {isIos ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-slate-900">Safari Alt Çubuğuna Bakın</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Tarayıcınızın alt kısmındaki <strong>Paylaş</strong> simgesine dokunun.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-slate-900">'Ana Ekrana Ekle' Seçeneğini Seçin</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Menüyü aşağı kaydırıp <strong>[+] Ana Ekrana Ekle</strong> butonuna dokunun.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                    <div>
                      <p className="font-bold text-slate-900">'Ekle' Butonuna Dokunun</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sağ üst köşedeki <strong>Ekle</strong> butonuna dokunun. DÖF Sistemi ana ekranınızda bağımsız bir mobil uygulama olarak yer alacaktır.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                    <div>
                      <p className="font-bold text-slate-900">Tarayıcı Menüsünü Açın</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sağ üstteki <strong>üç nokta [⋮]</strong> menü butonuna dokunun.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                    <div>
                      <p className="font-bold text-slate-900">'Uygulamayı Yükle' veya 'Ana Ekrana Ekle'</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Listeden <strong>Uygulamayı Yükle / Ana Ekrana Ekle</strong> seçeneğini seçin.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition cursor-pointer shadow-md shadow-indigo-100"
              >
                Anladım, Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DofMobilePortal;
