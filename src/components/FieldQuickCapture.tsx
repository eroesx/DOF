import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  MapPin,
  Camera,
  Image as ImageIcon,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  ShieldCheck,
  X,
  ClipboardList,
  ArrowRight,
  Building,
  RotateCcw,
  Lock,
  ChevronRight,
  UserCheck,
  BookmarkCheck,
} from "lucide-react";
import { collection, getDocs, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase";
import {
  createDof,
  generateRefNo,
  listDepartments,
} from "../lib/db";
import {
  Department,
  DofType,
  FieldCartItem,
  FieldSeverity,
  PanelUser,
} from "../types";
import {
  DEFAULT_FIELD_LOCATIONS,
  DEFAULT_FIELD_UNITS,
  classifyFieldFindingByRules,
  requestAiFieldClassification,
  severityToRiskLevel,
} from "../lib/fieldClassification";
import { compressImageToBase64 } from "../utils/imageCompressor";
import { computeTargetCompletionDate, getStoredSettings } from "../lib/settings";
import { triggerManagerEmailNotification } from "../lib/notifications";

interface FieldQuickCaptureProps {
  onDispatched?: (createdRefs: string[]) => void;
  onGoToAuditReport?: () => void;
  onRequestLogin?: () => void;
  requireAuth?: boolean;
  availableDepartments?: Department[];
}

const STICKY_LOCATION_KEY = "dof_field_sticky_location_v1";
const STICKY_UNIT_KEY = "dof_field_sticky_unit_v1";
const CART_STORAGE_KEY = "dof_field_capture_cart_v1";

const getAuthUserScope = (): string => {
  if (typeof window === "undefined") return "default";
  const email =
    auth.currentUser?.email ||
    localStorage.getItem("dof_admin_authed_email") ||
    "";
  const userId =
    localStorage.getItem("dof_admin_user_id") || auth.currentUser?.uid || "";
  const raw = (email || userId || "default").trim().toLocaleLowerCase("tr-TR");
  return raw.replace(/[^a-z0-9@._-]/g, "_") || "default";
};

const getScopedLocationKey = (scope: string) =>
  `${STICKY_LOCATION_KEY}_${scope}`;

const getScopedCustomLocationKey = (scope: string) =>
  `${STICKY_LOCATION_KEY}_custom_${scope}`;

const readSavedLocationForScope = (scope: string): { location: string; isCustom: boolean; hasSaved: boolean } => {
  if (typeof window === "undefined") {
    return { location: DEFAULT_FIELD_LOCATIONS[0], isCustom: false, hasSaved: false };
  }
  const scoped = localStorage.getItem(getScopedLocationKey(scope));
  const shared = localStorage.getItem(STICKY_LOCATION_KEY);
  const resolved = (scoped || shared || "").trim();
  const isCustom = localStorage.getItem(getScopedCustomLocationKey(scope)) === "true";
  if (resolved) {
    return { location: resolved, isCustom, hasSaved: true };
  }
  return { location: DEFAULT_FIELD_LOCATIONS[0], isCustom: false, hasSaved: false };
};

const SEVERITY_OPTIONS: {
  value: FieldSeverity;
  label: string;
  activeClass: string;
  idleClass: string;
}[] = [
  {
    value: "Düşük",
    label: "Düşük",
    activeClass: "bg-slate-800 text-white border-slate-800 shadow-xs",
    idleClass: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
  },
  {
    value: "Orta",
    label: "Orta",
    activeClass: "bg-sky-600 text-white border-sky-600 shadow-xs",
    idleClass: "bg-sky-50/70 text-sky-800 border-sky-200 hover:bg-sky-100/80",
  },
  {
    value: "Yüksek",
    label: "Yüksek",
    activeClass: "bg-amber-500 text-slate-950 border-amber-500 shadow-xs",
    idleClass: "bg-amber-50/80 text-amber-900 border-amber-200 hover:bg-amber-100",
  },
  {
    value: "Kritik",
    label: "Kritik",
    activeClass: "bg-rose-600 text-white border-rose-600 shadow-xs",
    idleClass: "bg-rose-50/80 text-rose-800 border-rose-200 hover:bg-rose-100",
  },
];

export default function FieldQuickCapture({
  onDispatched,
  onGoToAuditReport,
  onRequestLogin,
  requireAuth = true,
  availableDepartments,
}: FieldQuickCaptureProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      localStorage.getItem("dof_admin_passcode_authed") === "true" ||
        localStorage.getItem("dof_admin_authed_email") ||
        auth.currentUser
    );
  });
  const [userScope, setUserScope] = useState<string>(() => getAuthUserScope());
  const [inspectorDisplayName, setInspectorDisplayName] = useState<string>(() => {
    if (typeof window === "undefined") return "Saha Yetkilisi";
    return (
      localStorage.getItem("dof_admin_user_name") ||
      localStorage.getItem("dof_mobile_user_name") ||
      auth.currentUser?.displayName ||
      localStorage.getItem("dof_admin_authed_email")?.split("@")[0] ||
      "Saha Yetkilisi"
    );
  });
  const [inspectorDeptLabel, setInspectorDeptLabel] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("dof_admin_user_dept") || "";
  });

  const initialLocationState = useMemo(() => {
    const scope = getAuthUserScope();
    return readSavedLocationForScope(scope);
  }, []);

  const [departmentsList, setDepartmentsList] = useState<Department[]>(
    availableDepartments || []
  );

  // Sticky Top Selection: İlgili Saha / Lokasyon & Birim
  const [location, setLocation] = useState<string>(initialLocationState.location);
  const [isCustomLocation, setIsCustomLocation] = useState<boolean>(initialLocationState.isCustom);
  const [hasSavedLocation, setHasSavedLocation] = useState<boolean>(initialLocationState.hasSaved);
  const [mobileWelcomeDismissed, setMobileWelcomeDismissed] = useState<boolean>(false);
  const prevLoggedInRef = useRef<boolean>(isLoggedIn);

  useEffect(() => {
    const syncAuth = () => {
      const authed = Boolean(
        localStorage.getItem("dof_admin_passcode_authed") === "true" ||
          localStorage.getItem("dof_admin_authed_email") ||
          auth.currentUser
      );
      const nextScope = getAuthUserScope();
      const nextName =
        localStorage.getItem("dof_admin_user_name") ||
        localStorage.getItem("dof_mobile_user_name") ||
        auth.currentUser?.displayName ||
        localStorage.getItem("dof_admin_authed_email")?.split("@")[0] ||
        "Saha Yetkilisi";
      const nextDept = localStorage.getItem("dof_admin_user_dept") || "";

      setIsLoggedIn(authed);
      setUserScope((prev) => (prev !== nextScope ? nextScope : prev));
      setInspectorDisplayName(nextName);
      setInspectorDeptLabel(nextDept);

      if (authed && !prevLoggedInRef.current) {
        const saved = readSavedLocationForScope(nextScope);
        setLocation(saved.location);
        setIsCustomLocation(saved.isCustom);
        setHasSavedLocation(saved.hasSaved);
        setMobileWelcomeDismissed(false);
      }
      prevLoggedInRef.current = authed;
    };
    syncAuth();
    const unsubAuth = onAuthStateChanged(auth, () => syncAuth());
    window.addEventListener("storage", syncAuth);
    const interval = setInterval(syncAuth, 1000);
    return () => {
      unsubAuth();
      window.removeEventListener("storage", syncAuth);
      clearInterval(interval);
    };
  }, []);

  const [selectedUnit, setSelectedUnit] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STICKY_UNIT_KEY) || "";
    }
    return "";
  });

  // Fast Form Inputs
  const [subject, setSubject] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [severity, setSeverity] = useState<FieldSeverity>("Orta");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);

  // Draft Cart ("Saha Tespit Sepeti")
  const [cart, setCart] = useState<FieldCartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // Ignore corrupted cart storage
      }
    }
    return [];
  });

  // Batch dispatch state
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccessInfo, setDispatchSuccessInfo] = useState<{
    count: number;
    refs: string[];
    units: string[];
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const subjectInputRef = useRef<HTMLTextAreaElement>(null);
  const hydratedScopeRef = useRef<string | null>(isLoggedIn ? userScope : null);

  useEffect(() => {
    if (availableDepartments && availableDepartments.length > 0) {
      setDepartmentsList(availableDepartments);
      return;
    }
    listDepartments(true)
      .then((list) => setDepartmentsList(list))
      .catch((err) => console.warn("Could not load departments:", err));
  }, [availableDepartments]);

  useEffect(() => {
    if (!isLoggedIn) {
      hydratedScopeRef.current = null;
      return;
    }
    if (hydratedScopeRef.current !== userScope) {
      hydratedScopeRef.current = userScope;
      const saved = readSavedLocationForScope(userScope);
      if (saved.hasSaved) {
        setLocation(saved.location);
        setIsCustomLocation(saved.isCustom);
        setHasSavedLocation(true);
        return;
      }
    }
    const trimmed = location.trim();
    if (!trimmed) return;
    localStorage.setItem(STICKY_LOCATION_KEY, trimmed);
    localStorage.setItem(getScopedLocationKey(userScope), trimmed);
    localStorage.setItem(
      getScopedCustomLocationKey(userScope),
      isCustomLocation ? "true" : "false"
    );
    setHasSavedLocation(true);
  }, [location, isCustomLocation, isLoggedIn, userScope]);

  useEffect(() => {
    if (!isLoggedIn) return;
    localStorage.setItem(STICKY_UNIT_KEY, selectedUnit);
  }, [selectedUnit, isLoggedIn]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Storage quota safeguard if images are large
    }
  }, [cart]);

  const unitOptions = useMemo(() => {
    const merged = new Set<string>();
    departmentsList.forEach((d) => {
      if (d.name && d.isActive !== false) merged.add(d.name.trim());
    });
    DEFAULT_FIELD_UNITS.forEach((u) => {
      if (
        !Array.from(merged).some(
          (existing) =>
            existing.toLocaleLowerCase("tr-TR") === u.toLocaleLowerCase("tr-TR")
        )
      ) {
        merged.add(u);
      }
    });
    return Array.from(merged);
  }, [departmentsList]);

  const locationOptions = useMemo(() => {
    const merged = new Set<string>(DEFAULT_FIELD_LOCATIONS);
    departmentsList.forEach((d) => {
      if (d.name && d.isActive !== false) {
        merged.add(`${d.name.trim()} Sahası`);
      }
    });
    return Array.from(merged);
  }, [departmentsList]);

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setFormError("Lütfen yalnızca görsel dosyası (.jpg, .png) seçin.");
      return;
    }
    setIsCompressingImage(true);
    setFormError(null);
    try {
      const compressed = await compressImageToBase64(file, 900, 0.7);
      setImageUrl(compressed);
    } catch (err) {
      console.error("Image compression error:", err);
      setFormError("Fotoğraf işlenirken hata oluştu. Tekrar deneyin.");
    } finally {
      setIsCompressingImage(false);
    }
  };

  const handleAddToCart = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDispatchSuccessInfo(null);

    const trimmedSubject = subject.trim();
    const trimmedLocation = location.trim();

    if (!trimmedLocation) {
      setFormError("Lütfen önce denetlediğiniz İlgili Saha / Lokasyon bilgisini seçin.");
      return;
    }
    if (!trimmedSubject) {
      setFormError("Lütfen tespit edilen uygunsuzluğun konusunu / tanımını yazın.");
      return;
    }

    const firstLine = trimmedSubject.split("\n")[0].trim();
    const titleSummary =
      firstLine.length > 85 ? `${firstLine.slice(0, 82)}...` : firstLine;

    // 1) Instant 0ms Turkish rule-based classification
    const ruleResult = classifyFieldFindingByRules(
      titleSummary,
      trimmedSubject,
      proposedAction.trim(),
      unitOptions
    );

    const localId = `fld-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const hasStickyUnit = Boolean(selectedUnit && selectedUnit.trim().length > 0);
    const chosenTargetUnit = hasStickyUnit ? selectedUnit.trim() : ruleResult.recommendedUnit;

    const newItem: FieldCartItem = {
      localId,
      location: trimmedLocation,
      subject: titleSummary,
      description: trimmedSubject,
      proposedAction: proposedAction.trim() || undefined,
      severity,
      type: ruleResult.type,
      targetUnit: chosenTargetUnit,
      procedure: ruleResult.procedure,
      imageUrl: imageUrl || undefined,
      classificationSource: "kural",
      classificationReason: hasStickyUnit
        ? `${chosenTargetUnit} birimi seçildi · ${ruleResult.reason}`
        : ruleResult.reason,
      isAiRefining: true,
      createdAtIso: new Date().toISOString(),
    };

    setCart((prev) => [newItem, ...prev]);

    // 2) Reset form for rapid consecutive field capture (keep sticky location & sticky unit!)
    setSubject("");
    setProposedAction("");
    setSeverity("Orta");
    setImageUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    setTimeout(() => subjectInputRef.current?.focus(), 60);

    // 3) Background Gemini AI refinement (upgrades classification if available & not manually overridden)
    requestAiFieldClassification({
      subject: titleSummary,
      description: trimmedSubject,
      proposedAction: proposedAction.trim() || undefined,
      location: trimmedLocation,
      availableUnits: unitOptions,
    }).then((aiResult) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.localId !== localId) return item;
          if (!aiResult || item.classificationSource === "manuel") {
            return { ...item, isAiRefining: false };
          }
          return {
            ...item,
            type: aiResult.type,
            targetUnit: hasStickyUnit
              ? chosenTargetUnit
              : aiResult.recommendedUnit || item.targetUnit,
            procedure: aiResult.procedure || item.procedure,
            classificationReason: aiResult.reason || item.classificationReason,
            classificationSource: "ai",
            isAiRefining: false,
          };
        })
      );
    });
  };

  const handleUpdateCartItem = (
    localId: string,
    patch: Partial<FieldCartItem>
  ) => {
    setCart((prev) =>
      prev.map((item) =>
        item.localId === localId
          ? {
              ...item,
              ...patch,
              classificationSource: "manuel",
              isAiRefining: false,
              procedure:
                patch.type && !patch.procedure
                  ? patch.type === "önleyici"
                    ? "Önleyici - Risk Analizi & Önlem"
                    : "Düzeltici - 5 Neden Analizi"
                  : patch.procedure || item.procedure,
            }
          : item
      )
    );
  };

  const handleRemoveCartItem = (localId: string) => {
    setCart((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleBatchDispatch = async () => {
    if (cart.length === 0 || isDispatching) return;

    setIsDispatching(true);
    setFormError(null);
    const createdRefs: string[] = [];
    const dispatchedUnits = new Set<string>();

    try {
      const settings = getStoredSettings();
      const inspectorName =
        localStorage.getItem("dof_admin_user_name") ||
        localStorage.getItem("dof_mobile_user_name") ||
        localStorage.getItem("dof_admin_authed_email")?.split("@")[0] ||
        "Saha Denetim Yetkilisi";
      const inspectorEmail =
        localStorage.getItem("dof_admin_authed_email") || "saha@kurum.local";

      // Preload panel users once for clean responsible mapping
      let allUsers: PanelUser[] = [];
      try {
        const usersSnap = await getDocs(query(collection(db, "panel_users")));
        usersSnap.forEach((docSnap) => {
          allUsers.push({ id: docSnap.id, ...docSnap.data() } as PanelUser);
        });
      } catch (uErr) {
        console.warn("Could not preload panel_users during batch dispatch:", uErr);
      }

      const itemsToSend = [...cart].reverse();

      for (const item of itemsToSend) {
        const refNo = generateRefNo();
        const plannedDays =
          item.severity === "Kritik"
            ? Math.min(2, settings.correctiveActionDays)
            : item.type === "önleyici"
            ? settings.preventiveActionDays
            : settings.correctiveActionDays;

        const targetDate = computeTargetCompletionDate(
          new Date(),
          item.type,
          plannedDays
        );

        const matchedDept = departmentsList.find(
          (d) =>
            d.name.toLocaleLowerCase("tr-TR").trim() ===
            item.targetUnit.toLocaleLowerCase("tr-TR").trim()
        );

        // Find unit responsibles
        const unitUsersMap = new Map<
          string,
          { id: string; name: string; email: string }
        >();
        const normDept = item.targetUnit.toLocaleLowerCase("tr-TR").trim();
        const explicitIds = new Set<string>(
          Array.isArray(matchedDept?.referralUserIds)
            ? matchedDept.referralUserIds
            : matchedDept?.referralUserId
            ? [matchedDept.referralUserId]
            : []
        );
        const explicitEmails = new Set<string>(
          [
            ...(Array.isArray(matchedDept?.responsibleEmails)
              ? matchedDept.responsibleEmails
              : []),
            ...(matchedDept?.responsibleEmail
              ? matchedDept.responsibleEmail.split(",")
              : []),
          ]
            .map((x) => x.toLocaleLowerCase("tr-TR").trim())
            .filter(Boolean)
        );

        allUsers.forEach((u) => {
          if (u.isActive === false) return;
          const uId = u.id || "";
          const uEmail = (u.email || "").toLocaleLowerCase("tr-TR").trim();
          const hasExplicit =
            (uId && explicitIds.has(uId)) || (uEmail && explicitEmails.has(uEmail));
          const hasLegacyDept =
            !matchedDept?.referralUserIds &&
            !matchedDept?.referralUserId &&
            (u.department || "")
              .split(",")
              .some((part) => part.toLocaleLowerCase("tr-TR").trim() === normDept);

          if (hasExplicit || hasLegacyDept) {
            unitUsersMap.set(uId || uEmail, {
              id: uId,
              name: u.name || u.email,
              email: u.email,
            });
          }
        });

        const unitUsers = Array.from(unitUsersMap.values());
        const assignedUnitName = matchedDept?.name || item.targetUnit;

        const payload: any = {
          refNo,
          type: item.type,
          title: item.subject,
          department: assignedUnitName,
          assignedUnit: assignedUnitName,
          location: item.location,
          severity: item.severity,
          riskLevel: severityToRiskLevel(item.severity),
          procedure: item.procedure,
          inspectionStatus: "Açık",
          dofSource: "Saha Tesbiti",
          isFieldInspector: true,
          reporterName: inspectorName,
          reporterContact: inspectorEmail,
          description: `${item.description}\n\n[Saha / Lokasyon: ${item.location}]`,
          status: "yeni",
          targetCompletionDate: targetDate,
          completionDays: plannedDays,
          adminFeedback: `Saha Hızlı Tespit (${item.location}) üzerinden toplu dağıtımla açıldı.`,
        };

        if (item.proposedAction) {
          payload.proposedAction = item.proposedAction;
        }
        if (item.imageUrl) {
          payload.imageUrl = item.imageUrl;
          payload.beforeImageUrl = item.imageUrl;
        }
        if (unitUsers.length > 0) {
          payload.assignedUserIds = unitUsers.map((u) => u.id).filter(Boolean);
          payload.assignedUserEmails = unitUsers.map((u) => u.email).filter(Boolean);
          payload.assignedUserId = unitUsers[0].id;
          payload.assignedUserName = unitUsers.map((u) => u.name).join(", ");
          payload.assignedUserEmail = unitUsers.map((u) => u.email).join(", ");
        } else if (matchedDept?.responsibleEmail) {
          payload.assignedUserEmail = matchedDept.responsibleEmail;
          payload.assignedUserName = matchedDept.responsibleName || assignedUnitName;
        }

        const newId = await createDof(payload);
        createdRefs.push(refNo);
        dispatchedUnits.add(assignedUnitName);

        triggerManagerEmailNotification("create", { ...payload, id: newId }).catch(
          () => {}
        );
      }

      setCart([]);
      localStorage.removeItem(CART_STORAGE_KEY);
      setDispatchSuccessInfo({
        count: createdRefs.length,
        refs: createdRefs,
        units: Array.from(dispatchedUnits),
      });
      if (onDispatched) {
        onDispatched(createdRefs);
      }
    } catch (err) {
      console.error("Batch dispatch error:", err);
      setFormError(
        "Toplu gönderim sırasında bir hata oluştu. Sepetteki kayıtlarınız korundu, lütfen tekrar deneyin."
      );
    } finally {
      setIsDispatching(false);
    }
  };

  if (requireAuth && !isLoggedIn) {
    return (
      <div className="max-w-lg mx-auto my-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
          <Lock className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-display font-bold text-slate-900">
            Yetkili Girişi Gerekli
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            <strong>İlgili Saha / Lokasyon Seçimi</strong> ve Sahada Hızlı Tespit ekranını kullanabilmek için lütfen yetkili girişi yapın.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              if (onRequestLogin) {
                onRequestLogin();
              } else {
                window.dispatchEvent(new CustomEvent("dof_navigate", { detail: "portal" }));
              }
            }}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer"
          >
            Yetkili Giriş Ekranına Git
          </button>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("dof_navigate", { detail: "admin" }));
            }}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer"
          >
            Yönetim Paneli Girişi
          </button>
        </div>
      </div>
    );
  }

  const handleConfirmMobileWelcome = () => {
    const trimmed = location.trim() || DEFAULT_FIELD_LOCATIONS[0];
    setLocation(trimmed);
    if (isLoggedIn) {
      localStorage.setItem(STICKY_LOCATION_KEY, trimmed);
      localStorage.setItem(getScopedLocationKey(userScope), trimmed);
      localStorage.setItem(
        getScopedCustomLocationKey(userScope),
        isCustomLocation ? "true" : "false"
      );
      setHasSavedLocation(true);
    }
    setMobileWelcomeDismissed(true);
    setTimeout(() => subjectInputRef.current?.focus(), 80);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* MOBİL KARŞILAMA PANELİ (Sadece mobil cihazlarda ve giriş sonrası kullanıcıyı seçili lokasyonla karşılar) */}
      {!mobileWelcomeDismissed ? (
        <div
          id="mobile-field-welcome-panel"
          className="md:hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5 animate-fade-in"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <UserCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                  <BookmarkCheck className="h-3 w-3 shrink-0" />
                  <span>{hasSavedLocation ? "Kayıtlı Lokasyon Yüklendi" : "Saha Oturumu Açık"}</span>
                </span>
                <h2 className="text-lg font-display font-bold text-slate-900 truncate mt-1">
                  Hoş geldiniz, {inspectorDisplayName}
                </h2>
                {inspectorDeptLabel && (
                  <p className="text-xs text-slate-500 truncate">{inspectorDeptLabel}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  İlgili Saha / Lokasyon Seçimi
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomLocation((prev) => !prev)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer px-2 py-1 rounded-lg bg-white border border-slate-200"
              >
                {isCustomLocation ? "Listeden Seç" : "Manuel Yaz"}
              </button>
            </div>

            {isCustomLocation ? (
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Denetlenen saha veya lokasyon adı..."
                className="w-full min-h-[48px] px-3.5 py-2.5 bg-white border border-indigo-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            ) : (
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
                aria-label="Karşılama İlgili Saha veya Lokasyon Seçimi"
              >
                {!locationOptions.includes(location) && location && (
                  <option value={location}>{location}</option>
                )}
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Seçtiğiniz saha bilgisi cihazınızda (<span className="font-semibold text-slate-700">kalıcı olarak</span>) saklanır ve siz değiştirene kadar sonraki girişlerinizde otomatik seçili gelir.
            </p>
          </div>

          {cart.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-900">
              <span className="font-semibold">
                Sepetinizde gönderilmeyi bekleyen <strong>{cart.length}</strong> saha tespiti var.
              </span>
            </div>
          )}

          <button
            type="button"
            id="mobile-welcome-continue-btn"
            onClick={handleConfirmMobileWelcome}
            className="w-full min-h-[54px] px-5 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-2xl text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{location.trim() || DEFAULT_FIELD_LOCATIONS[0]} ile Devam Et</span>
            <ChevronRight className="h-5 w-5 shrink-0" />
          </button>
        </div>
      ) : (
        <div className="md:hidden bg-indigo-50/80 border border-indigo-200/80 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-indigo-700 truncate">
              Hoş geldiniz, {inspectorDisplayName}
            </p>
            <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileWelcomeDismissed(false)}
            className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 shrink-0 cursor-pointer"
          >
            Karşılama / Değiştir
          </button>
        </div>
      )}

      {/* Ana Tespit Alanı (Masaüstünde her zaman açık, mobilde karşılama onayından sonra açılır) */}
      <div className={mobileWelcomeDismissed ? "space-y-4" : "hidden md:block space-y-4"}>
        {/* Sticky Top Bar: İlgili Saha / Lokasyon */}
        <div className="sticky top-2 z-20 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                  <span>Sabit Denetim Sahası</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Kalıcı Seçim
                  </span>
                </span>
                <h2 className="text-sm sm:text-base font-display font-bold text-slate-900 leading-tight">
                  İlgili Saha / Lokasyon Seçimi
                </h2>
              </div>
            </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:min-w-[300px]">
            {isCustomLocation ? (
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Saha veya bölüm adı yazın..."
                className="flex-1 min-h-[44px] px-3.5 py-2 bg-slate-50 border border-indigo-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            ) : (
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="flex-1 min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                aria-label="İlgili Saha veya Lokasyon"
              >
                {!locationOptions.includes(location) && location && (
                  <option value={location}>{location}</option>
                )}
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setIsCustomLocation((prev) => !prev)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shrink-0 cursor-pointer"
            >
              {isCustomLocation ? "Listeden Seç" : "Manuel Yaz"}
            </button>
          </div>
        </div>
      </div>

      {/* Success Toast after Batch Dispatch */}
      {dispatchSuccessInfo && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-950">
                {dispatchSuccessInfo.count} Saha Tespiti DÖF Havuzlarına Gönderildi
              </h3>
              <p className="text-xs text-emerald-800 mt-1">
                Dağıtılan Birimler:{" "}
                <strong className="font-bold">
                  {dispatchSuccessInfo.units.join(", ")}
                </strong>{" "}
                · Ref:{" "}
                <span className="font-mono">
                  {dispatchSuccessInfo.refs.join(", ")}
                </span>
              </p>
            </div>
          </div>
          {onGoToAuditReport && (
            <button
              type="button"
              onClick={onGoToAuditReport}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition"
            >
              <span>Denetim Tablosunda Gör</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Main Split: Form (Left/Top) + Cart (Right/Bottom) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Hızlı Tespit Formu */}
        <form
          onSubmit={handleAddToCart}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div>
              <h3 className="text-base sm:text-lg font-display font-bold text-slate-900">
                Sahada Hızlı Tespit Formu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tespitleri sepete ekleyin; tur bitiminde tek dokunuşla birimlere dağıtın.
              </p>
            </div>
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg shrink-0">
              AI Otomatik Ayrım
            </span>
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 0. Hedef / Sorumlu Birim (Bir kere seçilince sabit kalır ve sepete otomatik seçili eklenir) */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-sticky-unit-select"
              className="text-xs font-bold text-slate-700 flex items-center justify-between gap-2"
            >
              <span>İlgili / Sorumlu Birim</span>
              <span className="text-[11px] font-medium text-indigo-600">
                {selectedUnit ? "Sabit Seçili · Sepete Otomatik Aktarılır" : "Otomatik (AI / Kural)"}
              </span>
            </label>
            <div className="relative">
              <Building className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="field-sticky-unit-select"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-500 cursor-pointer transition"
              >
                <option value="">Otomatik Belirle (AI / İçerik Analizi)</option>
                {selectedUnit && !unitOptions.includes(selectedUnit) && (
                  <option value={selectedUnit}>{selectedUnit}</option>
                )}
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. Uygunsuzluğun Konusu / Tanımı */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-subject-input"
              className="text-xs font-bold text-slate-700 flex items-center justify-between"
            >
              <span>Uygunsuzluğun Konusu / Tanımı *</span>
              <span className="text-[11px] font-normal text-slate-400">
                İlk satır başlık olur
              </span>
            </label>
            <textarea
              id="field-subject-input"
              ref={subjectInputRef}
              rows={3}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Örn: 2 No'lu pres altı yağ sızdırıyor veya merdiven korkuluk civatası gevşemiş..."
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition resize-y min-h-[96px]"
            />
          </div>

          {/* 2. Önem / Aciliyet Derecesi (Hızlı Dokunmatik Seçim Butonları) */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              Önem / Aciliyet Derecesi
            </span>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_OPTIONS.map((opt) => {
                const isSelected = severity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeverity(opt.value)}
                    className={`min-h-[46px] px-2 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition cursor-pointer active:scale-[0.98] ${
                      isSelected ? opt.activeClass : opt.idleClass
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Önerilen Çözüm (Opsiyonel) */}
          <div className="space-y-1.5">
            <label
              htmlFor="field-proposed-action"
              className="text-xs font-bold text-slate-700 block"
            >
              Önerilen Çözüm (Opsiyonel)
            </label>
            <input
              id="field-proposed-action"
              type="text"
              value={proposedAction}
              onChange={(e) => setProposedAction(e.target.value)}
              placeholder="Anlık çözüm veya önlem önerisi..."
              className="w-full min-h-[46px] px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
            />
          </div>

          {/* 4. Medya / Kanıt Ekleme */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              Medya / Kanıt Fotoğrafı (Opsiyonel)
            </span>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
              }}
            />

            {imageUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 p-2 flex items-center gap-3">
                <img
                  src={imageUrl}
                  alt="Kanıt önizleme"
                  className="w-20 h-20 object-cover rounded-xl shrink-0 border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800">
                    Kanıt Fotoğrafı Eklendi
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Listeye eklendiğinde otomatik sıkıştırılmış olarak saklanır.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                  title="Fotoğrafı Kaldır"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-1 gap-2.5">
                <button
                  type="button"
                  disabled={isCompressingImage}
                  onClick={() => cameraInputRef.current?.click()}
                  className="md:hidden min-h-[48px] px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  <span>{isCompressingImage ? "İşleniyor..." : "Kameradan Çek"}</span>
                </button>
                <button
                  type="button"
                  disabled={isCompressingImage}
                  onClick={() => galleryInputRef.current?.click()}
                  className="min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
                >
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span>{isCompressingImage ? "İşleniyor..." : "Galeriden / Dosyadan Seç"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Listeye Ekle CTA */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isCompressingImage}
              className="w-full min-h-[52px] px-5 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-2xl text-sm sm:text-base font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="h-5 w-5" />
              <span>Listeye Ekle (Sepete At)</span>
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: Saha Tespit Sepeti & Toplu Dağıtım */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-display font-bold text-slate-900">
                Saha Tespit Sepeti
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold tabular-nums">
                {cart.length} Kayıt
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                  title="Sepeti Temizle"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="py-10 px-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
              <ClipboardList className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                Tespit sepetiniz henüz boş
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Soldaki formdan tespitleri ekledikçe sistem Düzeltici / Önleyici türünü ve sorumlu birimi otomatik belirler.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {cart.map((item, idx) => {
                  const sevBadge =
                    item.severity === "Kritik"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : item.severity === "Yüksek"
                      ? "bg-amber-100 text-amber-900 border-amber-200"
                      : item.severity === "Orta"
                      ? "bg-sky-100 text-sky-800 border-sky-200"
                      : "bg-slate-100 text-slate-700 border-slate-200";

                  return (
                    <div
                      key={item.localId}
                      className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-mono font-bold text-slate-400">
                              #{cart.length - idx}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${sevBadge}`}
                            >
                              {item.severity}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 truncate">
                              {item.location}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 leading-snug">
                            {item.subject}
                          </h4>
                          {item.description !== item.subject && (
                            <p className="text-xs text-slate-600 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt="Kanıt"
                            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(item.localId)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0"
                          title="Sepetten Çıkar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Classification Switcher & Target Unit Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/70">
                        {/* Düzeltici / Önleyici Quick Toggle */}
                        <div className="flex rounded-xl bg-white border border-slate-200 p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateCartItem(item.localId, { type: "düzeltici" })
                            }
                            className={`flex-1 min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                              item.type === "düzeltici"
                                ? "bg-rose-600 text-white"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Wrench className="h-3 w-3 shrink-0" />
                            <span>Düzeltici</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateCartItem(item.localId, { type: "önleyici" })
                            }
                            className={`flex-1 min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                              item.type === "önleyici"
                                ? "bg-indigo-600 text-white"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <ShieldCheck className="h-3 w-3 shrink-0" />
                            <span>Önleyici</span>
                          </button>
                        </div>

                        {/* Sorumlu Birim Selector */}
                        <div className="relative">
                          <Building className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <select
                            value={item.targetUnit}
                            onChange={(e) =>
                              handleUpdateCartItem(item.localId, {
                                targetUnit: e.target.value,
                              })
                            }
                            className="w-full min-h-[38px] pl-8 pr-2 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
                            aria-label="Hedef Birim"
                          >
                            {!unitOptions.includes(item.targetUnit) && (
                              <option value={item.targetUnit}>{item.targetUnit}</option>
                            )}
                            {unitOptions.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Classification Hint Line */}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1 truncate">
                          <Sparkles className="h-3 w-3 text-indigo-500 shrink-0" />
                          <span className="truncate">
                            {item.isAiRefining
                              ? "Yapay zeka analizi yapılıyor..."
                              : item.classificationReason || item.procedure}
                          </span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
                          {item.classificationSource === "ai"
                            ? "AI"
                            : item.classificationSource === "manuel"
                            ? "Manuel"
                            : "Otomatik"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Toplu Gönderim Butonu */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDispatching}
                  onClick={handleBatchDispatch}
                  className="w-full min-h-[54px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.99] text-white rounded-2xl text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDispatching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      <span>Birimlerin DÖF Havuzuna Dağıtılıyor...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 shrink-0" />
                      <span>
                        Tümünü İlgili Birimlerin DÖF Havuzuna Gönder ({cart.length})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
