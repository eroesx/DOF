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
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";
import { DofForm, PanelUser, Department } from "../types";
import { maskKvkkText, getAppVersion } from "../lib/settings";
import { getRoleDisplayName } from "../lib/roles";
import {
  authorizedQuery,
  filterAuthorizedDofs,
  getCurrentUserAuthContext,
  listDofs,
  listDepartments,
  getAuthorizedDepartmentsForUser,
} from "../lib/db";

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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return Boolean(
      localStorage.getItem("dof_admin_passcode_authed") === "true" ||
      localStorage.getItem("dof_admin_authed_email") ||
      auth.currentUser
    );
  });
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
  const [departmentsList, setDepartmentsList] = useState<Department[]>([]);
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

    const syncAuth = () => {
      const isAuthed = Boolean(
        localStorage.getItem("dof_admin_passcode_authed") === "true" ||
        localStorage.getItem("dof_admin_authed_email") ||
        auth.currentUser
      );
      setIsLoggedIn(isAuthed);
    };

    syncAuth();
    const unsubAuth = onAuthStateChanged(auth, () => syncAuth());
    window.addEventListener("storage", syncAuth);
    const authInterval = setInterval(syncAuth, 1000);

    // 1. Real-time listener for DÖFs strictly using authorizedQuery & filterAuthorizedDofs
    let unsubscribeSnapshot = () => {};
    try {
      const userAuthCtx = getCurrentUserAuthContext();
      const q = authorizedQuery(userAuthCtx);
      unsubscribeSnapshot = onSnapshot(q, (snap) => {
        const rawList: DofForm[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const item: DofForm = { id: docSnap.id, ...data } as DofForm;
          rawList.push(item);
        });

        // Filter strictly by authorization context
        const list = filterAuthorizedDofs(rawList, userAuthCtx);

        // Calculate statistics based purely on authorized DOFs
        let total = list.length;
        let open = 0;
        let resolved = 0;
        let corrective = 0;
        let preventive = 0;

        list.forEach((item) => {
          const st = (item.status || "").toLowerCase().trim();
          if (st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı" || st === "kapali" || st === "kapalı") {
            resolved++;
          } else if (st === "reddedildi" || st === "iptal") {
            // Cancelled / rejected
          } else {
            open++;
          }

          if (item.type === "düzeltici") {
            corrective++;
          } else if (item.type === "önleyici") {
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
        console.warn("Snapshot notice, attempting authorized fallback fetch:", err);
        try {
          const list = await listDofs(userAuthCtx);
          let total = list.length;
          let open = 0;
          let resolved = 0;
          let corrective = 0;
          let preventive = 0;

          list.forEach((item) => {
            const st = (item.status || "").toLowerCase().trim();
            if (st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı" || st === "kapali") {
              resolved++;
            } else if (st === "reddedildi" || st === "iptal") {
              // cancelled
            } else {
              open++;
            }
            if (item.type === "düzeltici") corrective++;
            else if (item.type === "önleyici") preventive++;
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

    // 3. Load departments for unit-user synchronization
    listDepartments()
      .then((depts) => setDepartmentsList(depts))
      .catch((err) => console.warn("Could not load departments in portal:", err));

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("storage", syncAuth);
      clearInterval(authInterval);
      unsubAuth();
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

  const handleExecuteEditorLogin = async (targetView: "admin" | "edit") => {
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
    localStorage.setItem("dof_admin_user_id", selectedEditorUser.id || "");
    localStorage.setItem("dof_admin_user_can_see_all", selectedEditorUser.canSeeAllDofs ? "true" : "false");
    localStorage.setItem("dof_mobile_user_name", selectedEditorUser.name);

    try {
      const depts = departmentsList.length > 0 ? departmentsList : await listDepartments();
      const authUnits = getAuthorizedDepartmentsForUser(selectedEditorUser, depts);
      localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify(authUnits));
      localStorage.setItem(
        "dof_admin_user_dept",
        authUnits.length > 0 ? authUnits.join(", ") : selectedEditorUser.department || ""
      );
    } catch {
      localStorage.setItem("dof_admin_user_dept", selectedEditorUser.department || "");
    }

    setSelectedEditorUser(null);
    onNavigate(targetView);
  };

  const handleOpenPendingWork = () => {
    if (!isLoggedIn) {
      onNavigate("admin");
      return;
    }
    handleMetricClick("open");
  };

  return (
    <div className="space-y-4 pb-24 md:pb-8 animate-fade-in max-w-5xl mx-auto">
      {/* 1. Özet Başlık & Durum Kartı */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate">
              DÖF Mobil İşlem Portalı
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {getAppVersion()}
              {isLoggedIn && !isStatsLoading ? ` · ${stats.open} Bekleyen · ${stats.resolved} Çözülen` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={handleInstallClick}
            className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition cursor-pointer inline-flex items-center gap-1.5 shrink-0 active:scale-95"
            title={isInstalled ? "Mobil Uygulama Kısayolu Yüklü" : "Mobil Uygulama Kısayolu Ekle"}
          >
            <Smartphone className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>{isInstalled ? "Yüklü" : "Kısayol"}</span>
          </button>
        </div>

        {/* Özet Sayılar (Sadece oturum açıkken gösterilir) */}
        {isLoggedIn ? (
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleMetricClick("open")}
              className={`min-h-[72px] p-3 rounded-2xl border text-left transition cursor-pointer active:scale-[0.98] flex flex-col justify-between ${
                activeMetricFilter === "open"
                  ? "bg-amber-500 text-slate-950 border-amber-500 shadow-sm"
                  : "bg-amber-50/70 hover:bg-amber-100/70 text-amber-950 border-amber-200"
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Bekleyen</span>
              <span className="text-2xl font-black tabular-nums leading-none mt-1">
                {isStatsLoading ? "..." : stats.open}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleMetricClick("resolved")}
              className={`min-h-[72px] p-3 rounded-2xl border text-left transition cursor-pointer active:scale-[0.98] flex flex-col justify-between ${
                activeMetricFilter === "resolved"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200"
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Çözülen</span>
              <span className="text-2xl font-black tabular-nums leading-none mt-1">
                {isStatsLoading ? "..." : stats.resolved}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleMetricClick("all")}
              className={`min-h-[72px] p-3 rounded-2xl border text-left transition cursor-pointer active:scale-[0.98] flex flex-col justify-between ${
                activeMetricFilter === "all"
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200"
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Toplam</span>
              <span className="text-2xl font-black tabular-nums leading-none mt-1">
                {isStatsLoading ? "..." : stats.total}
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate("admin")}
            className="w-full min-h-[48px] px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer active:scale-[0.99]"
          >
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>Birim özetini görmek için giriş yapın</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        )}
      </div>

      {/* 2. Temel Eylem Kartları (Dikey Akışlı & Geniş Dokunma Alanları) */}
      <div className="flex flex-col md:grid md:grid-cols-3 gap-3">
        {/* Eylem 1: Hızlı DÖF Aç */}
        <button
          type="button"
          onClick={() => onNavigate("submit")}
          id="portal-btn-submit"
          className="w-full min-h-[76px] p-4 sm:p-5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-2xl shadow-sm transition flex items-center justify-between gap-4 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <FileEdit className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-base font-black block leading-tight">Hızlı DÖF Aç</span>
              <span className="text-xs text-indigo-100 block mt-0.5">Yeni bildirim oluştur</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-white/80 shrink-0" />
        </button>

        {/* Eylem 2: DÖF Sorgula */}
        <button
          type="button"
          onClick={() => onNavigate("track")}
          id="portal-btn-track"
          className="w-full min-h-[76px] p-4 sm:p-5 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-900 border border-slate-200 rounded-2xl shadow-xs transition flex items-center justify-between gap-4 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
              <Search className="h-6 w-6 text-sky-600" />
            </div>
            <div className="min-w-0">
              <span className="text-base font-black block leading-tight">DÖF Sorgula</span>
              <span className="text-xs text-slate-500 block mt-0.5">Takip kodu ile incele</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
        </button>

        {/* Eylem 3: Bekleyen İşlerim */}
        <button
          type="button"
          onClick={handleOpenPendingWork}
          id="portal-btn-pending"
          className={`w-full min-h-[76px] p-4 sm:p-5 active:scale-[0.99] rounded-2xl shadow-xs transition flex items-center justify-between gap-4 text-left cursor-pointer border ${
            activeMetricFilter === "open"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white hover:bg-slate-50 text-slate-900 border-slate-200"
          }`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              activeMetricFilter === "open"
                ? "bg-white/15 text-amber-300"
                : "bg-amber-50 border border-amber-100 text-amber-600"
            }`}>
              <Clock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <span className="text-base font-black block leading-tight">Bekleyen İşlerim</span>
              <span className={`text-xs block mt-0.5 tabular-nums ${
                activeMetricFilter === "open" ? "text-slate-300" : "text-slate-500"
              }`}>
                {isLoggedIn
                  ? isStatsLoading
                    ? "Yükleniyor..."
                    : `${stats.open} açık kayıt`
                  : "Giriş yapıp görüntüle"}
              </span>
            </div>
          </div>
          <ChevronRight className={`h-5 w-5 shrink-0 ${
            activeMetricFilter === "open" ? "text-white/80" : "text-slate-400"
          }`} />
        </button>
      </div>

      {/* 3. Bekleyen İşlerim / Seçilen Özet Listesi */}
      {activeMetricFilter && (
        <div
          id="portal-dof-list-section"
          className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5 animate-fade-in scroll-mt-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                {activeMetricFilter === "resolved"
                  ? "Çözülen DÖF'ler"
                  : activeMetricFilter === "open"
                  ? "Bekleyen İşlerim"
                  : "Tüm DÖF Kayıtları"}
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {filteredDofs.length} kayıt
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveMetricFilter(null)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Listeyi Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Filter Row */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveMetricFilter("open")}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap cursor-pointer tabular-nums ${
                  activeMetricFilter === "open"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Bekleyen ({stats.open})
              </button>

              <button
                type="button"
                onClick={() => setActiveMetricFilter("resolved")}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap cursor-pointer tabular-nums ${
                  activeMetricFilter === "resolved"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Çözülen ({stats.resolved})
              </button>

              <button
                type="button"
                onClick={() => setActiveMetricFilter("all")}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap cursor-pointer tabular-nums ${
                  activeMetricFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Tümü ({stats.total})
              </button>
            </div>

            {/* Search Input */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ref No, başlık veya birim ara..."
                  value={listSearchTerm}
                  onChange={(e) => setListSearchTerm(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-9 text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                {listSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setListSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {uniqueDepartments.length > 0 && (
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className="sm:w-48 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Tüm Birimler</option>
                  {uniqueDepartments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Vertical Touch Card List */}
          {filteredDofs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="font-medium">Kayıt bulunamadı.</p>
              {(listSearchTerm || selectedDeptFilter !== "all" || selectedTypeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setListSearchTerm("");
                    setSelectedDeptFilter("all");
                    setSelectedTypeFilter("all");
                  }}
                  className="min-h-[40px] px-3 py-1.5 text-indigo-600 font-bold hover:underline text-xs cursor-pointer"
                >
                  Filtreleri Temizle
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto">
              {filteredDofs.map((dof) => {
                const statusLabel =
                  dof.status === "cozuldu"
                    ? "Çözüldü"
                    : dof.status === "inceleniyor"
                    ? "İnceleniyor"
                    : dof.status === "reddedildi"
                    ? "İptal"
                    : "Yeni";
                const statusClass =
                  dof.status === "cozuldu"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : dof.status === "inceleniyor"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : dof.status === "reddedildi"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-blue-50 text-blue-700 border-blue-200";

                return (
                  <div
                    key={dof.id}
                    onClick={() => setViewDetailModalDof(dof)}
                    className="bg-slate-50/70 hover:bg-indigo-50/30 border border-slate-200 hover:border-indigo-400 rounded-2xl p-4 transition space-y-3 cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-indigo-700">
                            {dof.refNo}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusClass}`}>
                            {statusLabel}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {dof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                          {dof.title}
                        </h4>

                        <p className="text-xs text-slate-500">
                          {dof.department}
                          {dof.assignedUserName ? ` · ${dof.assignedUserName}` : ""}
                          {dof.createdAt
                            ? ` · ${
                                dof.createdAt?.seconds
                                  ? new Date(dof.createdAt.seconds * 1000).toLocaleDateString("tr-TR")
                                  : new Date(dof.createdAt).toLocaleDateString("tr-TR")
                              }`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 flex items-center justify-end gap-2">
                      {onOpenEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEdit(dof.refNo);
                          }}
                          className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition cursor-pointer"
                        >
                          Düzenle
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSearchRef(dof.refNo);
                        }}
                        className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-950 rounded-xl transition cursor-pointer"
                      >
                        Takip Et
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Yetkili Giriş (Dikey Akışlı Dokunmatik Liste) */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900 tracking-tight">
            Yetkili Giriş
            <span className="ml-2 text-xs font-semibold text-slate-500 tabular-nums">
              · {authorizedMobileEditors.length} Yetkili
            </span>
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("admin")}
            className="min-h-[36px] px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
          >
            Panel Girişi
          </button>
        </div>

        {isUsersLoading ? (
          <div className="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
            <span>Yükleniyor...</span>
          </div>
        ) : authorizedMobileEditors.length === 0 ? (
          <div className="py-5 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Yetkili düzenleme personeli tanımlanmamış.
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2.5">
            {authorizedMobileEditors.map((user) => {
              const units = getAuthorizedDepartmentsForUser(user, departmentsList);
              const unitText = units.length > 0 ? units.join(", ") : user.department || "Tüm Birimler";
              return (
                <button
                  key={user.id || user.email}
                  type="button"
                  onClick={() => handleOpenEditorLoginModal(user)}
                  className="w-full min-h-[64px] p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/40 transition flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                      {user.name ? user.name.charAt(0).toUpperCase() : "Y"}
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-slate-900 block truncate">
                        {user.name}
                      </span>
                      <span className="text-xs text-slate-500 block truncate">
                        {unitText} · {getRoleDisplayName(user.role)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
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
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">İlgili Birim</span>
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
