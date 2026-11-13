import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Lock, 
  Unlock,
  LogOut,
  SlidersHorizontal, 
  Search, 
  Filter,
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
  Ban,
  PieChart,
  Grid,
  Users,
  UserPlus,
  Plus,
  Shield,
  ShieldCheck,
  Wrench,
  Menu,
  Pin,
  PinOff,
  Edit3,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronRight,
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
  Smartphone,
  Image as ImageIcon,
  Folder,
  FolderKanban,
  FolderPlus,
  FolderCheck,
  CheckSquare,
  Square,
  Database,
  Server,
  HardDrive,
  Table
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
  listFolders,
  listDepartments,
  moveDofsToFolder,
  removeDofsFromFolder,
  handleFirestoreError,
  OperationType,
  filterAuthorizedDofs,
  accessFilter,
  authorizedQuery,
  getCurrentUserAuthContext,
  normalizeUnitText,
  splitDepartmentNames,
  isUserAssignedToDepartment,
  getAuthorizedDepartmentsForUser,
  bulkDeleteSystemData,
  BulkDeleteSelection
} from "../lib/db";
import { 
  DofForm, 
  DofStatus, 
  DofType, 
  GeminiAnalysisResult,
  PanelUser,
  PanelUserRole,
  Department,
  DofFolder
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
import DofLandscapePrintModal from "./DofLandscapePrintModal";
import DofExecutiveSummaryCard from "./DofExecutiveSummaryCard";
import DofFolderManager from "./DofFolderManager";
import DofDatabaseSettings from "./DofDatabaseSettings";
import DofRoleManager from "./DofRoleManager";
import { AccessRole } from "../types";
import {
  getStoredAccessRoles,
  syncAccessRolesFromFirestore,
  getRoleById,
  getRoleDisplayName,
  getRoleBadgeClasses,
  resolveEffectivePermissions,
  DEFAULT_ACCESS_ROLES,
} from "../lib/roles";
import { compressImageToBase64 } from "../utils/imageCompressor";
import {
  computeTargetCompletionDate,
  getStoredSettings,
  syncSettingsFromFirestore,
  saveSystemSettings,
  getRemainingBusinessDays,
  getAppVersion,
  DEFAULT_APP_VERSION
} from "../lib/settings";

/**
 * Birim bazlı yetkilendirme kontrol fonksiyonu:
 * - Sistem yöneticisi veya süper admin tüm DÖF kayıtlarını görebilir.
 * - Departman kullanıcıları (örn: sahin@gmail.com) SADECE kendi birimlerine ait veya kendilerine atanan DÖF kayıtlarını görebilir.
 * - Yetkisi olmayan hiçbir kullanıcı diğer birimlerin verilerini göremez.
 */
export function isUserAuthorizedForDof(user: PanelUser | null, dof: DofForm): boolean {
  // Read effective credentials from user or localStorage session fallback
  const effectiveEmail = (user?.email || localStorage.getItem("dof_admin_authed_email") || "").trim().toLowerCase();
  const effectiveRole = (user?.role || localStorage.getItem("dof_admin_user_role") || "").trim().toLowerCase();
  const effectiveDept = (user?.department || localStorage.getItem("dof_admin_user_dept") || "").trim();
  const effectiveUserId = user?.id || localStorage.getItem("dof_admin_user_id") || "";
  const effectiveCanSeeAll = user?.canSeeAllDofs || false;

  if (!effectiveEmail && !user) return false;

  // sahin@gmail.com or users with specific units are strictly unit users, NEVER super admin
  const isSuper = effectiveEmail !== "sahin@gmail.com" &&
    ((effectiveRole === "admin" && (!effectiveDept || effectiveDept === "Tüm Birimler" || effectiveDept.toLowerCase() === "tüm birimler")) ||
     (effectiveEmail === "gokhan.eroglu@gmail.com" && (!effectiveDept || effectiveDept === "Tüm Birimler")));

  // 1. Reddedilen DÖF'leri SADECE en üst yetkili (sistem yöneticisi / admin) görüntüleyebilir
  const st = (dof.status || "").toLowerCase().trim();
  const isRejected = st === "reddedildi" || st === "iptal";
  if (isRejected && !isSuper) {
    return false;
  }

  // 2. Tam yetkili sistem yöneticisi veya süper yönetici tüm DÖF'leri görebilir
  if (isSuper) {
    return true;
  }

  // Türkçe karakterlere duyarlı normalizasyon (örn: Üzülmez TİM <-> üzülmez tim)
  const normalizeText = (text?: string) => normalizeUnitText(text);

  const authorizedDepts = new Set<string>();
  splitDepartmentNames(effectiveDept).forEach((d) => {
    const normD = normalizeText(d);
    if (normD && normD !== "tüm birimler") {
      authorizedDepts.add(normD);
    }
  });
  try {
    const rawAuthDepts = localStorage.getItem("dof_admin_user_authorized_depts");
    if (rawAuthDepts) {
      const parsed = JSON.parse(rawAuthDepts);
      if (Array.isArray(parsed)) {
        parsed.forEach((d) => {
          splitDepartmentNames(typeof d === "string" ? d : "").forEach((part) => {
            const normD = normalizeText(part);
            if (normD && normD !== "tüm birimler") authorizedDepts.add(normD);
          });
        });
      }
    }
  } catch {}

  const dofDept = normalizeText(dof.department);
  const dofUserDept = normalizeText((dof as any).user_department);
  const dofAssignedUnit = normalizeText(dof.assignedUnit);

  // Kullanıcının yetkili olduğu birim(ler) ile DÖF birimi / assignedUnit eşleşiyorsa görebilir
  if (authorizedDepts.size > 0) {
    if (
      (dofDept && authorizedDepts.has(dofDept)) ||
      (dofUserDept && authorizedDepts.has(dofUserDept)) ||
      (dofAssignedUnit && authorizedDepts.has(dofAssignedUnit))
    ) {
      return true;
    }
  }

  // Doğrudan kullanıcıya veya çoklu birim sorumlusu listesine atanmış DÖF (ID veya e-posta eşleşmesi)
  if (effectiveUserId) {
    if (dof.assignedUserId && dof.assignedUserId === effectiveUserId) {
      return true;
    }
    if (Array.isArray(dof.assignedUserIds) && dof.assignedUserIds.includes(effectiveUserId)) {
      return true;
    }
  }
  if (effectiveEmail) {
    if (dof.assignedUserEmail && normalizeText(dof.assignedUserEmail) === effectiveEmail) {
      return true;
    }
    if (Array.isArray(dof.assignedUserEmails) && dof.assignedUserEmails.some((e) => normalizeText(e) === effectiveEmail)) {
      return true;
    }
  }

  // Kullanıcının bizzat raporladığı DÖF
  if (dof.reporterContact && effectiveEmail && normalizeText(dof.reporterContact) === effectiveEmail) {
    return true;
  }

  // Açık global görüntüleme yetkisi veya birimi olmayan rapor kullanıcısı (kısıtsız)
  if (
    effectiveEmail !== "sahin@gmail.com" &&
    authorizedDepts.size === 0 &&
    (effectiveCanSeeAll || effectiveRole === "viewer")
  ) {
    return true;
  }

  // Diğer hiçbir birimin verisi görüntülenemez
  return false;
}

interface DofAdminProps {
  onNavigate?: (tab: string) => void;
}

export default function DofAdmin({ onNavigate }: DofAdminProps = {}) {
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

  // Filters (Varsayılan olarak Açık & İşlemde DÖF'ler getirilir)
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const saved = localStorage.getItem("dof_admin_default_status_filter_setting");
    return saved && saved !== "all" ? saved : "acik";
  });
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
  const [adminSubTab, setAdminSubTab] = useState<"dashboard" | "dofs" | "folders" | "new_dof" | "users" | "roles" | "departments" | "workflow" | "reports" | "logs" | "remote" | "database">(() => {
    const saved = localStorage.getItem("dof_admin_default_tab_setting");
    if (saved && ["dashboard", "dofs", "folders", "new_dof", "users", "roles", "departments", "workflow", "reports", "logs", "remote", "database"].includes(saved)) {
      return saved as any;
    }
    return "dashboard";
  });

  // Access Roles (Erişim Rolleri)
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>(() => getStoredAccessRoles());

  // Folders State (dof_folders)
  const [folders, setFolders] = useState<DofFolder[]>([]);
  const [isFoldersLoading, setIsFoldersLoading] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [selectedDofIds, setSelectedDofIds] = useState<string[]>([]);
  const [bulkTargetFolderId, setBulkTargetFolderId] = useState<string>("");
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [selectedFolderForClose, setSelectedFolderForClose] = useState<string>("");

  // Panel Authorization Check
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  // Sol Menü (Sidebar) Otomatik Gizleme & Hover Durumları
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    return localStorage.getItem("dof_admin_sidebar_pinned") === "true";
  });
  const [sidebarDisplayMode, setSidebarDisplayMode] = useState<"rail" | "hidden">(() => {
    return (localStorage.getItem("dof_admin_sidebar_display_mode") as any) || "hidden";
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Departments (Birimler) management states
  const [departments, setDepartments] = useState<Department[]>([]);
  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => {
      const parsedA = Number(a.order);
      const parsedB = Number(b.order);
      const orderA = !isNaN(parsedA) && a.order !== undefined && a.order !== null && String(a.order).trim() !== "" ? parsedA : 999999;
      const orderB = !isNaN(parsedB) && b.order !== undefined && b.order !== null && String(b.order).trim() !== "" ? parsedB : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || "").localeCompare(b.name || "", "tr-TR");
    });
  }, [departments]);
  const [isDeptsLoading, setIsDeptsLoading] = useState(false);
  const [isDeptSaving, setIsDeptSaving] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  const [deptFormName, setDeptFormName] = useState("");
  const [deptFormOrder, setDeptFormOrder] = useState<number | string>(1);
  const [deptFormIsActive, setDeptFormIsActive] = useState(true);
  const [deptFormResponsibleEmail, setDeptFormResponsibleEmail] = useState("");
  const [deptFormIsCustomQr, setDeptFormIsCustomQr] = useState(false);
  const [deptFormDirectReferral, setDeptFormDirectReferral] = useState(false);
  const [deptFormReferralUserIds, setDeptFormReferralUserIds] = useState<string[]>([]);
  const [deptFormUserRoles, setDeptFormUserRoles] = useState<Record<string, string>>({});
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

  // Email and Audit logs state & filters
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [isEmailLogsLoading, setIsEmailLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logTypeFilter, setLogTypeFilter] = useState<string>("all");
  const [logUserFilter, setLogUserFilter] = useState<string>("all");
  const [logSearchTerm, setLogSearchTerm] = useState<string>("");

  // Active panel user state & filters
  const [activePanelUser, setActivePanelUser] = useState<PanelUser | null>(() => {
    const savedEmail = localStorage.getItem("dof_admin_authed_email");
    const savedRole = localStorage.getItem("dof_admin_user_role") as PanelUserRole | null;
    const savedDept = localStorage.getItem("dof_admin_user_dept");
    const savedName = localStorage.getItem("dof_admin_user_name");
    if (savedEmail) {
      return {
        name: savedName || savedEmail.split("@")[0],
        email: savedEmail,
        role: savedRole || "editor",
        department: savedDept || "",
        createdAt: null,
        updatedAt: null,
      };
    }
    return null;
  });
  const [referralFilter, setReferralFilter] = useState("all");

  const isSystemAdmin = useMemo(() => {
    // 1. If an active panel user is logged in
    if (activePanelUser) {
      const email = (activePanelUser.email || "").toLowerCase().trim();
      const role = (activePanelUser.role || "").toLowerCase().trim();
      const roleDef = getRoleById(role, accessRoles);

      if (email === "sahin@gmail.com") return false;
      if (email === "gokhan.eroglu@gmail.com") return true;

      const assignedUnits =
        departments.length > 0
          ? getAuthorizedDepartmentsForUser(activePanelUser, departments)
          : splitDepartmentNames(activePanelUser.department);
      if (assignedUnits.length > 0) return false;

      return role === "admin" || roleDef.permissions.canManageSystemAdmin;
    }

    // 2. Check stored panel user session in localStorage
    const storedEmail = (localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
    const storedRole = (localStorage.getItem("dof_admin_user_role") || "").toLowerCase().trim();
    const storedDept = (localStorage.getItem("dof_admin_user_dept") || "").trim();

    if (storedEmail) {
      if (storedEmail === "sahin@gmail.com") return false;
      if (storedEmail === "gokhan.eroglu@gmail.com") return true;
      const roleDef = getRoleById(storedRole, accessRoles);
      if (splitDepartmentNames(storedDept).length > 0) return false;
      return storedRole === "admin" || roleDef.permissions.canManageSystemAdmin;
    }

    // 3. Fallback: only if user logged in purely via Google (not passcode) and no panel user session exists
    if (!isPasscodeAuthed && user?.email?.toLowerCase().trim() === "gokhan.eroglu@gmail.com") {
      return true;
    }

    return false;
  }, [activePanelUser, isPasscodeAuthed, user, accessRoles, departments]);

  const activeRolePerms = useMemo(() => {
    return resolveEffectivePermissions(activePanelUser, accessRoles, isSystemAdmin);
  }, [activePanelUser, accessRoles, isSystemAdmin]);

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
  const [userFormCanSeeAllDofs, setUserFormCanSeeAllDofs] = useState(false);
  const [userFormCanEditDof, setUserFormCanEditDof] = useState(false);
  const [userFormIsActive, setUserFormIsActive] = useState(true);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userFormSuccess, setUserFormSuccess] = useState(false);

  // Yetkili Personel Listesi filtre states
  const [userListSearch, setUserListSearch] = useState("");
  const [userListDeptFilter, setUserListDeptFilter] = useState("all");
  const [userListRoleFilter, setUserListRoleFilter] = useState("all");
  const [userListActiveFilter, setUserListActiveFilter] = useState<"all" | "active" | "inactive" | "can_edit">("all");

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
  const [step3BeforeImage, setStep3BeforeImage] = useState<string>("");
  const [step3AfterImage, setStep3AfterImage] = useState<string>("");
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [showLandscapeModal, setShowLandscapeModal] = useState(false);
  const [landscapeTargetDof, setLandscapeTargetDof] = useState<DofForm | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isCommentSending, setIsCommentSending] = useState(false);

  // Mobile QR Code & Scanner states
  const [isAdminScannerOpen, setIsAdminScannerOpen] = useState(false);
  const [singleQrModalDof, setSingleQrModalDof] = useState<DofForm | null>(null);
  const [isMobileChartsExpanded, setIsMobileChartsExpanded] = useState(false);
  
  // Admin DÖF Reddetme İşlemi State'leri (Silme kaldırıldı, sadece red etme)
  const [dofToReject, setDofToReject] = useState<DofForm | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectingDof, setIsRejectingDof] = useState(false);
  
  // Program Versiyonu State
  const [appVersionSetting, setAppVersionSetting] = useState<string>(() => {
    return getAppVersion();
  });
  
  // Program Parametre & Veritabanı Ayarları States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<"parameters" | "database">("parameters");
  const [preventiveDaysSetting, setPreventiveDaysSetting] = useState<number>(() => {
    const val = Number(localStorage.getItem("dof_admin_preventive_days"));
    return !isNaN(val) && val > 0 ? val : 7;
  });
  const [correctiveDaysSetting, setCorrectiveDaysSetting] = useState<number>(() => {
    const val = Number(localStorage.getItem("dof_admin_corrective_days"));
    return !isNaN(val) && val > 0 ? val : 3;
  });
  const [defaultSoundSetting, setDefaultSoundSetting] = useState<"on" | "off" | "last" | string>(() => {
    return localStorage.getItem("dof_admin_default_sound_setting") || "on";
  });
  const [defaultTabSetting, setDefaultTabSetting] = useState<"dofs" | "users" | "notifications" | string>(() => {
    return localStorage.getItem("dof_admin_default_tab_setting") || "dofs";
  });
  const [defaultStatusFilterSetting, setDefaultStatusFilterSetting] = useState<string>(() => {
    const saved = localStorage.getItem("dof_admin_default_status_filter_setting");
    return saved && saved !== "all" ? saved : "acik";
  });
  const [defaultNotificationSetting, setDefaultNotificationSetting] = useState<"on" | "off" | string>(() => {
    return localStorage.getItem("dof_admin_default_notification_setting") || "on";
  });
  const [isPasscodeLoginPassive, setIsPasscodeLoginPassive] = useState<boolean>(() => {
    return localStorage.getItem("dof_admin_passcode_login_passive") === "true";
  });
  const [isKvkkMaskingEnabled, setIsKvkkMaskingEnabled] = useState<boolean>(() => {
    return localStorage.getItem("dof_admin_kvkk_masking") === "true";
  });

  // Tanımlı Verileri Silme (Sadece Admin)
  const [deleteSelection, setDeleteSelection] = useState<BulkDeleteSelection>({
    dofs: false,
    users: false,
    departments: false,
    folders: false,
    emailLogs: false,
    passwordRequests: false,
    accessRoles: false,
  });
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleteConfirmChecked, setIsDeleteConfirmChecked] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteMessage, setBulkDeleteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const nonAdminUsersCount = useMemo(() => {
    const activeEmail = (activePanelUser?.email || localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
    return panelUsers.filter((u) => {
      const role = (u.role || "").toLowerCase().trim();
      const email = (u.email || "").toLowerCase().trim();
      if (role === "admin" || role === "yönetici" || role === "yonetici") return false;
      if (email === "gokhan.eroglu@gmail.com") return false;
      if (activeEmail && email === activeEmail) return false;
      return true;
    }).length;
  }, [panelUsers, activePanelUser]);

  const customRolesCount = useMemo(() => {
    return accessRoles.filter((r) => !r.isSystemDefault).length;
  }, [accessRoles]);

  const selectedDeleteKeysCount = useMemo(() => {
    return Object.values(deleteSelection).filter(Boolean).length;
  }, [deleteSelection]);

  const handleToggleDeleteKey = (key: keyof BulkDeleteSelection) => {
    setBulkDeleteMessage(null);
    setDeleteSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleAllDeleteKeys = () => {
    setBulkDeleteMessage(null);
    const allSelected =
      deleteSelection.dofs &&
      deleteSelection.users &&
      deleteSelection.departments &&
      deleteSelection.folders &&
      deleteSelection.emailLogs &&
      deleteSelection.passwordRequests &&
      deleteSelection.accessRoles;
    const nextVal = !allSelected;
    setDeleteSelection({
      dofs: nextVal,
      users: nextVal,
      departments: nextVal,
      folders: nextVal,
      emailLogs: nextVal,
      passwordRequests: nextVal,
      accessRoles: nextVal,
    });
    if (!nextVal) {
      setIsDeleteConfirmOpen(false);
      setIsDeleteConfirmChecked(false);
    }
  };

  const handleExecuteBulkDelete = async () => {
    if (!isSystemAdmin) return;
    if (selectedDeleteKeysCount === 0 || !isDeleteConfirmChecked) return;

    setIsBulkDeleting(true);
    setBulkDeleteMessage(null);
    try {
      const currentEmail = activePanelUser?.email || localStorage.getItem("dof_admin_authed_email") || "";
      const result = await bulkDeleteSystemData(deleteSelection, currentEmail);

      const summaryParts: string[] = [];
      if (deleteSelection.dofs) {
        summaryParts.push(`${result.deletedCounts.dofs} DÖF`);
        setDofs([]);
        setSelectedDof(null);
        setSelectedDofIds([]);
      }
      if (deleteSelection.users) {
        summaryParts.push(`${result.deletedCounts.users} kullanıcı`);
        await fetchAllUsers();
      }
      if (deleteSelection.departments) {
        summaryParts.push(`${result.deletedCounts.departments} birim`);
        setDepartments([]);
        setSelectedDept(null);
        await fetchAllDepartments();
      }
      if (deleteSelection.folders) {
        summaryParts.push(`${result.deletedCounts.folders} klasör`);
        setFolders([]);
      }
      if (deleteSelection.emailLogs) {
        summaryParts.push(`${result.deletedCounts.emailLogs} log`);
        setEmailLogs([]);
      }
      if (deleteSelection.passwordRequests) {
        summaryParts.push(`${result.deletedCounts.passwordRequests} şifre talebi`);
        setPasswordRequests([]);
      }
      if (deleteSelection.accessRoles) {
        summaryParts.push("erişim rolleri sıfırlandı");
        setAccessRoles(DEFAULT_ACCESS_ROLES.map((r) => ({ ...r, permissions: { ...r.permissions } })));
      }

      setDeleteSelection({
        dofs: false,
        users: false,
        departments: false,
        folders: false,
        emailLogs: false,
        passwordRequests: false,
        accessRoles: false,
      });
      setIsDeleteConfirmOpen(false);
      setIsDeleteConfirmChecked(false);
      setBulkDeleteMessage({
        type: "success",
        text: `Silme işlemi tamamlandı: ${summaryParts.join(" · ")}.`,
      });
    } catch (err) {
      console.error("Toplu veri silme hatası:", err);
      setBulkDeleteMessage({
        type: "error",
        text: "Veriler silinirken bir hata oluştu. Lütfen yetkilerinizi kontrol edip tekrar deneyin.",
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getMaskedReporterName = (name?: string) => {
    if (isKvkkMaskingEnabled) return "*** Gizli (KVKK) ***";
    return name || "Anonim / Belirtilmemiş";
  };

  const getMaskedReporterContact = (contact?: string) => {
    if (isKvkkMaskingEnabled) return "*** Gizli (KVKK) ***";
    return contact || "-";
  };

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
    
    // Sync settings from Firestore
    syncSettingsFromFirestore().then((s) => {
      setPreventiveDaysSetting(s.preventiveActionDays);
      setCorrectiveDaysSetting(s.correctiveActionDays);
      if (s.appVersion) setAppVersionSetting(s.appVersion);
      if (s.defaultSoundSetting) setDefaultSoundSetting(s.defaultSoundSetting);
      if (s.defaultTabSetting) setDefaultTabSetting(s.defaultTabSetting);
      if (s.defaultStatusFilterSetting) {
        const eff = s.defaultStatusFilterSetting !== "all" ? s.defaultStatusFilterSetting : "acik";
        setDefaultStatusFilterSetting(eff);
      }
      if (s.defaultNotificationSetting) setDefaultNotificationSetting(s.defaultNotificationSetting);
      setIsPasscodeLoginPassive(s.isPasscodeLoginPassive);
      if (typeof s.isKvkkMaskingEnabled === "boolean") {
        setIsKvkkMaskingEnabled(s.isKvkkMaskingEnabled);
      }
    });

    syncAccessRolesFromFirestore().then((roles) => {
      setAccessRoles(roles);
    });

    const handleOpenSettingsEvent = (e?: Event) => {
      const customEvt = e as CustomEvent<{ tab?: "parameters" | "database" }>;
      const currentRoles = getStoredAccessRoles();
      const storedRole = localStorage.getItem("dof_admin_user_role");
      const currentEmail = (localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
      const isSuper = currentEmail === "gokhan.eroglu@gmail.com" || storedRole === "admin";
      const rolePerms = isSuper ? getRoleById("admin", currentRoles).permissions : getRoleById(storedRole, currentRoles).permissions;
      if (!rolePerms.canViewSettings && !isSuper) {
        return;
      }
      if (customEvt?.detail?.tab === "database" && (isSuper || rolePerms.canManageSystemAdmin)) {
        setSettingsModalTab("database");
      } else {
        setSettingsModalTab("parameters");
      }
      setIsSettingsOpen(true);
    };
    window.addEventListener("dof_open_settings", handleOpenSettingsEvent);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => {
      unsubscribe();
      window.removeEventListener("dof_open_settings", handleOpenSettingsEvent);
    };
  }, []);

  // Redirect to first permitted tab if current user doesn't have privileges for adminSubTab
  useEffect(() => {
    if (!activePanelUser) return;
    const isTabAllowed = (tab: typeof adminSubTab) => {
      if (tab === "dashboard") return activeRolePerms.canViewDashboard;
      if (tab === "dofs") return activeRolePerms.canViewDofs;
      if (tab === "folders") return activeRolePerms.canManageFolders;
      if (tab === "new_dof") return activeRolePerms.canCreateDof;
      if (tab === "reports") return activeRolePerms.canViewReports;
      if (tab === "workflow") return activeRolePerms.canViewDofs || activeRolePerms.canEditDof;
      if (["users", "roles", "departments", "remote", "logs", "database"].includes(tab)) {
        return isSystemAdmin || activeRolePerms.canManageSystemAdmin;
      }
      return true;
    };

    if (!isTabAllowed(adminSubTab)) {
      if (activeRolePerms.canViewDashboard) {
        setAdminSubTab("dashboard");
      } else if (activeRolePerms.canViewReports) {
        setAdminSubTab("reports");
      } else if (activeRolePerms.canViewDofs) {
        setAdminSubTab("dofs");
      } else if (activeRolePerms.canManageFolders) {
        setAdminSubTab("folders");
      } else if (activeRolePerms.canCreateDof) {
        setAdminSubTab("new_dof");
      }
    }
  }, [activePanelUser, adminSubTab, activeRolePerms, isSystemAdmin]);

  // Fetch Panel Users
  const fetchAllUsers = async () => {
    setIsUsersLoading(true);
    try {
      const data = await listPanelUsers();
      setPanelUsers(data);
      const savedEmail = localStorage.getItem("dof_admin_authed_email");
      if (savedEmail) {
        const found = data.find(u => u.email.toLowerCase().trim() === savedEmail.toLowerCase().trim());
        if (found) {
          setActivePanelUser(found);
        }
      }
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

    // Yetki kontrolü: Kullanıcı sadece kendi birimine gelen bildirimleri almalıdır (Rapor Yetkisi bildirim almaz)
    if (!activeRolePerms.canViewDofs || !isUserAuthorizedForDof(activePanelUser, newDof)) {
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

  // Real-time listener for DOFs using Firestore onSnapshot strictly filtered by authorizedQuery
  useEffect(() => {
    if (!isAuthorized) return;

    setIsLoading(true);
    const path = "dofs";

    const userId = activePanelUser?.id || localStorage.getItem("dof_admin_user_id") || undefined;
    const userEmailNorm = (activePanelUser?.email || localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
    const extraDepts = departments
      .filter((d) => {
        if (userId && (d.referralUserIds?.includes(userId) || d.referralUserId === userId)) return true;
        if (userEmailNorm && (d.responsibleEmails?.some((e) => e.toLowerCase().trim() === userEmailNorm) || d.responsibleEmail?.toLowerCase().trim() === userEmailNorm)) return true;
        return false;
      })
      .map((d) => d.name);

    const userAuthCtx = activePanelUser ? {
      userId: activePanelUser.id || undefined,
      email: activePanelUser.email,
      role: activePanelUser.role,
      department: activePanelUser.department,
      authorizedDepartments: extraDepts,
      canSeeAllDofs: activePanelUser.canSeeAllDofs,
    } : getCurrentUserAuthContext();

    const q = authorizedQuery(userAuthCtx);
    
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

      // Safe in-memory sorting by createdAt descending
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });

      const isSuper = isSystemAdmin && userAuthCtx.email?.toLowerCase().trim() !== "sahin@gmail.com";
      const authorizedList = isSuper ? list : filterAuthorizedDofs(list, userAuthCtx);
      setDofs(authorizedList);
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
    }, async (error) => {
      console.warn("Snapshot notice, attempting authorized fallback fetch:", error);
      try {
        const fallbackList = await listDofs(userAuthCtx);
        setDofs(fallbackList);
      } catch (err) {
        handleFirestoreError(error, OperationType.GET, path);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [isAuthorized, activePanelUser?.id, activePanelUser?.email, activePanelUser?.department, activePanelUser?.role, isSystemAdmin, departments]);

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

  // Real-time listener for dof_folders (Klasörler)
  useEffect(() => {
    if (!isAuthorized) return;

    setIsFoldersLoading(true);
    const q = query(collection(db, "dof_folders"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DofFolder[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DofFolder);
      });
      setFolders(list);
      setIsFoldersLoading(false);
    }, (error) => {
      console.warn("dof_folders dinleme uyarısı (kritik değil):", error);
      setIsFoldersLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthorized]);

  // Fallback / manual fetch function to keep compatibility with manual refresh buttons
  // Fallback / manual fetch function to keep compatibility with manual refresh buttons
  const fetchAllDofs = async (overrideUser?: PanelUser | null) => {
    setIsLoading(true);
    try {
      const targetUser = overrideUser !== undefined ? overrideUser : activePanelUser;
      const activeDepts = departments.length > 0 ? departments : await listDepartments().catch(() => []);
      const extraDepts = targetUser ? getAuthorizedDepartmentsForUser(targetUser, activeDepts) : [];

      const userAuthCtx = targetUser ? {
        userId: targetUser.id || undefined,
        email: targetUser.email,
        role: targetUser.role,
        department: extraDepts.length > 0 ? extraDepts.join(", ") : targetUser.department,
        authorizedDepartments: extraDepts,
        canSeeAllDofs: targetUser.canSeeAllDofs,
      } : getCurrentUserAuthContext();
      const data = await listDofs(userAuthCtx);
      const targetRolePerms = targetUser ? getRoleById(targetUser.role, accessRoles).permissions : activeRolePerms;
      const isSuper = targetUser
        ? (targetUser.email?.toLowerCase().trim() === "gokhan.eroglu@gmail.com" ||
            ((targetUser.role === "admin" || targetRolePerms.canManageSystemAdmin) &&
              extraDepts.length === 0 &&
              targetUser.email?.toLowerCase().trim() !== "sahin@gmail.com"))
        : isSystemAdmin;
      const authorizedList = isSuper ? data : filterAuthorizedDofs(data, userAuthCtx);
      setDofs(authorizedList);
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
        const usersList = await fetchAllUsers();
        fetchLogs();

        // Resolve active panel user by email or fallback to stored email
        const emailToMatch = (loginEmail || localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
        const passcodeToMatch = passcode || localStorage.getItem("dof_admin_passcode") || "";

        let resolvedUser: PanelUser | null = null;

        if (emailToMatch === "gokhan.eroglu@gmail.com" || (emailToMatch === "admin" && passcodeToMatch === "admin") || (emailToMatch === "" && passcodeToMatch === "admin")) {
          resolvedUser = {
            name: "Süper Yönetici (Admin)",
            email: "gokhan.eroglu@gmail.com",
            role: "admin",
            department: "Tüm Birimler",
            createdAt: null,
            updatedAt: null
          };
          setActivePanelUser(resolvedUser);
          localStorage.setItem("dof_admin_user_role", "admin");
          localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
          localStorage.setItem("dof_admin_authed_email", "gokhan.eroglu@gmail.com");
        } else {
          const matched = usersList.find(
            u => (emailToMatch ? u.email.toLowerCase().trim() === emailToMatch : false) && (passcodeToMatch ? u.password === passcodeToMatch : true)
          );
          if (matched) {
            resolvedUser = matched;
            setActivePanelUser(matched);
            localStorage.setItem("dof_admin_user_role", matched.role || "editor");
            localStorage.setItem("dof_admin_user_dept", matched.department || "");
            localStorage.setItem("dof_admin_authed_email", matched.email);
            localStorage.setItem("dof_admin_user_can_see_all", matched.canSeeAllDofs ? "true" : "false");
            if (matched.id) localStorage.setItem("dof_admin_user_id", matched.id);
          } else {
            // fallback search by password only if email is empty
            const matchedByPasscodeOnly = usersList.find(u => u.password === passcodeToMatch);
            if (matchedByPasscodeOnly) {
              resolvedUser = matchedByPasscodeOnly;
              setActivePanelUser(matchedByPasscodeOnly);
              localStorage.setItem("dof_admin_user_role", matchedByPasscodeOnly.role || "editor");
              localStorage.setItem("dof_admin_user_dept", matchedByPasscodeOnly.department || "");
              localStorage.setItem("dof_admin_authed_email", matchedByPasscodeOnly.email);
              localStorage.setItem("dof_admin_user_can_see_all", matchedByPasscodeOnly.canSeeAllDofs ? "true" : "false");
              if (matchedByPasscodeOnly.id) localStorage.setItem("dof_admin_user_id", matchedByPasscodeOnly.id);
            } else if (passcodeToMatch === "admin") {
              resolvedUser = {
                name: "Süper Yönetici (Admin)",
                email: "gokhan.eroglu@gmail.com",
                role: "admin",
                department: "Tüm Birimler",
                createdAt: null,
                updatedAt: null
              };
              setActivePanelUser(resolvedUser);
              localStorage.setItem("dof_admin_user_role", "admin");
              localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
              localStorage.setItem("dof_admin_authed_email", "gokhan.eroglu@gmail.com");
            }
          }
        }
        try {
          const allDepts = await listDepartments();
          setDepartments(allDepts);
          if (resolvedUser) {
            const authUnits = getAuthorizedDepartmentsForUser(resolvedUser, allDepts);
            localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify(authUnits));
            if (authUnits.length > 0 && resolvedUser.email?.toLowerCase().trim() !== "gokhan.eroglu@gmail.com") {
              const joined = authUnits.join(", ");
              localStorage.setItem("dof_admin_user_dept", joined);
              resolvedUser = { ...resolvedUser, department: joined };
              setActivePanelUser(resolvedUser);
            }
          }
        } catch {}
        await fetchAllDofs(resolvedUser);
        return;
      }

      if (user) {
        // If a passcode session is already active or stored email belongs to department user, do not overwrite with Google Auth
        const storedAuthedEmail = (localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
        if (storedAuthedEmail && storedAuthedEmail !== "gokhan.eroglu@gmail.com") {
          return;
        }

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
          fetchLogs();

          let resolvedGoogleUser: PanelUser | null = null;
          if (matchedUser) {
            resolvedGoogleUser = matchedUser;
            setActivePanelUser(matchedUser);
            localStorage.setItem("dof_admin_user_role", matchedUser.role || "editor");
            localStorage.setItem("dof_admin_user_dept", matchedUser.department || "");
            localStorage.setItem("dof_admin_authed_email", matchedUser.email);
            localStorage.setItem("dof_admin_user_can_see_all", matchedUser.canSeeAllDofs ? "true" : "false");
            if (matchedUser.id) localStorage.setItem("dof_admin_user_id", matchedUser.id);
          } else if (isSuper) {
            resolvedGoogleUser = {
              name: user.displayName || "Gökhan Eroğlu",
              email: user.email!,
              role: "admin",
              department: "Tüm Birimler",
              createdAt: null,
              updatedAt: null
            };
            setActivePanelUser(resolvedGoogleUser);
            localStorage.setItem("dof_admin_user_role", "admin");
            localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
            localStorage.setItem("dof_admin_authed_email", user.email!);
          } else if (isEmpty) {
            resolvedGoogleUser = {
              name: user.displayName || "İlk Yönetici",
              email: user.email!,
              role: "admin",
              department: "Tüm Birimler",
              createdAt: null,
              updatedAt: null
            };
            setActivePanelUser(resolvedGoogleUser);
            localStorage.setItem("dof_admin_user_role", "admin");
            localStorage.setItem("dof_admin_user_dept", "Tüm Birimler");
            localStorage.setItem("dof_admin_authed_email", user.email!);
          }
          try {
            const allDepts = await listDepartments();
            setDepartments(allDepts);
            if (resolvedGoogleUser) {
              const authUnits = getAuthorizedDepartmentsForUser(resolvedGoogleUser, allDepts);
              localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify(authUnits));
              if (authUnits.length > 0 && resolvedGoogleUser.email?.toLowerCase().trim() !== "gokhan.eroglu@gmail.com") {
                const joined = authUnits.join(", ");
                localStorage.setItem("dof_admin_user_dept", joined);
                resolvedGoogleUser = { ...resolvedGoogleUser, department: joined };
                setActivePanelUser(resolvedGoogleUser);
              }
            }
          } catch {}
          await fetchAllDofs(resolvedGoogleUser);
        } else {
          setIsAuthorized(false);
          setActivePanelUser(null);
          localStorage.removeItem("dof_admin_user_role");
          localStorage.removeItem("dof_admin_user_dept");
          localStorage.removeItem("dof_admin_user_id");
          localStorage.removeItem("dof_admin_user_authorized_depts");
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
      const isMobileDevice = typeof window !== "undefined" && (
        window.innerWidth < 768 || 
        /iphone|ipad|ipod|android|mobile/.test(navigator.userAgent.toLowerCase())
      );
      if (isMobileDevice) {
        if (onNavigate) {
          onNavigate("portal");
        }
        window.dispatchEvent(new CustomEvent("dof_navigate", { detail: "portal" }));
      }
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

    const isMobileDevice = typeof window !== "undefined" && (
      window.innerWidth < 768 || 
      /iphone|ipad|ipod|android|mobile/.test(navigator.userAgent.toLowerCase())
    );

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

      if (isMobileDevice) {
        if (onNavigate) {
          onNavigate("portal");
        }
        window.dispatchEvent(new CustomEvent("dof_navigate", { detail: "portal" }));
      }
    } else {
      const matchingUser = currentUsers.find(
        (u) => u.email.toLowerCase().trim() === inputEmail && u.password && u.password.trim() !== "" && u.password === passcode
      );
      if (matchingUser) {
        const deptsToCheck = departments.length > 0 ? departments : await listDepartments().catch(() => []);
        if (departments.length === 0 && deptsToCheck.length > 0) setDepartments(deptsToCheck);
        const authUnits = getAuthorizedDepartmentsForUser(matchingUser, deptsToCheck);
        const effectiveUserDept =
          authUnits.length > 0 && inputEmail !== "gokhan.eroglu@gmail.com"
            ? authUnits.join(", ")
            : (matchingUser.department || "");
        setIsPasscodeAuthed(true);
        localStorage.setItem("dof_admin_passcode_authed", "true");
        localStorage.setItem("dof_admin_authed_email", inputEmail);
        localStorage.setItem("dof_admin_passcode", passcode);
        localStorage.setItem("dof_admin_user_role", matchingUser.role || "editor");
        localStorage.setItem("dof_admin_user_dept", effectiveUserDept);
        localStorage.setItem("dof_admin_user_can_see_all", matchingUser.canSeeAllDofs ? "true" : "false");
        if (matchingUser.id) localStorage.setItem("dof_admin_user_id", matchingUser.id);
        localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify(authUnits));
        setActivePanelUser({ ...matchingUser, department: effectiveUserDept });

        if (isMobileDevice) {
          if (onNavigate) {
            onNavigate("portal");
          }
          window.dispatchEvent(new CustomEvent("dof_navigate", { detail: "portal" }));
        }
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
        // Birim yetkisi yalnızca Birim Tanımlama ekranından yönetilir; mevcut birim eşleşmesi korunur
        const syncedUnits = getAuthorizedDepartmentsForUser(selectedUser, departments);
        const syncedDepartment =
          syncedUnits.length > 0
            ? syncedUnits.join(", ")
            : normalizeUnitText(selectedUser.department) === "tüm birimler"
            ? "Tüm Birimler"
            : "";

        await updatePanelUser(selectedUser.id, {
          email: userFormEmail.trim(),
          name: userFormName.trim(),
          role: userFormRole,
          password: userFormPassword.trim(),
          department: syncedDepartment,
          canSeeAllDofs: userFormCanSeeAllDofs,
          canEditDof: userFormCanEditDof,
          isActive: userFormIsActive,
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
          department: "",
          canSeeAllDofs: userFormCanSeeAllDofs,
          canEditDof: userFormCanEditDof,
          isActive: userFormIsActive,
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
    setUserFormCanSeeAllDofs(!!userToEdit.canSeeAllDofs);
    setUserFormCanEditDof(!!userToEdit.canEditDof);
    setUserFormIsActive(userToEdit.isActive !== false);
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
    setUserFormCanSeeAllDofs(false);
    setUserFormCanEditDof(false);
    setUserFormIsActive(true);
    setUserFormError(null);
    setIsUserFormOpen(false);
  };

  const handleResetDeptForm = () => {
    setSelectedDept(null);
    setDeptFormName("");
    setDeptFormOrder(departments.length + 1);
    setDeptFormIsActive(true);
    setDeptFormResponsibleEmail("");
    setDeptFormIsCustomQr(false);
    setDeptFormDirectReferral(false);
    setDeptFormReferralUserIds([]);
    setDeptFormUserRoles({});
    setDeptFormError(null);
    setDeptFormSuccess(false);
    setPosterTitle("DÖF BİLDİRİM FORMU");
  };

  const handleEditDept = (dept: Department) => {
    setSelectedDept(dept);
    setDeptFormName(dept.name);
    setDeptFormOrder(typeof dept.order === "number" && !isNaN(dept.order) ? dept.order : 1);
    setDeptFormIsActive(dept.isActive !== false);
    setDeptFormResponsibleEmail(dept.responsibleEmail || "");
    setDeptFormIsCustomQr(dept.isCustomQr || false);
    setDeptFormDirectReferral(dept.directReferral || false);

    const matchedIds = panelUsers
      .filter((u) => u.id && isUserAssignedToDepartment(u, dept))
      .map((u) => u.id!);
    const explicitIds = Array.isArray(dept.referralUserIds)
      ? dept.referralUserIds
      : dept.referralUserId
      ? [dept.referralUserId]
      : [];
    const combinedIds = Array.from(new Set([...explicitIds, ...matchedIds]));
    setDeptFormReferralUserIds(combinedIds);

    const initialRoles: Record<string, string> = {};
    panelUsers.forEach((u) => {
      if (u.id) initialRoles[u.id] = u.role || "editor";
    });
    setDeptFormUserRoles(initialRoles);

    setDeptFormError(null);
    setDeptFormSuccess(false);
    setPosterTitle(`${dept.name.toUpperCase()} DÖF BİLDİRİM FORMU`);
  };

  const handleToggleDeptStatus = async (dept: Department) => {
    if (!dept.id) return;
    try {
      const { updateDepartment } = await import("../lib/db");
      const currentActive = dept.isActive !== false;
      await updateDepartment(dept.id, { isActive: !currentActive });
      await fetchAllDepartments();
    } catch (err) {
      console.error("Birim durumu güncellenemedi:", err);
    }
  };

  const syncUsersWithDepartments = async (
    nextDepartments: Department[],
    updatedRoleMap?: Record<string, string>,
    assignedUserIdsInEditedDept?: string[]
  ) => {
    const updates: Promise<void>[] = [];
    panelUsers.forEach((u) => {
      if (!u.id) return;
      const emailNorm = normalizeUnitText(u.email);
      const isSuperAccount = emailNorm === "gokhan.eroglu@gmail.com";
      const nextUnits = getAuthorizedDepartmentsForUser(u, nextDepartments);
      let nextDeptStr = nextUnits.join(", ");
      if (!nextDeptStr) {
        if (isSuperAccount || (u.role === "admin" && normalizeUnitText(u.department) === "tüm birimler")) {
          nextDeptStr = "Tüm Birimler";
        } else {
          nextDeptStr = "";
        }
      }

      const desiredRole =
        !isSuperAccount &&
        assignedUserIdsInEditedDept?.includes(u.id) &&
        updatedRoleMap?.[u.id]
          ? (updatedRoleMap[u.id] as PanelUserRole)
          : u.role;

      const deptChanged = nextDeptStr !== (u.department || "");
      const roleChanged = desiredRole !== u.role;

      if (deptChanged || roleChanged) {
        updates.push(
          updatePanelUser(u.id, {
            ...(deptChanged ? { department: nextDeptStr } : {}),
            ...(roleChanged ? { role: desiredRole } : {}),
          })
        );
      }

      if (activePanelUser?.id === u.id || (activePanelUser?.email && normalizeUnitText(activePanelUser.email) === emailNorm)) {
        if (nextUnits.length > 0 && !isSuperAccount) {
          localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify(nextUnits));
          localStorage.setItem("dof_admin_user_dept", nextDeptStr);
        } else if (!isSuperAccount) {
          localStorage.setItem("dof_admin_user_authorized_depts", JSON.stringify([]));
          localStorage.setItem("dof_admin_user_dept", nextDeptStr);
        }
        if (roleChanged) {
          localStorage.setItem("dof_admin_user_role", desiredRole);
        }
      }
    });

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptFormError(null);
    setDeptFormSuccess(false);

    if (!deptFormName.trim()) {
      setDeptFormError("Lütfen birim adını doldurun.");
      return;
    }

    setIsDeptSaving(true);
    try {
      const { createDepartment, updateDepartment } = await import("../lib/db");

      const cleanName = deptFormName.trim();
      const matchedUsers = panelUsers.filter((u) => u.id && deptFormReferralUserIds.includes(u.id));
      const responsibleNames = matchedUsers.map((u) => u.name).filter(Boolean);
      const responsibleEmails = matchedUsers.map((u) => u.email).filter(Boolean);

      const responsibleEmail = responsibleEmails.join(", ");
      const responsibleName = responsibleNames.length > 0 ? responsibleNames.join(", ") : (deptFormDirectReferral ? `${cleanName} Birimi` : "");

      const parsedOrder = typeof deptFormOrder === "number" ? deptFormOrder : parseInt(String(deptFormOrder).trim(), 10);

      const deptData = {
        name: cleanName,
        order: !isNaN(parsedOrder) ? parsedOrder : 999,
        isActive: deptFormIsActive,
        isCustomQr: deptFormIsCustomQr,
        directReferral: deptFormDirectReferral,
        referralUserId: deptFormReferralUserIds[0] || "",
        referralUserIds: deptFormReferralUserIds,
        responsibleEmail,
        responsibleName,
        responsibleEmails,
        responsibleNames,
      };

      let savedDeptId = selectedDept?.id;
      if (selectedDept?.id) {
        await updateDepartment(selectedDept.id, deptData);
        setDeptFormSuccess(true);
      } else {
        const exists = departments.some(
          (d) => normalizeUnitText(d.name) === normalizeUnitText(cleanName)
        );
        if (exists) {
          setDeptFormError("Bu birim zaten tanımlanmış.");
          setIsDeptSaving(false);
          return;
        }

        savedDeptId = await createDepartment(deptData);
        setDeptFormSuccess(true);
      }

      const freshDepartments = await listDepartments();
      const updatedDepartments =
        freshDepartments.length > 0
          ? freshDepartments
          : selectedDept?.id
          ? departments.map((d) => (d.id === selectedDept.id ? { ...d, ...deptData } : d))
          : [...departments, { id: savedDeptId, ...deptData } as Department];

      await syncUsersWithDepartments(updatedDepartments, deptFormUserRoles, deptFormReferralUserIds);

      handleResetDeptForm();
      await Promise.all([fetchAllDepartments(), fetchAllUsers()]);
      setTimeout(() => setDeptFormSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setDeptFormError("İşlem gerçekleştirilirken bir hata oluştu.");
    } finally {
      setIsDeptSaving(false);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!window.confirm("Bu birimi silmek istediğinize emin misiniz?")) {
      return;
    }
    try {
      const { deleteDepartment } = await import("../lib/db");
      await deleteDepartment(id);
      if (selectedDept?.id === id) {
        handleResetDeptForm();
      }
      const remainingDepts = departments.filter((d) => d.id !== id);
      await syncUsersWithDepartments(remainingDepts);
      await Promise.all([fetchAllDepartments(), fetchAllUsers()]);
    } catch (err) {
      console.error(err);
      alert("Birim silinirken bir hata oluştu.");
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
    localStorage.removeItem("dof_admin_user_id");
    localStorage.removeItem("dof_admin_user_authorized_depts");
    localStorage.removeItem("dof_admin_user_can_see_all");
    setActivePanelUser(null);
    await signOut(auth);
    setIsPasscodeAuthed(false);
    setPasscode("");
    setSelectedDof(null);
    setAiResult(null);
    window.location.reload();
  };

  const activeUserAuthorizedUnitNames = useMemo(() => {
    return getAuthorizedDepartmentsForUser(activePanelUser, departments);
  }, [activePanelUser, departments]);

  const activeUserAuthorizedUnitLabel = useMemo(() => {
    if (activeUserAuthorizedUnitNames.length > 0) {
      return activeUserAuthorizedUnitNames.join(", ");
    }
    return activePanelUser?.department || "";
  }, [activeUserAuthorizedUnitNames, activePanelUser?.department]);

  const activeUserAuthorizedUnits = useMemo(() => {
    const set = new Set<string>();
    activeUserAuthorizedUnitNames.forEach((name) => {
      const norm = normalizeUnitText(name);
      if (norm && norm !== "tüm birimler") set.add(norm);
    });
    return set;
  }, [activeUserAuthorizedUnitNames]);

  const isDofAssignedToActiveUser = (d: DofForm) => {
    const norm = (s?: string) => (s || "").trim().toLocaleLowerCase("tr-TR");
    const uId = activePanelUser?.id;
    const uEmail = norm(activePanelUser?.email);
    if (uId && (d.assignedUserId === uId || (Array.isArray(d.assignedUserIds) && d.assignedUserIds.includes(uId)))) {
      return true;
    }
    if (
      uEmail &&
      ((d.assignedUserEmail && norm(d.assignedUserEmail) === uEmail) ||
        (Array.isArray(d.assignedUserEmails) && d.assignedUserEmails.some((e) => norm(e) === uEmail)))
    ) {
      return true;
    }
    if (d.assignedUnit && activeUserAuthorizedUnits.has(norm(d.assignedUnit))) {
      return true;
    }
    return false;
  };

  // Birim kullanıcısı (örn: sahin@gmail.com) KYS kontrol paneli olarak dashboard'da ve listelerde
  // sadece kendi birimine gelen bildirimleri ve DÖF'leri görür.
  // Yetkisi olmayan hiç kimse diğer birimlerin bilgilerini göremez.
  const visibleDofs = useMemo(() => {
    if (isSystemAdmin || activeRolePerms.dofScope === "all" || activePanelUser?.canSeeAllDofs) return dofs;
    return dofs.filter((d) => isUserAuthorizedForDof(activePanelUser, d));
  }, [dofs, activePanelUser, isSystemAdmin, activeRolePerms.dofScope]);

  // Filter unique departments for filter dropdown
  const uniqueDepartments = (isSystemAdmin || activeRolePerms.dofScope === "all" || activePanelUser?.canSeeAllDofs)
    ? Array.from(new Set(dofs.map((d) => d.department).filter(Boolean)))
    : Array.from(new Set(visibleDofs.map((d) => d.department).filter(Boolean)));

  // Filtered list
  const filteredDofs = visibleDofs.filter((dof) => {
    const matchesSearch = 
      dof.refNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.reporterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dof.description.toLowerCase().includes(searchTerm.toLowerCase());

    const st = (dof.status || "").toLowerCase().trim();
    const isResolved = st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı";
    const isRejected = st === "reddedildi" || st === "iptal";
    const isOpen = st === "yeni" || st === "inceleniyor";

    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "bekleyen" || statusFilter === "acik"
        ? isOpen
        : statusFilter === "kapali"
        ? (isResolved || (isSystemAdmin && isRejected))
        : (statusFilter === "iptal" || statusFilter === "reddedildi")
        ? (isSystemAdmin && isRejected)
        : (statusFilter === "tamamlandi" || statusFilter === "cozuldu")
        ? isResolved
        : st === statusFilter);
    const matchesType = typeFilter === "all" || dof.type === typeFilter;
    const matchesDept = deptFilter === "all" || dof.department === deptFilter;

    const matchesReferral = 
      referralFilter === "all" ||
      (referralFilter === "havuz" && !dof.assignedUserId && !dof.assignedUnit && !(dof.assignedUserIds?.length)) ||
      (referralFilter === "bana" && activePanelUser && isDofAssignedToActiveUser(dof)) ||
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

    const matchesFolder = 
      folderFilter === "all" ||
      (folderFilter === "unassigned" ? !dof.folderId : dof.folderId === folderFilter);

    return matchesSearch && matchesStatus && matchesType && matchesDept && matchesReferral && matchesDate && matchesFolder;
  });

  // Stats calculation - strictly based on visibleDofs
  const totalCount = visibleDofs.length;
  const newCount = visibleDofs.filter((d) => (d.status || "").toLowerCase().trim() === "yeni").length;
  const reviewCount = visibleDofs.filter((d) => (d.status || "").toLowerCase().trim() === "inceleniyor").length;
  const resolvedCount = visibleDofs.filter((d) => {
    const st = (d.status || "").toLowerCase().trim();
    return st === "cozuldu" || st === "çözüldü" || st === "tamamlandi" || st === "tamamlandı";
  }).length;
  const rejectedCount = isSystemAdmin ? visibleDofs.filter((d) => {
    const st = (d.status || "").toLowerCase().trim();
    return st === "reddedildi" || st === "iptal";
  }).length : 0;
  const openCount = visibleDofs.filter((d) => {
    const st = (d.status || "").toLowerCase().trim();
    return st === "yeni" || st === "inceleniyor";
  }).length;
  const closedCount = isSystemAdmin ? (resolvedCount + rejectedCount) : resolvedCount;
  const correctiveCount = visibleDofs.filter((d) => d.type === "düzeltici").length;
  const preventiveCount = visibleDofs.filter((d) => d.type === "önleyici").length;
  const myTasksCount = visibleDofs.filter((d) => isDofAssignedToActiveUser(d)).length;

  const isAdminOrEditor = isSystemAdmin || activeRolePerms.canEditDof;
  const showAllDofsTab = activeRolePerms.canViewDofs;

  // Unique list of persons involved in logs: from panelUsers + distinct actors/recipients from emailLogs
  const logPersons = useMemo(() => {
    const map = new Map<string, { email: string; name: string; role?: string }>();
    
    // Add all registered panel users
    panelUsers.forEach((u) => {
      if (u.email) {
        const key = u.email.toLowerCase().trim();
        map.set(key, { email: key, name: u.name || key.split("@")[0], role: u.role });
      }
    });

    // Add any actors or recipients from emailLogs
    emailLogs.forEach((l) => {
      if (l.actorEmail) {
        const key = l.actorEmail.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, { email: key, name: l.actorName || key.split("@")[0], role: l.actorRole });
        }
      }
      if (l.recipient) {
        const key = l.recipient.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, { email: key, name: key.split("@")[0] });
        }
      }
      if (l.to) {
        const key = l.to.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, { email: key, name: key.split("@")[0] });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [panelUsers, emailLogs]);

  // Filtered email and audit logs based on user, type, and search term
  const filteredEmailLogs = useMemo(() => {
    return emailLogs.filter((log) => {
      // 1. User/Person filter
      if (logUserFilter !== "all") {
        const target = logUserFilter.toLowerCase().trim();
        const actorEmailMatch = (log.actorEmail || "").toLowerCase().trim() === target;
        const actorNameMatch = (log.actorName || "").toLowerCase().trim() === target;
        const recipientMatch = (log.recipient || "").toLowerCase().trim() === target;
        const toMatch = (log.to || "").toLowerCase().trim() === target;
        const bodyMatch = (log.body || "").toLowerCase().includes(target);
        if (!actorEmailMatch && !actorNameMatch && !recipientMatch && !toMatch && !bodyMatch) {
          return false;
        }
      }

      // 2. Type filter
      if (logTypeFilter !== "all") {
        if (logTypeFilter === "dof_deleted") {
          if (log.type !== "dof_deleted") return false;
        } else if (logTypeFilter === "notifications") {
          if (log.type === "dof_deleted") return false;
        } else if (logTypeFilter === "new_dof") {
          if (log.type !== "new_dof" && log.type !== "dof_created_notification") return false;
        } else if (logTypeFilter === "status_change") {
          if (log.type !== "status_update" && log.type !== "dof_status_changed_notification") return false;
        }
      }

      // 3. Search term
      if (logSearchTerm.trim()) {
        const q = logSearchTerm.toLowerCase().trim();
        const matchesRef = (log.dofRefNo || log.refNo || "").toLowerCase().includes(q);
        const matchesSubject = (log.subject || "").toLowerCase().includes(q);
        const matchesActor = (log.actorName || "").toLowerCase().includes(q) || (log.actorEmail || "").toLowerCase().includes(q);
        const matchesRecipient = (log.recipient || log.to || "").toLowerCase().includes(q);
        const matchesBody = (log.body || "").toLowerCase().includes(q);
        if (!matchesRef && !matchesSubject && !matchesActor && !matchesRecipient && !matchesBody) {
          return false;
        }
      }

      return true;
    });
  }, [emailLogs, logUserFilter, logTypeFilter, logSearchTerm]);

  // Count deleted DÖFs in logs
  const deletedLogsCount = useMemo(() => {
    return emailLogs.filter((l) => l.type === "dof_deleted").length;
  }, [emailLogs]);

  // Filtered panel users for Yetkili Personel Listesi
  const filteredPanelUsers = useMemo(() => {
    return panelUsers.filter((u) => {
      const userUnits = getAuthorizedDepartmentsForUser(u, departments);

      // 1. Department Filter (Birim Tanımlama & Yetkili Sorumlu eşleşmesi)
      if (userListDeptFilter !== "all") {
        if (userListDeptFilter === "__unassigned__") {
          if (userUnits.length > 0 || normalizeUnitText(u.department) === "tüm birimler") {
            return false;
          }
        } else {
          const targetNorm = normalizeUnitText(userListDeptFilter);
          if (!userUnits.some((unitName) => normalizeUnitText(unitName) === targetNorm)) {
            return false;
          }
        }
      }
      // 2. Role Filter
      if (userListRoleFilter !== "all") {
        if (u.role !== userListRoleFilter) return false;
      }
      // 3. Active / CanEdit Filter
      if (userListActiveFilter === "active") {
        if (u.isActive === false) return false;
      } else if (userListActiveFilter === "inactive") {
        if (u.isActive !== false) return false;
      } else if (userListActiveFilter === "can_edit") {
        if (!u.canEditDof) return false;
      }
      // 4. Search (Türkçe karakter duyarlı)
      if (userListSearch.trim()) {
        const q = normalizeUnitText(userListSearch);
        const matchesName = normalizeUnitText(u.name).includes(q);
        const matchesEmail = normalizeUnitText(u.email).includes(q);
        const matchesDept = normalizeUnitText(userUnits.join(" ") || u.department).includes(q);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }
      return true;
    });
  }, [panelUsers, departments, userListDeptFilter, userListRoleFilter, userListActiveFilter, userListSearch]);


  const filteredWorkflowDofs = visibleDofs.filter((d) => {
    // If the user is not an admin/editor, they can only see their own / their unit's tasks
    if (!isAdminOrEditor) {
      return isDofAssignedToActiveUser(d);
    }

    // If admin/editor, filter based on workflowDeptFilter
    if (workflowDeptFilter === "me") {
      return isDofAssignedToActiveUser(d);
    } else if (workflowDeptFilter === "all") {
      return true;
    } else {
      // Specific unit selected
      const targetNorm = workflowDeptFilter.toLowerCase().trim();
      return (
        d.department?.toLowerCase().trim() === targetNorm ||
        d.assignedUnit?.toLowerCase().trim() === targetNorm
      );
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
      drawMetaRow("Birim", dof.department || "-", "Sorumlu", dof.assignedUserName || "Atanmamis", y);
      y += 8;
      drawMetaRow("Bildiren Kisi", getMaskedReporterName(dof.reporterName), "Bildiren Iletisim", getMaskedReporterContact(dof.reporterContact), y);
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
      const defaultTargetDate = dof.targetCompletionDate || computeTargetCompletionDate(dof.createdAt, dof.type);
      setStep1TargetDate(defaultTargetDate);
      setStep1AssigneeId(
        dof.assignedUnit && (!dof.assignedUserId || dof.assignedUserId.startsWith("unit:"))
          ? `unit:${dof.assignedUnit}`
          : (dof.assignedUserId || (dof.assignedUnit ? `unit:${dof.assignedUnit}` : ""))
      );
      setStep1ReferralNote(dof.referralNote || "");
      
      setStep2RiskLevel(dof.riskLevel || "Orta");
      setStep2ForwardAssigneeId("");
      setStep2ResultNote(dof.referralResultNote || "");
      const defaultDays = dof.completionDays || (dof.type === "önleyici" ? preventiveDaysSetting : correctiveDaysSetting);
      setStep2CompletionDays(defaultDays);
      const rc = dof.rootCauses && Array.isArray(dof.rootCauses)
        ? [dof.rootCauses[0] || "", dof.rootCauses[1] || "", dof.rootCauses[2] || "", dof.rootCauses[3] || "", dof.rootCauses[4] || ""]
        : ["", "", "", "", ""];
      setStep2RootCauses(rc);
      setStep3ProgressUpdate("");
      setStep3BeforeImage(dof.beforeImageUrl || dof.imageUrl || "");
      setStep3AfterImage(dof.afterImageUrl || "");
      setSelectedFolderForClose(dof.folderId || "");

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
      setStep3BeforeImage("");
      setStep3AfterImage("");
      setSelectedFolderForClose("");
      setActiveGuideStep(1);
    }
  };

  const handleAssignDofFolder = async (dofId: string, targetFolderId: string) => {
    try {
      const targetFolder = folders.find(f => f.id === targetFolderId);
      const targetFolderName = targetFolder ? targetFolder.name : "";
      await moveDofsToFolder([dofId], targetFolderId, targetFolderName);
      
      setDofs(prev => prev.map(d => d.id === dofId ? { ...d, folderId: targetFolderId, folderName: targetFolderName } : d));
      if (selectedDof?.id === dofId) {
        setSelectedDof(prev => prev ? { ...prev, folderId: targetFolderId, folderName: targetFolderName } : null);
        setSelectedFolderForClose(targetFolderId);
      }
      setWorkflowNotice(targetFolder ? `✓ DÖF "${targetFolder.name}" klasörüne taşındı.` : "✓ DÖF klasörden çıkarıldı.");
      setTimeout(() => setWorkflowNotice(null), 3000);
    } catch (err) {
      console.error(err);
      alert("Klasör atanırken bir hata oluştu.");
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedDofIds.length === filteredDofs.length && filteredDofs.length > 0) {
      setSelectedDofIds([]);
    } else {
      setSelectedDofIds(filteredDofs.map(d => d.id).filter(Boolean) as string[]);
    }
  };

  const handleToggleSelectDof = (id: string) => {
    setSelectedDofIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkMoveToFolder = async (targetFolderId: string) => {
    if (!targetFolderId || selectedDofIds.length === 0) return;
    const targetFolder = folders.find(f => f.id === targetFolderId);
    if (!targetFolder) return;

    setIsBulkMoving(true);
    try {
      await moveDofsToFolder(selectedDofIds, targetFolder.id!, targetFolder.name);
      setDofs(prev => prev.map(d => {
        if (selectedDofIds.includes(d.id!)) {
          return { ...d, folderId: targetFolder.id, folderName: targetFolder.name };
        }
        return d;
      }));
      setWorkflowNotice(`✓ ${selectedDofIds.length} adet DÖF "${targetFolder.name}" klasörüne başarıyla taşındı.`);
      setSelectedDofIds([]);
      setBulkTargetFolderId("");
      setTimeout(() => setWorkflowNotice(null), 4000);
    } catch (err) {
      console.error(err);
      alert("Toplu klasöre taşıma işlemi sırasında hata oluştu.");
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkRemoveFromFolder = async () => {
    if (selectedDofIds.length === 0) return;
    setIsBulkMoving(true);
    try {
      await removeDofsFromFolder(selectedDofIds);
      setDofs(prev => prev.map(d => {
        if (selectedDofIds.includes(d.id!)) {
          return { ...d, folderId: "", folderName: "" };
        }
        return d;
      }));
      setWorkflowNotice(`✓ ${selectedDofIds.length} adet DÖF klasörden çıkarıldı.`);
      setSelectedDofIds([]);
      setTimeout(() => setWorkflowNotice(null), 4000);
    } catch (err) {
      console.error(err);
      alert("Klasörden çıkarma işlemi sırasında hata oluştu.");
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleMoveAllClosedToFolder = async (targetFolderId: string) => {
    if (!targetFolderId) return;
    const targetFolder = folders.find(f => f.id === targetFolderId);
    if (!targetFolder) return;
    const closedDofs = visibleDofs.filter(d => (d.status === "cozuldu" || (isSystemAdmin && d.status === "reddedildi")) && d.folderId !== targetFolderId);
    if (closedDofs.length === 0) {
      alert("Bu klasörde olmayan kapatılmış/çözülmüş DÖF kaydı bulunamadı.");
      return;
    }
    const closedIds = closedDofs.map(d => d.id!).filter(Boolean);
    setIsBulkMoving(true);
    try {
      await moveDofsToFolder(closedIds, targetFolder.id!, targetFolder.name);
      setDofs(prev => prev.map(d => {
        if (closedIds.includes(d.id!)) {
          return { ...d, folderId: targetFolder.id, folderName: targetFolder.name };
        }
        return d;
      }));
      setWorkflowNotice(`✓ Kapatılan ${closedIds.length} adet DÖF "${targetFolder.name}" klasörüne başarıyla taşındı.`);
      setTimeout(() => setWorkflowNotice(null), 4000);
    } catch (err) {
      console.error(err);
      alert("Kapatılan DÖF'ler klasöre taşınırken hata oluştu.");
    } finally {
      setIsBulkMoving(false);
    }
  };

  const resolveUnitMembers = (unitName: string) => {
    const unitNorm = unitName.toLowerCase().trim();
    const matchedDept = departments.find((d) => d.name.toLowerCase().trim() === unitNorm);
    return panelUsers.filter((u) => {
      if (u.isActive === false) return false;
      const inUserDept = (u.department || "").toLowerCase().trim() === unitNorm;
      const inReferralIds =
        !!u.id &&
        ((Array.isArray(matchedDept?.referralUserIds) && matchedDept!.referralUserIds!.includes(u.id)) ||
          matchedDept?.referralUserId === u.id);
      const inRespEmails =
        !!u.email &&
        ((Array.isArray(matchedDept?.responsibleEmails) &&
          matchedDept!.responsibleEmails!.some((e) => e.toLowerCase().trim() === u.email.toLowerCase().trim())) ||
          matchedDept?.responsibleEmail?.toLowerCase().trim() === u.email.toLowerCase().trim());
      return inUserDept || inReferralIds || inRespEmails;
    });
  };

  const handleWorkflowStep1Submit = async () => {
    if (!selectedDof?.id) return;
    if (!step1AssigneeId) {
      alert("Lütfen havale edilecek ilgili birimi veya sorumlu kişiyi seçin.");
      return;
    }
    setIsSaving(true);
    try {
      let updates: Partial<DofForm>;

      if (step1AssigneeId.startsWith("unit:")) {
        const unitName = step1AssigneeId.replace(/^unit:/, "").trim();
        const matchedDept = departments.find((d) => d.name.toLowerCase().trim() === unitName.toLowerCase().trim());
        const unitUsers = resolveUnitMembers(unitName);
        const unitUserIds = unitUsers.map((u) => u.id).filter(Boolean) as string[];
        const unitUserEmails = unitUsers.map((u) => u.email).filter(Boolean);
        const unitUserNames = unitUsers.map((u) => u.name).filter(Boolean);

        updates = {
          department: unitName,
          user_department: unitName,
          assignedUnit: unitName,
          assignedUserId: unitUserIds.length === 1 ? unitUserIds[0] : `unit:${matchedDept?.id || unitName}`,
          assignedUserIds: unitUserIds,
          assignedUserName: unitUserNames.length > 0 ? `${unitName} (${unitUserNames.join(", ")})` : `${unitName} Birimi`,
          assignedUserEmail: unitUserEmails.join(", "),
          assignedUserEmails: unitUserEmails,
          riskLevel: step1RiskLevel,
          targetCompletionDate: step1TargetDate,
          referralNote: step1ReferralNote.trim(),
          referralStatus: "islem_devam_ediyor" as const,
          status: "inceleniyor" as const,
          referralUpdatedAt: new Date().toISOString(),
        };
      } else {
        const matchedUser = panelUsers.find(u => u.id === step1AssigneeId);
        if (!matchedUser) {
          alert("Seçilen sorumlu veya birim bulunamadı.");
          setIsSaving(false);
          return;
        }
        const matchedUnits = getAuthorizedDepartmentsForUser(matchedUser, departments);
        const targetUnit = matchedUnits.find((un) => normalizeUnitText(un) === normalizeUnitText(selectedDof.department)) || matchedUnits[0] || selectedDof.department;
        updates = {
          department: targetUnit,
          user_department: targetUnit,
          assignedUnit: targetUnit,
          assignedUserId: matchedUser.id,
          assignedUserIds: matchedUser.id ? [matchedUser.id] : [],
          assignedUserName: matchedUser.name,
          assignedUserEmail: matchedUser.email,
          assignedUserEmails: matchedUser.email ? [matchedUser.email] : [],
          riskLevel: step1RiskLevel,
          targetCompletionDate: step1TargetDate,
          referralNote: step1ReferralNote.trim(),
          referralStatus: "islem_devam_ediyor" as const,
          status: "inceleniyor" as const,
          referralUpdatedAt: new Date().toISOString(),
        };
      }

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();
      
      setSelectedDof({
        ...selectedDof,
        ...updates
      });
      
      setActiveGuideStep(2);
      alert("DÖF başarıyla incelendi ve ilgili birime/sorumluya havale edildi.");
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
      // 1. Check if user wants to forward to another unit or person
      if (step2ForwardAssigneeId) {
        let updates: Partial<DofForm>;

        if (step2ForwardAssigneeId.startsWith("unit:")) {
          const unitName = step2ForwardAssigneeId.replace(/^unit:/, "").trim();
          const matchedDept = departments.find((d) => d.name.toLowerCase().trim() === unitName.toLowerCase().trim());
          const unitUsers = resolveUnitMembers(unitName);
          const unitUserIds = unitUsers.map((u) => u.id).filter(Boolean) as string[];
          const unitUserEmails = unitUsers.map((u) => u.email).filter(Boolean);
          const unitUserNames = unitUsers.map((u) => u.name).filter(Boolean);

          updates = {
            department: unitName,
            user_department: unitName,
            assignedUnit: unitName,
            assignedUserId: unitUserIds.length === 1 ? unitUserIds[0] : `unit:${matchedDept?.id || unitName}`,
            assignedUserIds: unitUserIds,
            assignedUserName: unitUserNames.length > 0 ? `${unitName} (${unitUserNames.join(", ")})` : `${unitName} Birimi`,
            assignedUserEmail: unitUserEmails.join(", "),
            assignedUserEmails: unitUserEmails,
            riskLevel: step2RiskLevel,
            referralNote: `Başka birime devredildi (${unitName}). Önceki açıklama: ${step2ResultNote || ""}`,
            referralUpdatedAt: new Date().toISOString(),
          };
        } else {
          const matchedUser = panelUsers.find(u => u.id === step2ForwardAssigneeId);
          if (!matchedUser) {
            alert("Yönlendirilecek yeni birim veya sorumlu bulunamadı.");
            setIsSaving(false);
            return;
          }

          const matchedUnits = getAuthorizedDepartmentsForUser(matchedUser, departments);
          const targetUnit = matchedUnits.find((un) => normalizeUnitText(un) === normalizeUnitText(selectedDof.department)) || matchedUnits[0] || selectedDof.department;
          updates = {
            department: targetUnit,
            user_department: targetUnit,
            assignedUnit: targetUnit,
            assignedUserId: matchedUser.id,
            assignedUserIds: matchedUser.id ? [matchedUser.id] : [],
            assignedUserName: matchedUser.name,
            assignedUserEmail: matchedUser.email,
            assignedUserEmails: matchedUser.email ? [matchedUser.email] : [],
            riskLevel: step2RiskLevel,
            referralNote: `Başka birime devredildi (${targetUnit}). Önceki açıklama: ${step2ResultNote || ""}`,
            referralUpdatedAt: new Date().toISOString(),
          };
        }

        await updateDof(selectedDof.id, updates);
        await fetchAllDofs();

        setSelectedDof({
          ...selectedDof,
          ...updates
        });

        setStep2ForwardAssigneeId("");
        alert("DÖF başarıyla başka bir birime / sorumluya devredildi.");
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

      const updates: any = {
        referralResultNote: updatedNote,
        beforeImageUrl: step3BeforeImage || null,
        afterImageUrl: step3AfterImage || null,
        referralUpdatedAt: new Date().toISOString(),
      };
      if (step3BeforeImage && !selectedDof.imageUrl) {
        updates.imageUrl = step3BeforeImage;
      }

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates
      });

      setStep3ProgressUpdate("");
      alert("Uygulama aşaması güncelleme notu ve fotoğraflar başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      alert("Uygulama notu kaydedilirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep3Photos = async () => {
    if (!selectedDof?.id) return;
    setIsPhotoSaving(true);
    try {
      const updates: any = {
        beforeImageUrl: step3BeforeImage || null,
        afterImageUrl: step3AfterImage || null,
        referralUpdatedAt: new Date().toISOString(),
      };
      if (step3BeforeImage && !selectedDof.imageUrl) {
        updates.imageUrl = step3BeforeImage;
      }

      await updateDof(selectedDof.id, updates);
      await fetchAllDofs();

      setSelectedDof({
        ...selectedDof,
        ...updates,
      });

      alert("Önce ve Sonra fotoğrafları başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      alert("Fotoğraflar kaydedilirken hata oluştu.");
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "before" | "after") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingPhoto(true);
    try {
      const compressed = await compressImageToBase64(file, 900, 0.75);
      if (target === "before") {
        setStep3BeforeImage(compressed);
      } else {
        setStep3AfterImage(compressed);
      }
    } catch (err) {
      console.error(err);
      alert("Fotoğraf işlenirken hata oluştu.");
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = "";
    }
  };

  const handleWorkflowStep4Complete = async () => {
    if (!selectedDof?.id) return;
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const targetFolderId = selectedFolderForClose || selectedDof.folderId || "";
      const targetFolderName = targetFolderId ? (folders.find(f => f.id === targetFolderId)?.name || selectedDof.folderName || "") : "";

      const updates: any = {
        status: "cozuldu" as const,
        referralStatus: "yapildi" as const,
        referralUpdatedAt: nowIso,
        currentStep: 8,
        adminFeedback: selectedDof.adminFeedback || editFeedback || "DÖF başarıyla tamamlandı ve süreç kapatıldı.",
        updatedAt: nowIso,
        folderId: targetFolderId,
        folderName: targetFolderName,
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
      const folderNoticeMsg = targetFolderName ? ` ve "${targetFolderName}" klasörüne taşındı.` : ".";
      setWorkflowNotice(`✓ DÖF başarıyla tamamlandı olarak işaretlendi${folderNoticeMsg}`);
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
      const targetFolderId = selectedFolderForClose !== undefined ? selectedFolderForClose : (selectedDof.folderId || "");
      const targetFolderName = targetFolderId ? (folders.find(f => f.id === targetFolderId)?.name || "") : "";

      const updates: any = {
        status: editStatus,
        adminFeedback: editFeedback,
        folderId: targetFolderId,
        folderName: targetFolderName,
      };

      await updateDof(selectedDof.id, updates);
      setSaveSuccess(true);
      // Refresh list
      await fetchAllDofs();
      // Update selected
      setSelectedDof({
        ...selectedDof,
        ...updates,
      });
      setDofs(prev => prev.map(d => d.id === selectedDof.id ? { ...d, ...updates } : d));
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
        userRole: getRoleDisplayName(activePanelUser?.role, accessRoles),
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
                  Kalite yöneticisi olarak bu bildirim için risk analiz puanını belirleyin, bir hedef tamamlanma tarihi seçin ve uygunsuzluğu çözmek üzere ilgili birime (veya sorumlu kişiye) havale edin.
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
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Birim Son Tamamlanma Tarihi (Hedef Tarih)</label>
                    <input
                      type="date"
                      value={step1TargetDate}
                      onChange={(e) => setStep1TargetDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Havale Edilecek İlgili Birim / Sorumlu *</label>
                    <select
                      value={step1AssigneeId}
                      onChange={(e) => setStep1AssigneeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                    >
                      <option value="">-- Birim veya Sorumlu Seçin --</option>
                      <optgroup label="🏢 Doğrudan Birime Havale Et (Birimdeki Tüm Yetkililer Görür)">
                        {sortedDepartments
                          .filter((dept) => dept.isActive !== false)
                          .map((dept) => (
                            <option key={`unit-${dept.id || dept.name}`} value={`unit:${dept.name}`}>
                              🏢 {dept.name} Birimi
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="👤 Tekil Sorumlu Kişiye Havale Et">
                        {panelUsers
                          .filter(u => u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.department || "Birim Yok"}) - {u.email}
                            </option>
                          ))}
                      </optgroup>
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
                <span className="font-extrabold text-amber-950 block text-sm">Aksiyon Planı, Risk Revizesi & Başka Birime Yönlendirme</span>
                <p className="text-slate-500 leading-relaxed">
                  İlgili birim olarak gelen DÖF'ü inceledikten sonra risk seviyesini revize edebilir, işi başka bir birime devredebilir veya çözüm sürecine ilişkin aksiyon planınızı ve tamamlanma süresini girerek işi başlatabilirsiniz.
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
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Başka Birime / Sorumluya Gönder (İsteğe Bağlı)</label>
                    <select
                      value={step2ForwardAssigneeId}
                      onChange={(e) => setStep2ForwardAssigneeId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer text-rose-700"
                    >
                      <option value="">-- Birimi Değiştirmek İçin Birim veya Kişi Seçin --</option>
                      <optgroup label="🏢 Doğrudan Başka Birime Devret">
                        {sortedDepartments
                          .filter((dept) => dept.isActive !== false && dept.name.toLowerCase().trim() !== (dof.department || "").toLowerCase().trim())
                          .map((dept) => (
                            <option key={`fwd-unit-${dept.id || dept.name}`} value={`unit:${dept.name}`}>
                              🏢 {dept.name} Birimi
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="👤 Tekil Sorumluya Devret">
                        {panelUsers
                          .filter(u => u.id !== dof.assignedUserId && u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.department || "Birim Yok"})
                            </option>
                          ))}
                      </optgroup>
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
                    {isSaving ? "Kaydediliyor..." : step2ForwardAssigneeId ? "Yeni Birime Yönlendir" : "Aksiyon Planı & Süresini Kaydet"}
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

                {/* Önce ve Sonra Fotoğrafları Ekleme / Yönetim Alanı */}
                <div className="mt-4 pt-4 border-t border-emerald-200/60 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-slate-900">
                        <Camera className="h-4 w-4 text-emerald-600" />
                        <h4 className="font-extrabold text-xs uppercase tracking-tight text-emerald-950">
                          Faaliyet Öncesi ve Sonrası Durum Fotoğrafları (Önce & Sonra)
                        </h4>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Sorunun ilk tespit edildiği durum ile çözüm sonrası durumun fotoğraflarını yükleyin. Bu fotoğraflar Yatık Kağıt Çıktısında yan yana yer alır.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLandscapeTargetDof(dof);
                          setShowLandscapeModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-bold rounded-lg text-xs transition cursor-pointer border border-indigo-200/60"
                        title="Yatık Kağıt Çıktısı Önizleme ve Yazdırma"
                        id="step3-landscape-btn"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Yatık Çıktı Al</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveStep3Photos}
                        disabled={isPhotoSaving || isCompressingPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-2xs disabled:bg-slate-300"
                        title="Fotoğrafları Kaydet"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isPhotoSaving ? "Kaydediliyor..." : "Fotoğrafları Kaydet"}</span>
                      </button>
                    </div>
                  </div>

                  {isCompressingPhoto && (
                    <div className="p-2.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-100 flex items-center gap-2 animate-pulse">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Fotoğraf optimize edilip yükleniyor, lütfen bekleyin...
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. ÖNCE FOTOĞRAFI */}
                    <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-black text-[10px] rounded uppercase tracking-wider">
                            1. ÖNCE (İlk Durum)
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">Sorun / Uygunsuzluk Hali</span>
                        </div>
                        {step3BeforeImage && (
                          <button
                            type="button"
                            onClick={() => setStep3BeforeImage("")}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                          >
                            Kaldır
                          </button>
                        )}
                      </div>

                      {step3BeforeImage ? (
                        <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 aspect-video flex items-center justify-center">
                          <img 
                            src={step3BeforeImage} 
                            alt="Önce" 
                            className="w-full h-full object-contain max-h-44" 
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                            <label className="px-3 py-1.5 bg-white text-slate-800 text-[11px] font-bold rounded-lg shadow cursor-pointer hover:bg-slate-50">
                              Değiştir
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handlePhotoUpload(e, "before")} 
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-rose-200 hover:border-rose-400 bg-rose-50/20 hover:bg-rose-50/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition cursor-pointer min-h-[140px]">
                          <Camera className="h-7 w-7 text-rose-400" />
                          <span className="text-xs font-bold text-rose-900 text-center">
                            Önce Fotoğrafı Seç veya Çek
                          </span>
                          <span className="text-[10px] text-slate-400 text-center">
                            (Uygunsuzluğun ilk tespit edildiği hal)
                          </span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handlePhotoUpload(e, "before")} 
                          />
                        </label>
                      )}
                    </div>

                    {/* 2. SONRA FOTOĞRAFI */}
                    <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-black text-[10px] rounded uppercase tracking-wider">
                            2. SONRA (Çözülen Hal)
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">Uygulama Sonrası Durum</span>
                        </div>
                        {step3AfterImage && (
                          <button
                            type="button"
                            onClick={() => setStep3AfterImage("")}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                          >
                            Kaldır
                          </button>
                        )}
                      </div>

                      {step3AfterImage ? (
                        <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-900/5 aspect-video flex items-center justify-center">
                          <img 
                            src={step3AfterImage} 
                            alt="Sonra" 
                            className="w-full h-full object-contain max-h-44" 
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                            <label className="px-3 py-1.5 bg-white text-slate-800 text-[11px] font-bold rounded-lg shadow cursor-pointer hover:bg-slate-50">
                              Değiştir
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handlePhotoUpload(e, "after")} 
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 hover:bg-emerald-50/50 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition cursor-pointer min-h-[140px]">
                          <Camera className="h-7 w-7 text-emerald-500" />
                          <span className="text-xs font-bold text-emerald-950 text-center">
                            Sonra Fotoğrafı Seç veya Çek
                          </span>
                          <span className="text-[10px] text-slate-400 text-center">
                            (Düzeltici/önleyici faaliyet sonrası nihai durum)
                          </span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handlePhotoUpload(e, "after")} 
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between pt-3 gap-2 border-t border-emerald-100">
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
                    disabled={isSaving || (!step3ProgressUpdate.trim() && !step3BeforeImage && !step3AfterImage)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    {isSaving ? "Kaydediliyor..." : "İlerleme Notu & Fotoğrafları Kaydet"}
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

                    {/* Kapatılan DÖF Klasörü Seçimi */}
                    <div className="mt-3">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                        <FolderKanban className="h-3.5 w-3.5 text-indigo-500" />
                        Kapatılan DÖF Klasörü (Arşiv)
                      </label>
                      <select
                        value={selectedFolderForClose}
                        onChange={(e) => setSelectedFolderForClose(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500 font-semibold cursor-pointer text-xs"
                      >
                        <option value="">-- Klasör Seçilmedi (Varsayılan) --</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id}>
                            📁 {f.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        DÖF kapatıldığında doğrudan bu klasöre taşınır.
                      </span>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Nihai Geri Bildirim / Kapatma Karar Notu</label>
                    <textarea
                      rows={5}
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
    const effectiveTargetDate = dof.targetCompletionDate || computeTargetCompletionDate(dof.createdAt, dof.type);
    if (effectiveTargetDate) {
      const rem = getRemainingBusinessDays(effectiveTargetDate);
      
      if (dof.status === "cozuldu" || dof.status === "reddedildi") {
        remainingText = "Tamamlandı";
        remainingBadgeStyle = "bg-emerald-100 text-emerald-800";
      } else if (rem.isOverdue) {
        remainingText = rem.text;
        remainingBadgeStyle = "bg-rose-100 text-rose-800 font-extrabold animate-pulse";
      } else if (rem.isToday) {
        remainingText = "Bugün Son Gün!";
        remainingBadgeStyle = "bg-amber-100 text-amber-800 font-extrabold animate-pulse";
      } else {
        remainingText = rem.text;
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
    let alertDesc = "DÖF kalite birimi tarafından ön inceleme aşamasındadır.";
    let alertNext = "Bir Sonraki Adım: DÖF'ü ilgili birime / sorumlusuna havale etmeniz gerekir.";
    
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
              <RefreshCw className="h-3.5 w-3.5" /> Birim Değiştir
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
                <span className="font-bold text-slate-800 text-sm mt-0.5 block">{getMaskedReporterName(dof.reporterName)}</span>
                {dof.reporterContact && (
                  <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">{getMaskedReporterContact(dof.reporterContact)}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Kaynak Birim</span>
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

        {/* Önce & Sonra Fotoğrafları ve Görsel Kanıt */}
        {(dof.beforeImageUrl || dof.afterImageUrl || dof.imageUrl) && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-2.5">
              <div className="flex items-center gap-2">
                <Camera className="h-4.5 w-4.5 text-indigo-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Önce ve Sonra Durum Fotoğrafları (Görsel Karşılaştırma)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLandscapeTargetDof(dof);
                  setShowLandscapeModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs transition cursor-pointer border border-emerald-200"
              >
                <Printer className="h-3.5 w-3.5 text-emerald-600" /> Yatık Çıktı Al
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Önce */}
              <div className="border border-rose-200 bg-rose-50/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded uppercase">
                    1. ÖNCE (İlk Durum / Problem)
                  </span>
                  <span className="text-[10px] text-slate-400">Uygunsuzluk Tespiti</span>
                </div>
                {(dof.beforeImageUrl || dof.imageUrl) ? (
                  <div className="aspect-video bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                    <img 
                      src={dof.beforeImageUrl || dof.imageUrl} 
                      alt="Önce" 
                      className="w-full h-full object-contain max-h-48" 
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-50 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center">
                    <ImageIcon className="h-6 w-6 text-slate-300 mb-1" />
                    <span className="text-xs text-slate-400">Önce fotoğrafı henüz eklenmedi</span>
                  </div>
                )}
                {(dof.beforeImageUrl || dof.imageUrl) && (
                  <div className="flex justify-end gap-2 pt-1">
                    <a 
                      href={dof.beforeImageUrl || dof.imageUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      Büyük Önizleme
                    </a>
                  </div>
                )}
              </div>

              {/* Sonra */}
              <div className="border border-emerald-200 bg-emerald-50/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded uppercase">
                    2. SONRA (Çözülen Durum)
                  </span>
                  <span className="text-[10px] text-slate-400">Faaliyet Sonucu</span>
                </div>
                {dof.afterImageUrl ? (
                  <div className="aspect-video bg-white rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                    <img 
                      src={dof.afterImageUrl} 
                      alt="Sonra" 
                      className="w-full h-full object-contain max-h-48" 
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-50 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center p-4 text-center">
                    <ImageIcon className="h-6 w-6 text-slate-300 mb-1" />
                    <span className="text-xs text-slate-400">Sonra fotoğrafı henüz eklenmedi</span>
                  </div>
                )}
                {dof.afterImageUrl && (
                  <div className="flex justify-end gap-2 pt-1">
                    <a 
                      href={dof.afterImageUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                    >
                      Büyük Önizleme
                    </a>
                  </div>
                )}
              </div>
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
                  <td className="p-3 text-slate-700 font-semibold">{getMaskedReporterName(dof.reporterName)}</td>
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

      const matchedUnits = getAuthorizedDepartmentsForUser(matchedUser, departments);
      const targetUnit = matchedUnits.find((un) => normalizeUnitText(un) === normalizeUnitText(selectedDof.department)) || matchedUnits[0] || selectedDof.department;
      const updates = {
        department: targetUnit,
        user_department: targetUnit,
        assignedUnit: targetUnit,
        assignedUserId: matchedUser.id,
        assignedUserIds: matchedUser.id ? [matchedUser.id] : [],
        assignedUserName: matchedUser.name,
        assignedUserEmail: matchedUser.email,
        assignedUserEmails: matchedUser.email ? [matchedUser.email] : [],
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

  const handleRejectDof = (dofOrId: DofForm | string) => {
    if (typeof dofOrId === "string") {
      const target = dofs.find(d => d.id === dofOrId) || (selectedDof?.id === dofOrId ? selectedDof : null);
      if (target) {
        setDofToReject(target);
        setRejectReason("");
      }
    } else if (dofOrId) {
      setDofToReject(dofOrId);
      setRejectReason("");
    }
  };

  const executeRejectDof = async () => {
    if (!dofToReject?.id) return;
    setIsRejectingDof(true);
    try {
      const refNo = dofToReject.refNo;
      const actorName = activePanelUser?.name || user?.displayName || (user?.email ? user.email.split('@')[0] : "Yönetici");
      const actorEmail = activePanelUser?.email || user?.email || localStorage.getItem("dof_admin_authed_email") || "yetkili@sirket.com";
      const actorRole = activePanelUser?.role || localStorage.getItem("dof_admin_user_role") || "editor";
      const reasonText = rejectReason.trim() || "DÖF başvurusu yetkili tarafından reddedildi.";
      const nowIso = new Date().toISOString();

      const updates: Partial<DofForm> = {
        status: "reddedildi",
        referralStatus: "iptal",
        currentStep: 8,
        adminFeedback: reasonText,
        updatedAt: nowIso,
      };

      await updateDof(dofToReject.id, updates);

      // Audit log kaydı
      try {
        const { addDoc } = await import("firebase/firestore");
        await addDoc(collection(db, "email_logs"), {
          dofRefNo: refNo,
          dofTitle: dofToReject.title,
          actorName,
          actorEmail,
          actorRole,
          recipient: dofToReject.reporterContact || dofToReject.assignedUserEmail || "-",
          subject: `DÖF #${refNo} Reddedildi`,
          body: `DÖF #${refNo} (${dofToReject.title}) başvurusu reddedildi.\nRed Gerekçesi: ${reasonText}\nİşlem Yapan: ${actorName} (${actorEmail})`,
          sentAt: nowIso,
          type: "dof_rejected",
        });
      } catch (logErr) {
        console.warn("Could not log dof rejection:", logErr);
      }

      setDofs(prev => prev.map(d => d.id === dofToReject.id ? { ...d, ...updates } : d));
      if (selectedDof?.id === dofToReject.id) {
        if (!isSystemAdmin) {
          setSelectedDof(null);
        } else {
          setSelectedDof(prev => prev ? { ...prev, ...updates } : null);
        }
      }

      await fetchAllDofs();
      fetchLogs();
      setDofToReject(null);
      setRejectReason("");
      setWorkflowNotice(`✓ DÖF #${refNo} başarıyla reddedildi.`);
      setTimeout(() => setWorkflowNotice(null), 4000);
    } catch (err) {
      console.error("DÖF reddetme hatası:", err);
      alert("DÖF reddedilirken bir hata oluştu.");
    } finally {
      setIsRejectingDof(false);
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
          className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-8 shadow-xl sm:shadow-2xl"
          id="admin-login-card"
        >
          {isForgotPasswordMode ? (
            // Forgot Password Wizard
            <div>
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mb-3">
                  <Mail className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">Şifremi Unuttum</h2>
                <p className="text-xs text-slate-500 mt-1">E-posta doğrulaması ile şifre sıfırlama talebinde bulunun</p>
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
                      className="w-full min-h-[44px] bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-sans"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition cursor-pointer text-sm"
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
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition cursor-pointer text-xs"
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
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-medium rounded-xl transition cursor-pointer text-sm"
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
                <div className="mx-auto flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mb-3">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-900 tracking-tight">Yönetici Girişi</h2>
                <p className="text-xs text-slate-500 mt-1">Lütfen yetkili e-posta adresi ve şifrenizle giriş yapın</p>
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
                    className="w-full min-h-[44px] bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-sans"
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
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer py-1"
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
                    className="w-full min-h-[44px] bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm text-center font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-950 text-white font-semibold rounded-xl transition cursor-pointer text-sm shadow-md"
                  id="passcode-submit-btn"
                >
                  Giriş Yap
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  onNavigate?.("portal");
                  window.dispatchEvent(new CustomEvent("dof_navigate", { detail: { tab: "portal" } }));
                }}
                className="md:hidden mt-3 w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer text-xs border border-slate-200"
              >
                Mobil Giriş Portalına Dön
              </button>
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
    const isDesktopDashboardOnlySection = ["chart", "header", "stats", "workflow_section"].includes(sectionId);

    if (!isEditingLayout) {
      return (
        <div
          key={sectionId}
          style={wrapperStyle}
          className={isDesktopDashboardOnlySection ? "hidden lg:block w-full" : "w-full"}
        >
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
                    {activeNotification.department} • {getMaskedReporterName(activeNotification.reporterName)}
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

      {/* Sol Menü Hover Tetikleyici (Kullanılmadığında Gizli, Üzerine Gelindiğinde Gözükür) */}
      {!isSidebarPinned && (
        <>
          {/* Ekranın en sol kenarında görünmez hover algılama alanı (16px) */}
          {!isSidebarHovered && (
            <div
              onMouseEnter={() => setIsSidebarHovered(true)}
              className="hidden lg:block fixed left-0 top-0 bottom-0 w-4 z-40 pointer-events-auto"
            />
          )}

          {/* Sol Kenar Yüzen 'Menü' Sekmesi */}
          <div
            onMouseEnter={() => setIsSidebarHovered(true)}
            className="hidden lg:flex fixed left-0 top-32 z-40 bg-slate-900/95 hover:bg-indigo-600 text-white px-2 py-3.5 rounded-r-2xl border-y border-r border-slate-700/80 shadow-2xl cursor-pointer transition-all duration-300 flex-col items-center gap-2 group backdrop-blur-xs"
            title="Menüyü Görüntülemek İçin Üzerine Gelin"
          >
            <Menu className="h-4 w-4 text-indigo-400 group-hover:text-white" />
            <span className="text-[9px] font-bold uppercase tracking-widest [writing-mode:vertical-lr] text-slate-400 group-hover:text-white">
              Menü
            </span>
            <ChevronRight className="h-3 w-3 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition" />
          </div>
        </>
      )}

      {/* Mobile Top Navigation Bar + Quick Switch Strip */}
      <div className="lg:hidden bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-slate-800 rounded-t-2xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0">
            <Shield className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <span className="font-bold text-sm text-white block truncate leading-tight">
              {isSystemAdmin ? "DÖF Yönetim Paneli" : "KYS Kontrol Paneli"}
            </span>
            <span className="text-[11px] text-slate-300 block truncate">
              {isSystemAdmin
                ? "Yönetici"
                : `${getRoleDisplayName(activePanelUser?.role, accessRoles)}${activeUserAuthorizedUnitLabel ? ` · ${activeUserAuthorizedUnitLabel}` : ""}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(activeRolePerms.canViewDofs || activeRolePerms.canEditDof) && (
            <button
              type="button"
              onClick={() => setIsAdminScannerOpen(true)}
              className="min-h-[40px] px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="QR Kod Tara"
            >
              <QrCode className="h-4 w-4 shrink-0" />
              <span>QR</span>
            </button>
          )}
          {(isSystemAdmin || activeRolePerms.canViewSettings) && (
            <button
              type="button"
              onClick={() => {
                setSettingsModalTab("parameters");
                setIsSettingsOpen(true);
              }}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              title="Ayarlar"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
            title="Menüyü Aç/Kapat"
          >
            {isMobileSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile 1-Tap Horizontal Quick Navigation Strip */}
      <div className="lg:hidden bg-slate-50 border-x border-b border-slate-200 px-2.5 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {activeRolePerms.canViewDashboard && (
          <button
            type="button"
            onClick={() => setAdminSubTab("dashboard")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
              adminSubTab === "dashboard"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
            <span>Özet</span>
          </button>
        )}

        {activeRolePerms.canViewDofs && (
          <button
            type="button"
            onClick={() => {
              if (statusFilter === "all") setStatusFilter("acik");
              setAdminSubTab("dofs");
            }}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer tabular-nums ${
              adminSubTab === "dofs"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Grid className="h-3.5 w-3.5 shrink-0" />
            <span>DÖF Listesi</span>
            {openCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                adminSubTab === "dofs" ? "bg-indigo-500 text-white" : "bg-indigo-50 text-indigo-700"
              }`}>
                {openCount}
              </span>
            )}
          </button>
        )}

        {activeRolePerms.canManageFolders && (
          <button
            type="button"
            onClick={() => setAdminSubTab("folders")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
              adminSubTab === "folders"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            <span>Klasörler</span>
          </button>
        )}

        {activeRolePerms.canCreateDof && (
          <button
            type="button"
            onClick={() => setAdminSubTab("new_dof")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
              adminSubTab === "new_dof"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50"
            }`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Yeni DÖF</span>
          </button>
        )}

        {activeRolePerms.canViewReports && (
          <button
            type="button"
            onClick={() => setAdminSubTab("reports")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
              adminSubTab === "reports"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <PieChart className="h-3.5 w-3.5 shrink-0" />
            <span>Raporlar</span>
          </button>
        )}

        {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
          <>
            <button
              type="button"
              onClick={() => setAdminSubTab("users")}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                adminSubTab === "users"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>Kullanıcılar</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab("departments")}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                adminSubTab === "departments"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <Building className="h-3.5 w-3.5 shrink-0" />
              <span>Birimler</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSubTab("roles")}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition cursor-pointer ${
                adminSubTab === "roles"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Roller</span>
            </button>
          </>
        )}
      </div>

      <div className={`min-h-[calc(100vh-12rem)] lg:min-h-screen flex flex-col lg:flex-row bg-slate-100 rounded-b-2xl lg:rounded-3xl overflow-hidden border-x border-b lg:border border-slate-200 shadow-sm relative ${showPosterModal ? "print:hidden" : ""}`}>
        {/* Mobile Backdrop Overlay */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[65] lg:hidden"
          />
        )}

        {/* Desktop Sidebar Width Reservation (Only reserves space when pinned) */}
        <div 
          className={`hidden lg:block shrink-0 transition-all duration-300 ${
            isSidebarPinned ? "w-72" : "w-0"
          }`}
        />

        {/* Left Sidebar Menu (Auto-collapsing when not used, expands on hover) */}
        <aside
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
          className={`
            bg-slate-900 text-slate-300 flex-col border-r border-slate-800 transition-all duration-300 ease-in-out
            ${isMobileSidebarOpen 
              ? "fixed inset-y-0 left-0 w-72 max-w-[85vw] z-[70] flex shadow-2xl translate-x-0 opacity-100 pointer-events-auto" 
              : "hidden lg:flex"
            }
            ${isSidebarPinned
              ? "lg:relative lg:w-72 lg:shadow-xl lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto"
              : isSidebarHovered
                ? "lg:fixed lg:top-0 lg:bottom-0 lg:left-0 lg:w-72 lg:z-50 lg:shadow-2xl lg:translate-x-0 lg:opacity-100 lg:pointer-events-auto"
                : !isMobileSidebarOpen
                  ? "lg:fixed lg:top-0 lg:bottom-0 lg:left-0 lg:w-72 lg:z-50 lg:-translate-x-full lg:opacity-0 lg:pointer-events-none"
                  : ""
            }
          `}
        >
          {(() => {
            const isExpanded = isSidebarPinned || isSidebarHovered || isMobileSidebarOpen;

            return (
              <div className="p-4 pb-24 lg:pb-4 flex flex-col gap-4 h-full overflow-y-auto overflow-x-hidden">
                {/* Brand Header & Toggle Controls */}
                <div className="space-y-3 pb-3 border-b border-slate-800">
                  <div className={`flex items-center gap-3 ${!isExpanded ? "justify-center" : "justify-between"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shrink-0">
                        <Shield className="h-5 w-5" />
                      </span>
                      {isExpanded && (
                        <div className="min-w-0">
                          <h2 className="font-display font-bold text-white text-xs leading-none truncate">
                            {isSystemAdmin ? "DÖF Yönetim Paneli" : "KYS Kontrol Paneli"}
                          </h2>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase truncate max-w-[130px]">
                              {isSystemAdmin
                                ? "YÖNETİCİ PANELİ"
                                : activeUserAuthorizedUnitLabel || getRoleDisplayName(activePanelUser?.role, accessRoles).toUpperCase()}
                            </span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                              {appVersionSetting}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pin Toggle Button (Desktop) & Close Button (Mobile) */}
                    {isExpanded && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isSidebarPinned;
                            setIsSidebarPinned(next);
                            localStorage.setItem("dof_admin_sidebar_pinned", String(next));
                          }}
                          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                            isSidebarPinned
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                          }`}
                          title={isSidebarPinned ? "Sabitlemeyi Kaldır (Otomatik Gizleme Moduna Geç)" : "Menüyü Sürekli Açık Sabitle"}
                        >
                          {isSidebarPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5 text-slate-400" />}
                          <span>{isSidebarPinned ? "Sabit" : "Oto Gizle"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMobileSidebarOpen(false)}
                          className="lg:hidden p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                          title="Menüyü Kapat"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mode explanation banner when expanded */}
                  {isExpanded && (
                    <div className="flex items-center justify-between text-[10px] px-2.5 py-1.5 bg-slate-800/60 rounded-xl border border-slate-700/50 text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isSidebarPinned ? "bg-indigo-400" : "bg-emerald-400 animate-pulse"}`} />
                        {isSidebarPinned ? "Menü Sabit Açık" : "Fare Ayrıldığında Gizlenir"}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {isSidebarPinned ? "Kilitli" : "Hover Açılır"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Nav Menu */}
                <nav className="flex flex-col gap-1.5 flex-1">
                  {/* Category 1 Header */}
                  {isExpanded ? (
                    <div className="pb-1 px-3">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                        {isSystemAdmin
                          ? "ANA PANEL"
                          : activeRolePerms.canViewDofs
                          ? "BİRİM İŞLEMLERİ"
                          : "RAPOR & ANALİZ"}
                      </span>
                    </div>
                  ) : (
                    <div className="my-1 border-t border-slate-800" />
                  )}
                  
                  {/* Dashboard Tab */}
                  {activeRolePerms.canViewDashboard && (
                    <button
                      onClick={() => {
                        setAdminSubTab("dashboard");
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                        adminSubTab === "dashboard"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      } ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? "Dashboard" : undefined}
                    >
                      <LayoutDashboard className="h-5 w-5 shrink-0" />
                      {isExpanded && <span className="truncate flex-1">Dashboard</span>}
                    </button>
                  )}

                  {/* Tüm DÖF'ler / Birim DÖF'leri Tab */}
                  {activeRolePerms.canViewDofs && (
                    <button
                      onClick={() => {
                        if (statusFilter === "all") {
                          setStatusFilter("acik");
                        }
                        setAdminSubTab("dofs");
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                        adminSubTab === "dofs"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      } ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? (isSystemAdmin || activeRolePerms.dofScope === "all" ? "Tüm DÖF'ler" : "Birim DÖF'leri") : undefined}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Grid className="h-5 w-5 shrink-0" />
                        {isExpanded && (
                          <span className="truncate">
                            {isSystemAdmin || activeRolePerms.dofScope === "all" ? "Tüm DÖF'ler" : "Birim DÖF'leri"}
                          </span>
                        )}
                      </div>
                      {newCount > 0 && (
                        isExpanded ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold animate-pulse shrink-0">
                            {newCount}
                          </span>
                        ) : (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-slate-900 animate-pulse" />
                        )
                      )}
                    </button>
                  )}

                  {/* Klasör Yönetimi Tab */}
                  {activeRolePerms.canManageFolders && (
                    <button
                      onClick={() => {
                        setAdminSubTab("folders");
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                        adminSubTab === "folders"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      } ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? "Klasör Yönetimi" : undefined}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderKanban className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate">Klasör Yönetimi</span>}
                      </div>
                      {folders.length > 0 && (
                        isExpanded ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono shrink-0 border border-slate-700">
                            {folders.length}
                          </span>
                        ) : (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-400 ring-2 ring-slate-900" />
                        )
                      )}
                    </button>
                  )}

                  {/* Yeni DÖF Oluşturma Tab */}
                  {activeRolePerms.canCreateDof && (
                    <button
                      onClick={() => {
                        setAdminSubTab("new_dof");
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                        adminSubTab === "new_dof"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      } ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? "Yeni DÖF Oluşturma" : undefined}
                    >
                      <Plus className="h-5 w-5 shrink-0" />
                      {isExpanded && <span className="truncate flex-1">Yeni DÖF Oluşturma</span>}
                    </button>
                  )}

                  {/* Raporlar & Analiz Tab */}
                  {activeRolePerms.canViewReports && (
                    <button
                      onClick={() => {
                        setAdminSubTab("reports");
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                        adminSubTab === "reports"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      } ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? (isSystemAdmin || activeRolePerms.dofScope === "all" ? "Raporlar & Analiz" : "Birim Raporları") : undefined}
                    >
                      <Sparkles className="h-5 w-5 shrink-0" />
                      {isExpanded && (
                        <span className="truncate flex-1">
                          {isSystemAdmin || activeRolePerms.dofScope === "all" ? "Raporlar & Analiz" : "Birim Raporları"}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Ayarlar (Yönetici ve Ayar Yetkisi olan Birim Sorumluları için) */}
                  {(isSystemAdmin || activeRolePerms.canViewSettings) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsModalTab("parameters");
                        setIsSettingsOpen(true);
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative text-slate-400 hover:bg-slate-800 hover:text-slate-200 ${!isExpanded ? "justify-center" : ""}`}
                      title={!isExpanded ? "Ayarlar" : undefined}
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      {isExpanded && <span className="truncate flex-1">Ayarlar</span>}
                    </button>
                  )}

                  {/* YÖNETİM PANELİ Bölümü - SADECE YÖNETİCİ YETKİSİ OLANLARDA GÖRÜNÜR */}
                  {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
                    <>
                      {isExpanded ? (
                        <div className="pt-3 pb-1 px-3">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">
                            YÖNETİM PANELİ
                          </span>
                        </div>
                      ) : (
                        <div className="my-1 border-t border-slate-800" />
                      )}

                      <button
                        onClick={() => {
                          setAdminSubTab("users");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "users"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Kullanıcılar" : undefined}
                      >
                        <Users className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate flex-1">Kullanıcılar</span>}
                      </button>

                      <button
                        onClick={() => {
                          setAdminSubTab("roles");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "roles"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Erişim Rolleri" : undefined}
                      >
                        <ShieldCheck className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate flex-1">Erişim Rolleri</span>}
                      </button>

                      <button
                        onClick={() => {
                          setAdminSubTab("departments");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "departments"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Birimler" : undefined}
                      >
                        <Building className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate flex-1">Birimler</span>}
                      </button>

                      <button
                        onClick={() => {
                          setAdminSubTab("remote");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "remote"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Uzak Bağlantı & QR" : undefined}
                      >
                        <QrCode className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate flex-1">Uzak Bağlantı & QR</span>}
                      </button>

                      <button
                        onClick={() => {
                          setAdminSubTab("logs");
                          fetchLogs();
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "logs"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Sistem Logları" : undefined}
                      >
                        <Mail className="h-5 w-5 shrink-0" />
                        {isExpanded && <span className="truncate flex-1">Sistem Logları</span>}
                      </button>

                      <button
                        onClick={() => {
                          setAdminSubTab("database");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer text-left relative ${
                          adminSubTab === "database"
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-950/60"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        } ${!isExpanded ? "justify-center" : ""}`}
                        title={!isExpanded ? "Veritabanı & Tablolar" : undefined}
                      >
                        <Database className="h-5 w-5 shrink-0 text-emerald-400" />
                        {isExpanded && (
                          <div className="flex items-center justify-between flex-1 truncate">
                            <span className="truncate">Veritabanı & Tablolar</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
                          </div>
                        )}
                      </button>
                    </>
                  )}
                </nav>

                {/* Footer Micro-help when expanded */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 text-center">
                    <span>Fare ayrıldığında menü gizlenir</span>
                  </div>
                )}
              </div>
            );
          })()}
        </aside>

        {/* Main Workspace Column */}
        <main className="flex-1 bg-white p-3.5 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="flex flex-col gap-4 lg:gap-6">
            {/* Desktop DÖF Üst Yönetici Özet Kartı */}
            {((adminSubTab === "dashboard" && activeRolePerms.canViewDashboard) || (adminSubTab === "dofs" && activeRolePerms.canViewDofs)) && (
              <div className="hidden lg:block">
                <DofExecutiveSummaryCard
                  totalCount={totalCount}
                  resolvedCount={resolvedCount}
                  openCount={openCount}
                  newCount={newCount}
                  reviewCount={reviewCount}
                  rejectedCount={rejectedCount}
                  correctiveCount={correctiveCount}
                  preventiveCount={preventiveCount}
                  urgentCount={urgentCount}
                  correctiveDays={correctiveDaysSetting}
                  preventiveDays={preventiveDaysSetting}
                  statusFilter={statusFilter}
                  typeFilter={typeFilter}
                  onFilterClick={(status, type) => {
                    if (!activeRolePerms.canViewDofs) return;
                    setStatusFilter(status);
                    if (type !== undefined) setTypeFilter(type);
                    if (adminSubTab !== "dofs") setAdminSubTab("dofs");
                  }}
                />
              </div>
            )}

            {/* Dedicated Mobile-First Dashboard View (< 1024px) */}
            {adminSubTab === "dashboard" && activeRolePerms.canViewDashboard && (
              <div className="lg:hidden space-y-4">
                {/* Mobile Greeting & Quick Utility Strip */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide block truncate">
                      {activeUserAuthorizedUnitLabel || "Tüm Birimler"}
                    </span>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      {activePanelUser?.name || "Yetkili Kullanıcı"} · {appVersionSetting}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !isMuted;
                        setIsMuted(nextMuted);
                        localStorage.setItem("dof_admin_last_sound_state", nextMuted ? "muted" : "unmuted");
                      }}
                      className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition cursor-pointer ${
                        isMuted
                          ? "bg-white text-slate-500 border-slate-200"
                          : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}
                      title={isMuted ? "Sesi Aç" : "Sesi Kapat"}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition cursor-pointer"
                      title="Oturumu Kapat"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Mobile 2x2 Actionable KPI Summary Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeRolePerms.canViewDofs) return;
                      setStatusFilter("acik");
                      setAdminSubTab("dofs");
                    }}
                    className={`min-h-[82px] p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      urgentCount > 0
                        ? "bg-rose-50/70 border-rose-200 hover:bg-rose-50"
                        : "bg-amber-50/60 border-amber-200 hover:bg-amber-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${urgentCount > 0 ? "text-rose-700" : "text-amber-700"}`}>
                        Açık & İşlemde
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <span className={`text-2xl font-display font-bold tabular-nums ${urgentCount > 0 ? "text-rose-800" : "text-amber-800"}`}>
                        {newCount + reviewCount}
                      </span>
                      <span className={`text-[11px] font-semibold ${urgentCount > 0 ? "text-rose-600" : "text-amber-700"}`}>
                        {urgentCount > 0 ? `${urgentCount} acil` : "Aktif"}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!activeRolePerms.canViewDofs) return;
                      setStatusFilter("yeni");
                      setAdminSubTab("dofs");
                    }}
                    className="min-h-[82px] p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 hover:bg-blue-50 text-left transition cursor-pointer flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                        Yeni Başvuru
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <span className="text-2xl font-display font-bold text-blue-800 tabular-nums">
                        {newCount}
                      </span>
                      <span className="text-[11px] font-semibold text-blue-600">
                        İncele
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!activeRolePerms.canViewDofs) return;
                      setStatusFilter("cozuldu");
                      setAdminSubTab("dofs");
                    }}
                    className="min-h-[82px] p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 hover:bg-emerald-50 text-left transition cursor-pointer flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                        Çözüldü
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <span className="text-2xl font-display font-bold text-emerald-800 tabular-nums">
                        {resolvedCount}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                        %{totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!activeRolePerms.canViewDofs) return;
                      setStatusFilter("all");
                      setAdminSubTab("dofs");
                    }}
                    className="min-h-[82px] p-3.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-left transition cursor-pointer flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                        Toplam DÖF
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <span className="text-2xl font-display font-bold text-slate-900 tabular-nums">
                        {totalCount}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        Tümü
                      </span>
                    </div>
                  </button>
                </div>

                {/* Mobile Primary Quick Actions */}
                <div className="grid grid-cols-2 gap-2.5">
                  {activeRolePerms.canCreateDof && (
                    <button
                      type="button"
                      onClick={() => setAdminSubTab("new_dof")}
                      className="min-h-[44px] px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Yeni DÖF Aç</span>
                    </button>
                  )}
                  {activeRolePerms.canViewDofs && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("acik");
                        setAdminSubTab("dofs");
                      }}
                      className={`min-h-[44px] px-3.5 py-2.5 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                        !activeRolePerms.canCreateDof ? "col-span-2" : ""
                      }`}
                    >
                      <Grid className="h-4 w-4 shrink-0" />
                      <span>DÖF Listesine Git</span>
                    </button>
                  )}
                </div>

                {/* Mobile Bekleyen & Atanan Görevler Feed */}
                {(activeRolePerms.canViewDofs || activeRolePerms.canEditDof) && (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-3.5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Aktif Görevlerim</h3>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {filteredWorkflowDofs.length} adet aksiyon bekleyen kayıt
                        </p>
                      </div>
                      {activeRolePerms.canViewDofs && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter("acik");
                            setAdminSubTab("dofs");
                          }}
                          className="min-h-[36px] px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition cursor-pointer"
                        >
                          Tümünü Gör
                        </button>
                      )}
                    </div>

                    {isAdminOrEditor && (
                      <div className="px-3.5 py-2.5 border-b border-slate-100 bg-white">
                        <select
                          value={workflowDeptFilter}
                          onChange={(e) => setWorkflowDeptFilter(e.target.value)}
                          className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="me">Bana / Birimime Atananlar</option>
                          <option value="all">Tüm Birimler (Genel Akış)</option>
                          {sortedDepartments.map((dept) => (
                            <option key={dept.id || dept.name} value={dept.name}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {filteredWorkflowDofs.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-1.5" />
                        <p className="text-xs font-semibold text-slate-700">
                          {workflowDeptFilter === "me" ? "Açık göreviniz bulunmuyor." : "Bu birimde bekleyen görev yok."}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredWorkflowDofs.slice(0, 12).map((dof) => {
                          const riskInfo = getDofScoreAndLevel(dof);
                          const statusLabel =
                            dof.status === "yeni"
                              ? "Yeni"
                              : dof.status === "inceleniyor"
                              ? "İnceleniyor"
                              : dof.status === "cozuldu"
                              ? "Çözüldü"
                              : "Reddedildi";
                          const statusClass =
                            dof.status === "yeni"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : dof.status === "inceleniyor"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : dof.status === "cozuldu"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200";

                          return (
                            <button
                              key={dof.id}
                              type="button"
                              onClick={() => handleSelectDof(dof)}
                              className="w-full min-h-[44px] p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition flex items-start justify-between gap-3 cursor-pointer"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-indigo-700">{dof.refNo}</span>
                                  <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusClass}`}>
                                    {statusLabel}
                                  </span>
                                  {riskInfo.level === "Yüksek" && (
                                    <span className="text-[10px] font-bold text-rose-700">Yüksek Risk</span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
                                  {dof.title}
                                </p>
                                <p className="text-xs text-slate-500 truncate">
                                  {dof.department} · {dof.assignedUserName || "Atanmamış"}
                                  {dof.targetCompletionDate ? ` · Termin: ${new Date(dof.targetCompletionDate).toLocaleDateString("tr-TR")}` : ""}
                                </p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile Collapsible Charts Accordion */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsMobileChartsExpanded(!isMobileChartsExpanded)}
                    className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span>Grafik & İstatistik Analizlerini {isMobileChartsExpanded ? "Gizle" : "Göster"}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isMobileChartsExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isMobileChartsExpanded && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50/40">
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
                        setAdminSubTab={(tab) => {
                          if (tab === "dofs" && !activeRolePerms.canViewDofs) return;
                          setAdminSubTab(tab);
                        }}
                        handleSelectDof={(dof) => {
                          if (!activeRolePerms.canViewDofs && !activeRolePerms.canEditDof) return;
                          handleSelectDof(dof);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

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
        {adminSubTab === "dashboard" && activeRolePerms.canViewDashboard && renderLayoutWrapper(
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
            setAdminSubTab={(tab) => {
              if (tab === "dofs" && !activeRolePerms.canViewDofs) return;
              setAdminSubTab(tab);
            }}
            handleSelectDof={(dof) => {
              if (!activeRolePerms.canViewDofs && !activeRolePerms.canEditDof) return;
              handleSelectDof(dof);
            }}
          />
        )}

        {/* Dashboard Top Header */}
        {adminSubTab === "dashboard" && activeRolePerms.canViewDashboard && renderLayoutWrapper(
          "header",
          "Yönetici Bilgi ve Kontrol Başlığı",
          <div className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                  <Unlock className="h-4 w-4" />
                </span>
                <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                  {isSystemAdmin
                    ? "GÜVENLİ YÖNETİCİ PANELİ"
                    : `${getRoleDisplayName(activePanelUser?.role, accessRoles).toUpperCase()} PANELİ • ${activeUserAuthorizedUnitLabel || "GENEL"}`}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {appVersionSetting}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Yerleşimi Düzenle Button (Sadece Yönetici) */}
              {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
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
              {(activeRolePerms.canViewDofs || activeRolePerms.canEditDof) && (
                <button
                  onClick={() => setIsAdminScannerOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer text-xs font-bold shadow-xs"
                  title="Kamera ile DÖF QR Kodu Tara"
                  id="admin-qr-scan-btn"
                >
                  <Camera className="h-3.5 w-3.5" /> QR Tara
                </button>
              )}

              {/* Parametre Ayarları Button */}
              {(isSystemAdmin || activeRolePerms.canViewSettings) && (
                <button
                  onClick={() => {
                    setSettingsModalTab("parameters");
                    setIsSettingsOpen(true);
                  }}
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
        {adminSubTab === "dashboard" && activeRolePerms.canViewDashboard && renderLayoutWrapper(
          "stats",
          "Filtrelenebilir İstatistik Kartları",
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <button
              onClick={() => {
                if (!activeRolePerms.canViewDofs) return;
                setStatusFilter("all");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
                statusFilter === "all"
                  ? "bg-indigo-50/60 border-2 border-indigo-400 ring-4 ring-indigo-500/10"
                  : "bg-white border border-slate-100 hover:border-slate-200 hover:bg-slate-50/40"
              }`}
            >
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">Toplam DÖF</span>
              <span className="text-3xl font-display font-bold text-slate-900 block mt-1">{totalCount}</span>
              <span className="text-[9px] font-medium text-slate-400 block mt-0.5">{activeRolePerms.canViewDofs ? "Tümünü Göster" : "Genel Özet"}</span>
            </button>

            <button
              onClick={() => {
                if (!activeRolePerms.canViewDofs) return;
                setStatusFilter("bekleyen");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 relative overflow-hidden ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
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
                if (!activeRolePerms.canViewDofs) return;
                setStatusFilter("yeni");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 relative overflow-hidden ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
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
                  {activeRolePerms.canViewDofs ? "Gözden Geçir!" : "Açık Kayıt"}
                </span>
              ) : (
                <span className="text-[9px] font-medium text-blue-400 block mt-0.5">{activeRolePerms.canViewDofs ? "Filtrele" : "Adet"}</span>
              )}
            </button>

            <button
              onClick={() => {
                if (!activeRolePerms.canViewDofs) return;
                setStatusFilter("inceleniyor");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
                statusFilter === "inceleniyor"
                  ? "bg-amber-50 border-2 border-amber-400 ring-4 ring-amber-500/10"
                  : "bg-amber-50/20 border border-amber-100/70 hover:bg-amber-50/40 hover:border-amber-200"
              }`}
            >
              <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase block">İnceleniyor</span>
              <span className="text-3xl font-display font-bold text-amber-700 block mt-1">{reviewCount}</span>
              <span className="text-[9px] font-medium text-amber-400 block mt-0.5">{activeRolePerms.canViewDofs ? "Filtrele" : "Adet"}</span>
            </button>

            <button
              onClick={() => {
                if (!activeRolePerms.canViewDofs) return;
                setStatusFilter("cozuldu");
                setAdminSubTab("dofs");
              }}
              className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
                statusFilter === "cozuldu"
                  ? "bg-emerald-50 border-2 border-emerald-400 ring-4 ring-emerald-500/10"
                  : "bg-emerald-50/20 border border-emerald-100/70 hover:bg-emerald-50/40 hover:border-emerald-200"
              }`}
            >
              <span className="text-[10px] font-bold text-emerald-500 tracking-wider uppercase block">Çözüldü</span>
              <span className="text-3xl font-display font-bold text-emerald-700 block mt-1">{resolvedCount}</span>
              <span className="text-[9px] font-medium text-emerald-400 block mt-0.5">{activeRolePerms.canViewDofs ? "Filtrele" : "Adet"}</span>
            </button>

            {isSystemAdmin && (
              <button
                onClick={() => {
                  if (!activeRolePerms.canViewDofs) return;
                  setStatusFilter("reddedildi");
                  setAdminSubTab("dofs");
                }}
                className={`p-4 rounded-2xl shadow-sm text-center transition-all duration-300 ${activeRolePerms.canViewDofs ? "cursor-pointer" : "cursor-default"} outline-none ${
                  statusFilter === "reddedildi"
                    ? "bg-rose-50 border-2 border-rose-400 ring-4 ring-rose-500/10"
                    : "bg-rose-50/20 border border-rose-100/70 hover:bg-rose-50/40 hover:border-rose-200"
                }`}
              >
                <span className="text-[10px] font-bold text-rose-500 tracking-wider uppercase block">Reddedildi</span>
                <span className="text-3xl font-display font-bold text-rose-700 block mt-1">{rejectedCount}</span>
                <span className="text-[9px] font-medium text-rose-400 block mt-0.5">{activeRolePerms.canViewDofs ? "Filtrele" : "Adet"}</span>
              </button>
            )}
          </div>
        )}

        {/* İş Akışı Section on Main Dashboard */}
        {adminSubTab === "dashboard" && (activeRolePerms.canViewDofs || activeRolePerms.canEditDof) && renderLayoutWrapper(
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
                  Size veya biriminize atanmış, aksiyon bekleyen aktif düzeltici önleyici faaliyetler.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                  {workflowDeptFilter === "me" ? "Üzerimdeki / Birimimdeki İşler" : workflowDeptFilter === "all" ? "Tüm İşler" : `${workflowDeptFilter} İşleri`}
                </span>
                <span className="text-xl font-display font-bold text-indigo-600 block mt-0.5">{filteredWorkflowDofs.length} Adet</span>
              </div>
            </div>

            {/* Birim Seçim Filtresi (Yalnızca Yönetici / Editör görebilir) */}
            {isAdminOrEditor && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 border border-slate-100/80 p-4 rounded-2xl mb-6 text-xs shadow-xs">
                <div className="space-y-1">
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Building className="h-4 w-4 text-indigo-600" />
                    Birim Filtreleme Paneli
                  </span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Yönetici/Editör yetkisiyle, aşağıdan seçeceğiniz birime ait iş akışlarını listeleyebilirsiniz.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <span className="text-slate-600 font-bold whitespace-nowrap">Birim:</span>
                  <select
                    value={workflowDeptFilter}
                    onChange={(e) => setWorkflowDeptFilter(e.target.value)}
                    className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500 cursor-pointer shadow-xs transition duration-200"
                  >
                    <option value="me">Bana / Birimime Atananlar</option>
                    <option value="all">Tüm Birimler (Genel Akış)</option>
                    {sortedDepartments.map((dept) => (
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
            {adminSubTab === "folders" && activeRolePerms.canManageFolders && (
              <div className="space-y-6">
                <DofFolderManager
                  folders={folders}
                  dofs={visibleDofs}
                  isSystemAdmin={isSystemAdmin}
                  onFilterByFolder={(targetFolderId) => {
                    if (!activeRolePerms.canViewDofs) return;
                    setFolderFilter(targetFolderId);
                    setAdminSubTab("dofs");
                  }}
                  onRefresh={fetchAllDofs}
                  onMoveClosedToFolder={handleMoveAllClosedToFolder}
                />
              </div>
            )}

            {adminSubTab === "new_dof" && activeRolePerms.canCreateDof && (
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md max-w-3xl mx-auto w-full">
                <h2 className="text-xl font-display font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
                  Yeni DÖF Giriş Formu (Yönetim Paneli)
                </h2>
                <DofSubmitForm 
                  onGoToTrack={(ref) => {
                    if (!activeRolePerms.canViewDofs) return;
                    setSearchTerm(ref);
                    setStatusFilter("all");
                    setAdminSubTab("dofs");
                  }} 
                  onShowQr={() => {
                    if (isSystemAdmin || activeRolePerms.canManageSystemAdmin) {
                      setAdminSubTab("departments");
                    }
                  }} 
                />
              </div>
            )}

            {adminSubTab === "departments" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5 mb-6">
                    <div>
                      <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                          <Building className="h-5 w-5" />
                        </span>
                        Birim Tanımlama & Yönetim
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Sistemdeki birimleri tanımlayın, birim sorumlularını belirleyin ve özel QR kodları oluşturarak birimlere özel bildirim toplama kanalları açın.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Save/Edit Unit Form */}
                    <div className="lg:col-span-4">
                      <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                          {selectedDept ? "BİRİMİ DÜZENLE" : "YENİ BİRİM EKLE"}
                        </h3>

                        <form onSubmit={handleSaveDept} className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Birim Adı *</label>
                            <input
                              type="text"
                              required
                              value={deptFormName}
                              onChange={(e) => setDeptFormName(e.target.value)}
                              placeholder="Örn: Bilgi İşlem Birimi"
                              className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                            />
                          </div>

                          {/* Sıralama ve Aktif / Pasif Ayarları */}
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="text-xs font-semibold text-slate-600 block mb-1">
                                Sıralama Sırası #
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="999"
                                value={deptFormOrder}
                                onChange={(e) => setDeptFormOrder(e.target.value === "" ? "" : Number(e.target.value))}
                                placeholder="1"
                                className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-semibold font-mono"
                              />
                              <span className="text-[10px] text-slate-400 mt-0.5 block">Formlarda listelenme sırası (1 en üstte)</span>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-600 block mb-1">
                                Durum
                              </label>
                              <button
                                type="button"
                                onClick={() => setDeptFormIsActive(!deptFormIsActive)}
                                className={`w-full py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                                  deptFormIsActive
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full ${deptFormIsActive ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                                {deptFormIsActive ? "Aktif" : "Pasif"}
                              </button>
                              <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
                                {deptFormIsActive ? "Formlarda görünür" : "Formlarda gizlenir"}
                              </span>
                            </div>
                          </div>

                          {/* Birim Aktif / Pasif Checkbox */}
                          <div>
                            <label className="flex items-center gap-2.5 cursor-pointer select-none bg-white p-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 transition">
                              <input
                                type="checkbox"
                                checked={deptFormIsActive}
                                onChange={(e) => setDeptFormIsActive(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-700 block">
                                  Birim Sistemde Aktif
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  İşaret kaldırıldığında (Pasif) DÖF bildirim ve seçim listelerinden tamamen gizlenir.
                                </span>
                              </div>
                            </label>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 bg-slate-100/80 px-2.5 py-1.5 rounded-lg block leading-relaxed border border-slate-200/50">
                              ℹ️ <strong>Yetkilendirme Bilgisi:</strong> Evraklar ve DÖF bildirimleri doğrudan <strong>birime</strong> havale edilir. Birime yetkili atanan tüm kullanıcılar (1 veya birden fazla) o birime gelen evrakları görebilir ve işlem yapabilir.
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
                                  İşaretlendiğinde bu birim için ayrı özel bir QR Kod oluşturulur. İşaretsiz ise "Genel QR" kullanılır.
                                </span>
                              </div>
                            </label>
                          </div>

                          {/* Doğrudan Birime Havale Çeki */}
                          <div className="pt-2 border-t border-slate-100/60">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={deptFormDirectReferral}
                                onChange={(e) => {
                                  setDeptFormDirectReferral(e.target.checked);
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-700 block">
                                  Birime Doğrudan Havale Aktif
                                </span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  Bu birime açılan DÖF'ler otomatik olarak birime havale edilir ve birimdeki tüm yetkili sorumluların ekranına düşer.
                                </span>
                              </div>
                            </label>
                          </div>

                          {/* Birim Yetkili Sorumluları & Birim Rol Yetkisi (Birden Fazla Seçilebilir) */}
                          <div className="space-y-1.5 pl-1 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-600 block">
                                Birim Yetkili Sorumluları & Rol Yetkisi (Birden Fazla Seçilebilir)
                              </label>
                              {deptFormReferralUserIds.length > 0 && (
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                  {deptFormReferralUserIds.length} Kişi Seçili
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-snug bg-indigo-50/60 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                              Birim yetkisi sadece buradan verilir. İşaretlenen personel bu birime gelen DÖF ve evrakları görür, seçilen birim rol yetkisiyle işlem yapar.
                            </p>
                            <div className="max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 p-1">
                              {panelUsers.length === 0 ? (
                                <div className="text-[11px] text-slate-400 p-3 text-center">
                                  Kayıtlı kullanıcı bulunmuyor.
                                </div>
                              ) : (
                                [...panelUsers]
                                  .filter((u) => u.id && u.isActive !== false)
                                  .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr-TR"))
                                  .map((u) => {
                                    const uid = u.id!;
                                    const isChecked = deptFormReferralUserIds.includes(uid);
                                    const userUnits = getAuthorizedDepartmentsForUser(u, departments);
                                    const matchesDeptName =
                                      deptFormName.trim() !== "" &&
                                      userUnits.some(
                                        (unitName) => normalizeUnitText(unitName) === normalizeUnitText(deptFormName)
                                      );
                                    const effectiveRoleId = deptFormUserRoles[uid] || u.role || "editor";
                                    const matchedRoleObj = getRoleById(effectiveRoleId, accessRoles);
                                    const isSuperAccount = normalizeUnitText(u.email) === "gokhan.eroglu@gmail.com";

                                    return (
                                      <div
                                        key={uid}
                                        className={`p-2 rounded-lg transition text-xs space-y-1.5 ${
                                          isChecked ? "bg-indigo-50/70 text-indigo-950" : "hover:bg-slate-50 text-slate-700"
                                        }`}
                                      >
                                        <label className="flex items-center gap-2.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setDeptFormReferralUserIds((prev) => Array.from(new Set([...prev, uid])));
                                                setDeptFormUserRoles((prev) => ({
                                                  ...prev,
                                                  [uid]: prev[uid] || u.role || "editor",
                                                }));
                                              } else {
                                                setDeptFormReferralUserIds((prev) => prev.filter((id) => id !== uid));
                                              }
                                            }}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1.5">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                <span className={`truncate ${isChecked ? "font-semibold" : ""}`}>{u.name}</span>
                                                {matchesDeptName && (
                                                  <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-bold shrink-0">
                                                    Birim Üyesi
                                                  </span>
                                                )}
                                              </div>
                                              <span
                                                className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold shrink-0 ${getRoleBadgeClasses(
                                                  matchedRoleObj.badgeColor
                                                )}`}
                                              >
                                                {matchedRoleObj.name}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 block truncate">
                                              {u.email} {userUnits.length > 0 ? `• ${userUnits.join(", ")}` : ""}
                                            </span>
                                          </div>
                                        </label>

                                        {isChecked && !isSuperAccount && (
                                          <div className="pl-6 flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-indigo-700 shrink-0">
                                              Birim Rol Yetkisi:
                                            </span>
                                            <select
                                              value={effectiveRoleId}
                                              onChange={(e) =>
                                                setDeptFormUserRoles((prev) => ({
                                                  ...prev,
                                                  [uid]: e.target.value,
                                                }))
                                              }
                                              className="flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                            >
                                              {accessRoles.map((r) => (
                                                <option key={r.id} value={r.id}>
                                                  {r.name}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                              )}
                            </div>
                          </div>

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
                                  placeholder="Örn: BİLGİ İŞLEM BİRİMİ"
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
                          Tüm genel birim tanımlamalarının QR kodudur. Herhangi bir özel ayrım barındırmayan genel bildirim formuna yönlendirir.
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

                    {/* Units List with Custom QR Codes */}
                    <div className="lg:col-span-8">
                      {isDeptsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                          <span className="text-xs font-semibold">Birim listesi yükleniyor...</span>
                        </div>
                      ) : sortedDepartments.length === 0 ? (
                        <div className="border border-dashed border-slate-200 rounded-2xl p-16 text-center text-slate-400 bg-slate-50/20">
                          <div className="p-3 bg-white border border-slate-100 rounded-full shadow-sm mb-3 inline-block">
                            <Building className="h-6 w-6 text-slate-300" />
                          </div>
                          <h4 className="font-bold text-slate-700 text-sm">Tanımlı Birim Bulunmuyor</h4>
                          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                            Sistemde henüz kayıtlı bir birim bulunmuyor. Sol taraftaki formu kullanarak ilk biriminizi oluşturun.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Tanımlı Birimler ({sortedDepartments.length}) • Sıralama Sırasına Göre Listeleniyor
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {sortedDepartments.map((dept) => {
                            const qrUrl = dept.isCustomQr 
                              ? `${window.location.origin}?view=submit&dept=${encodeURIComponent(dept.name)}`
                              : `${window.location.origin}?view=submit`;

                            const unitResponsibles = panelUsers
                              .filter((u) => isUserAssignedToDepartment(u, dept))
                              .map((u) => ({
                                id: u.id,
                                name: u.name,
                                email: u.email,
                                role: u.role,
                              }));

                            return (
                              <div 
                                key={dept.id} 
                                className={`border rounded-2xl p-4 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between ${
                                  dept.isActive === false ? "bg-slate-50/60 border-slate-200/80 opacity-80" : "bg-white border-slate-100"
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px] border border-indigo-100" title="Sıralama Önceliği">
                                          #{typeof dept.order === "number" ? dept.order : "-"}
                                        </span>
                                        <h4 className="text-sm font-bold text-slate-800">{dept.name}</h4>
                                      </div>
                                      <div className="mt-1 space-y-0.5">
                                        {unitResponsibles.length > 0 ? (
                                          unitResponsibles.map((u) => (
                                            <div key={u.id || u.email} className="flex items-center gap-1.5 max-w-[230px]">
                                              <span className="text-[10px] text-indigo-600 font-medium truncate" title={`${u.name} (${u.email})`}>
                                                👤 {u.name} ({u.email})
                                              </span>
                                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold shrink-0">
                                                {getRoleDisplayName(u.role, accessRoles)}
                                              </span>
                                            </div>
                                          ))
                                        ) : (
                                          <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                                            👤 Sorumlu Belirtilmemiş
                                          </span>
                                        )}
                                      </div>
                                      {dept.directReferral && (
                                        <div className="mt-1.5 text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-100/60 rounded-lg px-2 py-0.5 inline-flex items-center gap-1">
                                          ⚡ Birime Doğrudan Havale ({unitResponsibles.length} Yetkili)
                                        </div>
                                      )}
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                      {/* Aktif / Pasif Toggle Button Badge */}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleDeptStatus(dept)}
                                        className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer transition border ${
                                          dept.isActive !== false
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                                        }`}
                                        title="Durumu değiştirmek için tıklayın (Aktif / Pasif)"
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${dept.isActive !== false ? "bg-emerald-500" : "bg-slate-400"}`}></span>
                                        {dept.isActive !== false ? "AKTİF" : "PASİF"}
                                      </button>

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
                                          BİRİME HAVALE
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
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {adminSubTab === "workflow" && (activeRolePerms.canViewDofs || activeRolePerms.canEditDof) && (
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
                        Sistem tarafından otomatik birim sorumluluğu eşleşmesiyle veya doğrudan biriminize/üzerinize atanmış aktif DÖF işlerinin listesi.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                        {workflowDeptFilter === "me" ? "Üzerimdeki / Birimimdeki İşler" : workflowDeptFilter === "all" ? "Tüm İşler" : `${workflowDeptFilter} İşleri`}
                      </span>
                      <span className="text-2xl font-display font-bold text-indigo-600 block mt-0.5">{filteredWorkflowDofs.length} Adet</span>
                    </div>
                  </div>

                  {/* Birim Seçim Filtresi (Yalnızca Yönetici / Editör görebilir) */}
                  {isAdminOrEditor && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 border border-slate-100/80 p-4 rounded-2xl mb-6 text-xs shadow-xs">
                      <div className="space-y-1">
                        <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-indigo-600" />
                          Birim Filtreleme Paneli
                        </span>
                        <p className="text-slate-500 text-[11px] leading-relaxed">
                          Yönetici/Editör yetkisiyle, aşağıdan seçeceğiniz birime ait iş akışlarını ve DÖF görevlerini anlık listeleyebilirsiniz.
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <span className="text-slate-600 font-bold whitespace-nowrap">Birim:</span>
                        <select
                          value={workflowDeptFilter}
                          onChange={(e) => setWorkflowDeptFilter(e.target.value)}
                          className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold outline-none focus:border-indigo-500 cursor-pointer shadow-xs transition duration-200"
                        >
                          <option value="me">Bana / Birimime Atananlar</option>
                          <option value="all">Tüm Birimler (Genel Akış)</option>
                          {sortedDepartments.map((dept) => (
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
                         `${workflowDeptFilter} Birimine Ait Görev Bulunmuyor`}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                        {workflowDeptFilter === "me" ? "Şu anda doğrudan üzerinize atanmış veya sorumlu olduğunuz birime ait aktif bir düzeltici önleyici faaliyet bulunmamaktadır." :
                         workflowDeptFilter === "all" ? "Sistem genelinde işlem gören veya bekleyen aktif düzeltici önleyici faaliyet bulunmamaktadır." :
                         `Şu anda ${workflowDeptFilter} birimi için atanmış veya işlemde olan aktif bir düzeltici önleyici faaliyet bulunmamaktadır.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-slate-500">
                        {workflowDeptFilter === "me" ? "Aşağıdaki işler tamamlanmak üzere sizin veya biriminizin aksiyon almasını bekliyor. İncelemek ve güncellemek için tıklayın:" :
                         workflowDeptFilter === "all" ? "Tüm birimlere ait aktif iş akışı ve DÖF takipleri listeleniyor. Detay için tıklayın:" :
                         `Aşağıdaki işler ${workflowDeptFilter} birimi bünyesinde işlem görmektedir. İncelemek ve güncellemek için tıklayın:`}
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
                              <th className="p-4">İlişkili Birim</th>
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

            {adminSubTab === "reports" && activeRolePerms.canViewReports && (() => {
              const reportsDofs = visibleDofs;
              const canViewGlobalReports =
                isSystemAdmin ||
                activeRolePerms.dofScope === "all" ||
                Boolean(activePanelUser?.canSeeAllDofs) ||
                (activeUserAuthorizedUnits.size === 0 && activePanelUser?.role === "viewer") ||
                normalizeUnitText(activePanelUser?.department) === "tüm birimler";

              const visibleDepartments = canViewGlobalReports
                ? sortedDepartments
                : sortedDepartments.filter((dept) => activeUserAuthorizedUnits.has(normalizeUnitText(dept.name)));

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
                          {canViewGlobalReports ? "DÖF Performans & Dağılım Raporları" : `Birim DÖF Performans Raporu (${activeUserAuthorizedUnitLabel || "Biriminiz"})`}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {canViewGlobalReports 
                            ? "Birim bazlı dağılımlar, bildirim türleri ve çözüm performansı odaklı analitik veriler."
                            : `Sadece ${activeUserAuthorizedUnitLabel || "biriminize"} ait DÖF performans metrikleri ve analitik veriler.`}
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
                        {canViewGlobalReports ? "BİRİM BAZINDA BİLDİRİM DAĞILIMI" : "BİRİMİNİZ BİLDİRİM DAĞILIMI"}
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                        <table className="w-full text-left border-collapse text-xs font-sans">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                              <th className="p-4">Birim Adı</th>
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

            {adminSubTab === "logs" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
              <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md space-y-6 animate-fade-in" id="system-audit-logs-section">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                        <Shield className="h-5 w-5" />
                      </span>
                      Sistem Logları & İşlem Denetim Günlüğü
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                      Silinen DÖF kayıtları, kim tarafından silindiği bilgisi, yetkili bazlı işlem geçmişi ve otomatik sistem e-posta bildirimlerinin detaylı denetim günlüğü.
                    </p>
                  </div>

                  <button
                    onClick={fetchLogs}
                    disabled={isEmailLogsLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 text-indigo-700 font-semibold rounded-xl text-xs border border-indigo-100 transition cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isEmailLogsLoading ? "animate-spin" : ""}`} />
                    Günlüğü Yenile
                  </button>
                </div>

                {/* Quick Stats Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Toplam Günlük Kaydı</span>
                    <span className="text-xl font-black text-slate-800 mt-0.5 block">{emailLogs.length}</span>
                  </div>
                  <div className="bg-rose-50/60 border border-rose-200/60 rounded-2xl p-3.5">
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wide block">🗑️ Silinen DÖF Kayıtları</span>
                    <span className="text-xl font-black text-rose-700 mt-0.5 block">{deletedLogsCount}</span>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-200/60 rounded-2xl p-3.5">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide block">✉️ E-posta & Bildirimler</span>
                    <span className="text-xl font-black text-indigo-700 mt-0.5 block">{emailLogs.length - deletedLogsCount}</span>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-2xl p-3.5">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide block">👥 Kayıtlı Yetkili Sayısı</span>
                    <span className="text-xl font-black text-emerald-800 mt-0.5 block">{logPersons.length}</span>
                  </div>
                </div>

                {/* Advanced Filter Bar */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Filter className="h-4 w-4 text-indigo-600" />
                      <span>Log & Denetim Filtreleri</span>
                    </div>
                    {(logUserFilter !== "all" || logTypeFilter !== "all" || logSearchTerm !== "") && (
                      <button
                        onClick={() => {
                          setLogUserFilter("all");
                          setLogTypeFilter("all");
                          setLogSearchTerm("");
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* 1. İlgili Kişi / İşlemi Yapan Filtresi */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        İlgili Kişi / İşlemi Yapan
                      </label>
                      <select
                        value={logUserFilter}
                        onChange={(e) => setLogUserFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                      >
                        <option value="all">👤 Tüm Kişiler & Yetkililer (Filtresiz)</option>
                        {logPersons.map((p) => (
                          <option key={p.email} value={p.email}>
                            👤 {p.name} ({p.email}) {p.role ? `[${p.role.toUpperCase()}]` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2. İşlem / Log Türü */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        İşlem / Log Türü
                      </label>
                      <select
                        value={logTypeFilter}
                        onChange={(e) => setLogTypeFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                      >
                        <option value="all">Tüm İşlemler</option>
                        <option value="dof_deleted">🗑️ Silinen DÖF Kayıtları ({deletedLogsCount})</option>
                        <option value="notifications">✉️ E-posta & Sistem Bildirimleri</option>
                        <option value="new_dof">🆕 Yeni Kayıt Bildirimleri</option>
                        <option value="status_change">🔄 Durum Güncellemeleri</option>
                      </select>
                    </div>

                    {/* 3. Arama Çubuğu */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        Metin / Ref No Arama
                      </label>
                      <div className="relative">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={logSearchTerm}
                          onChange={(e) => setLogSearchTerm(e.target.value)}
                          placeholder="Ref No, başlık, kişi veya e-posta..."
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Table or Empty State */}
                {isEmailLogsLoading && emailLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                    <span className="text-xs font-semibold">Bildirim ve denetim kayıtları yükleniyor...</span>
                  </div>
                ) : filteredEmailLogs.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 border-dashed rounded-2xl p-16 text-center text-slate-400">
                    <div className="p-3.5 bg-white border border-slate-100 rounded-full shadow-sm mb-4 inline-block">
                      <Search className="h-8 w-8 text-slate-300" />
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm">Eşleşen Günlük Kaydı Bulunamadı</h3>
                    <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                      Seçilen kişi veya filtrelere ait herhangi bir işlem kaydı bulunamadı. Filtreleri sıfırlayarak tüm kayıtlara ulaşabilirsiniz.
                    </p>
                    <button
                      onClick={() => {
                        setLogUserFilter("all");
                        setLogTypeFilter("all");
                        setLogSearchTerm("");
                      }}
                      className="mt-4 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      Filtreleri Sıfırla
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                      <span>Gösterilen Kayıt: <strong className="text-slate-800 font-bold">{filteredEmailLogs.length}</strong> / {emailLogs.length}</span>
                      {logUserFilter !== "all" && (
                        <span className="inline-flex items-center gap-1 font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                          <User className="h-3 w-3" />
                          Seçili Yetkili: {logPersons.find(p => p.email === logUserFilter)?.name || logUserFilter}
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left border-collapse text-xs font-sans">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                            <th className="p-4">DÖF Ref No</th>
                            <th className="p-4">İşlem / Tür</th>
                            <th className="p-4">İşlemi Yapan / İlgili Kişi</th>
                            <th className="p-4">Konu Başlığı</th>
                            <th className="p-4">İşlem Tarihi</th>
                            <th className="p-4">Durum</th>
                            <th className="p-4 text-center">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredEmailLogs.map((log) => {
                            const isExpanded = expandedLogId === log.id;
                            const isDeletion = log.type === "dof_deleted";
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
                              return isNaN(date.getTime()) ? String(sentAt) : date.toLocaleString("tr-TR");
                            };

                            const actorDisplayName = log.actorName || (log.actorEmail ? log.actorEmail.split("@")[0] : null);
                            const actorDisplayEmail = log.actorEmail || log.recipient || log.to || "-";

                            return (
                              <React.Fragment key={log.id}>
                                <tr className={`hover:bg-slate-50/50 transition ${isDeletion ? "bg-rose-50/20" : ""}`}>
                                  <td className="p-4 font-mono font-bold text-slate-900">
                                    {log.dofRefNo || log.refNo || "-"}
                                  </td>
                                  <td className="p-4">
                                    {isDeletion ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-black text-[10px] uppercase bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                                        <Trash2 className="h-3 w-3 text-rose-600" />
                                        DÖF Silindi
                                      </span>
                                    ) : log.type === "new_dof" || log.type === "dof_created_notification" ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border bg-blue-50 text-blue-700 border-blue-100">
                                        Yeni Kayıt
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border bg-purple-50 text-purple-700 border-purple-100">
                                        Durum Güncelleme
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    <div className="flex flex-col">
                                      <span className="font-bold text-slate-800 flex items-center gap-1">
                                        <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                        {actorDisplayName || actorDisplayEmail.split("@")[0]}
                                      </span>
                                      <span className="font-mono text-[10px] text-slate-400 pl-4.5 truncate max-w-[200px]">
                                        {actorDisplayEmail}
                                      </span>
                                      {log.actorRole && (
                                        <span className="text-[9px] font-bold text-indigo-600 uppercase pl-4.5 mt-0.5">
                                          [{log.actorRole}]
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-4 font-medium text-slate-800 max-w-xs truncate">
                                    {log.subject || log.dofTitle || "-"}
                                  </td>
                                  <td className="p-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                                    {formatLogDate(log.sentAt)}
                                  </td>
                                  <td className="p-4">
                                    {isDeletion ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[10px] uppercase">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                        SİLİNDİ
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px] uppercase">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        GÖNDERİLDİ
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-4 text-center">
                                    <button
                                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold cursor-pointer ${
                                        isExpanded
                                          ? "bg-slate-800 text-white"
                                          : isDeletion
                                          ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                      }`}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      {isExpanded ? "Kapat" : isDeletion ? "Silen Kişi & Detay" : "Önizle"}
                                    </button>
                                  </td>
                                </tr>

                                {isExpanded && (
                                  <tr>
                                    <td colSpan={7} className="p-4 bg-slate-50 border-t border-b border-slate-100">
                                      {isDeletion ? (
                                        <div className="bg-white border-2 border-rose-200 rounded-2xl p-5 shadow-xs space-y-4">
                                          <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                                            <div className="flex items-center gap-2 text-rose-700 font-black text-sm uppercase tracking-wide">
                                              <AlertTriangle className="h-5 w-5 text-rose-600" />
                                              <span>DÖF Silme İşlemi Denetim Kaydı</span>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-400">Log ID: {log.id}</span>
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-rose-50/50 p-3.5 rounded-xl border border-rose-100 text-xs">
                                            <div>
                                              <span className="text-[10px] font-bold text-rose-500 uppercase block">Silme İşlemini Yapan</span>
                                              <span className="font-extrabold text-slate-800 mt-0.5 block">
                                                {log.actorName || "Süper Yönetici"}
                                              </span>
                                              <span className="text-[10px] text-slate-500 font-mono block">
                                                {log.actorEmail || "-"}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-[10px] font-bold text-rose-500 uppercase block">Yetki Düzeyi</span>
                                              <span className="font-bold text-slate-800 mt-0.5 block uppercase">
                                                {log.actorRole || "admin"}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-[10px] font-bold text-rose-500 uppercase block">Silinme Zamanı</span>
                                              <span className="font-bold text-slate-800 mt-0.5 block font-mono">
                                                {formatLogDate(log.sentAt)}
                                              </span>
                                            </div>
                                            <div>
                                              <span className="text-[10px] font-bold text-rose-500 uppercase block">Silinen Referans No</span>
                                              <span className="font-mono font-black text-rose-700 mt-0.5 block">
                                                #{log.dofRefNo || log.refNo || "-"}
                                              </span>
                                            </div>
                                          </div>

                                          {log.body && (
                                            <div>
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                                İşlem Detayları & Silinen Veri Özeti
                                              </span>
                                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs whitespace-pre-wrap leading-relaxed text-slate-700">
                                                {log.body}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                              📧 E-posta Bildirim İçeriği & Detayı
                                            </span>
                                            <span className="text-xs font-mono text-slate-400">Kayıt ID: {log.id}</span>
                                          </div>
                                          {log.html ? (
                                            <div 
                                              className="bg-white border border-slate-100 rounded-xl p-6 shadow-inner max-h-[500px] overflow-auto"
                                              dangerouslySetInnerHTML={{ __html: log.html }}
                                            />
                                          ) : log.body ? (
                                            <div className="bg-white border border-slate-100 rounded-xl p-5 font-mono text-xs whitespace-pre-wrap text-slate-700 leading-relaxed">
                                              {log.body}
                                            </div>
                                          ) : (
                                            <div className="bg-white border border-slate-100 rounded-xl p-5 text-slate-400 text-xs italic">
                                              Kayıtlı metin içeriği bulunmuyor.
                                            </div>
                                          )}
                                        </div>
                                      )}
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

            {adminSubTab === "remote" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
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
                            <p className="text-[10px] text-slate-400 mt-0.5">Sistem yöneticileri ve birim sorumlularının paneli kontrol etmesi içindir. Şifre/Google ile giriş gerektirir.</p>
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

            {adminSubTab === "database" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
              <div className="space-y-6 animate-fade-in" id="admin-database-tables-section">
                <DofDatabaseSettings
                  dofsCount={visibleDofs.length}
                  departmentsCount={departments.length}
                  panelUsersCount={panelUsers.length}
                  foldersCount={folders.length}
                  passwordRequestsCount={passwordRequests.length}
                  emailLogsCount={emailLogs.length}
                  sampleDof={dofs[0]}
                  onRefreshAll={() => {
                    fetchLogs();
                    fetchAllUsers();
                  }}
                />
              </div>
            )}

        {adminSubTab === "dofs" && activeRolePerms.canViewDofs && (
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
                    {(searchTerm || statusFilter !== "all" || typeFilter !== "all" || deptFilter !== "all" || referralFilter !== "all" || folderFilter !== "all" || dateRangePreset !== "all" || dateStart || dateEnd) && (
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Durum / Aşama</label>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium"
                        >
                          <option value="acik">🟢 Açık & İşlemde (Yeni & İnceleniyor)</option>
                          <option value="all">Tümü (Filtresiz)</option>
                          <option value="kapali">{isSystemAdmin ? "🔴 Kapalı (Çözüldü & Red)" : "🟢 Çözülenler (Kapatılan)"}</option>
                          <option value="bekleyen">Bekleyenler</option>
                          <option value="yeni">Yeni Başvuru</option>
                          <option value="inceleniyor">İnceleniyor</option>
                          <option value="cozuldu">Çözüldü</option>
                          {isSystemAdmin && <option value="reddedildi">Reddedildi</option>}
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
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Birim</label>
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

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1 flex items-center gap-1">
                          <FolderKanban className="h-3 w-3 text-indigo-500" />
                          Klasör
                        </label>
                        <select
                          value={folderFilter}
                          onChange={(e) => setFolderFilter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs outline-none focus:border-indigo-500 font-medium font-semibold"
                        >
                          <option value="all">Tüm Klasörler</option>
                          <option value="unassigned">Klasörsüz DÖF'ler ({visibleDofs.filter(d => !d.folderId).length})</option>
                          {folders.map((f) => {
                            const count = visibleDofs.filter(d => d.folderId === f.id).length;
                            return (
                              <option key={f.id} value={f.id}>
                                📁 {f.name} ({count})
                              </option>
                            );
                          })}
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
                    {(searchTerm || statusFilter !== "all" || typeFilter !== "all" || deptFilter !== "all" || referralFilter !== "all" || folderFilter !== "all" || dateRangePreset !== "all" || dateStart || dateEnd) && (
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("acik");
                          setTypeFilter("all");
                          setDeptFilter("all");
                          setReferralFilter("all");
                          setFolderFilter("all");
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
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <span className="text-sm font-bold text-slate-800">
                  {isSystemAdmin ? "Tüm DÖF Başvuruları" : `${activeUserAuthorizedUnitLabel || "Birim"} DÖF Başvuruları`}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-2 tabular-nums">
                  ({filteredDofs.length} / {totalCount})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchAllDofs}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                  title="Listeyi Yenile"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Yenile</span>
                </button>
              </div>
            </div>

            {/* Hızlı Ayrım ve Filtre Çubuğu (Faaliyet Türü ve Durum/Kapanış Ayrımı) */}
            <div className="p-3 sm:p-4 bg-slate-50/50 border-b border-slate-100 space-y-3">
              {/* 1. Faaliyet Türü Ayrımı (Düzeltici vs Önleyici) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 sm:w-28">
                  Faaliyet Türü:
                </span>
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 sm:flex-wrap no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setTypeFilter("all")}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                      typeFilter === "all"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <span>Tüm Türler</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700 text-white font-mono">
                      {totalCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTypeFilter(typeFilter === "düzeltici" ? "all" : "düzeltici")}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                      typeFilter === "düzeltici"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                        : "bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200"
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                    <span>Düzeltici</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${typeFilter === "düzeltici" ? "bg-indigo-800 text-white" : "bg-indigo-100 text-indigo-800"}`}>
                      {correctiveCount}
                    </span>
                    <span className="text-[9px] opacity-80 hidden md:inline">
                      ({correctiveDaysSetting} İş Günü Planlama)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTypeFilter(typeFilter === "önleyici" ? "all" : "önleyici")}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                      typeFilter === "önleyici"
                        ? "bg-teal-700 text-white shadow-md shadow-teal-100"
                        : "bg-white text-teal-800 hover:bg-teal-50 border border-teal-200"
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>Önleyici</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${typeFilter === "önleyici" ? "bg-teal-900 text-white" : "bg-teal-100 text-teal-800"}`}>
                      {preventiveCount}
                    </span>
                    <span className="text-[9px] opacity-80 hidden md:inline">
                      ({preventiveDaysSetting} İş Günü Planlama)
                    </span>
                  </button>
                </div>
              </div>

              {/* 2. Aşama ve Kapanış Bilgisi Ayrımı (Tamamlanan, Kapatılan, Açık) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 sm:w-28">
                  Durum / Aşama:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 sm:flex-wrap no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      statusFilter === "all"
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    Tümü
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === "acik" ? "all" : "acik")}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums ${
                      statusFilter === "acik"
                        ? "bg-amber-600 text-white"
                        : "bg-white text-amber-800 hover:bg-amber-50 border border-amber-200"
                    }`}
                  >
                    <span>Açık & İşlemde</span>
                    <span className="text-[10px] font-mono opacity-80">({openCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === "cozuldu" ? "all" : "cozuldu")}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums ${
                      statusFilter === "cozuldu" || statusFilter === "tamamlandi"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200"
                    }`}
                  >
                    <CheckCircle className="h-3 w-3 shrink-0" />
                    <span>Tamamlanan</span>
                    <span className="text-[10px] font-mono opacity-80">({resolvedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === "kapali" ? "all" : "kapali")}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums ${
                      statusFilter === "kapali"
                        ? "bg-slate-700 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <span>Kapatılanlar</span>
                    <span className="text-[10px] font-mono opacity-80">({closedCount})</span>
                  </button>

                  {isSystemAdmin && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter(statusFilter === "reddedildi" ? "all" : "reddedildi")}
                      className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums ${
                        statusFilter === "reddedildi"
                          ? "bg-rose-600 text-white"
                          : "bg-white text-rose-700 hover:bg-rose-50 border border-rose-200"
                      }`}
                    >
                      <XCircle className="h-3 w-3 shrink-0" />
                      <span>Reddedilen</span>
                      <span className="text-[10px] font-mono opacity-80">({rejectedCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Klasör Ayrımı & Hızlı Klasör Çubuğu */}
              {folders.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-200/60">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 sm:w-28 flex items-center gap-1">
                    <FolderKanban className="h-3 w-3 text-indigo-500" />
                    Klasörler:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 sm:flex-wrap no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setFolderFilter("all")}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                        folderFilter === "all"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      Tümü
                    </button>

                    <button
                      type="button"
                      onClick={() => setFolderFilter(folderFilter === "unassigned" ? "all" : "unassigned")}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        folderFilter === "unassigned"
                          ? "bg-slate-700 text-white shadow-xs"
                          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      <span>Klasörsüz</span>
                      <span className="text-[10px] font-mono opacity-80">
                        ({visibleDofs.filter(d => !d.folderId).length})
                      </span>
                    </button>

                    {folders.map(f => {
                      const count = visibleDofs.filter(d => d.folderId === f.id).length;
                      const isSelected = folderFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFolderFilter(isSelected ? "all" : f.id!)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100 ring-2 ring-indigo-400"
                              : "bg-white text-indigo-900 hover:bg-indigo-50 border border-indigo-200"
                          }`}
                        >
                          <Folder className="h-3 w-3 text-amber-500 shrink-0" />
                          <span>{f.name}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isSelected ? "bg-indigo-900 text-white" : "bg-indigo-100 text-indigo-700"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setAdminSubTab("folders")}
                      className="min-h-[34px] px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 ml-auto cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      Klasör Yönetimi
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Toplu Klasör & DÖF İşlem Barı (Seçilen DÖF'ler) */}
            {selectedDofIds.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-200 p-3.5 px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xs">
                    <CheckSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-950">
                      {selectedDofIds.length} adet DÖF seçildi
                    </span>
                    <span className="text-[11px] text-indigo-700 font-medium ml-2 hidden md:inline">
                      (Seçtiğiniz kayıtları klasöre taşıyabilir veya klasörden çıkarabilirsiniz)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkTargetFolderId}
                    onChange={(e) => setBulkTargetFolderId(e.target.value)}
                    className="bg-white border border-indigo-200 text-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
                  >
                    <option value="">-- Hedef Klasörü Seçin --</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleBulkMoveToFolder(bulkTargetFolderId)}
                    disabled={!bulkTargetFolderId || isBulkMoving}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    {isBulkMoving ? (
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <FolderCheck className="h-3.5 w-3.5" />
                    )}
                    <span>Klasöre Taşı</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBulkRemoveFromFolder}
                    disabled={isBulkMoving}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
                    title="Seçili DÖF'leri mevcut klasörlerinden çıkarır"
                  >
                    Klasörden Çıkar
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedDofIds([])}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition cursor-pointer ml-1"
                    title="Seçimi Temizle"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
                <p className="text-slate-400 text-xs">Yükleniyor...</p>
              </div>
            ) : filteredDofs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <p>Seçilen filtre kriterlerine uygun DÖF kaydı bulunamadı.</p>
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("all");
                    setStatusFilter("acik");
                    setSearchTerm("");
                    setDeptFilter("all");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100 transition cursor-pointer"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Touch-Friendly Card List (< 1024px) */}
                <div className="lg:hidden divide-y divide-slate-100">
                  {filteredDofs.map((dof) => {
                    const riskInfo = getDofScoreAndLevel(dof);
                    const statusLabel =
                      dof.status === "cozuldu"
                        ? "Çözüldü"
                        : dof.status === "reddedildi"
                        ? "Reddedildi"
                        : dof.status === "inceleniyor"
                        ? "İnceleniyor"
                        : "Yeni";
                    const statusClass =
                      dof.status === "cozuldu"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : dof.status === "reddedildi"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : dof.status === "inceleniyor"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200";

                    const elapsedMs = Date.now() - (dof.createdAt?.seconds ? dof.createdAt.seconds * 1000 : new Date(dof.createdAt).getTime());
                    const elapsedDays = Math.max(1, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));
                    const durationLabel =
                      dof.status === "cozuldu" || dof.status === "reddedildi"
                        ? dof.completionDays
                          ? `${dof.completionDays} gün`
                          : "Kapalı"
                        : `${elapsedDays} gün açık`;

                    return (
                      <div
                        key={dof.id}
                        onClick={() => handleSelectDof(dof)}
                        className={`p-3.5 transition cursor-pointer active:bg-slate-50 ${
                          selectedDof?.id === dof.id ? "bg-indigo-50/40" : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-indigo-700">{dof.refNo}</span>
                              <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusClass}`}>
                                {statusLabel}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500">
                                {dof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                              </span>
                              {riskInfo.level === "Yüksek" && (
                                <span className="text-[10px] font-bold text-rose-700">Yüksek Risk</span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                              {dof.title}
                            </h4>

                            <p className="text-xs text-slate-500 leading-relaxed">
                              {dof.department} · {dof.assignedUserName || "Atanmamış"} · {durationLabel}
                              {dof.folderName ? ` · 📁 ${dof.folderName}` : ""}
                            </p>
                          </div>

                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                        </div>

                        <div
                          className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="flex items-center gap-2 text-xs text-slate-500 font-medium cursor-pointer min-h-[36px] px-1">
                            <input
                              type="checkbox"
                              checked={selectedDofIds.includes(dof.id!)}
                              onChange={() => handleToggleSelectDof(dof.id!)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Seç</span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSelectDof(dof)}
                              className="min-h-[36px] px-2.5 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs cursor-pointer"
                            >
                              İncele
                            </button>
                            <button
                              type="button"
                              onClick={() => setSingleQrModalDof(dof)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
                              title="QR Göster"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <a
                              href={`?view=edit&refNo=${encodeURIComponent(dof.refNo)}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
                              title="Mobilde Düzenle"
                            >
                              <Smartphone className="h-3.5 w-3.5" />
                            </a>
                            {dof.status !== "reddedildi" && (
                              <button
                                type="button"
                                onClick={() => handleRejectDof(dof)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center bg-rose-50 text-rose-600 rounded-lg cursor-pointer"
                                title="Reddet"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= 1024px) */}
                <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Tümünü Seç / Seçimi Kaldır"
                          checked={selectedDofIds.length === filteredDofs.length && filteredDofs.length > 0}
                          onChange={handleToggleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Döf Başvuru</th>
                      <th className="p-4">Klasör</th>
                      <th className="p-4">Faaliyet Türü</th>
                      <th className="p-4">Durumu & Kapanış</th>
                      <th className="p-4">Planlanan Termin</th>
                      <th className="p-4">Süre</th>
                      <th className="p-4">Aciliyet</th>
                      <th className="p-4">Risk Skoru</th>
                      <th className="p-4">Sorumlu & Birim</th>
                      <th className="p-4">Oluşturma</th>
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

                      // Target Completion Date Analysis
                      let targetDateText = "-";
                      let targetStatusTag: React.ReactNode = null;
                      if (dof.targetCompletionDate) {
                        try {
                          const target = new Date(dof.targetCompletionDate);
                          if (!isNaN(target.getTime())) {
                            targetDateText = target.toLocaleDateString("tr-TR");
                            if (dof.status === "cozuldu") {
                              targetStatusTag = (
                                <span className="text-[9px] font-bold text-emerald-700 flex items-center gap-0.5">
                                  <Check className="h-2.5 w-2.5" /> Tamamlandı
                                </span>
                              );
                            } else if (dof.status === "reddedildi") {
                              targetStatusTag = (
                                <span className="text-[9px] font-bold text-slate-400">
                                  Kapatıldı
                                </span>
                              );
                            } else {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              target.setHours(0, 0, 0, 0);
                              const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                              if (diffDays < 0) {
                                targetStatusTag = (
                                  <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                    Termin Aşıldı ({Math.abs(diffDays)}g)
                                  </span>
                                );
                              } else if (diffDays <= 2) {
                                targetStatusTag = (
                                  <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                    Son {diffDays} Gün!
                                  </span>
                                );
                              } else {
                                targetStatusTag = (
                                  <span className="text-[9px] font-medium text-slate-500">
                                    Kalan: {diffDays} Gün
                                  </span>
                                );
                              }
                            }
                          }
                        } catch (e) {}
                      }

                      return (
                        <tr
                          key={dof.id}
                          onClick={() => handleSelectDof(dof)}
                          className={`hover:bg-indigo-50/20 transition cursor-pointer ${
                            selectedDofIds.includes(dof.id!)
                              ? "bg-indigo-50/60 font-medium"
                              : selectedDof?.id === dof.id
                              ? "bg-indigo-50/40 font-medium"
                              : ""
                          }`}
                        >
                          {/* Seçim Checkbox */}
                          <td className="p-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`DÖF ${dof.refNo} Seç`}
                              checked={selectedDofIds.includes(dof.id!)}
                              onChange={() => handleToggleSelectDof(dof.id!)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>

                          {/* Döf Başvuru */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-[10px] font-bold text-indigo-600">{dof.refNo}</span>
                              <span className="font-semibold text-slate-900 line-clamp-1">{dof.title}</span>
                            </div>
                          </td>

                          {/* Klasör Bilgisi & Hızlı Atama */}
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col gap-1">
                              {dof.folderId ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 font-bold text-[10px] w-fit">
                                  <Folder className="h-3 w-3 text-amber-600 shrink-0" />
                                  <span className="truncate max-w-[110px]">{dof.folderName || "Klasörlü"}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium italic">
                                  Klasörsüz
                                </span>
                              )}
                              <select
                                value={dof.folderId || ""}
                                onChange={(e) => handleAssignDofFolder(dof.id!, e.target.value)}
                                className="text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded p-1 outline-none cursor-pointer max-w-[120px]"
                                title="Klasörü Değiştir veya Ata"
                              >
                                <option value="">Klasör Seç...</option>
                                {folders.map(f => (
                                  <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                              </select>
                            </div>
                          </td>

                          {/* Faaliyet Türü (Düzeltici vs Önleyici Ayrımı) */}
                          <td className="p-4">
                            {dof.type === "düzeltici" ? (
                              <div className="flex flex-col gap-0.5 items-start">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-extrabold text-[10px] uppercase tracking-wide shadow-2xs">
                                  <Wrench className="h-3 w-3 text-indigo-600" />
                                  Düzeltici Faaliyet
                                </span>
                                <span className="text-[9px] text-slate-500 font-semibold pl-1">
                                  Plan: {correctiveDaysSetting} İş Günü
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5 items-start">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-800 font-extrabold text-[10px] uppercase tracking-wide shadow-2xs">
                                  <ShieldCheck className="h-3 w-3 text-teal-600" />
                                  Önleyici Faaliyet
                                </span>
                                <span className="text-[9px] text-slate-500 font-semibold pl-1">
                                  Plan: {preventiveDaysSetting} İş Günü
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Durumu & Kapanış Bilgisi */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1 items-start">
                              {dof.status === "cozuldu" ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] uppercase tracking-wide border border-emerald-300 shadow-2xs">
                                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                                    Tamamlandı (Çözüldü)
                                  </span>
                                  <span className="text-[9px] text-emerald-700 font-bold pl-1 flex items-center gap-1">
                                    🔒 Kapatıldı {dof.completionDays ? `• ${dof.completionDays} günde` : ""}
                                  </span>
                                </>
                              ) : dof.status === "reddedildi" ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px] uppercase tracking-wide border border-rose-300 shadow-2xs">
                                    <XCircle className="h-3 w-3 text-rose-600" />
                                    Kapatıldı (Reddedildi)
                                  </span>
                                  <span className="text-[9px] text-rose-600 font-bold pl-1">
                                    ⛔ Süreç Sonlandırıldı
                                  </span>
                                </>
                              ) : dof.status === "inceleniyor" ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[10px] uppercase tracking-wide border border-amber-300 shadow-2xs">
                                    <Clock className="h-3 w-3 text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                                    İnceleniyor (İşlemde)
                                  </span>
                                  <span className="text-[9px] text-amber-700 font-semibold pl-1">
                                    🟢 Açık • Faaliyet Uygulanıyor
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-extrabold text-[10px] uppercase tracking-wide border border-blue-300 shadow-2xs">
                                    <AlertTriangle className="h-3 w-3 text-blue-600" />
                                    Yeni Başvuru
                                  </span>
                                  <span className="text-[9px] text-blue-700 font-semibold pl-1">
                                    🟢 Açık • Değerlendirme Bekliyor
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Planlanan Termin */}
                          <td className="p-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-800 font-semibold">{targetDateText}</span>
                              {targetStatusTag}
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
                          
                          {/* Sorumlu & Birim */}
                          <td className="p-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-800 font-semibold">{dof.assignedUserName || "Atanmamış"}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{dof.department}</span>
                            </div>
                          </td>
                          
                          {/* DÖF Oluşturma Tarihi */}
                          <td className="p-4 text-slate-500">{formatDate(dof.createdAt)}</td>

                          {/* İşlemler */}
                          <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Yatık Çıktı Butonu */}
                              <button
                                type="button"
                                onClick={() => {
                                  setLandscapeTargetDof(dof);
                                  setShowLandscapeModal(true);
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 text-emerald-700 rounded-lg transition cursor-pointer border border-emerald-200/60"
                                title="Yatık Kağıt Çıktısı (Önce/Sonra & Çözüm Raporu)"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
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
                              {dof.status !== "reddedildi" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleRejectDof(dof);
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 text-rose-600 rounded-lg transition cursor-pointer"
                                  title="DÖF Başvurusunu Reddet"
                                >
                                  <Ban className="h-3.5 w-3.5" />
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
              </>
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
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sticky top-0 z-20 shadow-xs shrink-0">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">İnceleme Ekranı</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-mono font-bold text-slate-900 tracking-tight">{selectedDof.refNo}</h2>
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

                      {/* Klasör Bilgisi ve Değiştirme */}
                      <div className="flex items-center gap-1.5 ml-1">
                        {selectedDof.folderName ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Folder className="h-3 w-3 text-amber-600" />
                            {selectedDof.folderName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full font-medium">
                            Klasörsüz
                          </span>
                        )}
                        <select
                          value={selectedDof.folderId || ""}
                          onChange={(e) => handleAssignDofFolder(selectedDof.id!, e.target.value)}
                          className="text-xs bg-white border border-slate-200 text-slate-700 rounded-lg py-1 px-2 font-medium outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                          title="DÖF'ü Klasöre Taşı"
                        >
                          <option value="">📁 Klasöre Taşı...</option>
                          {folders.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap justify-end">
                    <a
                      href={`?view=edit&refNo=${encodeURIComponent(selectedDof.refNo)}`}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
                      title="Mobil Düzenleme Sayfasını Aç"
                    >
                      <Smartphone className="h-4 w-4" /> <span className="hidden sm:inline">Mobilde Düzenle</span><span className="sm:hidden">Düzenle</span>
                    </a>
                    <button
                      onClick={() => setSingleQrModalDof(selectedDof)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 font-bold rounded-xl text-xs transition cursor-pointer border border-amber-200/70"
                      title="Mobil QR Kodunu Görüntüle ve Paylaş"
                    >
                      <QrCode className="h-4 w-4 text-amber-600" /> <span className="hidden sm:inline">Mobil QR</span><span className="sm:hidden">QR</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(selectedDof)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-bold rounded-xl text-xs transition cursor-pointer border border-indigo-200/50"
                      title="Standart PDF Raporu İndir"
                    >
                      <Download className="h-4 w-4" /> <span className="hidden sm:inline">Raporu İndir</span><span className="sm:hidden">PDF</span>
                    </button>
                    <button
                      onClick={() => {
                        setLandscapeTargetDof(selectedDof);
                        setShowLandscapeModal(true);
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 font-bold rounded-xl text-xs transition cursor-pointer border border-emerald-200/70 sm:mr-2"
                      title="Yatık Kağıt Çıktısı Al (Önce/Sonra Fotoğraflı ve Çözüm Raporu)"
                      id="header-landscape-print-btn"
                    >
                      <Printer className="h-4 w-4 text-emerald-600" /> <span className="hidden sm:inline">Yatık Çıktı (Önce / Sonra)</span><span className="sm:hidden">Yazdır</span>
                    </button>
                    {selectedDof.status !== "reddedildi" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleRejectDof(selectedDof);
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold rounded-xl text-xs transition cursor-pointer border border-rose-200"
                        title="DÖF Başvurusunu Reddet"
                      >
                        <Ban className="h-4 w-4 text-rose-600" /> Reddet
                      </button>
                    )}
                    <button
                      onClick={() => handleSelectDof(null)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                      title="Kapat"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Drawer Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6">
                  {renderDofDetailFull(selectedDof)}
                </div>
              </motion.div>
      </>
    )}
  </AnimatePresence>

      </div>
        )}

        {adminSubTab === "users" && (
    !(isSystemAdmin || activeRolePerms.canManageSystemAdmin) ? (
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase block">Erişim Rolü</label>
                  <button
                    type="button"
                    onClick={() => setAdminSubTab("roles")}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition cursor-pointer"
                  >
                    Rolleri Tanımla & Düzenle →
                  </button>
                </div>
                <select
                  value={userFormRole}
                  onChange={(e) => setUserFormRole(e.target.value as PanelUserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  {accessRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {(() => {
                  const selRole = getRoleById(userFormRole, accessRoles);
                  const rp = selRole.permissions;
                  const caps: string[] = [];
                  if (rp.canViewDashboard) caps.push("Dashboard");
                  if (rp.canViewDofs) caps.push(rp.dofScope === "all" ? "Tüm DÖF'ler" : "Birim DÖF'leri");
                  if (rp.canManageFolders) caps.push("Klasör Yönetimi");
                  if (rp.canCreateDof) caps.push("Yeni DÖF");
                  if (rp.canViewReports) caps.push("Raporlar & Analiz");
                  if (rp.canViewSettings) caps.push(rp.canManageKvkkAndVersion ? "Ayarlar (Tam)" : "Ayarlar (KVKK & Sürüm Hariç)");
                  if (rp.canManageSystemAdmin) caps.push("Tam Yönetim");
                  return (
                    <div className="mt-1.5 bg-indigo-50/60 border border-indigo-100 rounded-lg px-2.5 py-1.5 text-[10px] text-indigo-900">
                      <span className="font-bold">Yetkiler:</span> {caps.join(" • ") || "Kısıtlı"}
                    </div>
                  );
                })()}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase block">
                    Yetkili Birimler
                  </label>
                  <button
                    type="button"
                    onClick={() => setAdminSubTab("departments")}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    Birim Tanımlamaya Git →
                  </button>
                </div>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                  {(() => {
                    const assignedUnits = selectedUser
                      ? getAuthorizedDepartmentsForUser(selectedUser, departments)
                      : [];
                    if (assignedUnits.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-1">
                          {assignedUnits.map((unitName) => (
                            <span
                              key={unitName}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold"
                            >
                              {unitName}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Henüz birim atanmamış
                      </span>
                    );
                  })()}
                  <p className="text-[10px] text-slate-400 leading-snug">
                    Birim ve birim rol yetkisi tek merkezden <strong>Birim Tanımlama</strong> ekranındaki <strong>Birim Yetkili Sorumluları</strong> bölümünden verilir.
                  </p>
                </div>
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

              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60 shadow-xs space-y-3">
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

                <div className="border-t border-slate-200/60 pt-2.5">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={userFormCanEditDof}
                      onChange={(e) => setUserFormCanEditDof(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-0.5"
                      id="user-form-can-edit-dof"
                    />
                    <div>
                      <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Edit3 className="h-3.5 w-3.5 text-indigo-600" />
                        Yetkili Düzenle (Mobil Giriş Yetkisi)
                      </span>
                      <span className="text-[10px] text-indigo-700/80 block leading-tight mt-0.5">
                        İşaretlendiğinde bu yetkili personel mobil giriş ekranında "Yetkili Düzenleyiciler" listesinde yer alır.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="border-t border-slate-200/60 pt-2.5">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={userFormIsActive}
                      onChange={(e) => setUserFormIsActive(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 mt-0.5"
                      id="user-form-is-active"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Yetkili Düzenle Aktif Çeki (Hesap Durumu: {userFormIsActive ? "Aktif" : "Pasif"})
                      </span>
                      <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                        Aktif çek işareti işaretli olduğu sürece kullanıcı sisteme ve mobil portala giriş yapabilir.
                      </span>
                    </div>
                  </label>
                </div>
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

            {/* Filter Bar for Yetkili Personel Listesi */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-indigo-600" />
                  Personel & Yetki Filtreleri
                </span>
                {(userListSearch || userListDeptFilter !== "all" || userListRoleFilter !== "all" || userListActiveFilter !== "all") && (
                  <button
                    onClick={() => {
                      setUserListSearch("");
                      setUserListDeptFilter("all");
                      setUserListRoleFilter("all");
                      setUserListActiveFilter("all");
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer flex items-center gap-1"
                  >
                    <XCircle className="h-3 w-3" /> Filtreleri Temizle
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                {/* 1. Birim Filtresi */}
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Birim</label>
                  <select
                    value={userListDeptFilter}
                    onChange={(e) => setUserListDeptFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Tüm Birimler</option>
                    {sortedDepartments.map((d) => (
                      <option key={d.id || d.name} value={d.name}>{d.name}</option>
                    ))}
                    <option value="__unassigned__">Birim Atanmamış</option>
                  </select>
                </div>

                {/* 2. Erişim Rolü Filtresi */}
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Erişim Rolü</label>
                  <select
                    value={userListRoleFilter}
                    onChange={(e) => setUserListRoleFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Tüm Roller</option>
                    {accessRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Aktiflik & Yetkili Düzenle Filtresi */}
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">Durum & Yetki</label>
                  <select
                    value={userListActiveFilter}
                    onChange={(e) => setUserListActiveFilter(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Tüm Durumlar</option>
                    <option value="active">🟢 Sadece Aktif Olanlar</option>
                    <option value="inactive">⚪ Pasif Olanlar</option>
                    <option value="can_edit">✏️ Yetkili Düzenle Çeki Olanlar</option>
                  </select>
                </div>

                {/* 4. Arama Kutusu */}
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-0.5">İsim veya E-posta</label>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-2" />
                    <input
                      type="text"
                      value={userListSearch}
                      onChange={(e) => setUserListSearch(e.target.value)}
                      placeholder="Personel veya e-posta..."
                      className="w-full bg-white border border-slate-200 rounded-lg pl-7 pr-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {isUsersLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2" />
                <span className="text-xs">Yetkili kullanıcılar yükleniyor...</span>
              </div>
            ) : filteredPanelUsers.length === 0 && (userListSearch || userListDeptFilter !== "all" || userListRoleFilter !== "all" || userListActiveFilter !== "all") ? (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center text-slate-400">
                <Search className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Filtreye Uygun Personel Bulunamadı</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                  Arama kriterlerinizi değiştirerek veya filtreleri temizleyerek tekrar deneyebilirsiniz.
                </p>
                <button
                  onClick={() => {
                    setUserListSearch("");
                    setUserListDeptFilter("all");
                    setUserListRoleFilter("all");
                    setUserListActiveFilter("all");
                  }}
                  className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition cursor-pointer"
                >
                  Filtreleri Sıfırla
                </button>
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
              <>
                {/* Mobile Touch-Friendly User Cards (< 1024px) */}
                <div className="lg:hidden space-y-2.5">
                  {filteredPanelUsers
                    .filter((u) => u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                    .map((u) => {
                      const hasPendingRequest = passwordRequests.some(
                        (r) => r.email.toLowerCase().trim() === u.email.toLowerCase().trim() && r.status === "bekliyor"
                      );
                      const isUserActive = u.isActive !== false;
                      const assignedUnits = getAuthorizedDepartmentsForUser(u, departments);
                      const matchedRole = getRoleById(u.role, accessRoles);

                      return (
                        <div
                          key={u.id}
                          className={`p-3.5 rounded-2xl border transition ${
                            hasPendingRequest
                              ? "bg-amber-50/30 border-amber-200"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-slate-900">{u.name}</span>
                                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${getRoleBadgeClasses(matchedRole.badgeColor)}`}>
                                  {matchedRole.name}
                                </span>
                                {!isUserActive && (
                                  <span className="text-[10px] font-bold text-slate-500">Pasif</span>
                                )}
                              </div>
                              <p className="text-xs font-mono text-slate-600 truncate">{u.email}</p>
                              <p className="text-xs text-slate-500">
                                {assignedUnits.length > 0
                                  ? assignedUnits.join(", ")
                                  : normalizeUnitText(u.department) === "tüm birimler" || u.role === "admin"
                                  ? "Tüm Birimler"
                                  : "Birim atanmamış"}
                                {u.password ? ` · Şifre: ${u.password}` : ""}
                                {u.canEditDof ? " · Yetkili Düzenle" : ""}
                              </p>
                              {hasPendingRequest && (
                                <p className="text-[11px] font-bold text-amber-700">
                                  Şifre sıfırlama talebi bekliyor
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {hasPendingRequest && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSendPassword(u.email)}
                                  className="min-h-[38px] min-w-[38px] flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200 rounded-xl cursor-pointer"
                                  title="Şifre Gönder"
                                >
                                  <Key className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditUser(u)}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center bg-indigo-50 text-indigo-700 rounded-xl cursor-pointer"
                                title="Düzenle"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id!)}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center bg-rose-50 text-rose-600 rounded-xl cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Desktop Table (>= 1024px) */}
                <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                      <th className="p-3">Ad Soyad</th>
                      <th className="p-3">E-posta Adresi</th>
                      <th className="p-3">Birim</th>
                      <th className="p-3">Erişim Rolü</th>
                      <th className="p-3">Yetkili Düzenle</th>
                      <th className="p-3">Durum</th>
                      <th className="p-3">Giriş Şifresi</th>
                      <th className="p-3">Kayıt Tarihi</th>
                      <th className="p-3 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-sans">
                    {/* Always showcase Super Admin as implicit top entry if filters permit */}
                    {(userListRoleFilter === "all" || userListRoleFilter === "admin") && 
                     (userListDeptFilter === "all" || userListDeptFilter === "Tüm Birimler") && 
                     (userListActiveFilter === "all" || userListActiveFilter === "active" || userListActiveFilter === "can_edit") &&
                     (!userListSearch || "gökhan eroğlu gokhan.eroglu@gmail.com".includes(userListSearch.toLowerCase().trim())) && (
                      <tr className="bg-amber-50/10 hover:bg-amber-50/20">
                        <td className="p-3 font-semibold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Aktif" />
                          Gökhan Eroğlu
                        </td>
                        <td className="p-3 font-mono text-slate-600">gokhan.eroglu@gmail.com</td>
                        <td className="p-3 text-slate-500 font-medium font-mono">Tüm Birimler (Süper)</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold text-[10px] uppercase">
                            SÜPER ADMİN
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-extrabold text-[9px]">
                            <Edit3 className="h-3 w-3" />
                            Tam Yetkili
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Aktif
                          </span>
                        </td>
                        <td className="p-3 font-mono text-indigo-600 font-bold">admin</td>
                        <td className="p-3 text-slate-400 font-mono">-</td>
                        <td className="p-3 text-right">
                          <span className="text-[10px] font-semibold text-slate-400 italic">Sistem Kurucusu</span>
                        </td>
                      </tr>
                    )}

                    {filteredPanelUsers
                      .filter((u) => u.email.toLowerCase().trim() !== "gokhan.eroglu@gmail.com")
                      .map((u) => {
                        const hasPendingRequest = passwordRequests.some(
                          (r) => r.email.toLowerCase().trim() === u.email.toLowerCase().trim() && r.status === "bekliyor"
                        );
                        const isUserActive = u.isActive !== false;
                        return (
                          <tr key={u.id} className={`hover:bg-slate-50/50 transition ${hasPendingRequest ? "bg-amber-50/20" : ""}`}>
                            <td className="p-3 font-semibold text-slate-900">
                              <div className="flex flex-col">
                                <span className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${isUserActive ? "bg-emerald-500" : "bg-slate-300"}`} title={isUserActive ? "Aktif" : "Pasif"} />
                                  {u.name}
                                </span>
                                {hasPendingRequest && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 uppercase mt-0.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                                    Şifre Talebi Var
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-600">{u.email}</td>
                            <td className="p-3 font-medium text-slate-600">
                              {(() => {
                                const assignedUnits = getAuthorizedDepartmentsForUser(u, departments);
                                if (assignedUnits.length > 0) {
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      {assignedUnits.map((unitName) => (
                                        <span
                                          key={unitName}
                                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold"
                                        >
                                          {unitName}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                }
                                if (normalizeUnitText(u.department) === "tüm birimler" || u.role === "admin") {
                                  return <span className="text-slate-500">Tüm Birimler (Admin)</span>;
                                }
                                return <span className="text-slate-400 italic text-[11px]">Birim Atanmamış</span>;
                              })()}
                            </td>
                            <td className="p-3">
                              {(() => {
                                const matchedRole = getRoleById(u.role, accessRoles);
                                return (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold text-[10px] ${getRoleBadgeClasses(
                                      matchedRole.badgeColor
                                    )}`}
                                  >
                                    {matchedRole.name}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="p-3">
                              {u.canEditDof ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[9px]">
                                  <Edit3 className="h-3 w-3" />
                                  Yetkili Düzenle
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isUserActive ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold text-[10px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  Pasif
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
              </>
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

  {adminSubTab === "roles" && (
    !(isSystemAdmin || activeRolePerms.canManageSystemAdmin) ? (
      <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center max-w-md mx-auto my-12 shadow-md space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center border border-rose-100">
          <Lock className="h-6 w-6 animate-pulse" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Yetkisiz Erişim</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Erişim Rolü Tanımlama ekranına sadece <strong>Yönetici (tam yetki)</strong> rolündeki kullanıcılar erişebilir.
        </p>
      </div>
    ) : (
      <DofRoleManager
        roles={accessRoles}
        panelUsers={panelUsers}
        onRolesChange={(updated) => setAccessRoles(updated)}
      />
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
              className={`relative w-full ${settingsModalTab === "database" ? "max-w-4xl" : "max-w-2xl"} max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-100 p-5 sm:p-7 overflow-hidden z-10 flex flex-col transition-all duration-200`}
            >
              {/* Modal Header */}
              <div className="flex flex-col gap-3 pb-4 border-b border-slate-100 mb-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                      {settingsModalTab === "database" ? (
                        <Database className="h-5 w-5 text-indigo-600" />
                      ) : (
                        <Settings className="h-5 w-5 text-indigo-600" />
                      )}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        {settingsModalTab === "database" ? "Veritabanı & Tablo Mimarisi" : "Sistem & Parametre Ayarları"}
                        {settingsModalTab === "database" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Canlı Firestore
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium">
                        {settingsModalTab === "database"
                          ? "Google Cloud Firestore veritabanı bağlantı detayları, canlı koleksiyon kayıtları ve şemalar"
                          : (isSystemAdmin || activeRolePerms.canManageKvkkAndVersion)
                          ? "Yönetici Paneli, termin süreleri ve DÖF davranış parametreleri"
                          : "Termin süreleri, bildirim ve panel tercih parametreleri"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    title="Kapat"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-2 p-1 bg-slate-100/90 rounded-2xl w-full sm:w-auto self-start border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setSettingsModalTab("parameters")}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      settingsModalTab === "parameters"
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Parametre Ayarları</span>
                  </button>
                  {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
                    <button
                      type="button"
                      onClick={() => setSettingsModalTab("database")}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        settingsModalTab === "database"
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                      }`}
                    >
                      <Database className="h-3.5 w-3.5" />
                      <span>Veritabanı & Tablolar</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${settingsModalTab === "database" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"}`}>
                        7 Tablo
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {settingsModalTab === "database" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) ? (
                <div className="overflow-y-auto pr-1 flex-1 py-1">
                  <DofDatabaseSettings
                    dofsCount={dofs.length}
                    departmentsCount={departments.length}
                    panelUsersCount={panelUsers.length}
                    foldersCount={folders.length}
                    passwordRequestsCount={passwordRequests.length}
                    emailLogsCount={emailLogs.length}
                    sampleDof={dofs[0]}
                    onRefreshAll={() => {
                      fetchLogs();
                      fetchAllUsers();
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {/* 0. DÖF Varsayılan Planlama Süreleri (Termin / İş Günü Ayarları) */}
                <div className="bg-gradient-to-br from-amber-50/70 via-indigo-50/30 to-white border border-amber-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-amber-200/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-amber-500 text-white font-mono font-bold text-xs">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">DÖF Varsayılan Planlama Süreleri</h4>
                        <p className="text-[10px] text-slate-500">DÖF oluşturulduğu andan itibaren otomatik hesaplanan iş günü terminleri</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                      İş Günü
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Önleyici Faaliyet Süresi */}
                    <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-700 block">
                          Önleyici Faaliyet
                        </label>
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Varsayılan: 7
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={preventiveDaysSetting}
                          onChange={(e) => setPreventiveDaysSetting(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition"
                        />
                        <span className="text-xs font-semibold text-slate-500 shrink-0">İş Günü</span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        Önleyici DÖF açıldığında otomatik hesaplanan termin süresi.
                      </p>
                    </div>

                    {/* Düzenleyici / Düzeltici Faaliyet Süresi */}
                    <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20 transition">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-700 block">
                          Düzenleyici / Düzeltici
                        </label>
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          Varsayılan: 3
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={correctiveDaysSetting}
                          onChange={(e) => setCorrectiveDaysSetting(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition"
                        />
                        <span className="text-xs font-semibold text-slate-500 shrink-0">İş Günü</span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        Düzeltici DÖF açıldığında otomatik hesaplanan termin süresi.
                      </p>
                    </div>
                  </div>

                  {/* Canlı Önizleme Kutusu */}
                  <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 text-[10px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-700 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-500" /> Bugün Oluşturulan DÖF Termin Önizlemesi:
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>• Önleyici Faaliyet ({preventiveDaysSetting} İş Günü):</span>
                      <span className="font-mono font-bold text-indigo-700">
                        {computeTargetCompletionDate(new Date(), "önleyici", preventiveDaysSetting)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>• Düzenleyici Faaliyet ({correctiveDaysSetting} İş Günü):</span>
                      <span className="font-mono font-bold text-amber-700">
                        {computeTargetCompletionDate(new Date(), "düzeltici", correctiveDaysSetting)}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-400 italic pt-0.5">
                      * Cumartesi ve Pazar günleri iş günü hesabına dahil edilmez.
                    </p>
                  </div>
                </div>

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
                    {activeRolePerms.canViewDashboard && <option value="dashboard">Dashboard</option>}
                    {activeRolePerms.canViewDofs && <option value="dofs">DÖF Başvuruları</option>}
                    {activeRolePerms.canManageFolders && <option value="folders">Klasör Yönetimi</option>}
                    {activeRolePerms.canCreateDof && <option value="new_dof">Yeni DÖF Oluşturma</option>}
                    {activeRolePerms.canViewReports && <option value="reports">Raporlar & Analiz</option>}
                    {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
                      <>
                        <option value="users">Yönetici & Kullanıcı Yönetimi</option>
                        <option value="roles">Erişim Rolleri</option>
                        <option value="remote">Uzak Bağlantı & Paylaşım</option>
                      </>
                    )}
                  </select>
                </div>

                {/* 3. Default Status Filter */}
                {activeRolePerms.canViewDofs && (
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
                      <option value="acik">🟢 Açık & İşlemde (Varsayılan - Yeni & İnceleniyor)</option>
                      <option value="all">Tümü (Filtresiz)</option>
                      <option value="kapali">🔴 Kapalı (Çözüldü & Reddedildi)</option>
                      <option value="yeni">Yeni Başvurular</option>
                      <option value="inceleniyor">İncelemedekiler</option>
                      <option value="cozuldu">Çözülenler</option>
                      {isSystemAdmin && <option value="reddedildi">Reddedilenler</option>}
                    </select>
                  </div>
                )}

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

                {/* 4. Passcode Login Passive/Disabled Toggle (Sadece Yönetici) */}
                {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
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
                )}

                {/* 5. KVKK Kişisel Veri Gizleme & Maskeleme (Sadece Admin) */}
                {(isSystemAdmin || activeRolePerms.canManageKvkkAndVersion) && (
                  <div className="space-y-1.5 pt-1 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 border border-indigo-100 rounded-2xl p-4 shadow-2xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="p-1 rounded-lg bg-indigo-600 text-white">
                        <Shield className="h-3.5 w-3.5" />
                      </span>
                      <label className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                        KVKK Kişisel Veri Gizleme & Maskeleme
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      İşaretlendiğinde, sistemdeki tüm DÖF kartlarında, tablolarda, detay pencerelerinde ve raporlarda bildirim yapan kişilerin <strong>Ad Soyad</strong> ve <strong>E-posta / İletişim</strong> bilgileri <em>*** Gizli (KVKK) ***</em> olarak maskelenir ve kimse tarafından görüntülenemez.
                    </p>
                    <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isKvkkMaskingEnabled}
                        onChange={(e) => setIsKvkkMaskingEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-indigo-950">
                        KVKK Veri Gizle (Ad Soyad ve Mail / İletişim Bilgilerini Maskele)
                      </span>
                    </label>
                  </div>
                )}

                {/* 6. Versiyon / Sürüm Bilgisi (Sadece Admin) */}
                {(isSystemAdmin || activeRolePerms.canManageKvkkAndVersion) && (
                  <div className="space-y-1.5 pt-1 bg-gradient-to-br from-indigo-50/50 to-white border border-indigo-100 rounded-2xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center">
                          v
                        </span>
                        <div>
                          <label className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                            Uygulama Versiyon Bilgisi (Sürüm)
                          </label>
                          <p className="text-[10px] text-slate-500">
                            Panelde, arayüzde ve raporlarda gösterilen sistem sürüm numarası
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full border border-indigo-200">
                        {appVersionSetting || DEFAULT_APP_VERSION}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={appVersionSetting}
                        onChange={(e) => setAppVersionSetting(e.target.value)}
                        placeholder="Örn: v1.2.5"
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 outline-none transition"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400">
                      * İstediğiniz sürüm kodunu (örneğin v1.2.6 veya v2.0.0) elle girip kaydedebilirsiniz.
                    </p>
                  </div>
                )}

                {/* 7. Tanımlı Verileri Silme (Sadece Sistem Admini) */}
                {isSystemAdmin && (
                  <div className="space-y-3 pt-1 bg-white border border-rose-200 rounded-2xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-rose-100">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-rose-600 text-white shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">
                            Tanımlı Verileri Silme (Sadece Yönetici)
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Silmek istediğiniz veri gruplarını işaretleyin. Admin hesapları korunur.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleAllDeleteKeys}
                        disabled={isBulkDeleting}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {selectedDeleteKeysCount === 7 ? "Seçimi Temizle" : "Tümünü Seç"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        {
                          key: "dofs" as const,
                          label: "DÖF Kayıtları",
                          hint: "Tüm DÖF başvuruları ve geçmişi",
                          countLabel: `${dofs.length} kayıt`,
                        },
                        {
                          key: "users" as const,
                          label: "Kullanıcılar (Admin hariç)",
                          hint: "Yönetici hesapları silinmez",
                          countLabel: `${nonAdminUsersCount} kişi`,
                        },
                        {
                          key: "departments" as const,
                          label: "Birimler",
                          hint: "Tanımlı tüm birim ve sorumlular",
                          countLabel: `${departments.length} birim`,
                        },
                        {
                          key: "folders" as const,
                          label: "Klasörler",
                          hint: "Arşiv klasör tanımları",
                          countLabel: `${folders.length} klasör`,
                        },
                        {
                          key: "emailLogs" as const,
                          label: "Bildirim & E-posta Logları",
                          hint: "Gönderim ve işlem günlükleri",
                          countLabel: `${emailLogs.length} log`,
                        },
                        {
                          key: "passwordRequests" as const,
                          label: "Şifre Talepleri",
                          hint: "Bekleyen ve geçmiş talepler",
                          countLabel: `${passwordRequests.length} talep`,
                        },
                        {
                          key: "accessRoles" as const,
                          label: "Özel Erişim Rolleri",
                          hint: "Özel roller silinir, 3 temel rol sıfırlanır",
                          countLabel: `${customRolesCount} özel rol`,
                        },
                      ].map((item) => {
                        const checked = Boolean(deleteSelection[item.key]);
                        return (
                          <label
                            key={item.key}
                            className={`flex items-start justify-between gap-2.5 min-h-[44px] p-2.5 rounded-xl border transition cursor-pointer select-none ${
                              checked
                                ? "border-rose-300 bg-rose-50/70"
                                : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isBulkDeleting}
                                onChange={() => handleToggleDeleteKey(item.key)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-800 block leading-snug">
                                  {item.label}
                                </span>
                                <span className="text-[10px] text-slate-500 block leading-snug">
                                  {item.hint}
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600 shrink-0 pt-0.5">
                              {item.countLabel}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {bulkDeleteMessage && (
                      <div
                        className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                          bulkDeleteMessage.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-rose-50 border-rose-200 text-rose-800"
                        }`}
                      >
                        {bulkDeleteMessage.type === "success" ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}
                        <span>{bulkDeleteMessage.text}</span>
                      </div>
                    )}

                    {!isDeleteConfirmOpen ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {selectedDeleteKeysCount > 0
                            ? `${selectedDeleteKeysCount} veri grubu seçildi`
                            : "Silme işlemi için en az 1 grup işaretleyin"}
                        </span>
                        <button
                          type="button"
                          disabled={selectedDeleteKeysCount === 0 || isBulkDeleting}
                          onClick={() => {
                            setIsDeleteConfirmChecked(false);
                            setBulkDeleteMessage(null);
                            setIsDeleteConfirmOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Seçili Verileri Sil</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 space-y-2.5">
                        <div className="flex items-start gap-2 text-xs text-rose-900">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                          <p className="leading-snug font-medium">
                            İşaretlediğiniz <strong>{selectedDeleteKeysCount}</strong> veri grubu veritabanından kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 min-h-[36px] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isDeleteConfirmChecked}
                            disabled={isBulkDeleting}
                            onChange={(e) => setIsDeleteConfirmChecked(e.target.checked)}
                            className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-rose-950">
                            Kalıcı silme işlemini onaylıyorum
                          </span>
                        </label>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBulkDeleting}
                            onClick={() => {
                              setIsDeleteConfirmOpen(false);
                              setIsDeleteConfirmChecked(false);
                            }}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            disabled={!isDeleteConfirmChecked || isBulkDeleting}
                            onClick={handleExecuteBulkDelete}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{isBulkDeleting ? "Siliniyor..." : "Kalıcı Olarak Sil"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

              {/* Action Buttons Footer */}
              {settingsModalTab === "database" && (isSystemAdmin || activeRolePerms.canManageSystemAdmin) ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-100 mt-4 gap-3 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-slate-700">Google Cloud Firestore:</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px]">
                      Aktif & Senkronize
                    </span>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSettingsModalTab("parameters")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                      <span>Parametre Ayarlarına Geç</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(false)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                    >
                      Pencereyi Kapat
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-100 mt-4 gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    {(isSystemAdmin || activeRolePerms.canManageSystemAdmin) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSettingsModalTab("database")}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition cursor-pointer border border-indigo-200/80 shadow-2xs"
                        >
                          <Database className="h-3.5 w-3.5 text-indigo-600" />
                          <span>Veritabanı & Tablolar</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setPreventiveDaysSetting(7);
                            setCorrectiveDaysSetting(3);
                            setDefaultSoundSetting("on");
                            setDefaultTabSetting("dofs");
                            setDefaultStatusFilterSetting("acik");
                            setDefaultNotificationSetting("on");
                            setIsPasscodeLoginPassive(false);
                            setIsKvkkMaskingEnabled(false);
                            setAppVersionSetting(DEFAULT_APP_VERSION);
                            
                            await saveSystemSettings({
                              preventiveActionDays: 7,
                              correctiveActionDays: 3,
                              defaultSoundSetting: "on",
                              defaultTabSetting: "dofs",
                              defaultStatusFilterSetting: "acik",
                              defaultNotificationSetting: "on",
                              isPasscodeLoginPassive: false,
                              isKvkkMaskingEnabled: false,
                              appVersion: DEFAULT_APP_VERSION,
                            });
                            localStorage.setItem("dof_app_version", DEFAULT_APP_VERSION);
                            
                            setIsMuted(false);
                            setIsSettingsOpen(false);
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
                        >
                          Varsayılana Sıfırla
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(false)}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition cursor-pointer"
                    >
                      İptal
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const prev = Number(preventiveDaysSetting) || 7;
                        const corr = Number(correctiveDaysSetting) || 3;
                        const canManageAdminSettings = isSystemAdmin || activeRolePerms.canManageSystemAdmin;
                        const canManageKvkkVer = isSystemAdmin || activeRolePerms.canManageKvkkAndVersion;
                        const ver = appVersionSetting.trim() || DEFAULT_APP_VERSION;

                        const payload: Record<string, any> = {
                          preventiveActionDays: prev,
                          correctiveActionDays: corr,
                          defaultSoundSetting: defaultSoundSetting as any,
                          defaultTabSetting,
                          defaultStatusFilterSetting,
                          defaultNotificationSetting: defaultNotificationSetting as any,
                        };
                        if (canManageAdminSettings) {
                          payload.isPasscodeLoginPassive = isPasscodeLoginPassive;
                        }
                        if (canManageKvkkVer) {
                          payload.isKvkkMaskingEnabled = isKvkkMaskingEnabled;
                          payload.appVersion = ver;
                          localStorage.setItem("dof_app_version", ver);
                        }

                        await saveSystemSettings(payload);
                        
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
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
                    >
                      Ayarları Kaydet
                    </button>
                  </div>
                </div>
              )}
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
                  <span className="text-[10px] text-slate-400 block">Birime özel afiş çıktısı ve A4 PDF belgesi</span>
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
                    alt="Birim DÖF QR"
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
              Bu afişi ilgili birimin fiziksel çalışma alanlarına, panolarına veya ortak alanlarına asabilirsiniz.
            </div>
          </motion.div>
        </div>
      )}

      {/* Admin DÖF Reddetme Onay Modalı */}
      <AnimatePresence>
        {dofToReject && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            {/* Backdrop click to dismiss */}
            <div 
              className="absolute inset-0"
              onClick={() => {
                if (!isRejectingDof) setDofToReject(null);
              }}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden"
            >
              {/* Modal Top Header */}
              <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-200 shrink-0">
                    <Ban className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-rose-950">
                      DÖF Başvurusunu Reddet
                    </h3>
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                      Uygunsuzluk / Talep İptali
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!isRejectingDof) setDofToReject(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/80 transition cursor-pointer"
                  title="Pencereyi Kapat"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <div className="text-center space-y-1">
                  <h4 className="text-base font-black text-slate-900 leading-snug">
                    Bu DÖF Başvurusunu Reddetmek İstediğinize Emin Misiniz?
                  </h4>
                  <p className="text-xs text-slate-500">
                    Reddedilen başvurular süreçten çıkarılır ve gizlilik ilkesi gereği yalnızca en üst yetkili tarafından görüntülenebilir:
                  </p>
                </div>

                {/* Target DOF Summary Card */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono font-black text-xs text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      #{dofToReject.refNo}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      dofToReject.type === "düzeltici" ? "bg-indigo-100 text-indigo-800 border border-indigo-200" : "bg-teal-100 text-teal-800 border border-teal-200"
                    }`}>
                      {dofToReject.type === "düzeltici" ? "Düzeltici Faaliyet" : "Önleyici Faaliyet"}
                    </span>
                  </div>

                  <div className="font-bold text-slate-900 text-sm leading-snug">
                    {dofToReject.title}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-slate-600 border-t border-slate-200/60">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Birim</span>
                      <span className="font-semibold text-slate-800">{dofToReject.department || "-"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Bildiren Kişi</span>
                      <span className="font-semibold text-slate-800">{getMaskedReporterName(dofToReject.reporterName)}</span>
                    </div>
                  </div>
                </div>

                {/* Red Gerekçesi Açıklama Alanı */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Red Gerekçesi / Açıklama Notu
                  </label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Bu başvurunun neden reddedildiğini (örn: mükerrer kayıt, yetersiz kanıt, ilgili standart kapsamında değil vb.) yazın..."
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-rose-500 rounded-xl p-3 text-xs text-slate-800 outline-none transition"
                  />
                  <p className="text-[10px] text-slate-400">
                    Bu açıklama sistem denetim kayıtlarına ve DÖF tarihçesine işlenecektir.
                  </p>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center gap-3 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setDofToReject(null)}
                    disabled={isRejectingDof}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 text-center"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={executeRejectDof}
                    disabled={isRejectingDof}
                    className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-md shadow-rose-200 flex items-center justify-center gap-2 disabled:opacity-50 text-center"
                  >
                    {isRejectingDof ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Reddediliyor...</span>
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4" />
                        <span>DÖF'ü Reddet</span>
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

      {/* Landscape DÖF Solution & Before/After Print Modal (A4 Yatık Format) */}
      <DofLandscapePrintModal
        isOpen={showLandscapeModal}
        dof={landscapeTargetDof || selectedDof}
        onClose={() => {
          setShowLandscapeModal(false);
          setLandscapeTargetDof(null);
        }}
      />
    </>
  );
}
