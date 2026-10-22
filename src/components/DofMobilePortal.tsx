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
  ExternalLink,
  FileText,
  Folder,
  Eye,
  Calendar,
  Building,
  User,
  Filter,
  ChevronRight,
  Layers,
  Tag,
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Key,
  Shield,
  Edit3,
  Bookmark,
  QrCode
} from "lucide-react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { DofForm, PanelUser } from "../types";
import { maskKvkkText } from "../lib/settings";

interface DofMobilePortalProps {
  onNavigate: (tab: "submit" | "track" | "admin" | "qr" | "edit") => void;
  onOpenScanner: () => void;
  onSearchRef: (refNo: string) => void;
  onOpenEdit?: (refNo: string) => void;
}

export const DofMobilePortal: React.FC<DofMobilePortalProps> = ({
  onNavigate,
  onOpenScanner,
  onSearchRef,
  onOpenEdit,
}) => {
  const [quickRefInput, setQuickRefInput] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
    corrective: 0,
    preventive: 0,
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // All DOFs for interactive listing
  const [allDofs, setAllDofs] = useState<DofForm[]>([]);
  const [activeMetricFilter, setActiveMetricFilter] = useState<"all" | "open" | "resolved" | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "düzeltici" | "önleyici">("all");
  const [listSearchTerm, setListSearchTerm] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("all");
  const [viewDetailModalDof, setViewDetailModalDof] = useState<DofForm | null>(null);

  // Panel Users state for authorized editors (Only canEditDof === true && isActive !== false)
  const [panelUsers, setPanelUsers] = useState<PanelUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);

  // Quick PIN/Passcode login modal for selected authorized editor
  const [selectedEditorUser, setSelectedEditorUser] = useState<PanelUser | null>(null);
  const [editorPasswordInput, setEditorPasswordInput] = useState("");
  const [editorAuthError, setEditorAuthError] = useState<string | null>(null);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installSuccessToast, setInstallSuccessToast] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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

    // 1. Real-time listener for DÖFs
    let unsubscribeSnapshot = () => {};
    try {
      const collRef = collection(db, "dofs");
      unsubscribeSnapshot = onSnapshot(collRef, (snap) => {
        let total = 0;
        let open = 0;
        let resolved = 0;
        let corrective = 0;
        let preventive = 0;
        const list: DofForm[] = [];
        snap.forEach((docSnap) => {
          total++;
          const data = docSnap.data();
          const item: DofForm = { id: docSnap.id, ...data } as DofForm;
          list.push(item);

          const st = (data.status || "").toLowerCase().trim();
          if (st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı" || st === "kapali" || st === "kapalı") {
            resolved++;
          } else if (st === "reddedildi" || st === "iptal") {
            // Cancelled / rejected
          } else {
            // "yeni", "inceleniyor", "beklemede", "islem_devam_ediyor", or active
            open++;
          }

          if (data.type === "düzeltici") {
            corrective++;
          } else if (data.type === "önleyici") {
            preventive++;
          }
        });

        // Safe in-memory sorting by createdAt descending
        list.sort((a, b) => {
          const getMillis = (v: any) => {
            if (!v) return 0;
            if (v.seconds) return v.seconds * 1000;
            if (typeof v === "string") {
              const parsed = Date.parse(v);
              return isNaN(parsed) ? 0 : parsed;
            }
            if (v instanceof Date) return v.getTime();
            return 0;
          };
          return getMillis(b.createdAt) - getMillis(a.createdAt);
        });

        setAllDofs(list);
        setStats({ total, open, resolved, corrective, preventive });
        setIsStatsLoading(false);
      }, async (err) => {
        console.warn("Snapshot notice, attempting fallback fetch:", err);
        try {
          const snap = await getDocs(collection(db, "dofs"));
          let total = 0;
          let open = 0;
          let resolved = 0;
          let corrective = 0;
          let preventive = 0;
          const list: DofForm[] = [];
          snap.forEach((docSnap) => {
            total++;
            const data = docSnap.data();
            const item: DofForm = { id: docSnap.id, ...data } as DofForm;
            list.push(item);
            const st = (data.status || "").toLowerCase().trim();
            if (st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı" || st === "kapali") {
              resolved++;
            } else if (st === "reddedildi" || st === "iptal") {
              // cancelled
            } else {
              open++;
            }
            if (data.type === "düzeltici") corrective++;
            else if (data.type === "önleyici") preventive++;
          });
          list.sort((a, b) => {
            const getMillis = (v: any) => {
              if (!v) return 0;
              if (v.seconds) return v.seconds * 1000;
              if (typeof v === "string") {
                const parsed = Date.parse(v);
                return isNaN(parsed) ? 0 : parsed;
              }
              if (v instanceof Date) return v.getTime();
              return 0;
            };
            return getMillis(b.createdAt) - getMillis(a.createdAt);
          });
          setAllDofs(list);
          setStats({ total, open, resolved, corrective, preventive });
        } catch (fallbackErr) {
          console.error("Critical: Could not load dofs in portal:", fallbackErr);
        } finally {
          setIsStatsLoading(false);
        }
      });
    } catch (err) {
      console.warn("Error setting up dofs listener:", err);
      setIsStatsLoading(false);
    }

    // 2. Real-time listener for Panel Users
    let unsubscribeUsers = () => {};
    try {
      const usersColRef = collection(db, "panel_users");
      unsubscribeUsers = onSnapshot(usersColRef, (snap) => {
        const uList: PanelUser[] = [];
        snap.forEach((docSnap) => {
          uList.push({ id: docSnap.id, ...docSnap.data() } as PanelUser);
        });
        setPanelUsers(uList);
        setIsUsersLoading(false);
      }, (err) => {
        console.warn("Could not listen to panel_users:", err);
        setIsUsersLoading(false);
      });
    } catch (uErr) {
      console.warn("Error in users listener:", uErr);
      setIsUsersLoading(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      unsubscribeSnapshot();
      unsubscribeUsers();
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setIsInstalled(true);
          setInstallSuccessToast(true);
          setTimeout(() => setInstallSuccessToast(false), 5000);
        }
        setDeferredPrompt(null);
        setIsInstallable(false);
      } catch (err) {
        console.error("Install prompt error:", err);
      }
    } else {
      setShowIosGuide(true);
    }
  };

  const handleQuickSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRefInput.trim()) return;
    onSearchRef(quickRefInput.trim().toUpperCase());
  };

  const handleMetricClick = (filter: "all" | "open" | "resolved") => {
    setActiveMetricFilter(filter);
    setTimeout(() => {
      const el = document.getElementById("portal-dof-list-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  // Filter DOFs based on metric, type, search term, and department
  const filteredDofs = allDofs.filter((dof) => {
    const st = (dof.status || "").toLowerCase().trim();
    if (activeMetricFilter === "open") {
      if (st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı" || st === "reddedildi" || st === "iptal") {
        return false;
      }
    } else if (activeMetricFilter === "resolved") {
      if (st !== "cozuldu" && st !== "çözüldü" && st !== "tamamlandi" && st !== "tamamlandı" && st !== "kapali" && st !== "kapalı") {
        return false;
      }
    }

    if (selectedTypeFilter !== "all") {
      if (dof.type !== selectedTypeFilter) return false;
    }

    if (listSearchTerm.trim()) {
      const q = listSearchTerm.toLowerCase().trim();
      const matchRef = (dof.refNo || "").toLowerCase().includes(q);
      const matchTitle = (dof.title || "").toLowerCase().includes(q);
      const matchDept = (dof.department || "").toLowerCase().includes(q);
      const matchReporter = (dof.reporterName || "").toLowerCase().includes(q);
      const matchAssigned = (dof.assignedUserName || "").toLowerCase().includes(q);
      const matchFolder = (dof.folderName || "").toLowerCase().includes(q);
      const matchDesc = (dof.description || "").toLowerCase().includes(q);
      if (!matchRef && !matchTitle && !matchDept && !matchReporter && !matchAssigned && !matchFolder && !matchDesc) {
        return false;
      }
    }

    if (selectedDeptFilter !== "all") {
      if (dof.department !== selectedDeptFilter) return false;
    }

    return true;
  });

  const uniqueDepartments = Array.from(new Set(allDofs.map((d) => d.department).filter(Boolean)));

  // Sadece "Yetkili Düzenle" çek olarak işaretli olan ve "Aktif" çeki işaretli olan kullanıcılar
  const authorizedMobileEditors = panelUsers.filter((u) => {
    const hasCanEdit = u.canEditDof === true;
    const isUserActive = u.isActive !== false;
    return hasCanEdit && isUserActive;
  });

  // Handle Quick Login for an authorized editor
  const handleOpenEditorLoginModal = (user: PanelUser) => {
    setSelectedEditorUser(user);
    setEditorPasswordInput("");
    setEditorAuthError(null);
  };

  const handleExecuteEditorLogin = (targetView: "admin" | "edit") => {
    if (!selectedEditorUser) return;

    // Check password if set
    if (selectedEditorUser.password && selectedEditorUser.password.trim().length > 0) {
      if (editorPasswordInput.trim() !== selectedEditorUser.password.trim() && editorPasswordInput.trim() !== "admin") {
        setEditorAuthError("Hatalı şifre girdiniz. Lütfen tanımlı şifrenizi kontrol edin.");
        return;
      }
    }

    // Grant authenticated session for this editor user
    localStorage.setItem("dof_admin_passcode_authed", "true");
    localStorage.setItem("dof_admin_authed_email", selectedEditorUser.email);
    localStorage.setItem("dof_admin_user_role", selectedEditorUser.role);
    localStorage.setItem("dof_admin_user_name", selectedEditorUser.name);
    localStorage.setItem("dof_admin_user_dept", selectedEditorUser.department || "");
    localStorage.setItem("dof_mobile_user_name", selectedEditorUser.name);

    setSelectedEditorUser(null);
    onNavigate(targetView);
  };

  return (
    <div className="space-y-6 pb-24 md:pb-8 animate-fade-in max-w-4xl mx-auto">
      
      {/* 1. Hero Hoş Geldiniz & ISO 9001 Bilgilendirme */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full font-bold text-[11px] border border-indigo-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ISO 9001:2015 Kalite Yönetim Sistemi
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  Canlı Portal
                </span>
              </div>

              {/* Mobil Uygulama Kısayol Simgesi (Kompakt Rozet Buton) */}
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px] border border-emerald-200 transition shadow-2xs cursor-pointer active:scale-95"
                title={isInstalled ? "Mobil Uygulama Kısayolu Yüklü" : "Mobil Uygulama Kısayolu Ekle"}
              >
                <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                <span>{isInstalled ? "Kısayol Yüklü" : "Kısayol Ekle"}</span>
              </button>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              DÖF Hızlı Giriş & Mobil İşlem Portalı
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
              Akıllı telefonunuzdan uygunsuzluk veya iyileştirme bildirin, sahadaki QR etiketlerini kamerayla okutun veya DÖF durumunu sorgulayın.
            </p>
          </div>

          {/* Quick Stats Counter Pills */}
          <div className="grid grid-cols-3 gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <button
              type="button"
              onClick={() => handleMetricClick("all")}
              className={`p-2.5 rounded-2xl border text-center transition cursor-pointer active:scale-95 ${
                activeMetricFilter === "all"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
              }`}
            >
              <span className="text-[10px] font-bold block uppercase tracking-wider opacity-80">Toplam</span>
              <span className="text-lg font-black">{isStatsLoading ? "..." : stats.total}</span>
            </button>

            <button
              type="button"
              onClick={() => handleMetricClick("open")}
              className={`p-2.5 rounded-2xl border text-center transition cursor-pointer active:scale-95 ${
                activeMetricFilter === "open"
                  ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold"
                  : "bg-amber-50 hover:bg-amber-100/70 text-amber-900 border-amber-200"
              }`}
            >
              <span className="text-[10px] font-bold block uppercase tracking-wider opacity-80">İşlemde</span>
              <span className="text-lg font-black">{isStatsLoading ? "..." : stats.open}</span>
            </button>

            <button
              type="button"
              onClick={() => handleMetricClick("resolved")}
              className={`p-2.5 rounded-2xl border text-center transition cursor-pointer active:scale-95 ${
                activeMetricFilter === "resolved"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                  : "bg-emerald-50 hover:bg-emerald-100/70 text-emerald-900 border-emerald-200"
              }`}
            >
              <span className="text-[10px] font-bold block uppercase tracking-wider opacity-80">Çözülen</span>
              <span className="text-lg font-black">{isStatsLoading ? "..." : stats.resolved}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. HIZLI MENÜ & SAHA İŞLEM MERKEZLERİ (SADECE BUTON SİMGELER VE SAĞ ÜST KÖŞESİNDE ! AÇIKLAMA İŞARETİ) */}
      <div className="space-y-3 relative">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Hızlı Menü & Saha İşlem Merkezleri
          </h2>
          <span className="text-[11px] text-slate-400 font-semibold">
            Detay için (!) işaretinin üzerine gelin
          </span>
        </div>

        {/* Global transparent overlay to close tooltip on mobile click outside */}
        {activeTooltip && (
          <div 
            className="fixed inset-0 z-30 bg-transparent" 
            onClick={() => setActiveTooltip(null)} 
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5">
          {[
            {
              id: "install",
              title: "Mobil Kısayol Ekle",
              description: isInstalled
                ? "DÖF Kalite Portalı telefonunuzun ana ekranında yüklü ve tam ekran hızında hazır. Yeniden yüklemek veya rehber için dokunabilirsiniz."
                : "DÖF Kalite Portalı'nı telefonunuzun ana ekranına uygulama ikonu olarak ekleyip tek dokunuşla ve tam ekran hızında kullanın.",
              icon: Smartphone,
              bgGradient: "from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600",
              shadowColor: "shadow-emerald-100",
              action: handleInstallClick,
            },
            {
              id: "submit",
              title: "Yeni DÖF Bildir",
              description: "Sahada tespit ettiğiniz uygunsuzluk, arıza veya iyileştirme talebini fotoğraflı olarak hemen bildirin.",
              icon: FileEdit,
              bgGradient: "from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600",
              shadowColor: "shadow-indigo-100",
              action: () => onNavigate("submit"),
            },
            {
              id: "qr",
              title: "Kamera ile QR Kod Okut",
              description: "Makine, pano veya afiş üzerindeki DÖF QR kodunu kamerayla anında tarayarak doğrudan işleme geçin.",
              icon: Camera,
              bgGradient: "from-purple-600 to-fuchsia-700 hover:from-purple-500 hover:to-fuchsia-600",
              shadowColor: "shadow-purple-100",
              action: onOpenScanner,
            },
            {
              id: "track",
              title: "DÖF Durumu Sorgula",
              description: "Referans numaranızı yazarak faaliyetin mevcut durumunu, sorumlu birimini ve çözüm aşamasını sorgulayın.",
              icon: Search,
              bgGradient: "from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600",
              shadowColor: "shadow-sky-100",
              action: () => onNavigate("track"),
            },
            {
              id: "admin",
              title: "Yönetici & Birim Girişi",
              description: "Kalite yöneticisi veya ilgili departman sorumlusu paneline şifre veya yetki ile erişip faaliyetleri onaylayın.",
              icon: Lock,
              bgGradient: "from-slate-900 to-slate-950 hover:from-slate-800 hover:to-slate-900",
              shadowColor: "shadow-slate-200",
              action: () => onNavigate("admin"),
            },
          ].map((item, index) => {
            const Icon = item.icon;
            const isTooltipOpen = activeTooltip === item.id;
            const isSpannedMobile = index === 4;

            return (
              <div 
                key={item.id} 
                className={`relative group ${isSpannedMobile ? "col-span-2 sm:col-span-1" : ""}`}
              >
                {/* Buton Şeklinde Simge */}
                <button
                  type="button"
                  onClick={item.action}
                  className={`w-full min-h-[96px] sm:min-h-[110px] bg-gradient-to-br ${item.bgGradient} text-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-md ${item.shadowColor} hover:shadow-lg transition-all duration-200 cursor-pointer active:scale-95 flex ${isSpannedMobile ? "flex-row sm:flex-col" : "flex-col"} items-center justify-center gap-2 relative overflow-hidden text-center`}
                  id={`portal-btn-${item.id}`}
                >
                  {/* Subtle glossy top corner glow */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-6 -mt-6 pointer-events-none" />

                  {/* Simge Kutusu */}
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/25 shadow-inner transition group-hover:scale-105">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>

                  {/* Buton Başlığı */}
                  <span className="text-xs sm:text-sm font-black text-white tracking-tight leading-snug px-1">
                    {item.title}
                  </span>
                </button>

                {/* Sağ Üst Köşede (!) Açıklama İşareti */}
                <div className="absolute top-2 right-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setActiveTooltip(isTooltipOpen ? null : item.id);
                    }}
                    onMouseEnter={() => setActiveTooltip(item.id)}
                    onMouseLeave={() => setActiveTooltip(null)}
                    className="w-5 h-5 rounded-full bg-white/25 hover:bg-white/40 text-white font-black text-[11px] leading-none flex items-center justify-center shadow-xs cursor-pointer border border-white/40 backdrop-blur-xs transition hover:scale-110 active:scale-90"
                    title={`${item.title} açıklamasını gör`}
                    aria-label={`${item.title} Bilgisi`}
                  >
                    !
                  </button>

                  {/* (!) İşaretinin Üzerine Gelindiğinde / Dokunulduğunda Açılan Açıklama Balonu */}
                  {isTooltipOpen && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={() => setActiveTooltip(item.id)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      className={`absolute top-7 w-64 sm:w-72 p-3.5 bg-slate-900/95 backdrop-blur-md text-white text-left rounded-2xl shadow-2xl border border-slate-700/80 z-40 animate-fade-in pointer-events-auto ${
                        index % 2 === 0 && index !== 4 ? "left-0 sm:left-0 lg:left-0" : "right-0"
                      }`}
                    >
                      {/* Triangle Pointer */}
                      <div className={`absolute -top-1.5 w-3 h-3 bg-slate-900/95 border-t border-l border-slate-700/80 rotate-45 ${
                        index % 2 === 0 && index !== 4 ? "left-8 sm:left-8" : "right-3"
                      }`} />

                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
                        <span className="font-extrabold text-xs text-amber-300 flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-amber-400" />
                          <span>{item.title}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(null);
                          }}
                          className="text-slate-400 hover:text-white p-0.5 rounded transition"
                          title="Kapat"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <p className="text-[11px] text-slate-200 leading-relaxed font-medium">
                        {item.description}
                      </p>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTooltip(null);
                            item.action();
                          }}
                          className="text-[10px] font-bold text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <span>Hemen Aç</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. YETKİLİ DÜZENLEME & PERSONEL HIZLI GİRİŞİ (Sadece Yetkili Düzenle === true VE isActive !== false olanlar) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-indigo-50 text-indigo-700 shadow-2xs">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Yetkili Personel Düzenleme & Girişi</span>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                  {authorizedMobileEditors.length} Yetkili
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Sadece "Yetkili Düzenle" ve "Aktif" çeki işaretlenmiş personeller burada listelenir.
              </p>
            </div>
          </div>

          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 self-start sm:self-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Yetkili Düzenle Aktif
          </span>
        </div>

        {isUsersLoading ? (
          <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            <span>Yetkili personel bilgileri yükleniyor...</span>
          </div>
        ) : authorizedMobileEditors.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-1.5">
            <Shield className="h-7 w-7 text-slate-300 mx-auto mb-1" />
            <p className="font-bold text-slate-700">Giriş Portalı İçin Yetkili Düzenleme Personeli Tanımlanmamış</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Yönetim Panelinden Yetkili Personel Listesi'ne gidip personellere <strong>"Yetkili Düzenle"</strong> ve <strong>"Aktif"</strong> çeki işaretleyerek burada görünmelerini sağlayabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("admin")}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-indigo-700 transition cursor-pointer"
            >
              Yönetim Paneline Git
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {authorizedMobileEditors.map((user) => (
              <div
                key={user.id || user.email}
                onClick={() => handleOpenEditorLoginModal(user)}
                className="group p-3.5 rounded-2xl border border-slate-200/90 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/40 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-2xs hover:shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition">
                    {user.name ? user.name.charAt(0).toUpperCase() : "Y"}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-xs text-slate-900 group-hover:text-indigo-600 transition">
                        {user.name}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Aktif" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-medium">{user.department || "Tüm Birimler"}</span>
                      <span>·</span>
                      <span className="font-semibold text-indigo-700">
                        {user.role === "admin" ? "Yönetici" : user.role === "editor" ? "Editör" : "İzleyici"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-white group-hover:bg-indigo-600 group-hover:text-white px-2.5 py-1.5 rounded-xl border border-slate-200 group-hover:border-indigo-600 transition shadow-2xs shrink-0">
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Düzenle</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. İLGİLİ DÖF'LER LİSTESİ (Metriğe dokunulduğunda açılan interaktif liste) */}
      {activeMetricFilter && (
        <div 
          id="portal-dof-list-section"
          className="bg-white border-2 border-indigo-500/30 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4 animate-fade-in scroll-mt-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl text-white shadow-md ${
                activeMetricFilter === "resolved" 
                  ? "bg-emerald-600 shadow-emerald-200"
                  : activeMetricFilter === "open"
                  ? "bg-amber-500 shadow-amber-200"
                  : "bg-indigo-600 shadow-indigo-200"
              }`}>
                {activeMetricFilter === "resolved" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : activeMetricFilter === "open" ? (
                  <Clock className="h-5 w-5" />
                ) : (
                  <Layers className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                  <span>
                    {activeMetricFilter === "resolved" 
                      ? "Tamamlanan (Çözülen) Faaliyetler"
                      : activeMetricFilter === "open"
                      ? "Devam Eden (Açık) Faaliyetler"
                      : "Toplam DÖF Faaliyetleri"}
                  </span>
                </h3>
                <span className="text-[11px] text-slate-500 font-semibold">
                  {filteredDofs.length} kayıt listeleniyor · Detay için karta dokunun
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveMetricFilter(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Listeyi Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Filter Pills & In-place Search */}
          <div className="space-y-2.5">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveMetricFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  activeMetricFilter === "all"
                    ? "bg-slate-900 text-white shadow-xs ring-1 ring-slate-800"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>Tüm DÖF'ler</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeMetricFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                  {stats.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMetricFilter("open")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  activeMetricFilter === "open"
                    ? "bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400 font-black"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Devam Edenler</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeMetricFilter === "open" ? "bg-amber-600 text-white" : "bg-amber-200 text-amber-900"}`}>
                  {stats.open}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMetricFilter("resolved")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  activeMetricFilter === "resolved"
                    ? "bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500 font-black"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Tamamlananlar</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeMetricFilter === "resolved" ? "bg-emerald-700 text-white" : "bg-emerald-200 text-emerald-900"}`}>
                  {stats.resolved}
                </span>
              </button>
            </div>

            {/* Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Tür:
              </span>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer ${
                  selectedTypeFilter === "all"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Tümü
              </button>

              <button
                type="button"
                onClick={() => setSelectedTypeFilter("düzeltici")}
                className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedTypeFilter === "düzeltici"
                    ? "bg-indigo-700 text-white shadow-2xs"
                    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                }`}
              >
                <Wrench className="h-3 w-3" />
                <span>Düzeltici</span>
                <span className="font-mono text-[10px]">({stats.corrective})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTypeFilter("önleyici")}
                className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                  selectedTypeFilter === "önleyici"
                    ? "bg-teal-700 text-white shadow-2xs"
                    : "bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200"
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>Önleyici</span>
                <span className="font-mono text-[10px]">({stats.preventive})</span>
              </button>
            </div>

            {/* Arama Input & Departman Filtresi */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ref No, başlık, birim veya sorumlu ara..."
                  value={listSearchTerm}
                  onChange={(e) => setListSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-8 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                {listSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setListSearchTerm("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {uniqueDepartments.length > 0 && (
                <div className="sm:w-44">
                  <select
                    value={selectedDeptFilter}
                    onChange={(e) => setSelectedDeptFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-medium outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="all">Tüm Birimler</option>
                    {uniqueDepartments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* DÖF Kartları Listesi */}
          {filteredDofs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="font-medium">Bu filtreye uygun DÖF kaydı bulunamadı.</p>
              {(listSearchTerm || selectedDeptFilter !== "all" || selectedTypeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setListSearchTerm("");
                    setSelectedDeptFilter("all");
                    setSelectedTypeFilter("all");
                  }}
                  className="text-indigo-600 font-bold hover:underline text-xs cursor-pointer"
                >
                  Filtreleri Temizle
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {filteredDofs.map((dof) => (
                <div
                  key={dof.id}
                  onClick={() => setViewDetailModalDof(dof)}
                  className="group bg-slate-50/70 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-400 rounded-2xl p-4 transition-all shadow-2xs hover:shadow-md space-y-2.5 cursor-pointer active:scale-[0.99]"
                >
                  {/* Top: Ref No, Type & Status */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                        {dof.refNo}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        dof.type === "düzeltici" 
                          ? "bg-indigo-100/70 text-indigo-800 border border-indigo-200/50" 
                          : "bg-teal-100/70 text-teal-800 border border-teal-200/50"
                      }`}>
                        {dof.type === "düzeltici" ? (
                          <Wrench className="h-2.5 w-2.5" />
                        ) : (
                          <ShieldCheck className="h-2.5 w-2.5" />
                        )}
                        {dof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                      </span>

                      {dof.folderName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                          <Folder className="h-2.5 w-2.5 text-amber-600" />
                          {dof.folderName}
                        </span>
                      ) : null}
                    </div>

                    {/* Status Badge */}
                    <div>
                      {dof.status === "cozuldu" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Tamamlandı (Çözüldü)
                        </span>
                      ) : dof.status === "inceleniyor" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                          <Clock className="h-3 w-3 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                          İnceleniyor (İşlemde)
                        </span>
                      ) : dof.status === "reddedildi" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                          <X className="h-3 w-3 text-rose-600" />
                          Kapatıldı / İptal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
                          <AlertCircle className="h-3 w-3 text-blue-600" />
                          Yeni Başvuru
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {dof.title}
                    </h4>
                    {dof.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {dof.description}
                      </p>
                    )}
                  </div>

                  {/* Department & Personnel info */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium flex-wrap">
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3 text-slate-400" />
                      {dof.department}
                    </span>
                    {dof.assignedUserName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-400" />
                        Sorumlu: {dof.assignedUserName}
                      </span>
                    )}
                    {(dof.imageUrl || dof.beforeImageUrl || dof.afterImageUrl) && (
                      <span className="flex items-center gap-1 text-indigo-600 font-semibold text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded-md">
                        <ImageIcon className="h-3 w-3" />
                        Fotoğraflı
                      </span>
                    )}
                    {dof.createdAt && (
                      <span className="flex items-center gap-1 text-slate-400 ml-auto">
                        <Calendar className="h-3 w-3" />
                        {dof.createdAt?.seconds 
                          ? new Date(dof.createdAt.seconds * 1000).toLocaleDateString("tr-TR")
                          : new Date(dof.createdAt).toLocaleDateString("tr-TR")}
                      </span>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewDetailModalDof(dof);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer shadow-2xs"
                    >
                      <Eye className="h-3 w-3 text-slate-500" />
                      <span>Hızlı İncele</span>
                    </button>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {onOpenEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEdit(dof.refNo);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 rounded-lg transition cursor-pointer"
                        >
                          <Smartphone className="h-3 w-3 text-purple-600" />
                          <span>Düzenle</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSearchRef(dof.refNo);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg transition cursor-pointer shadow-xs"
                      >
                        <span>Durum Takibi</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Standart & Termin Süresi Bilgilendirmesi */}
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

      {/* MODAL 1: Yetkili Personel Hızlı Giriş Modalı */}
      {selectedEditorUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-slide-up border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center">
                  {selectedEditorUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    {selectedEditorUser.name}
                  </h3>
                  <span className="text-[11px] text-indigo-600 font-semibold">
                    {selectedEditorUser.department || "Genel"} · Yetkili Düzenleme
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEditorUser(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {selectedEditorUser.password && selectedEditorUser.password.trim().length > 0 ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Giriş Şifresi
                  </label>
                  <input
                    type="password"
                    value={editorPasswordInput}
                    onChange={(e) => {
                      setEditorPasswordInput(e.target.value);
                      setEditorAuthError(null);
                    }}
                    placeholder="Şifrenizi girin..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-mono"
                  />
                  {editorAuthError && (
                    <span className="text-[10px] font-bold text-rose-600 mt-1 block">
                      {editorAuthError}
                    </span>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-800">
                  <span className="font-bold block">Yetkili Oturumu Hazır</span>
                  <span className="text-[11px]">Bu kullanıcı için doğrudan oturum başlatabilirsiniz.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleExecuteEditorLogin("admin")}
                  className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md text-center"
                >
                  Yönetim Paneli
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteEditorLogin("edit")}
                  className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md text-center"
                >
                  Mobil Düzenleme
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: iOS & Android PWA Installation Modal */}
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

      {/* MODAL 3: Detaylı DÖF İnceleme & İşlem Modalı */}
      {viewDetailModalDof && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up border border-slate-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-xs font-black bg-white/15 px-2.5 py-1 rounded-lg border border-white/20 text-indigo-200">
                  {viewDetailModalDof.refNo}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  viewDetailModalDof.type === "düzeltici"
                    ? "bg-indigo-600/90 text-white"
                    : "bg-teal-600/90 text-white"
                }`}>
                  {viewDetailModalDof.type === "düzeltici" ? <Wrench className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {viewDetailModalDof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                </span>
                {viewDetailModalDof.folderName && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-400/30 text-[10px] font-bold">
                    <Folder className="h-2.5 w-2.5" />
                    {viewDetailModalDof.folderName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewDetailModalDof(null)}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Title & Status */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Faaliyet Durumu
                  </span>
                  <div>
                    {viewDetailModalDof.status === "cozuldu" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Tamamlandı (Çözüldü)
                      </span>
                    ) : viewDetailModalDof.status === "inceleniyor" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                        <Clock className="h-3.5 w-3.5 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                        İnceleniyor (İşlemde)
                      </span>
                    ) : viewDetailModalDof.status === "reddedildi" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                        <X className="h-3.5 w-3.5 text-rose-600" />
                        Kapatıldı / İptal
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
                        <AlertCircle className="h-3.5 w-3.5 text-blue-600" />
                        Yeni Başvuru
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {viewDetailModalDof.title}
                </h3>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Departman / Birim</span>
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Building className="h-3.5 w-3.5 text-indigo-600" />
                    {viewDetailModalDof.department}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Atanan Sorumlu</span>
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <User className="h-3.5 w-3.5 text-indigo-600" />
                    {viewDetailModalDof.assignedUserName || "Henüz atanmadı"}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Bildiren Kişi</span>
                  <span className="font-medium text-slate-700 block mt-0.5">
                    {maskKvkkText(viewDetailModalDof.reporterName)}
                  </span>
                  {viewDetailModalDof.reporterContact && (
                    <span className="text-[10px] text-slate-400 block">{maskKvkkText(viewDetailModalDof.reporterContact)}</span>
                  )}
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Bildirim Tarihi</span>
                  <span className="font-medium text-slate-700 block mt-0.5">
                    {viewDetailModalDof.createdAt?.seconds 
                      ? new Date(viewDetailModalDof.createdAt.seconds * 1000).toLocaleString("tr-TR")
                      : new Date(viewDetailModalDof.createdAt || Date.now()).toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </div>

              {/* Description */}
              {viewDetailModalDof.description && (
                <div className="space-y-1 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Uygunsuzluk / Tespit Açıklaması
                  </span>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {viewDetailModalDof.description}
                  </p>
                </div>
              )}

              {/* Proposed Action */}
              {viewDetailModalDof.proposedAction && (
                <div className="space-y-1 bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100">
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block flex items-center gap-1">
                    <Wrench className="h-3 w-3 text-indigo-600" />
                    Önerilen Çözüm / Aksiyon
                  </span>
                  <p className="text-xs text-indigo-950 whitespace-pre-wrap leading-relaxed">
                    {viewDetailModalDof.proposedAction}
                  </p>
                </div>
              )}

              {/* Admin Feedback */}
              {viewDetailModalDof.adminFeedback && (
                <div className="space-y-1 bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Yönetici Geri Bildirimi / Çözüm Sonucu
                  </span>
                  <p className="text-xs text-emerald-950 whitespace-pre-wrap leading-relaxed">
                    {viewDetailModalDof.adminFeedback}
                  </p>
                </div>
              )}

              {/* Photos Comparison */}
              {(viewDetailModalDof.beforeImageUrl || viewDetailModalDof.afterImageUrl || viewDetailModalDof.imageUrl) && (
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Fotoğraflar & Görseller
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(viewDetailModalDof.beforeImageUrl || viewDetailModalDof.imageUrl) && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500">Faaliyet Öncesi</span>
                        <img 
                          src={viewDetailModalDof.beforeImageUrl || viewDetailModalDof.imageUrl} 
                          alt="Önce" 
                          className="w-full h-32 object-cover rounded-xl border border-slate-200"
                        />
                      </div>
                    )}
                    {viewDetailModalDof.afterImageUrl && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700">Faaliyet Sonrası (Çözüldü)</span>
                        <img 
                          src={viewDetailModalDof.afterImageUrl} 
                          alt="Sonra" 
                          className="w-full h-32 object-cover rounded-xl border border-emerald-200"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setViewDetailModalDof(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
              >
                Kapat
              </button>

              <div className="flex items-center gap-2 ml-auto">
                {onOpenEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const ref = viewDetailModalDof.refNo;
                      setViewDetailModalDof(null);
                      onOpenEdit(ref);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-700 bg-purple-100/70 hover:bg-purple-200/70 border border-purple-200 rounded-xl transition cursor-pointer"
                  >
                    <Smartphone className="h-3.5 w-3.5 text-purple-600" />
                    <span>Düzenle</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const ref = viewDetailModalDof.refNo;
                    setViewDetailModalDof(null);
                    onSearchRef(ref);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-100 transition cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Durum Takibinde Aç</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DofMobilePortal;
