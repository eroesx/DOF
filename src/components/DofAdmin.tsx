import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Lock, 
  Unlock,
  LogOut,
  SlidersHorizontal, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  User, 
  Mail, 
  Building, 
  Calendar,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Send,
  Eye,
  Trash2,
  PieChart,
  Grid,
  Users,
  UserPlus,
  Plus,
  Shield,
  Edit3,
  Volume2,
  VolumeX,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
  Settings,
  Key,
  Printer,
  Download,
  LayoutDashboard,
  QrCode,
  Activity,
  MapPin,
  Info,
  FileText,
  Paperclip,
  MessageSquare,
  Camera,
  Smartphone
} from "lucide-react";
import { DofSingleQrModal } from "./DofSingleQrModal";
import { DofQrScannerModal, ScanResult } from "./DofQrScannerModal";
import { jsPDF } from "jspdf";
import { printElement, exportPosterPdf } from "../utils/posterExporter";
import { signInWithPopup, signOut, auth, googleProvider, db } from "../firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { 
  listDofs, 
  updateDof, 
  deleteDof,
  listPanelUsers,
  createPanelUser,
  updatePanelUser,
  deletePanelUser,
  listEmailLogs,
  handleFirestoreError,
  OperationType
} from "../lib/db";
import { 
  DofForm, 
  DofStatus, 
  DofType, 
  GeminiAnalysisResult,
  PanelUser,
  PanelUserRole,
  Department
} from "../types";
import { DofPieChart } from "./DofPieChart";
import { DofDeptChart } from "./DofDeptChart";
import { DofUpcomingDeadlines } from "./DofUpcomingDeadlines";
import { DofReportCharts } from "./DofReportCharts";
import { DofDashboardChart } from "./DofDashboardChart";
import { DofMonthlyDistributionChart } from "./DofMonthlyDistributionChart";
import DofSubmitForm from "./DofSubmitForm";
import { DofDeadlineSummaryChart } from "./DofDeadlineSummaryChart";
import { DashboardChartsGrid } from "./DashboardChartsGrid";

/**
 * Birim bazlı yetkilendirme kontrol fonksiyonu:
 * - Sistem yöneticisi veya süper admin tüm DÖF kayıtlarını görebilir.
 * - Departman kullanıcıları (örn: sahin@gmail.com) SADECE kendi birimlerine ait veya kendilerine atanan DÖF kayıtlarını görebilir.
 * - Yetkisi olmayan hiçbir kullanıcı diğer birimlerin verilerini göremez.
 */
export function isUserAuthorizedForDof(user: PanelUser | null, dof: DofForm): boolean {
  if (!user) return false;

  const userEmail = (user.email || "").trim().toLowerCase();
  
  // Tam yetkili sistem yöneticisi veya süper yönetici tüm DÖF'leri görebilir
  if (user.role === "admin" || userEmail === "gokhan.eroglu@gmail.com") {
    return true;
  }

  // Türkçe karakterlere duyarlı normalizasyon (örn: Üzülmez TİM <-> üzülmez tim)
  const normalizeText = (text?: string) => 
    (text || "").trim().toLocaleLowerCase("tr-TR");

  const userDept = normalizeText(user.department);
  const dofDept = normalizeText(dof.department);

  // Kullanıcının atanmış bir departmanı varsa (ve "tüm birimler" değilse):
  // Kesinlikle SADECE kendi departmanına ait DÖF'leri görebilir
  if (userDept && userDept !== "tüm birimler") {
    if (dofDept === userDept) {
      return true;
    }
  }

  // Doğrudan kullanıcıya atanmış DÖF (ID veya e-posta eşleşmesi)
  if (dof.assignedUserId && user.id && dof.assignedUserId === user.id) {
    return true;
  }
  if (dof.assignedUserEmail && userEmail && normalizeText(dof.assignedUserEmail) === userEmail) {
    return true;
  }

  // Kullanıcının bizzat raporladığı DÖF
  if (dof.reporterContact && userEmail && normalizeText(dof.reporterContact) === userEmail) {
    return true;
  }

  // Açık global görüntüleme yetkisi sadece departmanı olmayan veya "tüm birimler" olan kullanıcılar için geçerlidir
  if (user.canSeeAllDofs && (!userDept || userDept === "tüm birimler")) {
    return true;
  }

  // Diğer hiçbir birimin verisi görüntülenemez
  return false;
}

export default function DofAdmin() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [passcode, setPasscode] = useState(() => localStorage.getItem("dof_admin_passcode") || "");
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem("dof_admin_authed_email") || "");
  const [isPasscodeAuthed, setIsPasscodeAuthed] = useState(() => localStorage.getItem("dof_admin_passcode_authed") === "true");
  const [authError, setAuthError] = useState<string | null>(null);

  // Forgot password & Password Request states
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Password requests management inside admin view
  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [sendingPasswordForEmail, setSendingPasswordForEmail] = useState<string | null>(null);
  const [newPasswordToSet, setNewPasswordToSet] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const handleOpenSendPassword = (email: string) => {
    setSendingPasswordForEmail(email);
    setNewPasswordToSet("");
    setIsPasswordModalOpen(true);
  };

  const [dofs, setDofs] = useState<DofForm[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDof, setSelectedDof] = useState<DofForm | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem("dof_admin_default_status_filter_setting") || "all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [dateRangePreset, setDateRangePreset] = useState<string>("all");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");

  // Editing state
  const [editStatus, setEditStatus] = useState<DofStatus>("yeni");
  const [editFeedback, setEditFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI State
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<GeminiAnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Admin View Sub-Tab
  const [adminSubTab, setAdminSubTab] = useState<"dashboard" | "dofs" | "new_dof" | "users" | "departments" | "workflow" | "reports" | "logs" | "remote">(() => {
    const saved = localStorage.getItem("dof_admin_default_tab_setting");
    if (saved && ["dashboard", "dofs", "new_dof", "users", "departments", "workflow", "reports", "logs", "remote"].includes(saved)) {
      return saved as any;
    }
    return "dashboard";
  });

  // Panel Authorization Check
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  // Departments management states
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDeptsLoading, setIsDeptsLoading] = useState(false);
  const [isDeptSaving, setIsDeptSaving] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const [deptFormName, setDeptFormName] = useState("");
  const [deptFormResponsibleEmail, setDeptFormResponsibleEmail] = useState("");
  const [deptFormIsCustomQr, setDeptFormIsCustomQr] = useState(false);
  const [deptFormDirectReferral, setDeptFormDirectReferral] = useState(false);
  const [deptFormReferralUserId, setDeptFormReferralUserId] = useState("");
  const [deptFormError, setDeptFormError] = useState<string | null>(null);
  const [deptFormSuccess, setDeptFormSuccess] = useState(false);

  // Poster Print States
  const [posterTitle, setPosterTitle] = useState("DÖF BİLDİRİM FORMU");
  const [activePosterDept, setActivePosterDept] = useState<Department | null>(null);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [isPosterPdfLoading, setIsPosterPdfLoading] = useState(false);
  const [isPosterPrinting, setIsPosterPrinting] = useState(false);

  const handlePrintPoster = async () => {
    if (!activePosterDept) return;
    setIsPosterPrinting(true);
    try {
      await printElement(
        "dof-admin-dept-poster-content",
        `${posterTitle || activePosterDept.name} DÖF Posteri`
      );
    } catch (err) {
      console.error("Print error:", err);
      window.print();
    } finally {
      setIsPosterPrinting(false);
    }
  };

  const handleExportPosterPdf = async () => {
    if (!activePosterDept) return;
    setIsPosterPdfLoading(true);
    const targetUrl = activePosterDept.isCustomQr 
      ? `${window.location.origin}?view=submit&dept=${encodeURIComponent(activePosterDept.name)}`
      : `${window.location.origin}?view=submit`;
    const cleanFileName = `dof-poster-${activePosterDept.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`;

    try {
      await exportPosterPdf(
        "dof-admin-dept-poster-content",
        cleanFileName,
        {
          title: posterTitle || `${activePosterDept.name.toUpperCase()} DÖF BİLDİRİM FORMU`,
          departmentName: activePosterDept.name,
          targetUrl,
          qrColor: "#059669",
          fileName: cleanFileName,
        }
      );
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsPosterPdfLoading(false);
    }
  };

  const fetchAllDepartments = async () => {
    setIsDeptsLoading(true);
    try {
      const { listDepartments } = await import("../lib/db");
      const list = await listDepartments();
      setDepartments(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeptsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchAllDepartments();
    }
  }, [isAuthorized]);

  // Email notifications state
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [isEmailLogsLoading, setIsEmailLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Active panel user state & filters
  const [activePanelUser, setActivePanelUser] = useState<PanelUser | null>(null);
  const [referralFilter, setReferralFilter] = useState("all");

  // Layout customization states
  const [layoutOrder, setLayoutOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("dof_admin_layout_order");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length === 5 &&
          parsed.every((item) => ["chart", "header", "stats", "tabs", "workflow_section"].includes(item))
        ) {
          return parsed;
        }
      } catch (e) {
        console.error("Layout order parsing failed:", e);
      }
    }
    return ["chart", "header", "stats", "tabs", "workflow_section"];
  });
  const [isEditingLayout, setIsEditingLayout] = useState(false);

  const moveSection = (direction: "up" | "down", currentSection: string) => {
    const currentIndex = layoutOrder.indexOf(currentSection);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= layoutOrder.length) return;

    const newOrder = [...layoutOrder];
    newOrder[currentIndex] = layoutOrder[targetIndex];
    newOrder[targetIndex] = layoutOrder[currentIndex];
    setLayoutOrder(newOrder);
  };

  // Panel Users management states
  const [panelUsers, setPanelUsers] = useState<PanelUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isUserSaving, setIsUserSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PanelUser | null>(null);
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);

  // User form fields
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormName, setUserFormName] = useState("");
  const [userFormRole, setUserFormRole] = useState<PanelUserRole>("editor");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormDepartment, setUserFormDepartment] = useState("");
  const [userFormCanSeeAllDofs, setUserFormCanSeeAllDofs] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userFormSuccess, setUserFormSuccess] = useState(false);

  // Referral states inside details view
  const [assigneeId, setAssigneeId] = useState("");
  const [referralNote, setReferralNote] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Assigned user action/progress states
  const [progressStatus, setProgressStatus] = useState<"islem_devam_ediyor" | "yapildi" | "iptal">("islem_devam_ediyor");
  const [progressNote, setProgressNote] = useState("");
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);

  // New DÖF notification states
  const [activeNotification, setActiveNotification] = useState<DofForm | null>(null);

  // Workflow stepper states
  const [activeGuideStep, setActiveGuideStep] = useState<number>(1);
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [step1RiskLevel, setStep1RiskLevel] = useState<"Düşük" | "Orta" | "Yüksek">("Orta");
  const [step1TargetDate, setStep1TargetDate] = useState("");
  const [step1AssigneeId, setStep1AssigneeId] = useState("");
  const [step1ReferralNote, setStep1ReferralNote] = useState("");
  const [step2RiskLevel, setStep2RiskLevel] = useState<"Düşük" | "Orta" | "Yüksek">("Orta");
  const [step2ForwardAssigneeId, setStep2ForwardAssigneeId] = useState("");
  const [step2ResultNote, setStep2ResultNote] = useState("");
  const [step2CompletionDays, setStep2CompletionDays] = useState<number | string>("");
  const [step2RootCauses, setStep2RootCauses] = useState<string[]>(["", "", "", "", ""]);
  const [step3ProgressUpdate, setStep3ProgressUpdate] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isCommentSending, setIsCommentSending] = useState(false);

  // Mobile QR Code & Scanner states
  const [isAdminScannerOpen, setIsAdminScannerOpen] = useState(false);
  const [singleQrModalDof, setSingleQrModalDof] = useState<DofForm | null>(null);
  
  // Admin DÖF Silme İşlemi State'leri
  const [dofToDelete, setDofToDelete] = useState<DofForm | null>(null);
  const [isDeletingDof, setIsDeletingDof] = useState(false);
  
  // Program Parametre Ayarları States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [defaultSoundSetting, setDefaultSoundSetting] = useState<"on" | "off" | "last" | string>(() => {
    return localStorage.getItem("dof_admin_default_sound_setting") || "on";
  });
  const [defaultTabSetting, setDefaultTabSetting] = useState<"dofs" | "users" | "notifications" | string>(() => {
    return localStorage.getItem("dof_admin_default_tab_setting") || "dofs";
  });
  const [defaultStatusFilterSetting, setDefaultStatusFilterSetting] = useState<string>(() => {
    return localStorage.getItem("dof_admin_default_status_filter_setting") || "all";
  });
  const [defaultNotificationSetting, setDefaultNotificationSetting] = useState<"on" | "off" | string>(() => {
    return localStorage.getItem("dof_admin_default_notification_setting") || "on";
  });
  const [isPasscodeLoginPassive, setIsPasscodeLoginPassive] = useState<boolean>(() => {
    return localStorage.getItem("dof_admin_passcode_login_passive") === "true";
  });

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const setting = localStorage.getItem("dof_admin_default_sound_setting") || "on";
    if (setting === "on") return false; // Default: Sound ON (not muted)
    if (setting === "off") return true; // Default: Sound OFF (muted)
    if (setting === "last") {
       const last = localStorage.getItem("dof_admin_last_sound_state");
       return last === "muted";
    }
    return false;
  });

  const [customHostUrl, setCustomHostUrl] = useState(() => {
    return typeof window !== "undefined" ? window.location.origin : "";
  });
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [copiedDeptId, setCopiedDeptId] = useState<string | null>(null);
  const [copiedRefNo, setCopiedRefNo] = useState<string | null>(null);
  const [workflowDeptFilter, setWorkflowDeptFilter] = useState<string>("me");

  const handleCopyRefNo = async (refNo: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(refNo);
      } else {
        const el = document.createElement("textarea");
        el.value = refNo;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopiedRefNo(refNo);
      setTimeout(() => setCopiedRefNo(null), 2500);
    } catch (err) {
      console.error("Clipboard copy error:", err);
    }
  };

  const handleCopyPublic = () => {
    navigator.clipboard.writeText(customHostUrl + "?view=submit");
    setCopiedPublic(true);
    setTimeout(() => setCopiedPublic(false), 2000);
  };

  const handleCopyAdmin = () => {
    navigator.clipboard.writeText(customHostUrl);
    setCopiedAdmin(true);
    setTimeout(() => setCopiedAdmin(false), 2000);
  };

  const handleCopyDeptUrl = (deptId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedDeptId(deptId);
    setTimeout(() => setCopiedDeptId(null), 2000);
  };

  // Monitor auth state change
  useEffect(() => {
    fetchAllUsers();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // Redirect to dashboard or fallback if current user doesn't have privileges
  useEffect(() => {
    if (activePanelUser) {
      const isSystemAdmin = activePanelUser.role === "admin" || 
                            activePanelUser.email?.toLowerCase().trim() === "gokhan.eroglu@gmail.com";
      if (!isSystemAdmin) {
        if (adminSubTab === "users" || adminSubTab === "departments" || adminSubTab === "remote" || adminSubTab === "logs") {
          setAdminSubTab("dashboard");
        }
      }
    }
  }, [activePanelUser, adminSubTab]);

  // Fetch Panel Users
  const fetchAllUsers = async () => {
    setIsUsersLoading(true);
    try {
      const data = await listPanelUsers();
      setPanelUsers(data);
      return data;
    } catch (err) {
      console.error("Failed to load panel users:", err);
      return [];
    } finally {
      setIsUsersLoading(false);
    }
  };

  // Web Audio API custom notification chime
  const playNotificationSound = () => {
    if (isMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Note 1 (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.6);

      // Note 2 (E5) after 120ms
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
          gain2.gain.setValueAtTime(0.12, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.8);
        } catch (err) {}
      }, 120);

      // Note 3 (G5) after 240ms
      setTimeout(() => {
        try {
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.type = "sine";
          osc3.frequency.setValueAtTime(783.99, ctx.currentTime);
          gain3.gain.setValueAtTime(0.15, ctx.currentTime);
          gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start();
          osc3.stop(ctx.currentTime + 1.0);
        } catch (err) {}
      }, 240);
    } catch (e) {
      console.warn("Audio Context is blocked or not supported:", e);
    }
  };

  const handleNewDofNotification = (newDof: DofForm) => {
    // Only notify if it's "yeni" status (newly submitted)
    if (newDof.status !== "yeni") return;
    
    // Check if notifications are disabled by default
    if (defaultNotificationSetting === "off") return;

    // Yetki kontrolü: Kullanıcı sadece kendi birimine gelen bildirimleri almalıdır (örn: sahin@gmail.com)
    if (!isUserAuthorizedForDof(activePanelUser, newDof)) {
      return;
    }
    
    // Play sound chime
    playNotificationSound();
    
    // Set notification to show the card
    setActiveNotification(newDof);
    
    // Auto-clear notification after 12 seconds
    setTimeout(() => {
      setActiveNotification((prev) => (prev?.id === newDof.id ? null : prev));
    }, 12000);
  };

  // Real-time listener for DOFs using Firestore onSnapshot
  useEffect(() => {
    if (!isAuthorized) return;

    setIsLoading(true);
    const path = "dofs";
    const q = query(collection(db, path), orderBy("createdAt", "desc"));
    
    let isInitial = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DofForm[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let createdAtStr = "";
        let updatedAtStr = "";
        
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          createdAtStr = data.createdAt.toDate().toISOString();
        } else if (data.createdAt && typeof data.createdAt === "string") {
          createdAtStr = data.createdAt;
        } else if (data.createdAt) {
          try {
            createdAtStr = new Date(data.createdAt).toISOString();
          } catch (e) {}
        }
        
        if (data.updatedAt && typeof data.updatedAt.toDate === "function") {
          updatedAtStr = data.updatedAt.toDate().toISOString();
        } else if (data.updatedAt && typeof data.updatedAt === "string") {
          updatedAtStr = data.updatedAt;
        } else if (data.updatedAt) {
          try {
            updatedAtStr = new Date(data.updatedAt).toISOString();
          } catch (e) {}
        }

        list.push({ 
          id: doc.id, 
          ...data,
          createdAt: createdAtStr || data.createdAt,
          updatedAt: updatedAtStr || data.updatedAt
        } as DofForm);
      });

      setDofs(list);
      setIsLoading(false);

      if (!isInitial) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            const addedDof = { id: change.doc.id, ...data } as DofForm;
            handleNewDofNotification(addedDof);
          }
        });
      } else {
        isInitial = false;
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, [isAuthorized]);

  // Real-time listener for password requests
  useEffect(() => {
    if (!isAuthorized) return;

    const q = query(collection(db, "password_requests"), orderBy("requestedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setPasswordRequests(list);
    }, (error) => {
      console.error("Error subscribing to password requests:", error);
    });

    return () => unsubscribe();
  }, [isAuthorized]);

  // Fallback / manual fetch function to keep compatibility with manual refresh buttons
  const fetchAllDofs = async () => {
    setIsLoading(true);
    try {
      const data = await listDofs();
      setDofs(data);
    } catch (err) {
      console.error("Failed to load DOFs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Email Logs
  const fetchLogs = async () => {
    setIsEmailLogsLoading(true);
    try {
      const logs = await listEmailLogs();
      setEmailLogs(logs);
    } catch (err) {
      console.error("Failed to load email logs:", err);
    } finally {
      setIsEmailLogsLoading(false);
    }
  };

  // Run authorization check when user or passcode status changes
  useEffect(() => {
    const checkAuth = async () => {
      if (isPasscodeLoginPassive) {
        setIsAuthorized(true);
        fetchAllDofs();
        fetchAllUsers();
        fetchLogs();
        setActivePanelUser({
          name: "Süper Yönetici (Admin)",
          email: "gokhan.eroglu@gmail.com",
          role: "admin",
          department: "Tüm Birimler",
          createdAt: null,
          updatedAt: null
        });
        return;
      }

      if (isPasscodeAuthed) {
        setIsAuthorized(true);
        fetchAllDofs();
        const usersList = await fetchAllUsers();
        fetchLogs();

        // Resolve active panel user by email or fallback to stored email
        const emailToMatch = (loginEmail || localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
        const passcodeToMatch = passcode || localStorage.getItem("dof_admin_passcode") || "";

        if (emailToMatch === "gokhan.eroglu@gmail.com" || (emailToMatch === "admin" && passcodeToMatch === "admin") || (emailToMatch === "" && passcodeToMatch === "admin")) {
          const adminUser: PanelUser = {
            name: "Süper Yönetici (Admin)",
            email: "gokhan.eroglu@gmail.com",
            role: "admin",
            department: "Tüm Birimler",
            createdAt: null,
            updatedAt: null
          };
          setActivePanelUser(adminUser);
          localStorage.setItem("dof_admin_user_role", "admin");
          localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
          localStorage.setItem("dof_admin_authed_email", "gokhan.eroglu@gmail.com");
        } else {
          const matched = usersList.find(
            u => (emailToMatch ? u.email.toLowerCase().trim() === emailToMatch : false) && (passcodeToMatch ? u.password === passcodeToMatch : true)
          );
          if (matched) {
            setActivePanelUser(matched);
            localStorage.setItem("dof_admin_user_role", matched.role || "editor");
            localStorage.setItem("dof_admin_user_dept", matched.department || "");
            localStorage.setItem("dof_admin_authed_email", matched.email);
          } else {
            // fallback search by password only if email is empty
            const matchedByPasscodeOnly = usersList.find(u => u.password === passcodeToMatch);
            if (matchedByPasscodeOnly) {
              setActivePanelUser(matchedByPasscodeOnly);
              localStorage.setItem("dof_admin_user_role", matchedByPasscodeOnly.role || "editor");
              localStorage.setItem("dof_admin_user_dept", matchedByPasscodeOnly.department || "");
              localStorage.setItem("dof_admin_authed_email", matchedByPasscodeOnly.email);
            } else if (passcodeToMatch === "admin") {
              const adminUser: PanelUser = {
                name: "Süper Yönetici (Admin)",
                email: "gokhan.eroglu@gmail.com",
                role: "admin",
                department: "Tüm Birimler",
                createdAt: null,
                updatedAt: null
              };
              setActivePanelUser(adminUser);
              localStorage.setItem("dof_admin_user_role", "admin");
              localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
              localStorage.setItem("dof_admin_authed_email", "gokhan.eroglu@gmail.com");
            }
          }
        }
        return;
      }

      if (user) {
        const loggedInEmail = user.email?.toLowerCase().trim();
        const isSuper = loggedInEmail === "gokhan.eroglu@gmail.com";
        
        // Load the users to check if this email is authorized
        const usersList = await fetchAllUsers();
        const matchedUser = usersList.find(
          (u) => u.email.toLowerCase().trim() === loggedInEmail
        );
        
        // If the panel users collection is completely empty, authorize the first logged in user 
        // to prevent chicken-and-egg lockouts
        const isEmpty = usersList.length === 0;

        if (isSuper || matchedUser || isEmpty) {
          setIsAuthorized(true);
          fetchAllDofs();
          fetchLogs();

          if (matchedUser) {
            setActivePanelUser(matchedUser);
            localStorage.setItem("dof_admin_user_role", matchedUser.role || "editor");
            localStorage.setItem("dof_admin_user_dept", matchedUser.department || "");
            localStorage.setItem("dof_admin_authed_email", matchedUser.email);
          } else if (isSuper) {
            const superUser: PanelUser = {
              name: user.displayName || "Gökhan Eroğlu",
              email: user.email!,
              role: "admin",
              department: "Tüm Birimler",
              createdAt: null,
              updatedAt: null
            };
            setActivePanelUser(superUser);
            localStorage.setItem("dof_admin_user_role", "admin");
            localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
            localStorage.setItem("dof_admin_authed_email", user.email!);
          } else if (isEmpty) {
            const firstUser: PanelUser = {
              name: user.displayName || "İlk Yönetici",
              email: user.email!,
              role: "admin",
              department: "Tüm Birimler",
              createdAt: null,
              updatedAt: null
            };
            setActivePanelUser(firstUser);
            localStorage.setItem("dof_admin_user_role", "admin");
            localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
            localStorage.setItem("dof_admin_authed_email", user.email!);
          }
        } else {
          setIsAuthorized(false);
          setActivePanelUser(null);
          localStorage.removeItem("dof_admin_user_role");
          localStorage.removeItem("dof_admin_user_dept");
        }
      } else {
        setIsAuthorized(null);
        setActivePanelUser(null);
        localStorage.removeItem("dof_admin_user_role");
        localStorage.removeItem("dof_admin_user_dept");
      }
    };

    if (authChecked || isPasscodeLoginPassive) {
      checkAuth();
    }
  }, [user, isPasscodeAuthed, authChecked, isPasscodeLoginPassive]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      setAuthError("Google ile giriş yapılırken bir hata oluştu.");
    }
  };

  const handlePasscodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    if (!loginEmail.trim()) {
      setAuthError("Lütfen e-posta adresinizi girin.");
      return;
    }
    if (!passcode) {
      setAuthError("Lütfen yönetici şifrenizi girin.");
      return;
    }

    let currentUsers = panelUsers;
    if (currentUsers.length === 0) {
      currentUsers = await fetchAllUsers();
    }

    const inputEmail = loginEmail.toLowerCase().trim();

    // Simple admin pincode with email match or "admin" username match
    if ((inputEmail === "gokhan.eroglu@gmail.com" || inputEmail === "admin") && passcode === "admin") {
      setIsPasscodeAuthed(true);
      localStorage.setItem("dof_admin_passcode_authed", "true");
      localStorage.setItem("dof_admin_authed_email", inputEmail === "admin" ? "gokhan.eroglu@gmail.com" : inputEmail);
      localStorage.setItem("dof_admin_passcode", passcode);
      localStorage.setItem("dof_admin_user_role", "admin");
      localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
      setActivePanelUser({
        name: "Süper Yönetici (Admin)",
        email: "gokhan.eroglu@gmail.com",
        role: "admin",
        department: "Tüm Birimler",
        createdAt: null,
        updatedAt: null
      });
    } else {
      const matchingUser = currentUsers.find(
        (u) => u.email.toLowerCase().trim() === inputEmail && u.password && u.password.trim() !== "" && u.password === passcode
      );
      if (matchingUser) {
        setIsPasscodeAuthed(true);
        localStorage.setItem("dof_admin_passcode_authed", "true");
        localStorage.setItem("dof_admin_authed_email", inputEmail);
        localStorage.setItem("dof_admin_passcode", passcode);
        localStorage.setItem("dof_admin_user_role", matchingUser.role || "editor");
        localStorage.setItem("dof_admin_user_dept", matchingUser.department || "");
        setActivePanelUser(matchingUser);
      } else {
        setAuthError("Geçersiz e-posta adresi veya şifre. Lütfen bilgilerinizi kontrol edin.");
      }
    }
  };

  // User Management Actions
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    setUserFormSuccess(false);

    if (!userFormEmail || !userFormName) {
      setUserFormError("E-posta adresi ve isim alanları zorunludur.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(userFormEmail.trim())) {
      setUserFormError("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    setIsUserSaving(true);
    try {
      if (selectedUser?.id) {
        // Edit existing
        await updatePanelUser(selectedUser.id, {
          email: userFormEmail.trim(),
          name: userFormName.trim(),
          role: userFormRole,
          password: userFormPassword.trim(),
          department: userFormDepartment.trim(),
          canSeeAllDofs: userFormCanSeeAllDofs,
        });
        setUserFormSuccess(true);
      } else {
        // Create new
        // Check if email already exists
        const exists = panelUsers.some(
          (u) => u.email.toLowerCase().trim() === userFormEmail.toLowerCase().trim()
        );
        if (exists) {
          setUserFormError("Bu e-posta adresi zaten yetkili listesinde kayıtlı.");
          setIsUserSaving(false);
          return;
        }

        await createPanelUser({
          email: userFormEmail.trim(),
          name: userFormName.trim(),
          role: userFormRole,
          password: userFormPassword.trim(),
          department: userFormDepartment.trim(),
          canSeeAllDofs: userFormCanSeeAllDofs,
        });
        setUserFormSuccess(true);
      }

      // Reset form and reload users
      handleResetUserForm();
      await fetchAllUsers();
      setTimeout(() => setUserFormSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setUserFormError("İşlem gerçekleştirilirken bir hata oluştu.");
    } finally {
      setIsUserSaving(false);
    }
  };

  const handleEditUser = (userToEdit: PanelUser) => {
    setSelectedUser(userToEdit);
    setUserFormEmail(userToEdit.email);
    setUserFormName(userToEdit.name);
    setUserFormRole(userToEdit.role);
    setUserFormPassword(userToEdit.password || "");
    setUserFormDepartment(userToEdit.department || "");
    setUserFormCanSeeAllDofs(!!userToEdit.canSeeAllDofs);
    setUserFormError(null);
    setIsUserFormOpen(true);
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Bu kullanıcının yetkisini iptal etmek istediğinize emin misiniz?")) {
      return;
    }
    try {
      await deletePanelUser(id);
      if (selectedUser?.id === id) {
        handleResetUserForm();
      }
      await fetchAllUsers();
    } catch (err) {
      console.error(err);
      alert("Kullanıcı silinirken bir hata oluştu.");
    }
  };

  const handleResetUserForm = () => {
    setSelectedUser(null);
    setUserFormEmail("");
    setUserFormName("");
    setUserFormRole("editor");
    setUserFormPassword("");
    setUserFormDepartment("");
    setUserFormCanSeeAllDofs(false);
    setUserFormError(null);
    setIsUserFormOpen(false);
  };

  const handleResetDeptForm = () => {
    setSelectedDept(null);
    setDeptFormName("");
    setDeptFormResponsibleEmail("");
    setDeptFormIsCustomQr(false);
    setDeptFormDirectReferral(false);
    setDeptFormReferralUserId("");
    setDeptFormError(null);
    setDeptFormSuccess(false);
    setPosterTitle("DÖF BİLDİRİM FORMU");
  };

  const handleEditDept = (dept: Department) => {
    setSelectedDept(dept);
    setDeptFormName(dept.name);
    setDeptFormResponsibleEmail(dept.responsibleEmail || "");
    setDeptFormIsCustomQr(dept.isCustomQr || false);
    setDeptFormDirectReferral(dept.directReferral || false);
    setDeptFormReferralUserId(dept.referralUserId || "");
    setDeptFormError(null);
    setDeptFormSuccess(false);
    setPosterTitle(`${dept.name.toUpperCase()} DÖF BİLDİRİM FORMU`);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptFormError(null);
    setDeptFormSuccess(false);

    if (!deptFormName.trim()) {
      setDeptFormError("Lütfen departman adını doldurun.");
      return;
    }

    setIsDeptSaving(true);
    try {
      const { createDepartment, updateDepartment } = await import("../lib/db");
      
      let responsibleEmail = "";
      let responsibleName = "";
      if (deptFormDirectReferral && deptFormReferralUserId) {
        const matchedUser = panelUsers.find((u) => u.id === deptFormReferralUserId);
        if (matchedUser) {
          responsibleEmail = matchedUser.email;
          responsibleName = matchedUser.name;
        }
      }

      const deptData = {
        name: deptFormName.trim(),
        isCustomQr: deptFormIsCustomQr,
        directReferral: deptFormDirectReferral,
        referralUserId: deptFormReferralUserId,
        responsibleEmail,
        responsibleName,
      };

      if (selectedDept) {
        // Edit existing
        await updateDepartment(selectedDept.id!, deptData);
        setDeptFormSuccess(true);
      } else {
        // Create new
        // Check if name already exists
        const exists = departments.some(
          (d) => d.name.toLowerCase().trim() === deptFormName.toLowerCase().trim()
        );
        if (exists) {
          setDeptFormError("Bu departman zaten tanımlanmış.");
          setIsDeptSaving(false);
          return;
        }

        await createDepartment(deptData);
        setDeptFormSuccess(true);
      }

      handleResetDeptForm();
      await fetchAllDepartments();
      setTimeout(() => setDeptFormSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setDeptFormError("İşlem gerçekleştirilirken bir hata oluştu.");
    } finally {
      setIsDeptSaving(false);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!window.confirm("Bu departmanı silmek istediğinize emin misiniz?")) {
      return;
    }
    try {
      const { deleteDepartment } = await import("../lib/db");
      await deleteDepartment(id);
      if (selectedDept?.id === id) {
        handleResetDeptForm();
      }
      await fetchAllDepartments();
    } catch (err) {
      console.error(err);
      alert("Departman silinirken bir hata oluştu.");
    }
  };

  // Forgot Password Actions
  const handleRequestVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    const email = forgotEmail.toLowerCase().trim();
    if (!email) {
      setForgotError("Lütfen e-posta adresinizi girin.");
      return;
    }

    let currentUsers = panelUsers;
    if (currentUsers.length === 0) {
      currentUsers = await fetchAllUsers();
    }

    const isSuper = email === "gokhan.eroglu@gmail.com";
    const userExists = currentUsers.some(u => u.email.toLowerCase().trim() === email);

    if (!isSuper && !userExists) {
      setForgotError("Bu e-posta adresi ile kayıtlı yetkili personel bulunamadı.");
      return;
    }

    try {
      const { addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "password_requests"), {
        email: email,
        status: "bekliyor",
        requestedAt: new Date().toISOString(),
      });

      setForgotStep(3);
      setForgotSuccess("Şifre sıfırlama talebiniz başarıyla alınmıştır. Sistem yöneticiniz yeni şifrenizi tanımladığında giriş yapabilirsiniz.");
    } catch (err: any) {
      console.error("Şifre talebi iletilirken hata:", err);
      setForgotError("Talep iletilirken teknik bir hata oluştu.");
    }
  };

  const handleVerifyCodeAndSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleConfirmSendPassword = async () => {
    if (!sendingPasswordForEmail) return;
    if (!newPasswordToSet.trim()) {
      alert("Lütfen şifre girin.");
      return;
    }

    try {
      // 1. Update the password in panel_users
      const matchedUser = panelUsers.find(u => u.email.toLowerCase().trim() === sendingPasswordForEmail.toLowerCase().trim());
      if (matchedUser?.id) {
        await updatePanelUser(matchedUser.id, {
          password: newPasswordToSet.trim()
        });
      } else {
        if (sendingPasswordForEmail.toLowerCase().trim() === "gokhan.eroglu@gmail.com") {
          alert("Süper yönetici şifresi sistem tarafından korunmaktadır ('admin').");
          setIsPasswordModalOpen(false);
          return;
        }
      }

      // 2. Delete any password_requests for this email
      const { getDocs, deleteDoc } = await import("firebase/firestore");
      const pendingRequestsQuery = query(collection(db, "password_requests"));
      const querySnapshot = await getDocs(pendingRequestsQuery);
      
      const promises: Promise<any>[] = [];
      querySnapshot.forEach((docSnap) => {
        const reqData = docSnap.data();
        if (reqData.email?.toLowerCase().trim() === sendingPasswordForEmail.toLowerCase().trim()) {
          promises.push(deleteDoc(docSnap.ref));
        }
      });
      await Promise.all(promises);

      // 3. Create an email log entry to show we sent it
      const { addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "email_logs"), {
        recipient: sendingPasswordForEmail,
        subject: "Yeni Yönetici Şifreniz Tanımlandı",
        body: `Şifre sıfırlama talebiniz onaylandı. Yeni giriş şifreniz: ${newPasswordToSet.trim()}`,
        sentAt: new Date().toISOString(),
        type: "password_reset_success"
      });

      alert(`Yeni şifre (${newPasswordToSet.trim()}) başarıyla tanımlandı ve talep kapatıldı!`);
      setIsPasswordModalOpen(false);
      setSendingPasswordForEmail(null);
      setNewPasswordToSet("");
      await fetchAllUsers();
    } catch (err) {
      console.error("Şifre gönderilirken hata:", err);
      alert("Şifre güncellenirken teknik bir hata oluştu.");
    }
  };

  const handleLogout = async () => {
    if (isPasscodeLoginPassive) {
      setIsPasscodeLoginPassive(false);
      localStorage.removeItem("dof_admin_passcode_login_passive");
    }
    localStorage.removeItem("dof_admin_passcode_authed");
    localStorage.removeItem("dof_admin_authed_email");
    localStorage.removeItem("dof_admin_passcode");
    localStorage.removeItem("dof_admin_user_role");
    localStorage.removeItem("dof_admin_user_dept");
    setActivePanelUser(null);
    await signOut(auth);
    setIsPasscodeAuthed(false);
    setPasscode("");
    setSelectedDof(null);
    setAiResult(null);
    window.location.reload();
  };

  const isSystemAdmin = activePanelUser?.role === "admin" || 
                        activePanelUser?.email?.toLowerCase().trim() === "gokhan.eroglu@gmail.com" ||
                        localStorage.getItem("dof_admin_user_role") === "admin" ||
                        localStorage.getItem("dof_admin_passcode") === "admin";

  // Birim kullanıcısı (örn: sahin@gmail.com) KYS kontrol paneli olarak dashboard'da ve listelerde
  // sadece kendi birimine gelen bildirimleri ve DÖF'leri görür.
  // Yetkisi olmayan hiç kimse diğer birimlerin bilgilerini göremez.
  const visibleDofs = dofs.filter((d) => isUserAuthorizedForDof(activePanelUser, d));

  // Filter unique departments for filter dropdown
  const uniqueDepartments = isSystemAdmin
    ? Array.from(new Set(dofs.map((d) => d.department).filter(Boolean)))
    : Array.from(new Set(visibleDofs.map((d) => d.department).filter(Boolean)));

  // Filtered list
  const filteredDofs = visibleDofs.filter((dof) => {
    const matchesSearch = 
      dof.refNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.reporterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "bekleyen" || statusFilter === "acik"
        ? (dof.status === "yeni" || dof.status === "inceleniyor") 
        : statusFilter === "kapali"
        ? (dof.status === "cozuldu" || dof.status === "reddedildi")
        : (statusFilter === "iptal" || statusFilter === "reddedildi")
        ? (dof.status === "reddedildi")
        : (statusFilter === "tamamlandi" || statusFilter === "cozuldu")
        ? (dof.status === "cozuldu")
        : dof.status === statusFilter);
    const matchesType = typeFilter === "all" || dof.type === typeFilter;
    const matchesDept = deptFilter === "all" || dof.department === deptFilter;

    const matchesReferral = 
      referralFilter === "all" ||
      (referralFilter === "havuz" && !dof.assignedUserId) ||
      (referralFilter === "bana" && dof.assignedUserId && activePanelUser && 
        (dof.assignedUserId === activePanelUser.id || 
          dof.assignedUserEmail?.toLowerCase().trim() === activePanelUser.email?.toLowerCase().trim())) ||
      (referralFilter === "islem_devam_ediyor" && dof.referralStatus === "islem_devam_ediyor") ||
      (referralFilter === "yapildi" && dof.referralStatus === "yapildi");

    let matchesDate = true;
    if (dof.createdAt) {
      let createdDate: Date | null = null;
      try {
        createdDate = new Date(dof.createdAt);
      } catch (e) {}

      if (createdDate && !isNaN(createdDate.getTime())) {
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (dateRangePreset === "today") {
          matchesDate = createdDate >= startOfToday;
        } else if (dateRangePreset === "last_7_days") {
          const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = createdDate >= sevenDaysAgo;
        } else if (dateRangePreset === "last_30_days") {
          const thirtyDaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchesDate = createdDate >= thirtyDaysAgo;
        } else if (dateRangePreset === "custom") {
          let pass = true;
          if (dateStart) {
            const sDate = new Date(dateStart);
            sDate.setHours(0, 0, 0, 0);
            pass = pass && createdDate >= sDate;
          }
          if (dateEnd) {
            const eDate = new Date(dateEnd);
            eDate.setHours(23, 59, 59, 999);
            pass = pass && createdDate <= eDate;
          }
          matchesDate = pass;
        }
      }
    }

    return matchesSearch && matchesStatus && matchesType && matchesDept && matchesReferral && matchesDate;
  });

  // Stats calculation
  const totalCount = visibleDofs.length;
  const newCount = visibleDofs.filter((d) => d.status === "yeni").length;
  const reviewCount = visibleDofs.filter((d) => d.status === "inceleniyor").length;
  const resolvedCount = visibleDofs.filter((d) => d.status === "cozuldu").length;
  const rejectedCount = visibleDofs.filter((d) => d.status === "reddedildi").length;
  const myTasksCount = visibleDofs.filter((d) => 
    d.assignedUserId === activePanelUser?.id ||
    (d.assignedUserEmail && activePanelUser?.email && d.assignedUserEmail.toLowerCase().trim() === activePanelUser.email.toLowerCase().trim())
  ).length;

  const isAdminOrEditor = activePanelUser?.role === "admin" || activePanelUser?.role === "editor";
  const showAllDofsTab = true;

  const filteredWorkflowDofs = visibleDofs.filter((d) => {
    // If the user is not an admin/editor, they can only see their own tasks
    if (!isAdminOrEditor) {
      return (
        d.assignedUserId === activePanelUser?.id ||
        (d.assignedUserEmail && activePanelUser?.email && d.assignedUserEmail.toLowerCase().trim() === activePanelUser.email.toLowerCase().trim())
      );
    }

    // If admin/editor, filter based on workflowDeptFilter
    if (workflowDeptFilter === "me") {
      return (
        d.assignedUserId === activePanelUser?.id ||
        (d.assignedUserEmail && activePanelUser?.email && d.assignedUserEmail.toLowerCase().trim() === activePanelUser.email.toLowerCase().trim())
      );
    } else if (workflowDeptFilter === "all") {
      return true;
    } else {
      // Specific department selected
      return d.department?.toLowerCase().trim() === workflowDeptFilter.toLowerCase().trim();
    }
  });

  const urgentDofs = visibleDofs.filter((d) => {
    if (d.status !== "yeni" && d.status !== "inceleniyor") return false;
    let createdDate = new Date();
    if (d.createdAt) {
      try {
        if (typeof d.createdAt.toDate === "function") {
          createdDate = d.createdAt.toDate();
        } else if (d.createdAt.seconds !== undefined) {
          createdDate = new Date(d.createdAt.seconds * 1000);
        } else {
          createdDate = new Date(d.createdAt);
        }
      } catch (e) {}
    }
    const targetDays = d.type === "düzeltici" ? 7 : 14;
    const terminDate = new Date(createdDate.getTime());
    terminDate.setDate(terminDate.getDate() + targetDays);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const terminDateZero = new Date(terminDate.getTime());
    terminDateZero.setHours(0, 0, 0, 0);

    const diffDays = Math.round((terminDateZero.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
  });
  const urgentCount = urgentDofs.length;

  // Document Title Flashing for new DOFs
  useEffect(() => {
    if (newCount > 0 && defaultNotificationSetting === "on") {
      const originalTitle = "DÖF Takip Sistemi - Yönetici Paneli";
      let isFlash = false;
      const interval = setInterval(() => {
        document.title = isFlash 
          ? `🔴 (${newCount}) YENİ DÖF` 
          : originalTitle;
        isFlash = !isFlash;
      }, 1500);
      return () => {
        clearInterval(interval);
        document.title = originalTitle;
      };
    } else {
      document.title = "DÖF Takip Sistemi - Yönetici Paneli";
    }
  }, [newCount, defaultNotificationSetting]);

  const handleDownloadPdf = (dof: DofForm) => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      // Helper to clean Turkish characters for Helvetica/Arial compatibility in standard jsPDF
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

      const riskInfo = getDofScoreAndLevel(dof);

      // --- Colors ---
      const primaryColor = [79, 70, 229]; // Indigo
      const darkColor = [30, 41, 59]; // Slate 800
      const lightBg = [248, 250, 252]; // Slate 50
      const borderLineColor = [226, 232, 240]; // Slate 200

      // Page dimensions
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);

      // Draw top styling banner (Indigo)
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(margin, 15, contentWidth, 8, "F");

      // Title & Ref No
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text("DUZELTICI ONLEYICI FAALIYET (DOF) RAPORU", margin, 32);

      doc.setFont("Courier", "bold");
      doc.setFontSize(12);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`REF: ${cleanText(dof.refNo)}`, pageWidth - margin, 32, { align: "right" });

      // Subtitle / Date
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 140);
      const formattedDate = dof.createdAt ? (dof.createdAt.seconds ? new Date(dof.createdAt.seconds * 1000).toLocaleDateString("tr-TR") : new Date(dof.createdAt).toLocaleDateString("tr-TR")) : new Date().toLocaleDateString("tr-TR");
      doc.text(`Rapor Olusturma Tarihi: ${cleanText(formattedDate)}`, margin, 38);

      // Add horizontal line
      doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
      doc.setLineWidth(0.5);
      doc.line(margin, 42, pageWidth - margin, 42);

      // Metadata Block
      let y = 48;

      const drawMetaRow = (label1: string, val1: string, label2: string, val2: string, currentY: number) => {
        // Label background
        doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
        doc.rect(margin, currentY, contentWidth, 8, "F");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(cleanText(label1) + ":", margin + 3, currentY + 5.5);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(cleanText(val1), margin + 35, currentY + 5.5);

        doc.setFont("Helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text(cleanText(label2) + ":", margin + contentWidth / 2 + 3, currentY + 5.5);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(cleanText(val2), margin + contentWidth / 2 + 38, currentY + 5.5);

        // draw dividing line
        doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
        doc.line(margin, currentY + 8, pageWidth - margin, currentY + 8);
      };

      // Status translation
      const getStatusLabel = (status: string) => {
        if (status === "yeni") return "Yeni Basvuru";
        if (status === "inceleniyor") return "Inceleme Altinda";
        if (status === "cozuldu") return "Cozuldu / Kapatildi";
        if (status === "reddedildi") return "Reddedildi";
        return status;
      };

      drawMetaRow("DOF Tipi", dof.type === "düzeltici" ? "Duzeltici Faaliyet" : "Onleyici Faaliyet", "Mevcut Durum", getStatusLabel(dof.status), y);
      y += 8;
      drawMetaRow("Departman", dof.department || "-", "Sorumlu Kisi", dof.assignedUserName || "Atanmamis", y);
      y += 8;
      drawMetaRow("Bildiren Kisi", dof.reporterName || "-", "Bildiren Iletisim", dof.reporterContact || "-", y);
      y += 8;
      drawMetaRow("Aciliyet Derecesi", riskInfo.level || "Orta", "Risk Skoru", `${riskInfo.score} / 15`, y);
      y += 14;

      // Wrap-text Helper for Descriptions & text blocks
      const drawTextBlock = (title: string, content: string, startY: number, accentColor: number[]) => {
        // Accent bar
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(margin, startY, 3, 6, "F");

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text(cleanText(title), margin + 5, startY + 4.5);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85); // slate 700

        const textLines = doc.splitTextToSize(cleanText(content || "Belirtilmemis"), contentWidth - 5);
        let textY = startY + 11;
        
        textLines.forEach((line: string) => {
          doc.text(line, margin + 2, textY);
          textY += 5;
        });

        // Return new Y
        return textY + 4;
      };

      // Title/Description Block
      y = drawTextBlock("DÖF Başlığı", dof.title, y, primaryColor);
      y = drawTextBlock("Açıklama / Tespit Edilen Uygunsuzluk", dof.description, y, [220, 38, 38]); // Red accent for description

      if (dof.proposedAction) {
        y = drawTextBlock("Önerilen Düzeltici / Önleyici Aksiyon", dof.proposedAction, y, [16, 185, 129]); // Green accent
      }

      // Action Plan and referral section
      if (dof.referralResultNote) {
        y = drawTextBlock("Uygulanan Aksiyon ve Çözüm Raporu", dof.referralResultNote, y, [245, 158, 11]); // Amber accent
      }

      // 5 Kök Neden Analizi (5 Whys)
      if (dof.rootCauses && dof.rootCauses.some(c => c && c.trim().length > 0)) {
        const rootCausesSummary = dof.rootCauses
          .map((c, i) => (c && c.trim() ? `${i + 1}. Neden: ${c.trim()}` : null))
          .filter(Boolean)
          .join("\n");
        if (rootCausesSummary) {
          y = drawTextBlock("5 Kök Neden Analizi (5 Whys)", rootCausesSummary, y, [217, 119, 6]); // Warm amber accent
        }
      }

      // Add feedback if exists
      if (dof.adminFeedback) {
        y = drawTextBlock("Yönetim Değerlendirmesi / Geri Bildirim", dof.adminFeedback, y, [107, 114, 128]); // Grey accent
      }

      // Sign-off / Signature footer area
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 30;
      }

      y = Math.max(y, pageHeight - 55);

      // Signature area
      doc.setDrawColor(borderLineColor[0], borderLineColor[1], borderLineColor[2]);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("RAPORLAYAN SİSTEM", margin, y);
      doc.text("YONETICI ONAYI", pageWidth - margin - 50, y);

      y += 5;
      doc.setFont("Helvetica", "normal");
      doc.text("DÖF Otomasyon Sistemi", margin, y);
      doc.text("Sistem Yoneticisi", pageWidth - margin - 50, y);

      y += 4;
      doc.setFont("Courier", "normal");
      doc.setFontSize(7);
      doc.text("Kagitsiz Dijital Surec Belgesidir.", margin, y);
      doc.text("Islak imza yerine anlik dijital onay verilmistir.", pageWidth - margin - 50, y);

      // Page numbers & system credits at absolute bottom
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("DOF Yonetim ve Takip Portali - Tum Haklari Saklidir.", margin, pageHeight - 10);
      doc.text("Sayfa 1 / 1", pageWidth - margin, pageHeight - 10, { align: "right" });

      // Save PDF
      const fileName = `DOF_Raporu_${dof.refNo}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("PDF generation error: ", error);
      alert("PDF Raporu olusturulurken bir hata olustu.");
    }
  };

  const handleAdminScanSuccess = (result: ScanResult) => {
    setIsAdminScannerOpen(false);
    const target = visibleDofs.find(d => 
      (result.refNo && d.refNo?.toLowerCase() === result.refNo.toLowerCase()) || 
      (result.id && d.id === result.id)
    );
    if (target) {
      handleSelectDof(target);
    } else if (result.refNo) {
      const anyMatch = dofs.find(d => result.refNo && d.refNo?.toLowerCase() === result.refNo.toLowerCase());
      if (anyMatch && !isUserAuthorizedForDof(activePanelUser, anyMatch)) {
        alert("Bu DÖF kaydı başka bir birime aittir ve görüntüleme yetkiniz bulunmamaktadır.");
      } else {
        window.location.href = `?view=edit&refNo=${encodeURIComponent(result.refNo)}`;
      }
    }
  };

  const handleSelectDof = (dof: DofForm | null) => {
    if (dof && !isUserAuthorizedForDof(activePanelUser, dof)) {
      alert("Bu DÖF kaydı başka bir birime aittir ve görüntüleme yetkiniz bulunmamaktadır.");
      setSelectedDof(null);
      return;
    }
    setSelectedDof(dof);
    if (dof) {
      setEditStatus(dof.status);
      setEditFeedback(dof.adminFeedback || "");
      setAiResult(null);
      setAiError(null);
      setSaveSuccess(false);

      // Initialize workflow step states
      setStep1RiskLevel(dof.riskLevel || "Orta");
      setStep1TargetDate(dof.targetCompletionDate || "");
      setStep1AssigneeId(dof.assignedUserId || "");
      setStep1ReferralNote(dof.referralNote || "");
      
      setStep2RiskLevel(dof.riskLevel || "Orta");
      setStep2ForwardAssigneeId("");
      setStep2ResultNote(dof.referralResultNote || "");
      setStep2CompletionDays(dof.completionDays || "");
      const rc = dof.rootCauses && Array.isArray(dof.rootCauses)
        ? [dof.rootCauses[0] || "", dof.rootCauses[1] || "", dof.rootCauses[2] || "", dof.rootCauses[3] || "", dof.rootCauses[4] || ""]
        : ["", "", "", "", ""];
      setStep2RootCauses(rc);
      setStep3ProgressUpdate("");

      // Determine default active step in the guide
      if (dof.status === "cozuldu" || dof.status === "reddedildi") {
        setActiveGuideStep(5); // Kapatıldı
      } else if (dof.referralStatus === "yapildi") {
        setActiveGuideStep(4); // Tamamlandı
      } else if (dof.status === "inceleniyor") {
        if (dof.referralResultNote) {
          setActiveGuideStep(3); // Uygulama
        } else {
          setActiveGuideStep(2); // Aksiyon Planı
        }
      } else {
        setActiveGuideStep(1); // İnceleme ve Atama
      }
    } else {
      setEditStatus("yeni");
      setEditFeedback("");
      setAiResult(null);
      setAiError(null);
      setSaveSuccess(false);
      setStep2RootCauses(["", "", "", "", ""]);
      setActiveGuideStep(1);
    }
  };

  const handleWorkflowStep1Submit = async () => {
    if (!selectedDof?.id) return;
    if (!step1AssigneeId) {
      alert("Lütfen havale edilecek ilgili sorumlu kişiyi seçin.");
      return;
    }
    setIsSaving(true);
    try {
      const matchedUser = panelUsers.find(u => u.id === step1AssigneeId);
      if (!matchedUser) {
        alert("Seçilen sorumlu bulunamadı.");
        setIsSaving(false);
        return;
      }

      const updates = {
        assignedUserId: matchedUser.id,
        assignedUserName: matchedUser.name,
        assignedUserEmail: matchedUser.email,
        riskLevel: step1RiskLevel,
        targetCompletionDate: step1TargetDate,
        referralNote: step1ReferralNote.trim(),
        referralStatus: "islem_devam_ediyor" as const,
        status: "inceleniyor" as const,
        referralUpdatedAt: new Date().toISOString(),
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();
      
      setSelectedDof({
        ...selectedDof,
        ...updates
      });
      
      setActiveGuideStep(2);
      alert("DÖF başarıyla incelendi ve ilgili departman sorumlusuna havale edildi.");
    } catch (err) {
      console.error(err);
      alert("Atama işlemi kaydedilirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowStep2Submit = async () => {
    if (!selectedDof?.id) return;
    setIsSaving(true);
    try {
      // 1. Check if user wants to forward to another person
      if (step2ForwardAssigneeId) {
        const matchedUser = panelUsers.find(u => u.id === step2ForwardAssigneeId);
        if (!matchedUser) {
          alert("Yönlendirilecek yeni sorumlu bulunamadı.");
          setIsSaving(false);
          return;
        }

        const updates = {
          assignedUserId: matchedUser.id,
          assignedUserName: matchedUser.name,
          assignedUserEmail: matchedUser.email,
          riskLevel: step2RiskLevel,
          referralNote: `Başka departmana devredildi. Önceki açıklama: ${step2ResultNote || ""}`,
          referralUpdatedAt: new Date().toISOString(),
        };

        await updateDof(selectedDof.id, updates);
        await fetchAllDofs();

        setSelectedDof({
          ...selectedDof,
          ...updates
        });

        setStep2ForwardAssigneeId("");
        alert("DÖF başarıyla başka bir departman sorumlusuna devredildi.");
        setActiveGuideStep(2);
        setIsSaving(false);
        return;
      }

      // 2. Normal Action Plan Saving
      const cleanRootCauses = step2RootCauses.map((r) => (r || "").trim());
      const updates = {
        riskLevel: step2RiskLevel,
        referralResultNote: step2ResultNote.trim(),
        completionDays: step2CompletionDays ? Number(step2CompletionDays) : undefined,
        rootCauses: cleanRootCauses,
        referralUpdatedAt: new Date().toISOString(),
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates
      });

      setActiveGuideStep(3);
      alert("Aksiyon planı ve tamamlanma süresi başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      alert("Aksiyon planı kaydedilirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowStep3Submit = async () => {
    if (!selectedDof?.id) return;
    if (!step3ProgressUpdate.trim()) {
      alert("Lütfen bir uygulama güncelleme notu girin.");
      return;
    }
    setIsSaving(true);
    try {
      const currentNote = selectedDof.referralResultNote || "";
      const updatedNote = currentNote 
        ? `${currentNote}\n\n[Uygulama Güncellemesi - ${new Date().toLocaleDateString("tr-TR")}]: ${step3ProgressUpdate.trim()}`
        : `[Uygulama Güncellemesi - ${new Date().toLocaleDateString("tr-TR")}]: ${step3ProgressUpdate.trim()}`;

      const updates = {
        referralResultNote: updatedNote,
        referralUpdatedAt: new Date().toISOString(),
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates
      });

      setStep3ProgressUpdate("");
      alert("Uygulama aşaması güncelleme notu başarıyla eklendi.");
    } catch (err) {
      console.error(err);
      alert("Uygulama notu kaydedilirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowStep4Complete = async () => {
    if (!selectedDof?.id) return;
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates = {
        status: "cozuldu" as const,
        referralStatus: "yapildi" as const,
        referralUpdatedAt: nowIso,
        currentStep: 8,
        adminFeedback: selectedDof.adminFeedback || editFeedback || "DÖF başarıyla tamamlandı ve süreç kapatıldı.",
        updatedAt: nowIso,
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      const updatedObj = {
        ...selectedDof,
        ...updates
      };

      setSelectedDof(updatedObj);
      setDofs(prev => prev.map(d => d.id === selectedDof.id ? { ...d, ...updates } : d));

      setActiveGuideStep(5);
      setSaveSuccess(true);
      setWorkflowNotice("✓ DÖF başarıyla tamamlandı olarak işaretlendi ve süreç kapatıldı.");
      setTimeout(() => {
        setWorkflowNotice(null);
        setSaveSuccess(false);
      }, 5000);
    } catch (err) {
      console.error(err);
      setWorkflowNotice("DÖF kapatılırken bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!selectedDof?.id) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await updateDof(selectedDof.id, {
        status: editStatus,
        adminFeedback: editFeedback,
      });
      setSaveSuccess(true);
      // Refresh list
      await fetchAllDofs();
      // Update selected
      setSelectedDof({
        ...selectedDof,
        status: editStatus,
        adminFeedback: editFeedback,
      });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Durum güncellenirken bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedDof?.id || !commentText.trim()) return;
    setIsCommentSending(true);
    try {
      const newComment = {
        id: Math.random().toString(36).substr(2, 9),
        userName: activePanelUser?.name || "Bilinmeyen Kullanıcı",
        userRole: activePanelUser?.role === "admin" ? "Yönetici" : activePanelUser?.role === "editor" ? "Editör" : "Sorumlu",
        text: commentText.trim(),
        createdAt: new Date().toISOString(),
      };

      const updatedComments = [...(selectedDof.comments || []), newComment];
      await updateDof(selectedDof.id, { comments: updatedComments });
      
      const updatedDofObj = {
        ...selectedDof,
        comments: updatedComments
      };
      
      setSelectedDof(updatedDofObj);
      setCommentText("");
      
      // Update our list in state too
      setDofs(prev => prev.map(d => d.id === selectedDof.id ? updatedDofObj : d));
    } catch (err) {
      console.error(err);
      alert("Yorum eklenirken hata oluştu.");
    } finally {
      setIsCommentSending(false);
    }
  };

  const getDofStepNumber = (dof: DofForm): number => {
    if (dof.currentStep && dof.currentStep >= 1 && dof.currentStep <= 8) {
      return dof.currentStep;
    }
    if (dof.status === "cozuldu" || dof.status === "reddedildi") {
      return 8; // Kapatıldı / Çözüldü
    }
    if (dof.referralStatus === "yapildi") {
      return 6; // Tamamlandı
    }
    if (dof.referralResultNote) {
      if (dof.referralResultNote.includes("[Uygulama Güncellemesi")) {
        return 5; // Uygulama
      }
      return 4; // Aksiyon Planı
    }
    if (dof.assignedUserId) {
      return 3; // Atanmış
    }
    if (dof.status === "inceleniyor" || dof.status === "yeni") {
      return 2; // İnceleme
    }
    return 1; // Taslak
  };

  const handleAdvanceWorkflowStep = async (targetStepNum: number, currentDof: DofForm) => {
    const dofId = currentDof?.id || selectedDof?.id;
    if (!dofId) return;

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates: Partial<DofForm> = {
        currentStep: targetStepNum,
        updatedAt: nowIso,
      };

      if (targetStepNum === 1) {
        updates.status = "yeni";
        setActiveGuideStep(1);
      } else if (targetStepNum === 2) {
        updates.status = "inceleniyor";
        setActiveGuideStep(1);
      } else if (targetStepNum === 3) {
        updates.status = "inceleniyor";
        if (!currentDof.assignedUserId) {
          updates.assignedUserName = currentDof.department + " Birim Sorumlusu";
        }
        setActiveGuideStep(2);
      } else if (targetStepNum === 4) {
        updates.status = "inceleniyor";
        updates.referralStatus = "islem_devam_ediyor";
        if (!currentDof.referralResultNote) {
          updates.referralResultNote = "Aksiyon planı hazırlandı. Faaliyet uygulamaya alındı.";
        }
        setActiveGuideStep(2);
      } else if (targetStepNum === 5) {
        updates.status = "inceleniyor";
        updates.referralStatus = "islem_devam_ediyor";
        const todayStr = new Date().toLocaleDateString("tr-TR");
        const existingNote = currentDof.referralResultNote || "";
        if (!existingNote.includes("[Uygulama Güncellemesi")) {
          updates.referralResultNote = `${existingNote}\n[Uygulama Güncellemesi - ${todayStr}]: Sahadaki faaliyetler uygulanıyor.`.trim();
        }
        setActiveGuideStep(3);
      } else if (targetStepNum === 6) {
        // Step 6: Tamamlandı
        updates.status = "cozuldu";
        updates.referralStatus = "yapildi";
        updates.referralUpdatedAt = nowIso;
        if (!currentDof.adminFeedback && !selectedDof?.adminFeedback) {
          updates.adminFeedback = "Süreç tamamlandı olarak işaretlendi.";
        }
        setActiveGuideStep(4);
      } else if (targetStepNum === 7) {
        // Step 7: Çözüldü
        updates.status = "cozuldu";
        updates.referralStatus = "yapildi";
        updates.referralUpdatedAt = nowIso;
        if (!currentDof.adminFeedback && !selectedDof?.adminFeedback) {
          updates.adminFeedback = "Süreç başarıyla çözüldü.";
        }
        setActiveGuideStep(4);
      } else if (targetStepNum === 8) {
        // Step 8: Kapatıldı
        updates.status = "cozuldu";
        updates.referralStatus = "yapildi";
        updates.referralUpdatedAt = nowIso;
        if (!currentDof.adminFeedback && !selectedDof?.adminFeedback) {
          updates.adminFeedback = "Süreç başarıyla sonuçlandırıldı ve kapatıldı.";
        }
        setActiveGuideStep(4);
      }

      await updateDof(dofId, updates);
      await fetchAllDofs();
      
      const updatedDofObj: DofForm = {
        ...currentDof,
        ...(selectedDof || {}),
        ...updates,
      };

      setSelectedDof(updatedDofObj);
      setDofs(prev => prev.map(d => (d.id === dofId || d.refNo === currentDof.refNo) ? { ...d, ...updates } : d));
      
      const stepNames: Record<number, string> = {
        1: "1. Taslak",
        2: "2. İnceleme",
        3: "3. Atanmış",
        4: "4. Aksiyon Planı",
        5: "5. Uygulama",
        6: "6. Tamamlandı",
        7: "7. Çözüldü",
        8: "8. Kapatıldı",
      };

      setSaveSuccess(true);
      setWorkflowNotice(`Aşama başarıyla '${stepNames[targetStepNum] || targetStepNum}' olarak güncellendi.`);
      setTimeout(() => {
        setWorkflowNotice(null);
        setSaveSuccess(false);
      }, 4000);
    } catch (err) {
      console.error("Workflow step update error:", err);
      setWorkflowNotice("Aşama güncellenirken bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkProcessCompleted = async (currentDof: DofForm) => {
    const dofId = currentDof?.id || selectedDof?.id;
    if (!dofId) return;

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates: Partial<DofForm> = {
        status: "cozuldu" as const,
        referralStatus: "yapildi" as const,
        referralUpdatedAt: nowIso,
        currentStep: 6, // 6. Aşama: Tamamlandı
        adminFeedback: currentDof.adminFeedback || selectedDof?.adminFeedback || "Süreç başarıyla tamamlandı ve kapatıldı.",
        updatedAt: nowIso,
      };

      await updateDof(dofId, updates);
      await fetchAllDofs();

      const updatedObj: DofForm = {
        ...currentDof,
        ...(selectedDof || {}),
        ...updates,
      };

      setSelectedDof(updatedObj);
      setDofs(prev => prev.map(d => (d.id === dofId || d.refNo === currentDof.refNo) ? { ...d, ...updates } : d));

      setActiveGuideStep(4);
      setSaveSuccess(true);
      setWorkflowNotice("✓ DÖF süreci başarıyla 'Tamamlandı' olarak işaretlendi ve kapatıldı.");
      setTimeout(() => {
        setWorkflowNotice(null);
        setSaveSuccess(false);
      }, 5000);
    } catch (err) {
      console.error("Mark process completed error:", err);
      setWorkflowNotice("İşlem sırasında bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderWorkflowActionsWidget = (dof: DofForm) => {
    return (
      <div className="space-y-4">
        {/* Step tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
          <button
            onClick={() => setActiveGuideStep(1)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeGuideStep === 1 
                ? "bg-indigo-600 text-white shadow-xs" 
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/50"
            }`}
          >
            1. İnceleme ve Atama
          </button>
          <button
            onClick={() => setActiveGuideStep(2)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeGuideStep === 2 
                ? "bg-indigo-600 text-white shadow-xs" 
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/50"
            }`}
          >
            2. Aksiyon Planı & Yönlendirme
          </button>
          <button
            onClick={() => setActiveGuideStep(3)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeGuideStep === 3 
                ? "bg-indigo-600 text-white shadow-xs" 
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/50"
            }`}
          >
            3. Uygulama & Güncellemeler
          </button>
          <button
            onClick={() => setActiveGuideStep(4)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeGuideStep === 4 || activeGuideStep === 5
                ? "bg-indigo-600 text-white shadow-xs" 
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/50"
            }`}
          >
            4. Kapatma & Karar
          </button>
        </div>

        {/* Tab contents */}
        <div className="pt-2">
          {activeGuideStep === 1 && (
            <div className="space-y-4 animate-fade-in text-xs animate-fade-in">
              <div className="bg-indigo-50/20 border border-indigo-100 p-4 rounded-xl space-y-3">
                <span className="font-extrabold text-indigo-900 block text-sm">DÖF İnceleme, Risk Seçimi ve Atama</span>
                <p className="text-slate-500 leading-relaxed">
                  Kalite yöneticisi olarak bu bildirim için risk analiz puanını belirleyin, bir hedef tamamlanma tarihi seçin ve uygunsuzluğu çözmek üzere ilgili departman yetkilisini görevlendirin.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Manuel Risk Seviyesi Seçimi</label>
                    <select
                      value={step1RiskLevel}
                      onChange={(e) => setStep1RiskLevel(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="Düşük">Düşük (Düşük Etki)</option>
                      <option value="Orta">Orta (Orta Etki)</option>
                      <option value="Yüksek">Yüksek (Kritik/Yüksek Etki)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Departman Son Tamamlanma Tarihi (Hedef Tarih)</label>
                    <input
                      type="date"
                      value={step1TargetDate}
                      onChange={(e) => setStep1TargetDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">İlgili Birim Sorumlusu (Havale Edilecek Kişi)</label>
                    <select
                      value={step1AssigneeId}
                      onChange={(e) => setStep1AssigneeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="">-- Sorumlu Personel Seçin --</option>
                      {panelUsers
                        .filter(u => u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.department || "Birim Yok"}) - {u.email}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Havale Notu ve Talimatlar</label>
                    <input
                      type="text"
                      value={step1ReferralNote}
                      onChange={(e) => setStep1ReferralNote(e.target.value)}
                      placeholder="Örn: Uygunsuzluğun 30 gün içinde giderilmesi ve raporlanması."
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 transition outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleWorkflowStep1Submit}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition cursor-pointer shadow-md shadow-indigo-100"
                  >
                    {isSaving ? "Kaydediliyor..." : "İlgili Birime Gönder / Havale Et"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeGuideStep === 2 && (
            <div className="space-y-4 animate-fade-in text-xs animate-fade-in">
              <div className="bg-amber-50/30 border border-amber-100 p-4 rounded-xl space-y-3">
                <span className="font-extrabold text-amber-950 block text-sm">Aksiyon Planı, Risk Revizesi & Başka Departmana Yönlendirme</span>
                <p className="text-slate-500 leading-relaxed">
                  İlgili departman olarak gelen DÖF'ü inceledikten sonra risk seviyesini revize edebilir, işi başka bir departmana devredebilir veya çözüm sürecine ilişkin aksiyon planınızı ve tamamlanma süresini girerek işi başlatabilirsiniz.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Risk Seviyesini Güncelle / Revize Et</label>
                    <select
                      value={step2RiskLevel}
                      onChange={(e) => setStep2RiskLevel(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="Düşük">Düşük Seviye</option>
                      <option value="Orta">Orta Seviye</option>
                      <option value="Yüksek">Yüksek Seviye</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Başka Sorumluya / Departmana Gönder (İsteğe Bağlı)</label>
                    <select
                      value={step2ForwardAssigneeId}
                      onChange={(e) => setStep2ForwardAssigneeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer text-rose-700"
                    >
                      <option value="">-- Departmanı Değiştirmek İçin Kişi Seçin --</option>
                      {panelUsers
                        .filter(u => u.id !== dof.assignedUserId && u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.department || "Birim Yok"})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Çözüm Süreci, Aksiyon Planı ve Bilgilendirme Notu</label>
                    <textarea
                      rows={4}
                      value={step2ResultNote}
                      onChange={(e) => setStep2ResultNote(e.target.value)}
                      placeholder="Yapılması planlanan düzeltici faaliyet detaylarını, önlemleri ve çözüm sürecini girin..."
                      className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-3 transition"
                    />
                  </div>

                  {/* 5 Kök Neden Analizi (5 Whys Root Cause Analysis) */}
                  <div className="md:col-span-2 bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-amber-50/20 border border-amber-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs font-mono shadow-xs">
                          5Y
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                            5 Kök Neden Analizi (5 Whys / 5 Neden)
                            <span className="text-[9px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                              Kök Neden Metodolojisi
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Uygunsuzluğun kök sebebine ulaşmak için birbirini takip eden 5 neden alanını doldurun.
                          </p>
                        </div>
                      </div>
                      <div className="text-[10px] text-amber-800 font-semibold bg-white/80 border border-amber-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                        {step2RootCauses.filter(c => c.trim().length > 0).length} / 5 Neden Girildi
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      {[
                        { num: 1, title: "1. Kök Neden", subtitle: "Problem / Uygunsuzluk ilk olarak neden oluştu?", placeholder: "Örn: Makine üretim esnasında aşırı ısınarak acil duruşa geçti..." },
                        { num: 2, title: "2. Kök Neden", subtitle: "Buna ne sebep oldu?", placeholder: "Örn: Çünkü havalandırma fanı devreye girmedi ve hava akışı kesildi..." },
                        { num: 3, title: "3. Kök Neden", subtitle: "Bu durum neden fark edilmedi veya önlenemedi?", placeholder: "Örn: Fan filtresi yoğun toz ve partikül nedeniyle tamamen tıkanmıştı..." },
                        { num: 4, title: "4. Kök Neden", subtitle: "Hangi kontrol veya süreç adımı yetersizdi?", placeholder: "Örn: Haftalık bakım kontrol listesinde filtre temizliği kontrol maddesi tanımlı değildi..." },
                        { num: 5, title: "5. Kök Neden", subtitle: "Temel Kök Neden (Süreç / Sistemik Kök Sebep)", placeholder: "Örn: Koruyucu ve önleyici bakım prosedürü son makine revizyonuna göre güncellenmemişti..." },
                      ].map((item, idx) => (
                        <div key={item.num} className="bg-white/95 border border-amber-100/90 rounded-xl p-3 shadow-2xs space-y-1.5 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 transition">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-extrabold text-amber-950 flex items-center gap-1.5">
                              <span className="w-4.5 h-4.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center">
                                {item.num}
                              </span>
                              <span>{item.title}</span>
                              <span className="font-normal text-slate-400 hidden sm:inline">— {item.subtitle}</span>
                            </label>
                            <span className="text-[9px] font-mono text-slate-400 font-medium">Neden #{item.num}</span>
                          </div>
                          <input
                            type="text"
                            value={step2RootCauses[idx] || ""}
                            onChange={(e) => {
                              const updated = [...step2RootCauses];
                              updated[idx] = e.target.value;
                              setStep2RootCauses(updated);
                            }}
                            placeholder={item.placeholder}
                            className="w-full bg-slate-50/60 hover:bg-white focus:bg-white border border-slate-200 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition font-medium"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Planlanan Tamamlama Süresi (Tahmini Gün Sayısı)</label>
                    <input
                      type="number"
                      value={step2CompletionDays}
                      onChange={(e) => setStep2CompletionDays(e.target.value)}
                      placeholder="Örn: 15"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 transition outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 gap-2">
                  <button
                    onClick={handleWorkflowStep2Submit}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition cursor-pointer shadow-md shadow-indigo-100"
                  >
                    {isSaving ? "Kaydediliyor..." : step2ForwardAssigneeId ? "Yeni Departmana Yönlendir" : "Aksiyon Planı & Süresini Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeGuideStep === 3 && (
            <div className="space-y-4 animate-fade-in text-xs animate-fade-in">
              <div className="bg-emerald-50/20 border border-emerald-100 p-4 rounded-xl space-y-3">
                <span className="font-extrabold text-emerald-950 block text-sm">Uygulama Durumu ve Günlük Güncellemeler</span>
                <p className="text-slate-500 leading-relaxed">
                  Sahadaki düzeltici veya önleyici faaliyetlerin uygulama adımlarına dair anlık ilerleme veya ara rapor notları girerek süreci takip edilebilir kılın.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Uygulama / İlerleme Durum Bilgisi Ekle</label>
                    <textarea
                      rows={3}
                      value={step3ProgressUpdate}
                      onChange={(e) => setStep3ProgressUpdate(e.target.value)}
                      placeholder="Süreçteki son durum, yapılan düzeltmeler ve ara sonuçlar hakkında detaylı bilgi yazın..."
                      className="w-full bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none border border-slate-200 rounded-xl p-3 transition"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleMarkProcessCompleted(dof)}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition cursor-pointer shadow-md shadow-emerald-100 flex items-center gap-1.5"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>✓ Süreci Tamamlandı Olarak İşaretle</span>
                  </button>

                  <button
                    onClick={handleWorkflowStep3Submit}
                    disabled={isSaving || !step3ProgressUpdate.trim()}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition cursor-pointer"
                  >
                    {isSaving ? "Kaydediliyor..." : "İlerleme Notunu Kaydet"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(activeGuideStep === 4 || activeGuideStep === 5) && (
            <div className="space-y-4 animate-fade-in text-xs animate-fade-in">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <span className="font-extrabold text-slate-800 block text-sm">Yönetici Kararı, Onay ve Süreç Kapatma</span>
                <p className="text-slate-500 leading-relaxed">
                  Kalite Temsilcisi / Yönetici olarak yapılan işlemleri kontrol edin, çözüm kararı geri bildirimini yazın ve "Kararı ve Geri Bildirimi Kaydet" butonuna basarak DÖF sürecini kapatın.
                </p>

                {saveSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 text-xs font-semibold rounded-xl">
                    <CheckCircle className="h-4 w-4" /> Karar ve geri bildirim başarıyla kaydedildi!
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Nihai Talep Durumu</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as DofStatus)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="yeni">Yeni Bildirim (Havuza Al)</option>
                      <option value="inceleniyor">İnceleniyor / Değerlendirmede</option>
                      <option value="cozuldu">Çözüldü / Tamamlandı</option>
                      <option value="reddedildi">Reddedildi / İptal</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Nihai Geri Bildirim / Kapatma Karar Notu</label>
                    <textarea
                      rows={3}
                      value={editFeedback}
                      onChange={(e) => setEditFeedback(e.target.value)}
                      placeholder="Bildirim sahibine ve ilgili birime iletilecek resmi yanıtı yazın..."
                      className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-3 transition"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 gap-2">
                  <button
                    onClick={handleWorkflowStep4Complete}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300 text-white font-extrabold rounded-xl transition cursor-pointer shadow-md shadow-emerald-100"
                  >
                    ✓ DÖF'ü Kapat (Süreci Bitir)
                  </button>

                  <button
                    onClick={handleSaveStatus}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition cursor-pointer"
                  >
                    Kararı Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDofDetailFull = (dof: DofForm) => {
    const activeStep = getDofStepNumber(dof);
    const riskInfo = getDofScoreAndLevel(dof);
    
    // Calculate Duration
    let durationText = "-";
    if (dof.status === "cozuldu" || dof.status === "reddedildi") {
      durationText = dof.completionDays ? `${dof.completionDays} Gün` : "Belirtilmemiş";
    } else {
      const elapsedMs = Date.now() - (dof.createdAt?.seconds ? dof.createdAt.seconds * 1000 : new Date(dof.createdAt).getTime());
      const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
      durationText = `${elapsedDays} Gün (Açık)`;
    }

    // Remaining Days Calculation
    let remainingText = "Belirsiz";
    let remainingBadgeStyle = "bg-slate-100 text-slate-800";
    if (dof.targetCompletionDate) {
      const targetDate = new Date(dof.targetCompletionDate);
      const today = new Date();
      targetDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffMs = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      
      if (dof.status === "cozuldu" || dof.status === "reddedildi") {
        remainingText = "Tamamlandı";
        remainingBadgeStyle = "bg-emerald-100 text-emerald-800";
      } else if (diffDays < 0) {
        remainingText = `Gecikmiş (${Math.abs(diffDays)} Gün)`;
        remainingBadgeStyle = "bg-rose-100 text-rose-800 font-extrabold animate-pulse";
      } else if (diffDays === 0) {
        remainingText = "Bugün Son Gün!";
        remainingBadgeStyle = "bg-amber-100 text-amber-800 font-extrabold animate-pulse";
      } else {
        remainingText = `${diffDays} Gün Kaldı`;
        remainingBadgeStyle = "bg-indigo-100 text-indigo-800 font-bold";
      }
    }

    const steps = [
      { num: 1, label: "Taslak" },
      { num: 2, label: "İnceleme" },
      { num: 3, label: "Atanmış" },
      { num: 4, label: "Aksiyon Planı" },
      { num: 5, label: "Uygulama" },
      { num: 6, label: "Tamamlandı" },
      { num: 7, label: "Çözüldü" },
      { num: 8, label: "Kapatıldı" }
    ];

    let alertTitle = "Şu An Burasındasınız: İncelemede";
    let alertDesc = "DÖF kalite departmanı tarafından ön inceleme aşamasındadır.";
    let alertNext = "Bir Sonraki Adım: DÖF'ü ilgili departman sorumlusuna havale etmeniz gerekir.";
    
    if (activeStep === 3) {
      alertTitle = "Şu An Burasındasınız: Sorumlu Atandı";
      alertDesc = `DÖF başarıyla ${dof.assignedUserName || "sorumlu kişiye"} havale edildi ve inceleniyor.`;
      alertNext = "Bir Sonraki Adım: Sorumlunun aksiyon planını, risk analizini ve süre tahminini girmesi gerekiyor.";
    } else if (activeStep === 4) {
      alertTitle = "Şu An Burasındasınız: Aksiyon Planı Hazır";
      alertDesc = "Sorumlu birim aksiyon planını ve tahmini süre detaylarını kaydetti. Uygulama aşamasına geçildi.";
      alertNext = "Bir Sonraki Adım: Sahadaki uygulamaların takip edilerek süreç güncellemelerinin kaydedilmesi.";
    } else if (activeStep === 5) {
      alertTitle = "Şu An Burasındasınız: Uygulama Aşamasında";
      alertDesc = "Planlanan faaliyetler sahada uygulanıyor ve ilerleme notları güncelleniyor.";
      alertNext = "Bir Sonraki Adım: Faaliyetler tamamlandığında sorumlunun 'Tamamlandı' olarak işaretlemesi.";
    } else if (activeStep === 6) {
      alertTitle = "Şu An Burasındasınız: Tamamlandı / Onay Bekliyor";
      alertDesc = "Sorumlu birim faaliyeti tamamladı ve kapatılması için Kalite Yöneticisi onayı bekliyor.";
      alertNext = "Bir Sonraki Adım: Kalite yöneticisinin sonucu onaylaması ve DÖF'ü çözüldü olarak kapatması.";
    } else if (activeStep === 7) {
      alertTitle = "Şu An Burasındasınız: Çözüldü";
      alertDesc = "DÖF başarıyla çözülmüş ve uygunsuzluk giderilmiştir.";
      alertNext = "Süreç başarıyla sonlandırılmıştır.";
    } else if (activeStep === 8) {
      alertTitle = "Şu An Burasındasınız: Kapatıldı / Arşivlendi";
      alertDesc = "DÖF süreci tamamen kapatılmış, karara bağlanmış ve arşivlenmiştir.";
      alertNext = "Arşiv kaydı olarak saklanacaktır.";
    }

    return (
      <div className="space-y-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 animate-fade-in shadow-inner">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-[10px] font-mono text-slate-400 border-b border-slate-100 pb-2">
          <span>Doküman No: P.03.F.01.01</span>
          <div className="flex gap-4">
            <span>Yayın Tarihi: 01.08.2023</span>
            <span>Revizyon Tarihi: 22.09.2023</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-sans">DÖF Detayı</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleSelectDof(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-xs"
            >
              <ArrowUp className="h-3.5 w-3.5 -rotate-90" /> DÖF Listesine Dön
            </button>
            
            <a
              href="#workflow-actions-widget"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-xs"
            >
              <Search className="h-3.5 w-3.5" /> İncele ve Ata
            </a>

            <a
              href="#workflow-actions-widget"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Departman Değiştir
            </a>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-50 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800 font-sans">DÖF Süreç Rehberi</h3>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Aşama {activeStep} / 8: {steps[activeStep - 1]?.label || ""}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {dof.status !== "cozuldu" ? (
                <button
                  type="button"
                  onClick={() => handleMarkProcessCompleted(dof)}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Faaliyeti ve süreci doğrudan 'Tamamlandı' olarak işaretle"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Süreci Tamamlandı Olarak İşaretle</span>
                </button>
              ) : (
                <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Süreç Tamamlandı</span>
                </div>
              )}

              {activeStep < 8 && (
                <button
                  type="button"
                  onClick={() => handleAdvanceWorkflowStep(Math.min(8, activeStep + 1), dof)}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                  title="Bir sonraki aşamaya ilerle"
                >
                  <span>Sonraki Aşamaya Geç ({steps[activeStep]?.label || ""}) →</span>
                </button>
              )}
            </div>
          </div>

          {workflowNotice && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{workflowNotice}</span>
              </div>
              <button onClick={() => setWorkflowNotice(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="relative pt-4 pb-2">
            <div className="absolute top-[35px] left-8 right-8 h-1 bg-slate-100 -translate-y-1/2 z-0" />
            <div 
              className="absolute top-[35px] left-8 h-1 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, ((activeStep - 1) / 7) * 100))}%` }}
            />

            <div className="relative z-10 flex justify-between items-center">
              {steps.map((s) => {
                const isCompleted = s.num < activeStep;
                const isActive = s.num === activeStep;
                
                let circleStyle = "border-slate-200 bg-white text-slate-400 hover:border-indigo-400 hover:text-indigo-600";
                if (isActive) {
                  circleStyle = "border-emerald-500 bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-100 ring-4 ring-emerald-100 animate-pulse";
                } else if (isCompleted) {
                  circleStyle = "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700";
                }

                return (
                  <div key={s.num} className="flex flex-col items-center gap-1.5 text-center w-16">
                    <button
                      type="button"
                      onClick={() => {
                        // 1-2-3-4-5-6-7-8 rakamlarına tıklandığında bir sonraki aşamaya / hedeflenen aşamaya geçiş sağla
                        const nextStep = s.num === activeStep ? Math.min(8, activeStep + 1) : s.num;
                        handleAdvanceWorkflowStep(nextStep, dof);
                      }}
                      disabled={isSaving}
                      className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300 cursor-pointer hover:scale-115 active:scale-95 hover:shadow-md ${circleStyle}`}
                      title={`${s.num}. Aşama (${s.label}) - Tıklayarak aşamayı değiştirin veya bir sonraki aşamaya geçin`}
                    >
                      {isCompleted ? "✓" : s.num}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextStep = s.num === activeStep ? Math.min(8, activeStep + 1) : s.num;
                        handleAdvanceWorkflowStep(nextStep, dof);
                      }}
                      disabled={isSaving}
                      className={`text-[10px] font-bold transition hover:underline cursor-pointer ${
                        isActive ? "text-emerald-600 font-extrabold" : isCompleted ? "text-indigo-600" : "text-slate-400 hover:text-slate-700"
                      }`}
                      title={`${s.num}. Aşama (${s.label}) - Tıklayarak aşamayı değiştirin veya bir sonraki aşamaya geçin`}
                    >
                      {s.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-rose-50/50 border border-rose-100/70 rounded-2xl p-4 flex gap-3 text-xs text-rose-950 items-start">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-rose-900">{alertTitle}</h4>
              <p className="text-slate-600 leading-relaxed">{alertDesc}</p>
              <div className="flex items-center gap-1.5 pt-1 text-slate-500 font-medium">
                <Info className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span>{alertNext}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100/50 rounded-2xl p-4 flex items-center gap-3 text-xs text-indigo-950">
          <Settings className="h-4 w-4 text-indigo-600 animate-spin" />
          <span>
            Bu DÖF şu anda <strong className="font-semibold text-indigo-900">{dof.department} Kalite / Birim Sorumluları</strong> tarafından detaylı inceleme ve faaliyet koordinasyon aşamasındadır.
          </span>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-3 py-1 bg-indigo-600 text-white font-mono font-bold text-xs rounded-lg shadow-sm">
              #{dof.refNo}
            </span>
            <button
              type="button"
              onClick={() => handleCopyRefNo(dof.refNo)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border shadow-2xs ${
                copiedRefNo === dof.refNo
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
              }`}
              title="DÖF Takip Kodunu Kopyala"
            >
              {copiedRefNo === dof.refNo ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-700 font-bold text-[10px]">Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-slate-500" />
                  <span className="text-slate-600 text-[10px]">Kodu Kopyala</span>
                </>
              )}
            </button>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight font-sans">
              {dof.title}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              dof.status === "yeni" ? "bg-blue-100 text-blue-800" :
              dof.status === "inceleniyor" ? "bg-amber-100 text-amber-800 animate-pulse" :
              dof.status === "cozuldu" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}>
              {dof.status === "yeni" ? "Yeni Başvuru" :
               dof.status === "inceleniyor" ? "İncelemede" :
               dof.status === "cozuldu" ? "Çözüldü" : "Reddedildi"}
            </span>
            <span className="text-slate-400 font-mono text-xs">{formatDate(dof.createdAt)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
              <FileText className="h-4.5 w-4.5 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Kaynak Bilgileri</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
              <div>
                <span className="text-slate-400 font-medium block">Oluşturan</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{dof.reporterName}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Kaynak Departman</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{dof.department}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Tür</span>
                <span className="font-bold text-indigo-600 text-sm mt-0.5 block capitalize">{dof.type} Faaliyet</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">DÖF Kaynağı</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">Müşteri Şikayeti / Bildirim</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
              <Users className="h-4.5 w-4.5 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Atama Bilgileri</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
              <div>
                <span className="text-slate-400 font-medium block">Atanan Birim Sorumlusu</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{dof.assignedUserName || "Atanmamış"}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Atayan</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{dof.assignedUserId ? "Kalite Yöneticisi" : "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Atama Tarihi</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                  {dof.referralUpdatedAt ? new Date(dof.referralUpdatedAt).toLocaleString("tr-TR") : "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Aksiyon Sınıfı</span>
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">Normal Faaliyet</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
            <Clock className="h-4.5 w-4.5 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Zaman ve Öncelik Bilgileri</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block font-semibold mb-1">Son Tarih</span>
              <span className="text-sm font-bold text-slate-800">
                {dof.targetCompletionDate ? new Date(dof.targetCompletionDate).toLocaleDateString("tr-TR") : "Belirtilmemiş"}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block font-semibold mb-1">Termin</span>
              <span className="text-sm font-bold text-slate-800">
                {dof.completionDays ? `${dof.completionDays} Gün` : "Belirtilmemiş"}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block font-semibold mb-1">Kalan Süre</span>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${remainingBadgeStyle}`}>
                {remainingText}
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="text-slate-400 block font-semibold mb-1">Öncelik / Risk Seviyesi</span>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                riskInfo.level === "Yüksek" ? "bg-rose-100 text-rose-800" :
                riskInfo.level === "Orta" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}>
                {riskInfo.level} ({riskInfo.score} Puan)
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
            <FileText className="h-4.5 w-4.5 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Uygunsuzluk Açıklaması</h4>
          </div>

          <div className="space-y-4 text-xs">
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 text-slate-700 leading-relaxed whitespace-pre-line min-h-[80px]">
              {dof.description}
            </div>

            {dof.proposedAction && (
              <div className="bg-slate-50/30 rounded-xl p-4 border border-slate-100 text-slate-700 leading-relaxed">
                <span className="text-[10px] font-bold text-indigo-600 block mb-1">BİLDİRİM YAPAN KİŞİNİN ÖNERİSİ:</span>
                <p className="italic">{dof.proposedAction}</p>
              </div>
            )}
          </div>
        </div>

        {/* 5 Kök Neden Analizi (5 Whys / Root Cause) Display */}
        {dof.rootCauses && dof.rootCauses.some(c => c && c.trim().length > 0) && (
          <div className="bg-white border border-amber-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs font-mono shadow-xs">
                  5Y
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950">5 Kök Neden Analizi (5 Whys)</h4>
                  <p className="text-[10px] text-slate-500">Aksiyon planında tespit edilen kök neden analizi aşamaları</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                Kök Neden Raporu
              </span>
            </div>

            <div className="space-y-2.5">
              {dof.rootCauses.map((cause, idx) => {
                if (!cause || !cause.trim()) return null;
                const isFinal = idx === 4 || idx === dof.rootCauses!.filter(c => c && c.trim()).length - 1;
                return (
                  <div 
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-xs transition-all ${
                      idx === 4 
                        ? "bg-amber-50/80 border-amber-300/80 font-semibold text-amber-950 shadow-2xs" 
                        : "bg-slate-50/70 border-slate-100 text-slate-700"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[10px] font-black ${
                      idx === 4 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-400">
                        {idx === 4 ? "Temel / Asıl Kök Neden (5. Neden)" : `${idx + 1}. Kök Neden`}
                      </div>
                      <p className="leading-relaxed whitespace-pre-line">{cause}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
            <Paperclip className="h-4.5 w-4.5 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ekler</h4>
          </div>

          {dof.imageUrl ? (
            <div className="border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-indigo-50 border border-indigo-100 overflow-hidden shrink-0">
                  <img src={dof.imageUrl} alt="Ek" className="h-full w-full object-cover" />
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 block">DÖF Ek Belge / Görsel</span>
                  <span className="text-slate-400 text-[10px] font-mono mt-0.5 block">Boyut: ~15 KB</span>
                </div>
              </div>
              <div className="flex gap-2">
                <a 
                  href={dof.imageUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" /> Önizleme
                </a>
                <a 
                  href={dof.imageUrl} 
                  download={`dof-${dof.refNo}-ek.jpg`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> İndir
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-2">Bu DÖF bildirimine eklenmiş herhangi bir belge veya görsel bulunmuyor.</p>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
            <Clock className="h-4.5 w-4.5 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">İşlem Geçmişi</h4>
          </div>

          <div className="overflow-x-auto text-xs font-sans">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Tarih</th>
                  <th className="p-3">Kullanıcı</th>
                  <th className="p-3">DÖF Tipi</th>
                  <th className="p-3">DÖF Kaynağı</th>
                  <th className="p-3">İşlem</th>
                  <th className="p-3">Açıklama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50/50 transition">
                  <td className="p-3 font-mono text-[10px] text-slate-500">{formatDate(dof.createdAt)}</td>
                  <td className="p-3 text-slate-700 font-semibold">{dof.reporterName}</td>
                  <td className="p-3 capitalize text-indigo-600 font-bold">{dof.type}</td>
                  <td className="p-3 text-slate-600">Sistem Girişi</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-bold">
                      OLUŞTURULDU
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 max-w-xs truncate">DÖF başarıyla oluşturuldu ve havuza alındı.</td>
                </tr>

                {dof.assignedUserId && (
                  <tr className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-mono text-[10px] text-slate-500">
                      {dof.referralUpdatedAt ? new Date(dof.referralUpdatedAt).toLocaleString("tr-TR") : formatDate(dof.createdAt)}
                    </td>
                    <td className="p-3 text-slate-700 font-semibold">Kalite Temsilcisi</td>
                    <td className="p-3 capitalize text-indigo-600 font-bold">{dof.type}</td>
                    <td className="p-3 text-slate-600">Sorumlu Atama</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                        HAVALE EDİLDİ
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {dof.assignedUserName} kişisine havale edildi. Not: {dof.referralNote || "Belirtilmemiş"}
                    </td>
                  </tr>
                )}

                {dof.referralResultNote && (
                  <tr className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-mono text-[10px] text-slate-500">
                      {dof.referralUpdatedAt ? new Date(dof.referralUpdatedAt).toLocaleString("tr-TR") : formatDate(dof.createdAt)}
                    </td>
                    <td className="p-3 text-slate-700 font-semibold">{dof.assignedUserName}</td>
                    <td className="p-3 capitalize text-indigo-600 font-bold">{dof.type}</td>
                    <td className="p-3 text-slate-600">Aksiyon & Sonuç</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                        İŞLEM YAPILDI
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 max-w-xs truncate">{dof.referralResultNote}</td>
                  </tr>
                )}

                {dof.status === "cozuldu" && (
                  <tr className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-mono text-[10px] text-slate-500">
                      {dof.referralUpdatedAt ? new Date(dof.referralUpdatedAt).toLocaleString("tr-TR") : formatDate(dof.createdAt)}
                    </td>
                    <td className="p-3 text-slate-700 font-semibold">Kalite Yöneticisi</td>
                    <td className="p-3 capitalize text-indigo-600 font-bold">{dof.type}</td>
                    <td className="p-3 text-slate-600">Süreç Kapatma</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                        KAPATILDI
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 max-w-xs truncate">{dof.adminFeedback || "Süreç başarıyla çözümlendi."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-50 pb-2.5">
            <MessageSquare className="h-4.5 w-4.5 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Yorumlar</h4>
          </div>

          <div className="space-y-4">
            {dof.comments && dof.comments.length > 0 ? (
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-2">
                {dof.comments.map((comment) => (
                  <div key={comment.id} className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-800">{comment.userName}</span>
                        <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase text-[8px] tracking-wide">
                          {comment.userRole}
                        </span>
                      </div>
                      <span className="text-slate-400 font-mono">
                        {new Date(comment.createdAt).toLocaleString("tr-TR")}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Henüz yorum yapılmamış.</p>
            )}

            <div className="pt-3 border-t border-slate-50 space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Yorum Ekle</label>
              <textarea
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Bu uygunsuzluk hakkında teknik analiz, not veya koordinasyon detayı yazın..."
                className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-3.5 transition text-xs resize-none"
              />
              <div className="flex justify-end font-sans">
                <button
                  onClick={handleAddComment}
                  disabled={isCommentSending || !commentText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-xs"
                >
                  {isCommentSending ? "Gönderiliyor..." : "Yorumu Gönder"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="workflow-actions-widget" className="border-t border-slate-100 pt-6 space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-2.5">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-indigo-600 animate-pulse" />
                DÖF İşlem ve Aksiyon Yönetim Paneli
              </h4>
            </div>

            {renderWorkflowActionsWidget(dof)}
          </div>
        </div>
      </div>
    );
  };

  const handleReferDof = async () => {
    if (!selectedDof?.id) return;
    if (!assigneeId) {
      alert("Lütfen havale edilecek yetkili kişiyi seçin.");
      return;
    }
    setIsAssigning(true);

    try {
      const matchedUser = panelUsers.find(u => u.id === assigneeId);
      if (!matchedUser) {
        alert("Seçilen yetkili bulunamadı.");
        setIsAssigning(false);
        return;
      }

      const updates = {
        assignedUserId: matchedUser.id,
        assignedUserName: matchedUser.name,
        assignedUserEmail: matchedUser.email,
        referralStatus: "islem_devam_ediyor" as const,
        referralNote: referralNote.trim(),
        referralUpdatedAt: new Date().toISOString(),
        status: selectedDof.status === "yeni" ? ("inceleniyor" as const) : selectedDof.status,
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates
      });

      setAssigneeId("");
      setReferralNote("");
      alert("DÖF başarıyla ilgili yetkiliye havale edildi.");
    } catch (err) {
      console.error(err);
      alert("Havale işlemi sırasında bir hata oluştu.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUpdateProgress = async () => {
    if (!selectedDof?.id) return;
    setIsUpdatingProgress(true);

    try {
      const updates = {
        referralStatus: progressStatus,
        referralResultNote: progressNote.trim(),
        referralUpdatedAt: new Date().toISOString(),
        status: progressStatus === "yapildi" ? ("cozuldu" as const) : selectedDof.status,
      };

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates
      });

      setProgressNote("");
      alert("İşlem aşaması başarıyla güncellendi.");
    } catch (err) {
      console.error(err);
      alert("İşlem durumu güncellenirken bir hata oluştu.");
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleDeleteDof = (dofOrId: DofForm | string) => {
    if (typeof dofOrId === "string") {
      const target = dofs.find(d => d.id === dofOrId) || (selectedDof?.id === dofOrId ? selectedDof : null);
      if (target) {
        setDofToDelete(target);
      }
    } else if (dofOrId) {
      setDofToDelete(dofOrId);
    }
  };

  const executeDeleteDof = async () => {
    if (!dofToDelete?.id) return;
    setIsDeletingDof(true);
    try {
      const refNo = dofToDelete.refNo;
      await deleteDof(dofToDelete.id);
      
      setDofs(prev => prev.filter(d => d.id !== dofToDelete.id));
      if (selectedDof?.id === dofToDelete.id) {
        setSelectedDof(null);
      }
      
      await fetchAllDofs();
      setDofToDelete(null);
      setWorkflowNotice(`✓ DÖF #${refNo} kaydı başarıyla silindi.`);
      setTimeout(() => setWorkflowNotice(null), 4000);
    } catch (err) {
      console.error("DÖF silme hatası:", err);
      alert("Kayıt silinirken bir hata oluştu.");
    } finally {
      setIsDeletingDof(false);
    }
  };

  // Run Gemini AI Analysis
  const handleAiAnalysis = async () => {
    if (!selectedDof) return;
    setIsAiLoading(true);
    setAiError(null);
    setAiResult(null);

    try {
      const response = await fetch("/api/analyze-dof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedDof.title,
          type: selectedDof.type,
          department: selectedDof.department,
          description: selectedDof.description,
          proposedAction: selectedDof.proposedAction || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Yapay zeka servisi yanıt vermedi.");
      }

      const data = await response.json();
      setAiResult(data);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Yapay zeka analizi yüklenirken bir hata oluştu.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiFeedback = () => {
    if (aiResult?.feedbackDraft) {
      setEditFeedback(aiResult.feedbackDraft);
    }
  };

  const handleCopyToClipboard = () => {
    if (aiResult?.feedbackDraft) {
      navigator.clipboard.writeText(aiResult.feedbackDraft);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const getDofScoreAndLevel = (dof: DofForm) => {
    const text = ((dof.title || "") + " " + (dof.description || "")).toLowerCase();
    let hash = 0;
    const str = dof.id || dof.refNo || "dof";
    for (let i = 0; i < str.length; i++) {
      hash += str.charCodeAt(i);
    }
    let score = 5 + (hash % 10);
    if (text.includes("yangın") || text.includes("iş güvenliği") || text.includes("kaza") || text.includes("yaralanma") || text.includes("tehlike")) {
      score += 5;
    }
    if (text.includes("kalite") || text.includes("hata") || text.includes("bozuk") || text.includes("müşteri")) {
      score += 3;
    }
    
    // Default level to "Orta" unless explicitly specified
    let level: "Düşük" | "Orta" | "Yüksek" = "Orta";
    if (dof.riskLevel) {
      level = dof.riskLevel;
    }

    if (level === "Yüksek") {
      score = Math.max(12, score);
    } else if (level === "Orta") {
      score = score >= 8 && score < 12 ? score : 9;
    } else {
      score = score < 8 ? score : 6;
    }

    return { score, level };
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    return new Date(timestamp).toLocaleDateString("tr-TR");
  };

  // Authentication Gate Screen
  if (!authChecked) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
        <p className="text-slate-400 text-sm">Yönetim Paneli yükleniyor...</p>
      </div>
    );
  }

  // Active bypass auto-login check loader
  if (isPasscodeLoginPassive && isAuthorized === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
        <p className="text-slate-400 text-sm font-semibold">Yönetim Paneline otomatik giriş yapılıyor...</p>
      </div>
    );
  }

  if (!isPasscodeLoginPassive && !user && !isPasscodeAuthed) {
    return (
      <div className="max-w-md mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-100 rounded-2xl p-8 shadow-2xl"
          id="admin-login-card"
        >
          {isForgotPasswordMode ? (
            // Forgot Password Wizard
            <div>
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mb-3">
                  <Mail className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">Şifremi Unuttum</h2>
                <p className="text-xs text-slate-400 mt-1">E-posta doğrulaması ile şifre sıfırlama talebinde bulunun</p>
              </div>

              {forgotError && (
                <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-100 p-2.5 rounded-lg mb-4">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {forgotError}
                </p>
              )}

              {forgotStep === 1 && (
                <form onSubmit={handleRequestVerificationCode} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">E-Posta Adresiniz</label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Örn: gokhan.eroglu@gmail.com"
                      className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-sans"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition cursor-pointer text-sm"
                  >
                    Şifre Kurtarma Talebi Gönder
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordMode(false);
                      setForgotStep(1);
                      setForgotError(null);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition cursor-pointer text-xs"
                  >
                    Geri Dön
                  </button>
                </form>
              )}

              {forgotStep === 3 && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 mb-2">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed font-sans font-medium">
                    {forgotSuccess}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordMode(false);
                      setForgotStep(1);
                      setForgotError(null);
                      setForgotSuccess(null);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-medium rounded-xl transition cursor-pointer text-sm"
                  >
                    Giriş Sayfasına Dön
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Email and Passcode Login View
            <div>
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mb-3">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-display font-bold text-slate-900 tracking-tight">Yönetici Girişi</h2>
                <p className="text-xs text-slate-400 mt-1">Lütfen yetkili e-posta adresi ve şifrenizle giriş yapın</p>
              </div>

              {authError && (
                <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-100 p-2.5 rounded-lg mb-4">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {authError}
                </p>
              )}

              <form onSubmit={handlePasscodeLogin} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">Kullanıcı Adı veya E-Posta</label>
                  <input
                    type="text"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Örn: admin veya gokhan.eroglu@gmail.com"
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-sans"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase block">Yönetici Şifresi</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(true);
                        setForgotStep(1);
                        setForgotError(null);
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                    >
                      Şifremi Unuttum
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Şifreniz"
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-medium rounded-xl transition cursor-pointer text-sm shadow-md"
                  id="passcode-submit-btn"
                >
                  Giriş Yap
                </button>
              </form>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Gate check for loading authorization
  if (!isPasscodeLoginPassive && user && isAuthorized === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
        <p className="text-slate-400 text-sm">Yetkilendirme kontrol ediliyor...</p>
      </div>
    );
  }

  // Gate check for unauthorized users
  if (!isPasscodeLoginPassive && user && isAuthorized === false && !isPasscodeAuthed) {
    return (
      <div className="max-w-md mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-100 rounded-2xl p-8 shadow-2xl text-center"
          id="admin-unauthorized-card"
        >
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-rose-50 border border-rose-100 text-rose-600 mb-3 animate-pulse">
            <XCircle className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-display font-bold text-slate-900 tracking-tight">Erişim Yetkiniz Yok</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Giriş yaptığınız Google hesabı (<strong>{user.email}</strong>) bu yönetim paneline erişim yetkisine sahip değil.
          </p>
          <p className="text-xs text-slate-400 mt-4 bg-slate-50 border border-slate-100 p-3 rounded-xl leading-normal">
            Lütfen sistem yöneticinizden e-posta adresinizi sisteme yetkili kullanıcı olarak eklemesini talep edin.
          </p>
          
          <div className="mt-6 space-y-3">
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-semibold rounded-xl transition cursor-pointer text-sm"
              id="switch-account-btn"
            >
              Başka Hesapla Giriş Yap
            </button>
            
            {!isPasscodeLoginPassive && (
              <>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink mx-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">veya</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                <form onSubmit={handlePasscodeLogin} className="space-y-2">
                  <input
                    type="text"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Kullanıcı Adı veya E-Posta"
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs text-center font-sans animate-none"
                  />
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Yönetici Şifresi"
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs text-center font-mono animate-none"
                  />
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition cursor-pointer text-xs border border-slate-200"
                  >
                    Giriş Yap
                  </button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  const renderLayoutWrapper = (sectionId: string, title: string, content: React.ReactNode) => {
    const sectionIndex = layoutOrder.indexOf(sectionId);
    const wrapperStyle = { order: sectionIndex };

    if (!isEditingLayout) {
      return (
        <div key={sectionId} style={wrapperStyle} className="w-full">
          {content}
        </div>
      );
    }

    return (
      <div 
        key={sectionId} 
        style={wrapperStyle}
        className="w-full relative border-2 border-dashed border-indigo-400/60 rounded-3xl p-5 bg-indigo-50/5 hover:bg-indigo-50/10 transition-all duration-300 group shadow-inner"
      >
        {/* Reordering Controls Pill */}
        <div className="absolute -top-3.5 left-4 right-4 flex items-center justify-between bg-indigo-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm z-10">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-[10px] font-bold">
              {sectionIndex + 1}
            </span>
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => moveSection("up", sectionId)}
              disabled={sectionIndex === 0}
              className="p-1 rounded bg-white/10 hover:bg-white/20 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              title="Yukarı Taşı"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => moveSection("down", sectionId)}
              disabled={sectionIndex === layoutOrder.length - 1}
              className="p-1 rounded bg-white/10 hover:bg-white/20 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              title="Aşağı Taşı"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        
        <div className="pt-4">
          {content}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Real-time Toast Notification Overlay */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
        <AnimatePresence>
          {activeNotification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 relative overflow-hidden"
            >
              {/* Animated highlight line at the top */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse" />

              <div className="flex gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                      YENİ BAŞVURU ALINDI
                    </span>
                    <button
                      onClick={() => setActiveNotification(null)}
                      className="text-slate-400 hover:text-white transition p-0.5 rounded cursor-pointer"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>

                  <h3 className="text-xs font-bold font-mono text-indigo-300">
                    {activeNotification.refNo}
                  </h3>
                  <h4 className="text-xs font-semibold text-slate-100 line-clamp-1">
                    {activeNotification.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 line-clamp-2">
                    {activeNotification.department} • {activeNotification.reporterName}
                  </p>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={() => {
                        handleSelectDof(activeNotification);
                        setActiveNotification(null);
                        setAdminSubTab("dofs");
                      }}
                      className="flex-1 text-center py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[10px] font-bold rounded-lg transition cursor-pointer"
                    >
                      Hemen İncele
                    </button>
                    <button
                      onClick={() => setActiveNotification(null)}
                      className="py-1.5 px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 text-[10px] font-medium rounded-lg transition cursor-pointer"
                    >
                      Yoksay
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`min-h-screen flex flex-col lg:flex-row bg-slate-100 rounded-3xl overflow-hidden border border-slate-200 shadow-sm ${showPosterModal ? "print:hidden" : ""}`}>
        {/* Left Sidebar Menu */}
        <aside className="w-full lg:w-72 bg-slate-900 text-slate-300 shrink-0 flex flex-col border-r border-slate-800 shadow-xl">
          <div className="p-5 flex flex-col gap-5">
            {/* Brand Header */}
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shrink-0">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display font-bold text-white text-xs leading-none">
                  {isSystemAdmin ? "DÖF Yönetim Paneli" : "KYS Kontrol Paneli"}
                </h2>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider block mt-1 uppercase truncate max-w-[170px]">
                  {isSystemAdmin ? "YÖNETİCİ PANELİ" : (activePanelUser?.department || "BİRİM PANELİ")}
                </span>
              </div>
            </div>

            {/* Nav Menu */}
            <nav className="flex flex-col gap-1.5">
              <div className="pb-1 px-4">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                  {isSystemAdmin ? "ANA PANEL" : "BİRİM İŞLEMLERİ"}
                </span>
              </div>
              
              <button
                onClick={() => setAdminSubTab("dashboard")}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                  adminSubTab === "dashboard"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>

              <button
                onClick={() => setAdminSubTab("dofs")}
                className={`flex items-center justify-between px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                  adminSubTab === "dofs"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Grid className="h-4 w-4" />
                  {isSystemAdmin ? "Tüm DÖF'ler" : "Birim DÖF'leri"}
                </div>
                {newCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold animate-pulse">
                    {newCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setAdminSubTab("new_dof")}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                  adminSubTab === "new_dof"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span className="text-sm font-bold leading-none">+</span>
                Yeni DÖF Oluşturma
              </button>

              <button
                onClick={() => setAdminSubTab("reports")}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                  adminSubTab === "reports"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Sparkles className="h-4 w-4" />
                {isSystemAdmin ? "Raporlar & Analiz" : "Birim Raporları"}
              </button>

              {/* YÖNETİM PANELİ Bölümü - SADECE YÖNETİCİ YETKİSİ OLANLARDA GÖRÜNÜR */}
              {isSystemAdmin && (
                <>
                  <div className="pt-4 pb-1 px-4">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">YÖNETİM PANELİ</span>
                  </div>

                  <button
                    onClick={() => setAdminSubTab("users")}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                      adminSubTab === "users"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Kullanıcılar
                  </button>

                  <button
                    onClick={() => setAdminSubTab("departments")}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                      adminSubTab === "departments"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <Building className="h-4 w-4" />
                    Departmanlar
                  </button>

                  <button
                    onClick={() => setAdminSubTab("remote")}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                      adminSubTab === "remote"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    Uzak Bağlantı & QR
                  </button>

                  <button
                    onClick={() => {
                      setAdminSubTab("logs");
                      fetchLogs();
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left ${
                      adminSubTab === "logs"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <Mail className="h-4 w-4" />
                    Sistem Logları
                  </button>
                </>
              )}
            </nav>
          </div>
        </aside>

        {/* Main Workspace Column */}
        <main className="flex-1 bg-white p-6 sm:p-8 overflow-y-auto">
          <div className="flex flex-col gap-6">
            {/* Layout customization active banner */}
        {isEditingLayout && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 w-full"
            id="layout-edit-banner"
            style={{ order: -1 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="p-2 rounded-xl bg-amber-500 text-white shadow-sm mt-0.5 shrink-0">
                  <SlidersHorizontal className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                    🔧 Ekran Yerleşimi Düzenleme Modu Aktif
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Aşağıdaki bileşenlerin yerlerini değiştirmek için başlıklarındaki <b>Yukarı (<ArrowUp className="inline h-3 w-3" />)</b> ve <b>Aşağı (<ArrowDown className="inline h-3 w-3" />)</b> yön oklarını kullanabilirsiniz. Değişikliklerinizi kaydetmeyi unutmayın.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => {
                    localStorage.setItem("dof_admin_layout_order", JSON.stringify(layoutOrder));
                    setIsEditingLayout(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" /> Kaydet
                </button>
                <button
                  onClick={() => {
                    setLayoutOrder(["chart", "header", "stats", "tabs", "workflow_section"]);
                    localStorage.removeItem("dof_admin_layout_order");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Sıfırla
                </button>
                <button
                  onClick={() => {
                    const saved = localStorage.getItem("dof_admin_layout_order");
                    if (saved) {
                      try {
                        setLayoutOrder(JSON.parse(saved));
                      } catch(e) {}
                    } else {
                      setLayoutOrder(["chart", "header", "stats", "tabs", "workflow_section"]);
                    }
                    setIsEditingLayout(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" /> İptal
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* DÖF Durum & Dağılım Özeti Grafiği ve Kartı */}
        {adminSubTab === "dashboard" && renderLayoutWrapper(
          "chart",
          "DÖF Durum & Dağılım Özeti Grafiği",
          <DashboardChartsGrid
            visibleDofs={visibleDofs}
            resolvedCount={resolvedCount}
            newCount={newCount}
            reviewCount={reviewCount}
            rejectedCount={rejectedCount}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setSearchTerm={setSearchTerm}
            setDeptFilter={setDeptFilter}
            setAdminSubTab={setAdminSubTab}
            handleSelectDof={handleSelectDof}
          />
        )}

        {/* Dashboard Top Header */}
        {adminSubTab === "dashboard" && renderLayoutWrapper(
          "header",
          "Yönetici Bilgi ve Kontrol Başlığı",
          <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                  <Unlock className="h-4 w-4" />
                </span>
                <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                  {isSystemAdmin 
                    ? "GÜVENLİ YÖNETİCİ PANELİ" 
                    : `KYS BİRİM KONTROL PANELİ • ${activePanelUser?.department || "BİRİMİNİZ"}`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Yerleşimi Düzenle Button (Sadece Yönetici) */}
              {isSystemAdmin && (
                <button
                  onClick={() => setIsEditingLayout(!isEditingLayout)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition cursor-pointer text-xs font-semibold border ${
                    isEditingLayout
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                  title="Ekran yerleşimini düzenle"
                  id="layout-edit-toggle-btn"
                >
                  <SlidersHorizontal className={`h-3.5 w-3.5 ${isEditingLayout ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                  {isEditingLayout ? "Düzenlemeyi Kapat" : "Ekranı Düzenle"}
                </button>
              )}

              {/* QR Scanner Button */}
              <button
                onClick={() => setIsAdminScannerOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer text-xs font-bold shadow-xs"
                title="Kamera ile DÖF QR Kodu Tara"
                id="admin-qr-scan-btn"
              >
                <Camera className="h-3.5 w-3.5" /> QR Tara
              </button>

              {/* Parametre Ayarları Button (Sadece Yönetici) */}
              {isSystemAdmin && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-xl transition cursor-pointer text-xs font-semibold"
                  title="Sistem Parametre Ayarları"
                  id="system-settings-btn"
                >
                  <Settings className="h-3.5 w-3.5" /> Ayarlar
                </button>
              )}

              {/* Audio alert controller */}
              <button
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  localStorage.setItem("dof_admin_last_sound_state", nextMuted ? "muted" : "unmuted");
                }}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition cursor-pointer text-xs font-semibold border ${
                  isMuted 
                    ? "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100" 
                    : "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100/70"
                }`}
                title={isMuted ? "Sesli bildirimleri aç" : "Sesli bildirimleri sustur"}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5" /> Ses Kapalı
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 animate-bounce" style={{ animationDuration: '2s' }} /> Ses Açık
                  </>
                )}
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center p-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl transition cursor-pointer border border-slate-200 shrink-0"
                title="Oturumu Kapat"
                id="logout-btn"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards Section */}
        {adminSubTab === "dashboard" && renderLayoutWrapper(
          "stats",
          "Filtrelenebilir İstatistik Kartları",
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <button
              onClick={() => {
                setStatusFilter("all");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 cursor-pointer outline-none ${
                statusFilter === "all"
                  ? "bg-indigo-50/60 border-2 border-indigo-400 ring-4 ring-indigo-500/10"
                  : "bg-white border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Toplam DÖF</span>
              <span className="text-3xl font-display font-bold text-slate-900 block mt-1">{totalCount}</span>
              <span className="text-[9px] font-medium text-slate-400 block mt-0.5">Tümünü Göster</span>
            </button>

            <button
              onClick={() => {
                setStatusFilter("bekleyen");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 relative overflow-hidden cursor-pointer outline-none ${
                statusFilter === "bekleyen"
                  ? urgentCount > 0
                    ? "bg-rose-100/60 border-2 border-rose-500 ring-4 ring-rose-500/10"
                    : "bg-amber-100/60 border-2 border-amber-500 ring-4 ring-amber-500/10"
                  : urgentCount > 0
                    ? "bg-rose-50/50 border border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                    : "bg-amber-5/40 border border-amber-200/50 hover:bg-amber-50/70 hover:border-amber-300"
              }`}
            >
              {urgentCount > 0 ? (
                <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                </span>
              ) : (newCount + reviewCount) > 0 ? (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              ) : null}
              <span className={`text-[10px] font-bold tracking-wider uppercase block ${urgentCount > 0 ? "text-rose-600 font-extrabold" : "text-amber-600"}`}>
                {urgentCount > 0 ? "⚠️ ACİL BEKLEYEN" : "Toplam Bekleyen"}
              </span>
              <span className={`text-3xl font-display font-bold block mt-1 ${urgentCount > 0 ? "text-rose-700" : "text-amber-700"}`}>{newCount + reviewCount}</span>
              {urgentCount > 0 ? (
                <span className="text-[9px] font-extrabold text-rose-600 bg-rose-100/80 px-1.5 py-0.5 rounded-md inline-block mt-0.5 animate-pulse">
                  {urgentCount} DÖF Süresi Doluyor/Geçti!
                </span>
              ) : (
                <span className="text-[9px] font-medium text-amber-500 block mt-0.5">Aksiyon Bekleyenler</span>
              )}
            </button>

            <button
              onClick={() => {
                setStatusFilter("yeni");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 relative overflow-hidden cursor-pointer outline-none ${
                statusFilter === "yeni"
                  ? "bg-blue-50 border-2 border-blue-400 ring-4 ring-blue-500/10"
                  : "bg-blue-50/20 border border-blue-100 hover:bg-blue-50/40 hover:border-blue-200"
              }`}
            >
              {newCount > 0 && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
              <span className="text-[10px] font-bold text-blue-500 tracking-wider uppercase block">Yeni</span>
              <span className="text-3xl font-display font-bold text-blue-700 block mt-1">{newCount}</span>
              {newCount > 0 ? (
                <span className="text-[9px] font-bold text-blue-600 block mt-0.5 animate-bounce">
                  Gözden Geçir!
                </span>
              ) : (
                <span className="text-[9px] font-medium text-blue-400 block mt-0.5">Filtrele</span>
              )}
            </button>

            <button
              onClick={() => {
                setStatusFilter("inceleniyor");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 cursor-pointer outline-none ${
                statusFilter === "inceleniyor"
                  ? "bg-amber-50 border-2 border-amber-400 ring-4 ring-amber-500/10"
                  : "bg-amber-50/20 border border-amber-100/70 hover:bg-amber-50/40 hover:border-amber-200"
              }`}
            >
              <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase block">İnceleniyor</span>
              <span className="text-3xl font-display font-bold text-amber-700 block mt-1">{reviewCount}</span>
              <span className="text-[9px] font-medium text-amber-400 block mt-0.5">Filtrele</span>
            </button>

            <button
              onClick={() => {
                setStatusFilter("cozuldu");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 cursor-pointer outline-none ${
                statusFilter === "cozuldu"
                  ? "bg-emerald-50 border-2 border-emerald-400 ring-4 ring-emerald-500/10"
                  : "bg-emerald-50/20 border border-emerald-100/70 hover:bg-emerald-50/40 hover:border-emerald-200"
              }`}
            >
              <span className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase block">Çözüldü</span>
              <span className="text-3xl font-display font-bold text-emerald-700 block mt-1">{resolvedCount}</span>
              <span className="text-[9px] font-medium text-emerald-400 block mt-0.5">Filtrele</span>
            </button>

            <button
              onClick={() => {
                setStatusFilter("reddedildi");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 cursor-pointer outline-none ${
                statusFilter === "reddedildi"
                  ? "bg-rose-50 border-2 border-rose-400 ring-4 ring-rose-500/10"
                  : "bg-rose-50/20 border border-rose-100/70 hover:bg-rose-50/40 hover:border-rose-200"
              }`}
            >
              <span className="text-[10px] font-bold text-rose-500 tracking-wider uppercase block">Reddedildi</span>
              <span className="text-3xl font-display font-bold text-rose-700 block mt-1">{rejectedCount}</span>
              <span className="text-[9px] font-medium text-rose-400 block mt-0.5">Filtrele</span>
            </button>
          </div>
        )}

        {/* İş Akışı Section on Main Dashboard */}
        {adminSubTab === "dashboard" && renderLayoutWrapper(
          "workflow_section",
          "Aktif İş Akışı & Atanan Görevler",
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <SlidersHorizontal className="h-5 w-5" />
                  </span>
                  Aktif İş Akışı & Görevlerim
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Size veya departmanınıza atanmış, aksiyon bekleyen aktif düzeltici önleyici faaliyetler.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                  {workflowDeptFilter === "me" ? "Üzerimdeki İşler" : workflowDeptFilter === "all" ? "Tüm İşler" : `${workflowDeptFilter} İşleri`}
                </span>
                <span className="text-xl font-display font-bold text-indigo-600 block mt-0.5">{filteredWorkflowDofs.length} Adet</span>
              </div>
            </div>

            {/* Departman Seçim Filtresi (Yalnızca Yönetici / Editör görebilir) */}
            {isAdminOrEditor && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 border border-slate-100/80 p-4 rounded-2xl mb-6 text-xs shadow-xs">
                <div className="space-y-1">
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Building className="h-4 w-4 text-indigo-600" />
                    Departman Filtreleme Paneli
                  </span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Yönetici/Editör yetkisiyle, aşağıdan seçeceğiniz departmana ait iş akışlarını listeleyebilirsiniz.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <span className="text-slate-600 font-bold whitespace-nowrap">Departman:</span>
                  <select
                    value={workflowDeptFilter}
                    onChange={(e) => setWorkflowDeptFilter(e.target.value)}
                    className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500 cursor-pointer shadow-xs transition duration-200"
                  >
                    <option value="me">Sadece Bana Atananlar (Şahsi)</option>
                    <option value="all">Tüm Departmanlar (Genel Akış)</option>
                    {departments.map((dept) => (
                      <option key={dept.id || dept.name} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {filteredWorkflowDofs.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-2xl p-10 text-center text-slate-400 bg-slate-50/20">
                <div className="p-3 bg-white border border-slate-100 rounded-full shadow-sm mb-3 inline-block">
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                </div>
                <h4 className="font-bold text-slate-700 text-xs">
                  {workflowDeptFilter === "me" ? "Tebrikler! Açık Göreviniz Bulunmuyor" : "Kayıtlı Görev Bulunmuyor"}
                </h4>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Döf Adı</th>
                        <th className="p-4">Süre</th>
                        <th className="p-4">Aciliyet</th>
                        <th className="p-4">Risk Skoru</th>
                        <th className="p-4">Sorumlu</th>
                        <th className="p-4">Son Tarih</th>
                        <th className="p-4">Durumu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredWorkflowDofs.map((dof) => {
                        const riskInfo = getDofScoreAndLevel(dof);
                        
                        let durationText = "-";
                        if (dof.status === "cozuldu" || dof.status === "reddedildi") {
                          durationText = dof.completionDays ? `${dof.completionDays} Gün` : "Belirtilmemiş";
                        } else {
                          const elapsedMs = Date.now() - (dof.createdAt?.seconds ? dof.createdAt.seconds * 1000 : new Date(dof.createdAt).getTime());
                          const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
                          durationText = `${elapsedDays} Gün (Açık)`;
                        }

                        return (
                          <tr
                            key={dof.id}
                            onClick={() => {
                              setAdminSubTab("workflow");
                            }}
                            className="hover:bg-indigo-50/20 transition cursor-pointer"
                          >
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <span className="font-mono text-[10px] font-bold text-indigo-600">{dof.refNo}</span>
                                <span className="font-semibold text-slate-900 line-clamp-1">{dof.title}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-600 font-semibold">{durationText}</td>
                            
                            {/* Aciliyet */}
                            <td className="p-4">
                              {riskInfo.level === "Yüksek" ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
                                  YÜKSEK
                                </span>
                              ) : riskInfo.level === "Orta" ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                  ORTA
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                  DÜŞÜK
                                </span>
                              )}
                            </td>

                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                riskInfo.level === "Yüksek" ? "bg-rose-100 text-rose-800" :
                                riskInfo.level === "Orta" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}>
                                {riskInfo.score} / {riskInfo.level}
                              </span>
                            </td>
                            <td className="p-4 text-slate-600 font-medium">{dof.assignedUserName || "Atanmamış"}</td>
                            <td className="p-4 text-slate-600 font-medium">
                              {dof.targetCompletionDate ? new Date(dof.targetCompletionDate).toLocaleDateString("tr-TR") : "-"}
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                                dof.status === "yeni" ? "bg-blue-100 text-blue-800" :
                                dof.status === "inceleniyor" ? "bg-amber-100 text-amber-800" :
                                dof.status === "cozuldu" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}>
                                {dof.status === "yeni" ? "Yeni" :
                                 dof.status === "inceleniyor" ? "İnceleme" :
                                 dof.status === "cozuldu" ? "Çözüldü" : "Reddedildi"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-Tab Selectors */}
        {adminSubTab !== "dashboard" && renderLayoutWrapper(
          "tabs",
          "DÖF Başvuru Listesi ve Yönetim Sekmeleri",
          <div className="w-full flex flex-col gap-6">
            
            {/* Custom Sub-Tabs Render Block */}
            {adminSubTab === "new_dof" && (
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md max-w-3xl mx-auto w-full">
                <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
                  Yeni DÖF Giriş Formu (Yönetim Paneli)
                </h2>
                <DofSubmitForm 
                  onGoToTrack={(ref) => {
                    setSearchTerm(ref);
                    setStatusFilter("all");
                    setAdminSubTab("dofs");
                  }} 
                  onShowQr={() => setAdminSubTab("departments")} 
                />
              </div>
            )}

            {adminSubTab === "departments" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
                    <div>
                      <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                          <Building className="h-5 w-5" />
                        </span>
                        Departman Tanımlama & Yönetim
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Sistemdeki departmanları tanımlayın, sorumlularını belirleyin ve özel QR kodları oluşturarak departmanlara özel bildirim toplama kanalları açın.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Save/Edit Department Form */}
                    <div className="lg:col-span-4">
                      <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                          {selectedDept ? "DEPARTMANI DÜZENLE" : "YENİ DEPARTMAN EKLE"}
                        </h3>

                        <form onSubmit={handleSaveDept} className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Departman Adı *</label>
                            <input
                              type="text"
                              required
                              value={deptFormName}
                              onChange={(e) => setDeptFormName(e.target.value)}
                              placeholder="Örn: Bilgi İşlem"
                              className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 bg-slate-100/80 px-2.5 py-1.5 rounded-lg block leading-relaxed border border-slate-200/50">
                              ℹ️ <strong>İlişkilendirme Bilgisi:</strong> Departman sorumlusu atamaları artık doğrudan <strong>Kullanıcılar</strong> sekmesinden yapılmaktadır. Bir kullanıcıya yetki tanımlarken departmanını seçmeniz yeterlidir.
                            </span>
                          </div>

                          <div className="pt-2">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={deptFormIsCustomQr}
                                onChange={(e) => setDeptFormIsCustomQr(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-700 block">
                                  Özel QR Kod Oluşturulsun
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  İşaretlendiğinde bu departman için ayrı özel bir QR Kod oluşturulur. İşaretsiz ise "Genel QR" kullanılır.
                                </span>
                              </div>
                            </label>
                          </div>

                          {/* Doğrudan Havale Çeki */}
                          <div className="pt-2 border-t border-slate-100/60">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={deptFormDirectReferral}
                                onChange={(e) => {
                                  setDeptFormDirectReferral(e.target.checked);
                                  if (!e.target.checked) {
                                    setDeptFormReferralUserId("");
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-700 block">
                                  Doğrudan Havale Aktif
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  Bu departmana açılan DÖF'leri otomatik olarak seçtiğiniz kişiye havale eder.
                                </span>
                              </div>
                            </label>
                          </div>

                          {deptFormDirectReferral && (
                            <div className="space-y-1 pl-6 pt-1">
                              <label className="text-xs font-semibold text-slate-600 block mb-1">Havale Edilecek Sorumlu Kişi *</label>
                              <select
                                required={deptFormDirectReferral}
                                value={deptFormReferralUserId}
                                onChange={(e) => setDeptFormReferralUserId(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs outline-none focus:border-indigo-500 font-medium cursor-pointer"
                              >
                                <option value="">-- Sorumlu Kişi Seçin --</option>
                                {panelUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.email})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {deptFormError && (
                            <div className="text-rose-600 text-xs font-semibold flex items-center gap-1.5 p-2 bg-rose-50 rounded-lg">
                              <XCircle className="h-4 w-4 shrink-0" />
                              <span>{deptFormError}</span>
                            </div>
                          )}

                          {deptFormSuccess && (
                            <div className="text-emerald-600 text-xs font-semibold flex items-center gap-1.5 p-2 bg-emerald-50 rounded-lg">
                              <CheckCircle className="h-4 w-4 shrink-0" />
                              <span>Başarıyla kaydedildi!</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              type="submit"
                              disabled={isDeptSaving}
                              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
                            >
                              {isDeptSaving ? "Kaydediliyor..." : selectedDept ? "Güncelle" : "Ekle"}
                            </button>
                            {selectedDept && (
                              <button
                                type="button"
                                onClick={handleResetDeptForm}
                                className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                              >
                                İptal
                              </button>
                            )}
                          </div>

                          {selectedDept && (
                            <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                              <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                                <Printer className="h-3.5 w-3.5" />
                                AFİŞ & POSTER YAZDIRMA
                              </h4>
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 block mb-1">Afiş Başlığı (Düzenlenebilir)</label>
                                <input
                                  type="text"
                                  value={posterTitle}
                                  onChange={(e) => setPosterTitle(e.target.value)}
                                  placeholder="Örn: BİLGİ İŞLEM DEPARTMANI"
                                  className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-1.5 px-3 transition text-xs font-medium"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActivePosterDept(selectedDept);
                                  setShowPosterModal(true);
                                }}
                                className="w-full py-2 bg-emerald-550 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Poster Oluştur & Yazdır
                              </button>
                            </div>
                          )}
                        </form>
                      </div>

                      {/* General QR Box Panel */}
                      <div className="mt-6 bg-indigo-50/40 rounded-2xl p-5 border border-indigo-100/60">
                        <div className="flex items-center gap-2 text-indigo-800 mb-2">
                          <QrCode className="h-4 w-4" />
                          <h4 className="text-xs font-bold uppercase tracking-wider">GENEL DÖF QR KODU</h4>
                        </div>
                        <p className="text-[10px] text-indigo-700 leading-normal mb-4">
                          Tüm genel departman tanımlamalarının QR kodudur. Herhangi bir özel ayrım barındırmayan genel bildirim formuna yönlendirir.
                        </p>
                        <div className="flex flex-col items-center gap-3 bg-white p-4 rounded-xl border border-indigo-100/50 shadow-sm">
                          <img
                            referrerPolicy="no-referrer"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + "?view=submit")}`}
                            alt="Genel QR Kodu"
                            className="w-32 h-32"
                          />
                          <div className="flex gap-2 w-full">
                            <a
                              href={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin + "?view=submit")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition"
                            >
                              <Download className="h-3 w-3" /> QR İndir
                            </a>
                            <button
                              type="button"
                              onClick={handleCopyPublic}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition border border-indigo-200 cursor-pointer"
                            >
                              {copiedPublic ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-600" /> Kopyalandı
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Adresi Kopyala
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Departments List with Custom QR Codes */}
                    <div className="lg:col-span-8">
                      {isDeptsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                          <span className="text-xs font-semibold">Departman listesi yükleniyor...</span>
                        </div>
                      ) : departments.length === 0 ? (
                        <div className="border border-dashed border-slate-200 rounded-2xl p-16 text-center text-slate-400 bg-slate-50/20">
                          <div className="p-3 bg-white border border-slate-100 rounded-full shadow-sm mb-3 inline-block">
                            <Building className="h-6 w-6 text-slate-300" />
                          </div>
                          <h4 className="font-bold text-slate-700 text-sm">Tanımlı Departman Bulunmuyor</h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                            Sistemde henüz kayıtlı bir departman bulunmuyor. Sol taraftaki formu kullanarak ilk departmanınızı oluşturun.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {departments.map((dept) => {
                            const qrUrl = dept.isCustomQr 
                              ? `${window.location.origin}?view=submit&dept=${encodeURIComponent(dept.name)}`
                              : `${window.location.origin}?view=submit`;

                            return (
                              <div 
                                key={dept.id} 
                                className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800">{dept.name}</h4>
                                      <div className="mt-1 space-y-0.5">
                                        {(() => {
                                          const matched = panelUsers.filter(
                                            (u) => u.department && u.department.toLowerCase().trim() === dept.name.toLowerCase().trim()
                                          );
                                          if (matched.length > 0) {
                                            return matched.map((u) => (
                                              <span key={u.id || u.email} className="text-[10px] text-indigo-600 font-medium block truncate max-w-[180px]" title={`${u.name} (${u.email})`}>
                                                👤 {u.name} ({u.email})
                                              </span>
                                            ));
                                          }
                                          return (
                                            <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                              👤 Sorumlu Belirtilmemiş
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      {dept.directReferral && dept.responsibleName && (
                                        <div className="mt-1.5 text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-100/60 rounded-lg px-2 py-0.5 inline-flex items-center gap-1">
                                          ⚡ Havale: {dept.responsibleName}
                                        </div>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                      {dept.isCustomQr ? (
                                        <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 font-extrabold text-[9px] uppercase tracking-wider">
                                          ÖZEL QR
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100 font-bold text-[9px] uppercase tracking-wider">
                                          GENEL QR
                                        </span>
                                      )}
                                      {dept.directReferral && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold text-[8px] uppercase tracking-wider block">
                                          OTO HAVALE
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-3">
                                    <img
                                      referrerPolicy="no-referrer"
                                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrUrl)}`}
                                      alt="QR Kodu"
                                      className="w-16 h-16 bg-white border border-slate-100 p-0.5 rounded-lg"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Hedef Adres</span>
                                      <p className="text-[10px] text-indigo-600 truncate font-mono mt-0.5 font-semibold">
                                        {qrUrl}
                                      </p>
                                      <div className="flex gap-2 mt-1.5">
                                        <a
                                          href={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 hover:underline"
                                        >
                                          <Download className="h-2.5 w-2.5" /> Resmi İndir
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => handleCopyDeptUrl(dept.id!, qrUrl)}
                                          className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
                                        >
                                          {copiedDeptId === dept.id ? (
                                            <>
                                              <Check className="h-2.5 w-2.5 text-emerald-600" /> Kopyalandı!
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="h-2.5 w-2.5" /> Adresi Kopyala
                                            </>
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActivePosterDept(dept);
                                            setPosterTitle(`${dept.name.toUpperCase()} DÖF BİLDİRİM FORMU`);
                                            setShowPosterModal(true);
                                          }}
                                          className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
                                        >
                                          <Printer className="h-2.5 w-2.5" /> Poster Hazırla & Yazdır
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-1.5 pt-4 mt-3 border-t border-slate-50">
                                  <button
                                    onClick={() => {
                                      setActivePosterDept(dept);
                                      setPosterTitle(`${dept.name.toUpperCase()} DÖF BİLDİRİM FORMU`);
                                      setShowPosterModal(true);
                                    }}
                                    className="p-1.5 hover:bg-emerald-50 hover:text-emerald-600 text-slate-400 rounded-lg transition cursor-pointer"
                                    title="QR Poster ve Yazdır"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleEditDept(dept)}
                                    className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-lg transition cursor-pointer"
                                    title="Düzenle"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDept(dept.id!)}
                                    className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition cursor-pointer"
                                    title="Sil"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {adminSubTab === "workflow" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
                    <div>
                      <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                          <SlidersHorizontal className="h-5 w-5" />
                        </span>
                        Şahsi İş Akışım / Atanan Görevler
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Sistem tarafından otomatik departman sorumluluğu eşleşmesiyle veya el ile doğrudan sizin üzerinize atanmış aktif DÖF işlerinin listesi.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                        {workflowDeptFilter === "me" ? "Üzerimdeki İşler" : workflowDeptFilter === "all" ? "Tüm İşler" : `${workflowDeptFilter} İşleri`}
                      </span>
                      <span className="text-2xl font-display font-bold text-indigo-600 block mt-0.5">{filteredWorkflowDofs.length} Adet</span>
                    </div>
                  </div>

                  {/* Departman Seçim Filtresi (Yalnızca Yönetici / Editör görebilir) */}
                  {isAdminOrEditor && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 border border-slate-100/80 p-4 rounded-2xl mb-6 text-xs shadow-xs">
                      <div className="space-y-1">
                        <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-indigo-600" />
                          Departman Filtreleme Paneli
                        </span>
                        <p className="text-slate-500 text-[11px] leading-relaxed">
                          Yönetici/Editör yetkisiyle, aşağıdan seçeceğiniz departmana ait iş akışlarını ve DÖF görevlerini anlık listeleyebilirsiniz.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <span className="text-slate-600 font-bold whitespace-nowrap">Departman:</span>
                        <select
                          value={workflowDeptFilter}
                          onChange={(e) => setWorkflowDeptFilter(e.target.value)}
                          className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500 cursor-pointer shadow-xs transition duration-200"
                        >
                          <option value="me">Sadece Bana Atananlar (Şahsi)</option>
                          <option value="all">Tüm Departmanlar (Genel Akış)</option>
                          {departments.map((dept) => (
                            <option key={dept.id || dept.name} value={dept.name}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {filteredWorkflowDofs.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-16 text-center text-slate-400 bg-slate-50/20">
                      <div className="p-3.5 bg-white border border-slate-100 rounded-full shadow-sm mb-3 inline-block">
                        <CheckCircle className="h-8 w-8 text-emerald-500 animate-bounce" />
                      </div>
                      <h4 className="font-bold text-slate-700 text-sm">
                        {workflowDeptFilter === "me" ? "Tebrikler! Açık Göreviniz Bulunmuyor" : 
                         workflowDeptFilter === "all" ? "Kayıtlı Görev Bulunmuyor" : 
                         `${workflowDeptFilter} Departmanına Ait Görev Bulunmuyor`}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                        {workflowDeptFilter === "me" ? "Şu anda doğrudan sizin üzerinize atanmış veya sorumlu olduğunuz departmana ait aktif bir düzeltici önleyici faaliyet bulunmamaktadır." :
                         workflowDeptFilter === "all" ? "Sistem genelinde işlem gören veya bekleyen aktif düzeltici önleyici faaliyet bulunmamaktadır." :
                         `Şu anda ${workflowDeptFilter} departmanı için atanmış veya işlemde olan aktif bir düzeltici önleyici faaliyet bulunmamaktadır.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-slate-500">
                        {workflowDeptFilter === "me" ? "Aşağıdaki işler tamamlanmak üzere sizin aksiyon almanızı bekliyor. İncelemek ve güncellemek için tıklayın:" :
                         workflowDeptFilter === "all" ? "Tüm departmanlara ait aktif iş akışı ve DÖF takipleri listeleniyor. Detay için tıklayın:" :
                         `Aşağıdaki işler ${workflowDeptFilter} departmanı bünyesinde işlem görmektedir. İncelemek ve güncellemek için tıklayın:`}
                      </p>
                      <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white shadow-sm">
                        <table className="w-full text-left border-collapse text-xs font-sans">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                              <th className="p-4">Döf Adı</th>
                              <th className="p-4">Süre</th>
                              <th className="p-4">Aciliyet</th>
                              <th className="p-4">Risk Skoru</th>
                              <th className="p-4">Sorumlu</th>
                              <th className="p-4">İlişkili Departman</th>
                              <th className="p-4">Son Tamamlanma Tarihi</th>
                              <th className="p-4">DÖF Oluşturma Tarihi</th>
                              <th className="p-4">Durumu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredWorkflowDofs.map((dof) => {
                              const riskInfo = getDofScoreAndLevel(dof);
                              
                              // Calculate Duration
                              let durationText = "-";
                              if (dof.status === "cozuldu" || dof.status === "reddedildi") {
                                durationText = dof.completionDays ? `${dof.completionDays} Gün` : "Belirtilmemiş";
                              } else {
                                const elapsedMs = Date.now() - (dof.createdAt?.seconds ? dof.createdAt.seconds * 1000 : new Date(dof.createdAt).getTime());
                                const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
                                durationText = `${elapsedDays} Gün (Açık)`;
                              }

                              return (
                                <tr
                                  key={dof.id}
                                  onClick={() => {
                                    handleSelectDof(dof);
                                  }}
                                  className={`hover:bg-indigo-50/20 transition cursor-pointer ${
                                    selectedDof?.id === dof.id ? "bg-indigo-50/40 font-medium" : ""
                                  }`}
                                >
                                  {/* Döf Adı */}
                                  <td className="p-4">
                                    <div className="flex flex-col gap-1">
                                      <span className="font-mono text-[10px] font-bold text-indigo-600">{dof.refNo}</span>
                                      <span className="font-semibold text-slate-900 line-clamp-1">{dof.title}</span>
                                    </div>
                                  </td>
                                  
                                  {/* Süre */}
                                  <td className="p-4 text-slate-600 font-semibold">{durationText}</td>

                                  {/* Aciliyet */}
                                  <td className="p-4">
                                    {riskInfo.level === "Yüksek" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
                                        YÜKSEK
                                      </span>
                                    ) : riskInfo.level === "Orta" ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                        ORTA
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                        DÜŞÜK
                                      </span>
                                    )}
                                  </td>
                                  
                                  {/* Risk Skoru */}
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                      riskInfo.level === "Yüksek" ? "bg-rose-100 text-rose-800" :
                                      riskInfo.level === "Orta" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                    }`}>
                                      {riskInfo.score} / {riskInfo.level}
                                    </span>
                                  </td>
                                  
                                  {/* Sorumlu */}
                                  <td className="p-4 text-slate-600 font-medium">{dof.assignedUserName || "Atanmamış"}</td>
                                  
                                  {/* İlişkili Departman */}
                                  <td className="p-4 text-slate-600 font-medium">{dof.department}</td>
                                  
                                  {/* Son Tamamlanma Tarihi */}
                                  <td className="p-4 text-slate-600 font-medium">
                                    {dof.targetCompletionDate ? new Date(dof.targetCompletionDate).toLocaleDateString("tr-TR") : "-"}
                                  </td>
                                  
                                  {/* DÖF Oluşturma Tarihi */}
                                  <td className="p-4 text-slate-500">{formatDate(dof.createdAt)}</td>
                                  
                                  {/* Durumu */}
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                                      dof.status === "yeni" ? "bg-blue-100 text-blue-800" :
                                      dof.status === "inceleniyor" ? "bg-amber-100 text-amber-800" :
                                      dof.status === "cozuldu" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                    }`}>
                                      {dof.status === "yeni" ? "Yeni Başvuru" :
                                       dof.status === "inceleniyor" ? "İncelemede" :
                                       dof.status === "cozuldu" ? "Çözüldü" : "Reddedildi"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {adminSubTab === "reports" && (() => {
              const reportsDofs = visibleDofs;

              const visibleDepartments = isSystemAdmin
                ? departments
                : departments.filter(dept => 
                    dept.name.toLowerCase().trim() === (activePanelUser?.department || "").toLowerCase().trim()
                  );

              const rTotalCount = reportsDofs.length;
              const rResolvedCount = reportsDofs.filter(d => d.status === "cozuldu").length;
              const rReviewCount = reportsDofs.filter(d => d.status === "inceleniyor").length;

              return (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
                      <div>
                        <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                            <Sparkles className="h-5 w-5" />
                          </span>
                          {isSystemAdmin ? "DÖF Performans & Dağılım Raporları" : `Birim DÖF Performans Raporu (${activePanelUser?.department || "Biriminiz"})`}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {isSystemAdmin 
                            ? "Departman bazlı dağılımlar, bildirim türleri ve çözüm performansı odaklı analitik veriler."
                            : `Sadece ${activePanelUser?.department || "biriminize"} ait DÖF performans metrikleri ve analitik veriler.`}
                        </p>
                      </div>
                    </div>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                      <div className="p-5 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">ÇÖZÜLME ORANI</span>
                        <span className="text-3xl font-display font-bold text-slate-800 block mt-1.5">
                          %{rTotalCount > 0 ? Math.round((rResolvedCount / rTotalCount) * 100) : 0}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">Toplam çözülmüş faaliyetlerin tüm kayıtlara oranı.</p>
                      </div>

                      <div className="p-5 bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">AKTİF HIZLI AKSİYON</span>
                        <span className="text-3xl font-display font-bold text-slate-800 block mt-1.5">
                          {rReviewCount} Adet
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">İnceleme aşamasında olan aktif düzeltici süreçler.</p>
                      </div>

                      <div className="p-5 bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block">KORUYUCU ÖNLEYİCİ PAYI</span>
                        <span className="text-3xl font-display font-bold text-slate-800 block mt-1.5">
                          %{rTotalCount > 0 ? Math.round((reportsDofs.filter(d => d.type === "önleyici").length / rTotalCount) * 100) : 0}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">Önleyici faaliyetlerin genel dağılımdaki yüzdesi.</p>
                      </div>
                    </div>

                    {/* Advanced Analytics Charts Block */}
                    <div className="mb-8 border-t border-b border-slate-100/50 py-8">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-5">DÖF GELİŞMİŞ ANALİTİK VE PERFORMANS GRAFİKLERİ</h3>
                      <DofReportCharts dofs={reportsDofs} />
                    </div>

                    {/* Department distribution table */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        {isSystemAdmin ? "DEPARTMAN BAZINDA BİLDİRİM DAĞILIMI" : "BİRİMİNİZ BİLDİRİM DAĞILIMI"}
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                        <table className="w-full text-left border-collapse text-xs font-sans">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                              <th className="p-4">Departman Adı</th>
                              <th className="p-4 text-center">Toplam Bildirim</th>
                              <th className="p-4 text-center">Yeni</th>
                              <th className="p-4 text-center">İşlemde</th>
                              <th className="p-4 text-center">Çözüldü</th>
                              <th className="p-4 text-center">Red</th>
                              <th className="p-4 text-center">Aksiyon Durumu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {visibleDepartments.map((dept) => {
                              const deptDofs = reportsDofs.filter(d => d.department?.toLowerCase().trim() === dept.name.toLowerCase().trim());
                              const tCount = deptDofs.length;
                              const yCount = deptDofs.filter(d => d.status === "yeni").length;
                              const iCount = deptDofs.filter(d => d.status === "inceleniyor").length;
                              const cCount = deptDofs.filter(d => d.status === "cozuldu").length;
                              const rCount = deptDofs.filter(d => d.status === "reddedildi").length;

                              return (
                                <tr key={dept.id} className="hover:bg-slate-50/50 transition">
                                  <td className="p-4 font-semibold text-slate-800">{dept.name}</td>
                                  <td className="p-4 text-center font-bold font-mono text-slate-700">{tCount}</td>
                                  <td className="p-4 text-center font-mono text-blue-600">{yCount}</td>
                                  <td className="p-4 text-center font-mono text-amber-600">{iCount}</td>
                                  <td className="p-4 text-center font-mono text-emerald-600">{cCount}</td>
                                  <td className="p-4 text-center font-mono text-rose-600">{rCount}</td>
                                  <td className="p-4 text-center">
                                    {tCount === 0 ? (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 font-bold text-[9px]">PASİF</span>
                                    ) : yCount + iCount > 0 ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[9px] border border-amber-100 animate-pulse">AKTİF SÜREÇ</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-100">ONAYLI TAMAM</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {adminSubTab === "logs" && (
              <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md space-y-6 animate-fade-in" id="email-notifications-section">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                        <Mail className="h-5 w-5" />
                      </span>
                      Otomatik E-posta Bildirim Geçmişi (Firebase Cloud Functions)
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                      Yeni bir DÖF kaydı oluşturulduğunda veya durumu güncellendiğinde ilgili birime ve bildirim sahibine otomatik olarak iletilen e-posta bildirimlerinin detaylı takip günlüğü.
                    </p>
                  </div>

                  <button
                    onClick={fetchLogs}
                    disabled={isEmailLogsLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 text-indigo-700 font-semibold rounded-xl text-xs border border-indigo-100 transition cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isEmailLogsLoading ? "animate-spin" : ""}`} />
                    Günlüğü Yenile
                  </button>
                </div>

                {isEmailLogsLoading && emailLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                    <span className="text-xs font-semibold">Bildirim kayıtları yükleniyor...</span>
                  </div>
                ) : emailLogs.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-16 text-center text-slate-400">
                    <div className="p-3.5 bg-white border border-slate-100 rounded-full shadow-sm mb-4 inline-block">
                      <Mail className="h-8 w-8 text-slate-300 animate-pulse" />
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm">Gönderilmiş E-posta Bulunmuyor</h3>
                    <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      Sistemde henüz otomatik tetiklenen bir e-posta bildirimi kaydı yok. Yeni bir DÖF kaydı oluşturarak veya mevcut bir kaydın durumunu güncelleyerek anlık e-posta akışını başlatabilirsiniz!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left border-collapse text-xs font-sans">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="p-4">DÖF Ref No</th>
                            <th className="p-4">Bildirim Türü</th>
                            <th className="p-4">Alıcı E-posta</th>
                            <th className="p-4">Konu Başlığı</th>
                            <th className="p-4">Gönderim Tarihi</th>
                            <th className="p-4">Durum</th>
                            <th className="p-4 text-center">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {emailLogs.map((log) => {
                            const isExpanded = expandedLogId === log.id;
                            const formatLogDate = (sentAt: any) => {
                              if (!sentAt) return "-";
                              let date: Date;
                              if (sentAt.toDate) {
                                date = sentAt.toDate();
                              } else if (sentAt.seconds) {
                                date = new Date(sentAt.seconds * 1000);
                              } else {
                                date = new Date(sentAt);
                              }
                              return date.toLocaleString("tr-TR");
                            };

                            return (
                              <React.Fragment key={log.id}>
                                <tr className="hover:bg-slate-50/50 transition">
                                  <td className="p-4 font-mono font-bold text-slate-900">{log.dofRefNo}</td>
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${
                                      log.type === "new_dof" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-purple-50 text-purple-700 border-purple-100"
                                    }`}>
                                      {log.type === "new_dof" ? "Yeni Kayıt" : "Durum Güncelleme"}
                                    </span>
                                  </td>
                                  <td className="p-4 font-mono text-slate-600">{log.to}</td>
                                  <td className="p-4 font-medium text-slate-800">{log.subject}</td>
                                  <td className="p-4 text-slate-400 font-mono">{formatLogDate(log.sentAt)}</td>
                                  <td className="p-4">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] uppercase">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      GÖNDERİLDİ
                                    </span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <button
                                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition text-xs font-semibold cursor-pointer"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      {isExpanded ? "Kapat" : "Önizle"}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={7} className="p-4 bg-slate-50 border-t border-b border-slate-100">
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                            📧 Gönderilen HTML E-posta Canlı Önizlemesi
                                          </span>
                                          <span className="text-xs font-mono text-slate-400">Kayıt ID: {log.id}</span>
                                        </div>
                                        <div 
                                          className="bg-white border border-slate-100 rounded-xl p-6 shadow-inner max-h-[500px] overflow-auto"
                                          dangerouslySetInnerHTML={{ __html: log.html }}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {adminSubTab === "remote" && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
                    <div>
                      <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                          <QrCode className="h-5 w-5" />
                        </span>
                        Uzak Bağlantı & Kolay Erişim Paneli
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Sisteme cep telefonu, tablet, el terminali ya da diğer ağ cihazlarından hızlıca bağlanmak için aşağıdaki QR kodlarını ve bağlantı linklerini kullanabilirsiniz.
                      </p>
                    </div>
                  </div>

                  {/* Manual URL customization block */}
                  <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 space-y-4 mb-6">
                    <div>
                      <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                        ⚙️ BAĞLANTI AYARI & HOST TANIMLAMA
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-1 mb-3">
                        Eğer sistemi ngrok, yerel ağ IP'si veya özel bir sunucu adresi (domain) üzerinden yayınlıyorsanız, QR kodlarının o adrese yönlenmesi için aşağıdaki Host adresini güncelleyebilirsiniz:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customHostUrl}
                          onChange={(e) => setCustomHostUrl(e.target.value)}
                          placeholder="Örn: https://sirket-dof.com"
                          className="flex-1 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-semibold font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setCustomHostUrl(window.location.origin)}
                          className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          Sıfırla
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Grid for connection options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Option 1: Submission Form View (Public) */}
                    <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-300 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2.5">
                          <span className="p-2 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs font-sans">A</span>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">Çalışan Bildirim Formu (Sadece Giriş)</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Sadece yeni DÖF girişi yapmak isteyen personeller için tasarlanmıştır. Şifre gerektirmez.</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                          <img
                            referrerPolicy="no-referrer"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(customHostUrl + "?view=submit")}`}
                            alt="Personel Form QR"
                            className="w-40 h-40 bg-white p-2 rounded-lg border border-slate-100 shadow-xs animate-none"
                          />
                          <a
                            href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customHostUrl + "?view=submit")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition"
                          >
                            <Download className="h-3 w-3" /> QR Kodunu Büyük İndir
                          </a>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bağlantı Adresi (URL)</label>
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-xs select-all text-slate-600 break-all pr-12 relative">
                            <span className="truncate">{customHostUrl}?view=submit</span>
                            <button
                              type="button"
                              onClick={handleCopyPublic}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition cursor-pointer"
                              title="Adresi Kopyala"
                            >
                              {copiedPublic ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
                        <a
                          href={`${customHostUrl}?view=submit`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                        >
                          <Eye className="h-3.5 w-3.5" /> Yeni Sekmede Test Et
                        </a>
                      </div>
                    </div>

                    {/* Option 2: Full Management Console Link */}
                    <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-300 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2.5">
                          <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs font-sans">B</span>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800">Yönetim Paneli & Tam Erişim</h3>
                            <p className="text-[10px] text-slate-400 mt-0.5">Sistem yöneticileri ve departman sorumlularının paneli kontrol etmesi içindir. Şifre/Google ile giriş gerektirir.</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                          <img
                            referrerPolicy="no-referrer"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(customHostUrl)}`}
                            alt="Yönetim Panel QR"
                            className="w-40 h-40 bg-white p-2 rounded-lg border border-slate-100 shadow-xs animate-none"
                          />
                          <a
                            href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(customHostUrl)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition"
                          >
                            <Download className="h-3 w-3" /> QR Kodunu Büyük İndir
                          </a>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bağlantı Adresi (URL)</label>
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-xs select-all text-slate-600 break-all pr-12 relative">
                            <span className="truncate">{customHostUrl}</span>
                            <button
                              type="button"
                              onClick={handleCopyAdmin}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition cursor-pointer"
                              title="Adresi Kopyala"
                            >
                              {copiedAdmin ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
                        <a
                          href={customHostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition"
                        >
                          <Eye className="h-3.5 w-3.5" /> Yeni Sekmede Test Et
                        </a>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

        {adminSubTab === "dofs" && (
          <div className="grid grid-cols-1 gap-6">
            
            {/* Full Width Side: List with filters */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3.5 transition-all duration-300">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="w-full flex items-center justify-between text-left text-sm font-bold text-slate-900 hover:text-indigo-600 transition cursor-pointer outline-none focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-indigo-500" />
                    <span>Gelişmiş Filtreler & Arama</span>
                    {(searchTerm || statusFilter !== "all" || typeFilter !== "all" || deptFilter !== "all" || referralFilter !== "all" || dateRangePreset !== "all" || dateStart || dateEnd) && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-extrabold uppercase border border-indigo-100 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        Aktif
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isFiltersExpanded ? "rotate-180" : ""}`} />
                </button>

                {isFiltersExpanded && (
                  <div className="space-y-3.5 pt-3.5 border-t border-slate-50 animate-fade-in">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ref No, başlık veya isim ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 pl-9 pr-4 transition text-xs font-medium"
                      />
                    </div>

                    {/* Grid of Select Dropdowns */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Durum / Aşama</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="all">Tümü</option>
                          <option value="acik">🟢 Açık (Yeni & İnceleme)</option>
                          <option value="kapali">🔴 Kapalı (Çözüldü & Red)</option>
                          <option value="bekleyen">Bekleyenler</option>
                          <option value="yeni">Yeni Başvuru</option>
                          <option value="inceleniyor">İnceleniyor</option>
                          <option value="cozuldu">Çözüldü</option>
                          <option value="reddedildi">Reddedildi</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Tür</label>
                        <select
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="all">Tümü</option>
                          <option value="düzeltici">Düzeltici</option>
                          <option value="önleyici">Önleyici</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Bölüm / Departman</label>
                        <select
                          value={deptFilter}
                          onChange={(e) => setDeptFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="all">Tümü</option>
                          {uniqueDepartments.map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Havale / Havuz</label>
                        <select
                          value={referralFilter}
                          onChange={(e) => setReferralFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="all">Tümü</option>
                          <option value="havuz">Havuzda (Yönlendirilmemiş)</option>
                          <option value="bana">Bana Havale Edilenler</option>
                          <option value="islem_devam_ediyor">İşlem Devam Edenler</option>
                          <option value="yapildi">Yapılanlar / Tamamlananlar</option>
                        </select>
                      </div>
                    </div>

                    {/* Advanced Date Filter Section */}
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Oluşturulma Tarihi</label>
                        <select
                          value={dateRangePreset}
                          onChange={(e) => {
                            setDateRangePreset(e.target.value);
                            if (e.target.value !== "custom") {
                              setDateStart("");
                              setDateEnd("");
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="all">Tüm Tarihler</option>
                          <option value="today">Bugün</option>
                          <option value="last_7_days">Son 7 Gün</option>
                          <option value="last_30_days">Son 30 Gün</option>
                          <option value="custom">📅 Özel Tarih Aralığı...</option>
                        </select>
                      </div>

                      {dateRangePreset === "custom" && (
                        <div className="grid grid-cols-2 gap-2 animate-fade-in">
                          <div>
                            <label className="text-[9px] font-semibold text-slate-400 block mb-1">Başlangıç Tarihi</label>
                            <input
                              type="date"
                              value={dateStart}
                              onChange={(e) => setDateStart(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-semibold text-slate-400 block mb-1">Bitiş Tarihi</label>
                            <input
                              type="date"
                              value={dateEnd}
                              onChange={(e) => setDateEnd(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs outline-none focus:border-indigo-500 font-medium"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Clear Filters Button */}
                    {(searchTerm || statusFilter !== "all" || typeFilter !== "all" || deptFilter !== "all" || referralFilter !== "all" || dateRangePreset !== "all" || dateStart || dateEnd) && (
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setTypeFilter("all");
                          setDeptFilter("all");
                          setReferralFilter("all");
                          setDateRangePreset("all");
                          setDateStart("");
                          setDateEnd("");
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                )}
              </div>

          {/* List Card */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">
                {isSystemAdmin ? "Tüm DÖF Başvuruları" : `${activePanelUser?.department || "Birim"} DÖF Başvuruları`} ({filteredDofs.length})
              </span>
              <button 
                onClick={fetchAllDofs}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
                title="Listeyi Yenile"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
                <p className="text-slate-400 text-xs">Yükleniyor...</p>
              </div>
            ) : filteredDofs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Filtrelere uygun DÖF kaydı bulunamadı.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-4">Döf Adı</th>
                      <th className="p-4">Süre</th>
                      <th className="p-4">Aciliyet</th>
                      <th className="p-4">Risk Skoru</th>
                      <th className="p-4">Sorumlu</th>
                      <th className="p-4">İlişkili Departman</th>
                      <th className="p-4">Son Tamamlanma Tarihi</th>
                      <th className="p-4">DÖF Oluşturma Tarihi</th>
                      <th className="p-4">Durumu</th>
                      <th className="p-4 text-center">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDofs.map((dof) => {
                      const riskInfo = getDofScoreAndLevel(dof);
                      
                      // Calculate Duration
                      let durationText = "-";
                      if (dof.status === "cozuldu" || dof.status === "reddedildi") {
                        durationText = dof.completionDays ? `${dof.completionDays} Gün` : "Belirtilmemiş";
                      } else {
                        const elapsedMs = Date.now() - (dof.createdAt?.seconds ? dof.createdAt.seconds * 1000 : new Date(dof.createdAt).getTime());
                        const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
                        durationText = `${elapsedDays} Gün (Açık)`;
                      }

                      return (
                        <tr
                          key={dof.id}
                          onClick={() => handleSelectDof(dof)}
                          className={`hover:bg-indigo-50/20 transition cursor-pointer ${
                            selectedDof?.id === dof.id ? "bg-indigo-50/40 font-medium" : ""
                          }`}
                        >
                          {/* Döf Adı */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-[10px] font-bold text-indigo-600">{dof.refNo}</span>
                              <span className="font-semibold text-slate-900 line-clamp-1">{dof.title}</span>
                            </div>
                          </td>
                          
                          {/* Süre */}
                          <td className="p-4 text-slate-600 font-semibold">{durationText}</td>

                          {/* Aciliyet */}
                          <td className="p-4">
                            {riskInfo.level === "Yüksek" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
                                YÜKSEK
                              </span>
                            ) : riskInfo.level === "Orta" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                ORTA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 text-white font-black text-[10px] uppercase tracking-wide shadow-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                                DÜŞÜK
                              </span>
                            )}
                          </td>
                          
                          {/* Risk Skoru */}
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              riskInfo.level === "Yüksek" ? "bg-rose-100 text-rose-800" :
                              riskInfo.level === "Orta" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {riskInfo.score} / {riskInfo.level}
                            </span>
                          </td>
                          
                          {/* Sorumlu */}
                          <td className="p-4 text-slate-600 font-medium">{dof.assignedUserName || "Atanmamış"}</td>
                          
                          {/* İlişkili Departman */}
                          <td className="p-4 text-slate-600 font-medium">{dof.department}</td>
                          
                          {/* Son Tamamlanma Tarihi */}
                          <td className="p-4 text-slate-600 font-medium">
                            {dof.targetCompletionDate ? new Date(dof.targetCompletionDate).toLocaleDateString("tr-TR") : "-"}
                          </td>
                          
                          {/* DÖF Oluşturma Tarihi */}
                          <td className="p-4 text-slate-500">{formatDate(dof.createdAt)}</td>
                          
                          {/* Durumu */}
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                              dof.status === "yeni" ? "bg-blue-100 text-blue-800" :
                              dof.status === "inceleniyor" ? "bg-amber-100 text-amber-800" :
                              dof.status === "cozuldu" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {dof.status === "yeni" ? "Yeni Başvuru" :
                               dof.status === "inceleniyor" ? "İncelemede" :
                               dof.status === "cozuldu" ? "Çözüldü" : "Reddedildi"}
                            </span>
                          </td>

                          {/* Mobil QR / İşlem */}
                          <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSingleQrModalDof(dof)}
                                className="p-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 rounded-lg transition cursor-pointer"
                                title="Mobil QR Kodunu Görüntüle"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={`?view=edit&refNo=${encodeURIComponent(dof.refNo)}`}
                                className="p-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-lg transition cursor-pointer"
                                title="Mobil Düzenleme Formunu Aç"
                              >
                                <Smartphone className="h-3.5 w-3.5" />
                              </a>
                              {isSystemAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDof(dof);
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 text-rose-600 rounded-lg transition cursor-pointer"
                                  title="DÖF Kaydını Sil (Yönetici Yetkisi)"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Side Drawer details view */}
        <AnimatePresence>
          {selectedDof && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => handleSelectDof(null)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100]"
              />

              {/* Side Drawer Panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-2xl z-[101] flex flex-col h-full overflow-hidden border-l border-slate-150"
              >
                {/* Drawer Header */}
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-5 flex items-center justify-between sticky top-0 z-20 shadow-xs shrink-0">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">İnceleme Ekranı</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <h2 className="text-xl font-mono font-bold text-slate-900 tracking-tight">{selectedDof.refNo}</h2>
                      <button
                        type="button"
                        onClick={() => handleCopyRefNo(selectedDof.refNo)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border shadow-2xs ${
                          copiedRefNo === selectedDof.refNo
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300"
                        }`}
                        title="DÖF Takip Kodunu Kopyala"
                        id="copy-selected-dof-code-btn"
                      >
                        {copiedRefNo === selectedDof.refNo ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600 animate-in fade-in zoom-in-75 duration-200" />
                            <span className="text-emerald-700 font-bold text-[11px]">Kopyalandı!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-600 text-[11px] font-medium">Kodu Kopyala</span>
                          </>
                        )}
                      </button>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        selectedDof.type === "düzeltici" ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-teal-50 text-teal-700 border border-teal-100"
                      }`}>
                        {selectedDof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSingleQrModalDof(selectedDof)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 font-bold rounded-xl text-xs transition cursor-pointer border border-amber-200/70"
                      title="Mobil QR Kodunu Görüntüle ve Paylaş"
                    >
                      <QrCode className="h-4 w-4 text-amber-600" /> Mobil QR & Düzenle
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(selectedDof)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-bold rounded-xl text-xs transition cursor-pointer border border-indigo-200/50 mr-2"
                      title="Şık PDF Raporu İndir"
                    >
                      <Download className="h-4 w-4" /> Raporu İndir
                    </button>
                    {isSystemAdmin && (
                      <button
                        onClick={() => handleDeleteDof(selectedDof)}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                        title="DÖF Kaydını Sil (Yönetici Yetkisi)"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleSelectDof(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                      title="Kapat"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Drawer Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {renderDofDetailFull(selectedDof)}
                </div>
              </motion.div>
      </>
    )}
  </AnimatePresence>

      </div>
        )}

        {adminSubTab === "users" && (
    activePanelUser?.role !== "admin" ? (
      <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center max-w-md mx-auto my-12 shadow-md space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center border border-rose-100">
          <Lock className="h-6 w-6 animate-pulse" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Yetkisiz Erişim</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Yönetici & Kullanıcı Yönetimi sekmesine erişim yetkiniz bulunmamaktadır. Bu alana sadece <strong>Yönetici (tam yetki)</strong> rolündeki kullanıcılar erişebilir.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6" id="user-management-section">
      {/* Form Column */}
      {isUserFormOpen && (
        <div className="md:col-span-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-md space-y-4 animate-fade-in relative">
            <button
              onClick={handleResetUserForm}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              title="Formu Kapat"
            >
              <X className="h-4 w-4" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-950 tracking-tight flex items-center gap-2 pr-6">
                <UserPlus className="h-5 w-5 text-indigo-600" />
                {selectedUser ? "Yetkili Düzenle" : "Yeni Yetkili Tanımla"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Yönetim panelini kullanabilecek kişilere e-posta tabanlı erişim izni verin.
              </p>
            </div>

            {userFormError && (
              <div className="text-xs font-semibold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-100 p-3 rounded-xl">
                <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce" />
                {userFormError}
              </div>
            )}

            {userFormSuccess && (
              <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 p-3 rounded-lg animate-pulse">
                <CheckCircle className="h-4 w-4 shrink-0" />
                İşlem başarıyla kaydedildi.
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  value={userFormName}
                  onChange={(e) => setUserFormName(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">E-posta Adresi</label>
                <input
                  type="email"
                  required
                  value={userFormEmail}
                  onChange={(e) => setUserFormEmail(e.target.value)}
                  placeholder="Örn: ahmet.yilmaz@sirket.com"
                  className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">Erişim Rolü</label>
                <select
                  value={userFormRole}
                  onChange={(e) => setUserFormRole(e.target.value as PanelUserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="admin">Yönetici (Tam Yetki)</option>
                  <option value="editor">Editör (Güncelleme & AI Analizi)</option>
                  <option value="viewer">Sadece İzleyici (Rapor & Takip)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">Birim / Bölüm</label>
                <select
                  value={userFormDepartment}
                  onChange={(e) => setUserFormDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="">-- Bölüm / Departman Seçin --</option>
                  {departments.map((dept) => (
                    <option key={dept.id || dept.name} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1">Giriş Şifresi (Parola)</label>
                <input
                  type="text"
                  value={userFormPassword}
                  onChange={(e) => setUserFormPassword(e.target.value)}
                  placeholder="Örn: yetkili123 (Boş kalırsa sadece Google Girişi)"
                  className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                />
              </div>

              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60 shadow-xs">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userFormCanSeeAllDofs}
                    onChange={(e) => setUserFormCanSeeAllDofs(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-0.5"
                    id="user-form-can-see-all-dofs"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Tüm DÖF'ler Çeki (Yetki)</span>
                    <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                      İşaretlenirse, 'Sadece İzleyici' rolünde olsa dahi Tüm DÖF'ler listesini görebilir ve takip edebilir.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                {selectedUser && (
                  <button
                    type="button"
                    onClick={handleResetUserForm}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition cursor-pointer text-xs border border-slate-200"
                  >
                    Vazgeç
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isUserSaving}
                  className="flex-grow inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-xl transition cursor-pointer text-xs shadow-md shadow-indigo-100"
                  id="save-user-btn"
                >
                  <Shield className="h-3.5 w-3.5" />
                  {isUserSaving ? "Kaydediliyor..." : selectedUser ? "Güncelle" : "Ekle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List Column */}
      <div className={isUserFormOpen ? "md:col-span-8" : "md:col-span-12"}>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-md space-y-4 h-full flex flex-col justify-between animate-fade-in">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950 tracking-tight flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                  Yetkili Personel Listesi
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Bu listeye eklenen kullanıcılar sisteme kurumsal Google Hesapları ile veya burada atanan şifreleri ile doğrudan giriş yapabilirler.
                </p>
              </div>
              <button
                onClick={() => {
                  if (isUserFormOpen && !selectedUser) {
                    setIsUserFormOpen(false);
                  } else {
                    handleResetUserForm();
                    setIsUserFormOpen(true);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md shadow-indigo-100 shrink-0"
              >
                <Plus className="h-4 w-4" />
                Yeni Yetki Tanımla
              </button>
            </div>

            {/* Pending Password Requests Panel */}
            {passwordRequests.filter(r => r.status === "bekliyor").length > 0 && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-2.5 animate-pulse-slow">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Aktif Şifre Kurtarma Talepleri ({passwordRequests.filter(r => r.status === "bekliyor").length})
                  </h4>
                  <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">Müdahale Bekliyor</span>
                </div>
                <div className="divide-y divide-amber-100/50 border border-amber-100 rounded-lg bg-white overflow-hidden shadow-xs">
                  {passwordRequests
                    .filter(r => r.status === "bekliyor")
                    .map((req) => (
                      <div key={req.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-900 block font-mono">{req.email}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Talep Tarihi: {formatDate(req.requestedAt)}</span>
                        </div>
                        <button
                          onClick={() => handleOpenSendPassword(req.email)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-sm"
                        >
                          <Key className="h-3 w-3" /> Şifre Gönder
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {isUsersLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                <span className="text-xs">Yetkili kullanıcılar yükleniyor...</span>
              </div>
            ) : panelUsers.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center text-slate-400">
                <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="text-xs font-semibold text-slate-700">Hiç Tanımlı Yetkili Yok</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                  Herhangi bir yetkili tanımlı değilse, sistem güvenliği için ilk giriş yapan yönetici yetkilendirilir.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <th className="p-3">Ad Soyad</th>
                      <th className="p-3">E-posta Adresi</th>
                      <th className="p-3">Birim / Bölüm</th>
                      <th className="p-3">Erişim Rolü</th>
                      <th className="p-3">Giriş Şifresi</th>
                      <th className="p-3">Kayıt Tarihi</th>
                      <th className="p-3 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-sans">
                    {/* Always showcase Super Admin as implicit top entry */}
                    <tr className="bg-amber-50/10 hover:bg-amber-50/20">
                      <td className="p-3 font-semibold text-slate-900 flex items-center gap-1.5">
                        Gökhan Eroğlu
                      </td>
                      <td className="p-3 font-mono text-slate-600">gokhan.eroglu@gmail.com</td>
                      <td className="p-3 text-slate-500 font-medium font-mono">Tüm Birimler (Süper)</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold text-[10px] uppercase">
                          SÜPER ADMİN
                        </span>
                      </td>
                      <td className="p-3 font-mono text-indigo-600 font-bold">admin</td>
                      <td className="p-3 text-slate-400 font-mono">-</td>
                      <td className="p-3 text-right">
                        <span className="text-[10px] font-semibold text-slate-400 italic">Sistem Kurucusu</span>
                      </td>
                    </tr>

                    {panelUsers
                      .filter((u) => u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                      .map((u) => {
                        const hasPendingRequest = passwordRequests.some(
                          (r) => r.email.toLowerCase().trim() === u.email.toLowerCase().trim() && r.status === "bekliyor"
                        );
                        return (
                          <tr key={u.id} className={`hover:bg-slate-50/50 transition ${hasPendingRequest ? "bg-amber-50/20" : ""}`}>
                            <td className="p-3 font-semibold text-slate-900">
                              <div className="flex flex-col">
                                <span>{u.name}</span>
                                {hasPendingRequest && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 uppercase mt-0.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                                    Şifre Talebi Var
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-600">{u.email}</td>
                            <td className="p-3 font-medium text-slate-600">{u.department || "Tüm Birimler / Genel"}</td>
                            <td className="p-3">
                              {u.role === "admin" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[10px]">
                                  Yönetici
                                </span>
                              )}
                              {u.role === "editor" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-bold text-[10px]">
                                  Editör
                                </span>
                              )}
                              {u.role === "viewer" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[10px]">
                                  İzleyici
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-indigo-600 font-bold">
                              <div className="flex flex-col gap-0.5">
                                <span>{u.password || "-"}</span>
                                {hasPendingRequest && (
                                  <span className="text-[10px] text-amber-600 font-semibold animate-pulse">Sıfırlama Bekliyor</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-slate-400 font-mono">
                              {u.createdAt ? formatDate(u.createdAt) : "-"}
                            </td>
                            <td className="p-3 text-right">
                              <div className="inline-flex gap-1 justify-end">
                                {hasPendingRequest && (
                                  <button
                                    onClick={() => handleOpenSendPassword(u.email)}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition cursor-pointer animate-pulse-slow"
                                    title="Şifre Belirle ve Gönder"
                                  >
                                    <Key className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEditUser(u)}
                                  className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-lg transition cursor-pointer"
                                  title="Düzenle"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id!)}
                                  className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition cursor-pointer"
                                  title="Yetkiyi Kaldır"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              🛡️ Kurumsal Güvenlik Altyapısı
            </span>
            <p className="text-[11px] text-slate-400 mt-1 max-w-lg mx-auto leading-normal">
              Yetkili listesi haricindeki hiç kimse Google hesabı ile sisteme giriş yapamaz. Şifreli giriş ise sadece geçici acil durum kurtarmaları içindir.
            </p>
          </div>
        </div>
      </div>
      </div>
    )
  )}

  {/* Duplicate block disabled to avoid duplicate rendering */}
  {false && (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-md space-y-6 animate-fade-in" id="email-notifications-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Mail className="h-5 w-5" />
            </span>
            Otomatik E-posta Bildirim Geçmişi (Firebase Cloud Functions)
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
            Yeni bir DÖF kaydı oluşturulduğunda veya durumu güncellendiğinde ilgili birime ve bildirim sahibine otomatik olarak iletilen e-posta bildirimlerinin detaylı takip günlüğü.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={isEmailLogsLoading}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 text-indigo-700 font-semibold rounded-xl text-xs border border-indigo-100 transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isEmailLogsLoading ? "animate-spin" : ""}`} />
          Günlüğü Yenile
        </button>
      </div>

      {isEmailLogsLoading && emailLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
          <span className="text-xs font-semibold">Bildirim kayıtları yükleniyor...</span>
        </div>
      ) : emailLogs.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-16 text-center text-slate-400">
          <div className="p-3.5 bg-white border border-slate-100 rounded-full shadow-sm mb-4 inline-block">
            <Mail className="h-8 w-8 text-slate-300 animate-pulse" />
          </div>
          <h3 className="font-bold text-slate-700 text-sm">Gönderilmiş E-posta Bulunmuyor</h3>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Sistemde henüz otomatik tetiklenen bir e-posta bildirimi kaydı yok. Yeni bir DÖF kaydı oluşturarak veya mevcut bir kaydın durumunu güncelleyerek anlık e-posta akışını başlatabilirsiniz!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-4">DÖF Ref No</th>
                  <th className="p-4">Bildirim Türü</th>
                  <th className="p-4">Alıcı E-posta</th>
                  <th className="p-4">Konu Başlığı</th>
                  <th className="p-4">Gönderim Tarihi</th>
                  <th className="p-4">Durum</th>
                  <th className="p-4 text-center">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {emailLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const formatLogDate = (sentAt: any) => {
                    if (!sentAt) return "-";
                    let date: Date;
                    if (sentAt.toDate) {
                      date = sentAt.toDate();
                    } else if (sentAt.seconds) {
                      date = new Date(sentAt.seconds * 1000);
                    } else {
                      date = new Date(sentAt);
                    }
                    return date.toLocaleString("tr-TR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                  };

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/50 transition">
                        <td className="p-4 font-mono font-bold text-indigo-600">{log.refNo}</td>
                        <td className="p-4">
                          {log.type === "yeni_dof" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[10px] uppercase">
                              Yeni DÖF Kaydı
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-bold text-[10px] uppercase">
                              Durum Güncellemesi
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono font-medium text-slate-700">{log.to}</td>
                        <td className="p-4 text-slate-600 font-medium truncate max-w-[240px]" title={log.subject}>
                          {log.subject}
                        </td>
                        <td className="p-4 text-slate-400 font-mono">{formatLogDate(log.sentAt)}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            GÖNDERİLDİ
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition text-xs font-semibold cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {isExpanded ? "Kapat" : "Önizle"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-4 bg-slate-50 border-t border-b border-slate-100">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  📧 Gönderilen HTML E-posta Canlı Önizlemesi
                                </span>
                                <span className="text-xs font-mono text-slate-400">Kayıt ID: {log.id}</span>
                              </div>
                              <div 
                                className="bg-white border border-slate-100 rounded-xl p-6 shadow-inner max-h-[500px] overflow-auto"
                                dangerouslySetInnerHTML={{ __html: log.html }}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )}
          </div>
        )}
        </div>
        </main>
      </div>

      {/* Şifre Gönder Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsPasswordModalOpen(false);
                setSendingPasswordForEmail(null);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 overflow-hidden z-10 space-y-4"
            >
              <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Key className="h-4.5 w-4.5 text-indigo-600 animate-pulse" />
                    Yeni Giriş Şifresi Tanımla
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {sendingPasswordForEmail}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setSendingPasswordForEmail(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Belirlenecek Geçici Şifre</label>
                  <input
                    type="text"
                    value={newPasswordToSet}
                    onChange={(e) => setNewPasswordToSet(e.target.value)}
                    placeholder="Örn: sirket123"
                    className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-sm font-semibold font-mono text-center"
                  />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(100000 + Math.random() * 900000).toString();
                      setNewPasswordToSet(rand);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer text-xs border border-slate-200"
                  >
                    Şifre Üret
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSendPassword}
                    className="flex-grow inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer text-xs shadow-md shadow-indigo-100"
                  >
                    Gönder ve Tamamla
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sistem Parametre Ayarları Modalı */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-7 overflow-hidden z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Settings className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Program Parametre Ayarları
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">Yönetici Paneli Varsayılan Davranışları</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* 1. Default Sound Setting */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Varsayılan Ses Bildirimi Durumu
                  </label>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Yönetici paneli her açıldığında sesli bildirimlerin otomatik olarak hangi durumda başlayacağını belirler.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDefaultSoundSetting("on")}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                        defaultSoundSetting === "on"
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Açık
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultSoundSetting("off")}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                        defaultSoundSetting === "off"
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Sessiz
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultSoundSetting("last")}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                        defaultSoundSetting === "last"
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                      title="En son seçilen ses durumunu hatırlar."
                    >
                      Son Seçim
                    </button>
                  </div>
                </div>

                {/* 2. Default Active Tab */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Varsayılan Başlangıç Sekmesi
                  </label>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Yönetici paneline ilk giriş yaptığınızda hangi sekmenin aktif olacağını ayarlar.
                  </p>
                  <select
                    value={defaultTabSetting}
                    onChange={(e) => setDefaultTabSetting(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-slate-50/80 border border-slate-200 rounded-lg p-2 text-xs font-medium focus:border-indigo-500 focus:bg-white outline-none"
                  >
                    <option value="dofs">DÖF Başvuruları</option>
                    {activePanelUser?.role === "admin" && (
                      <option value="users">Yönetici & Kullanıcı Yönetimi</option>
                    )}
                    <option value="notifications">Otomatik E-posta Bildirim Geçmişi</option>
                    <option value="remote">Uzak Bağlantı & Paylaşım</option>
                  </select>
                </div>

                {/* 3. Default Status Filter */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Varsayılan DÖF Durum Filtresi
                  </label>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    DÖF listesi ilk açıldığında otomatik olarak uygulanacak durum filtresi.
                  </p>
                  <select
                    value={defaultStatusFilterSetting}
                    onChange={(e) => setDefaultStatusFilterSetting(e.target.value)}
                    className="w-full bg-slate-50 hover:bg-slate-50/80 border border-slate-200 rounded-lg p-2 text-xs font-medium focus:border-indigo-500 focus:bg-white outline-none"
                  >
                    <option value="all">Tümü (Filtresiz)</option>
                    <option value="yeni">Yeni Başvurular</option>
                    <option value="inceleniyor">İncelemedekiler</option>
                    <option value="cozuldu">Çözülenler</option>
                    <option value="reddedildi">Reddedilenler</option>
                  </select>
                </div>

                {/* 3.5 Default Notification Setting */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Varsayılan Anlık Bildirim Durumu
                  </label>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Yeni bir DÖF kaydı geldiğinde sesli ve görsel bildirimlerin gösterilip gösterilmeyeceğini belirler.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDefaultNotificationSetting("on")}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                        defaultNotificationSetting === "on"
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Açık (Sesli & Görsel)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultNotificationSetting("off")}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border transition text-center cursor-pointer ${
                        defaultNotificationSetting === "off"
                          ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Kapalı (Sessiz & Gizli)
                    </button>
                  </div>
                </div>

                {/* 4. Passcode Login Passive/Disabled Toggle */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                    Yönetici Giriş Ekranı Ayarı
                  </label>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    İşaretlendiğinde, Yönetim paneline hiçbir şifre ya da doğrulama yapmadan otomatik olarak doğrudan giriş yapılır.
                  </p>
                  <label className="flex items-center gap-2.5 pt-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPasscodeLoginPassive}
                      onChange={(e) => setIsPasscodeLoginPassive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Şifresiz ve Doğrulamasız Otomatik Giriş Yap
                    </span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-5 border-t border-slate-100 mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDefaultSoundSetting("on");
                    setDefaultTabSetting("dofs");
                    setDefaultStatusFilterSetting("all");
                    setDefaultNotificationSetting("on");
                    setIsPasscodeLoginPassive(false);
                    
                    localStorage.removeItem("dof_admin_default_sound_setting");
                    localStorage.removeItem("dof_admin_default_tab_setting");
                    localStorage.removeItem("dof_admin_default_status_filter_setting");
                    localStorage.removeItem("dof_admin_default_notification_setting");
                    localStorage.removeItem("dof_admin_passcode_login_passive");
                    
                    setIsMuted(false);
                    setIsSettingsOpen(false);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Sıfırla
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem("dof_admin_default_sound_setting", defaultSoundSetting);
                      localStorage.setItem("dof_admin_default_tab_setting", defaultTabSetting);
                      localStorage.setItem("dof_admin_default_status_filter_setting", defaultStatusFilterSetting);
                      localStorage.setItem("dof_admin_default_notification_setting", defaultNotificationSetting);
                      localStorage.setItem("dof_admin_passcode_login_passive", isPasscodeLoginPassive ? "true" : "false");
                      
                      // Apply immediately
                      if (defaultSoundSetting === "on") {
                        setIsMuted(false);
                      } else if (defaultSoundSetting === "off") {
                        setIsMuted(true);
                      } else if (defaultSoundSetting === "last") {
                        const last = localStorage.getItem("dof_admin_last_sound_state");
                        setIsMuted(last === "muted");
                      }

                      setIsSettingsOpen(false);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Poster Printable Modal */}
      {showPosterModal && activePosterDept && (
        <div 
          onClick={() => {
            setShowPosterModal(false);
            setActivePosterDept(null);
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto cursor-pointer"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 flex flex-col my-8 print:my-0 print:border-0 print:shadow-none print:rounded-none print:w-full print:max-w-none print:h-full cursor-default"
          >
            {/* Modal Top Control Bar (Hidden during print) */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Printer className="h-5 w-5" />
                </span>
                <div>
                  <span className="font-bold text-sm text-slate-800 block">Poster ve QR Kodu Yazdır</span>
                  <span className="text-[10px] text-slate-400 block">Departmana özel afiş çıktısı ve A4 PDF belgesi</span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={handlePrintPoster}
                  disabled={isPosterPrinting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
                  title="Doğrudan yazıcıya gönder"
                >
                  <Printer className="h-4 w-4" />
                  {isPosterPrinting ? "Yazıcıya Gönderiliyor..." : "Yazıcıya Gönder (Yazdır)"}
                </button>
                <button
                  type="button"
                  onClick={handleExportPosterPdf}
                  disabled={isPosterPdfLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
                  title="A4 formatında PDF olarak kaydet ve indir"
                >
                  <Download className="h-4 w-4" />
                  {isPosterPdfLoading ? "PDF Hazırlanıyor..." : "PDF Olarak Kaydet"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPosterModal(false);
                    setActivePosterDept(null);
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  <X className="h-4 w-4" /> Kapat
                </button>
              </div>
            </div>

            {/* Absolute floating X button inside the modal for desktop (Hidden during print) */}
            <button
              onClick={() => {
                setShowPosterModal(false);
                setActivePosterDept(null);
              }}
              className="absolute top-4 right-4 p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full border border-slate-200/40 transition cursor-pointer print:hidden z-50 flex items-center justify-center shadow-xs md:hidden"
              title="Kapat"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Editable header inside modal (Hidden during print) */}
            <div className="bg-amber-50/50 border-b border-amber-100/50 p-4 px-6 print:hidden">
              <label className="block text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1 font-mono">Afiş Üst Başlığı (Buradan da düzenleyebilirsiniz)</label>
              <input
                type="text"
                value={posterTitle}
                onChange={(e) => setPosterTitle(e.target.value)}
                placeholder="Başlık girin..."
                className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-3 transition text-xs font-bold animate-none"
              />
            </div>

            {/* Poster Content */}
            <div id="dof-admin-dept-poster-content" className="p-10 sm:p-14 text-center bg-white space-y-8 flex-1 print:p-0 print:space-y-6">
              
              {/* Logo Badge */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-700 text-xs font-bold tracking-wider uppercase">
                  <Building className="h-4 w-4" /> {activePosterDept.name} Kalite Güvence
                </div>
                
                {/* Title / Header (Editable from input above) */}
                <h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-slate-900 uppercase leading-tight mt-2 whitespace-pre-line max-w-xl mx-auto">
                  {posterTitle || `${activePosterDept.name.toUpperCase()} DÖF BİLDİRİM FORMU`}
                </h1>
                
                <h2 className="text-lg sm:text-xl font-display font-bold text-emerald-600 uppercase tracking-widest mt-1">
                  HIZLI BİLDİRİM KANALI
                </h2>
              </div>

              <div className="w-full border-b border-slate-100 border-dashed" />

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="p-5 bg-slate-50 border-4 border-emerald-600 rounded-[32px] inline-block shadow-inner relative">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                      activePosterDept.isCustomQr 
                        ? `${window.location.origin}?view=submit&dept=${encodeURIComponent(activePosterDept.name)}`
                        : `${window.location.origin}?view=submit`
                    )}&color=059669`}
                    alt="Departman DÖF QR"
                    className="w-60 h-60 object-contain rounded-2xl border border-white bg-white shadow-md"
                  />
                  {/* Frame corners */}
                  <div className="absolute top-3 left-3 w-6 h-6 border-t-4 border-l-4 border-emerald-600 rounded-tl-xl" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-t-4 border-r-4 border-emerald-600 rounded-tr-xl" />
                  <div className="absolute bottom-3 left-3 w-6 h-6 border-b-4 border-l-4 border-emerald-600 rounded-bl-xl" />
                  <div className="absolute bottom-3 right-3 w-6 h-6 border-b-4 border-r-4 border-emerald-600 rounded-br-xl" />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase block">KAMERANIZ İLE TARATIN</span>
                  <p className="text-xs font-semibold text-emerald-600 select-all font-mono">
                    {activePosterDept.isCustomQr 
                      ? `${window.location.origin}?view=submit&dept=${encodeURIComponent(activePosterDept.name)}`
                      : `${window.location.origin}?view=submit`
                    }
                  </p>
                </div>
              </div>

              <div className="w-full border-b border-slate-100 border-dashed" />

              {/* Motivational & Instructions Section */}
              <div className="max-w-md mx-auto space-y-3.5">
                <h3 className="text-base font-bold text-slate-800">Sürekli İyileştirmeye Katkı Sağlayın</h3>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                  İş yerimizdeki uygunsuzlukları, aksaklıkları, ramak kala olayları veya iyileştirme önerilerinizi bu QR kodu okutarak doğrudan <b>{activePosterDept.name}</b> birimine bildirebilirsiniz.
                </p>
                <div className="pt-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-100 rounded-xl py-2 px-3 bg-slate-50">
                    "Güvenli, kaliteli ve sıfır hatalı bir çalışma ortamı sizin bildiriminizle başlar."
                  </p>
                </div>
              </div>

            </div>

            {/* Modal bottom hint (Hidden during print) */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 text-center text-[10px] text-slate-400 print:hidden">
              Bu afişi ilgili departmanın fiziksel çalışma alanlarına, panolarına veya ortak alanlarına asabilirsiniz.
            </div>
          </motion.div>
        </div>
      )}

      {/* Admin DÖF Silme Onay Modalı */}
      <AnimatePresence>
        {dofToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Trash2 className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">
                  DÖF Kaydını Silmek İstediğinize Emin Misiniz?
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  <span className="font-mono font-bold text-indigo-600">#{dofToDelete.refNo}</span> - <span className="font-medium text-slate-700">{dofToDelete.title}</span>
                </p>
                <div className="bg-rose-50/80 border border-rose-100 rounded-xl p-3 text-[11px] text-rose-800 text-left mb-6 leading-relaxed">
                  ⚠️ <strong>Yönetici Yetkisi Uyarısı:</strong> Bu işlem bu bildirim kaydını veritabanından kalıcı olarak silecektir. Süreç notları, yorumlar ve tüm işlem geçmişi geri getirilemez şekilde silinir.
                </div>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setDofToDelete(null)}
                    disabled={isDeletingDof}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={executeDeleteDof}
                    disabled={isDeletingDof}
                    className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-rose-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isDeletingDof ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Siliniyor...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Evet, Kalıcı Olarak Sil</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Single DOF QR Code Modal */}
      <DofSingleQrModal 
        dof={singleQrModalDof} 
        onClose={() => setSingleQrModalDof(null)} 
      />

      {/* Admin QR Scanner Modal */}
      <DofQrScannerModal
        isOpen={isAdminScannerOpen}
        onClose={() => setIsAdminScannerOpen(false)}
        onScanSuccess={handleAdminScanSuccess}
      />
    </>
  );
}
