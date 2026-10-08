import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Camera, 
  Upload, 
  Save, 
  QrCode, 
  Share2, 
  RefreshCw, 
  Sparkles, 
  Check, 
  Copy, 
  Building2, 
  User, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  Image as ImageIcon, 
  Trash2, 
  Send, 
  MessageSquare,
  ChevronDown,
  ExternalLink,
  Search,
  CheckCircle,
  HelpCircle,
  Eye,
  X
} from "lucide-react";
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { updateDof, listPanelUsers } from "../lib/db";
import { DofForm, DofStatus, DofType, DofComment } from "../types";
import { DofSingleQrModal } from "./DofSingleQrModal";
import { DofQrScannerModal, ScanResult } from "./DofQrScannerModal";

interface DofMobileEditorProps {
  initialRefNo?: string | null;
  initialId?: string | null;
  onBack?: () => void;
  onGoToTrack?: (refNo: string) => void;
  onGoToAdmin?: () => void;
}

export const DofMobileEditor: React.FC<DofMobileEditorProps> = ({
  initialRefNo,
  initialId,
  onBack,
  onGoToTrack,
  onGoToAdmin,
}) => {
  // Navigation & Form Target
  const [currentRefNo, setCurrentRefNo] = useState<string>(initialRefNo || "");
  const [currentId, setCurrentId] = useState<string>(initialId || "");
  const [dof, setDof] = useState<DofForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Editable Form Fields
  const [type, setType] = useState<DofType>("düzeltici");
  const [status, setStatus] = useState<DofStatus>("yeni");
  const [riskLevel, setRiskLevel] = useState<"Düşük" | "Orta" | "Yüksek">("Orta");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [isCustomDept, setIsCustomDept] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState("");
  const [description, setDescription] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [adminFeedback, setAdminFeedback] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [targetCompletionDate, setTargetCompletionDate] = useState("");
  const [referralStatus, setReferralStatus] = useState<"beklemede" | "islem_devam_ediyor" | "yapildi" | "iptal">("beklemede");
  const [referralNote, setReferralNote] = useState("");

  // Departments and Users for dropdowns
  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [panelUsers, setPanelUsers] = useState<any[]>([]);

  // Comments / Notes
  const [newCommentText, setNewCommentText] = useState("");
  const [authorName, setAuthorName] = useState(() => {
    return localStorage.getItem("dof_mobile_user_name") || "Mobil Yetkili";
  });
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Modals & UI States
  const [showSingleQrModal, setShowSingleQrModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch departments list from database
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const snap = await getDocs(collection(db, "departments"));
        const names: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.name) names.push(data.name);
        });
        setDepartmentsList(names.sort());
      } catch (err) {
        console.warn("Could not load departments list:", err);
      }
    };

    const fetchUsers = async () => {
      try {
        const users = await listPanelUsers();
        setPanelUsers(users);
      } catch (err) {
        console.warn("Could not load panel users:", err);
      }
    };

    fetchDepartments();
    fetchUsers();
  }, []);

  // Fetch or Listen to target DOF document
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setNotFound(false);

    const loadDofData = async () => {
      try {
        let docIdToListen = currentId;

        // If we only have refNo, lookup doc by refNo
        if (!docIdToListen && currentRefNo) {
          const q = query(collection(db, "dofs"), where("refNo", "==", currentRefNo.trim()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            docIdToListen = snap.docs[0].id;
            setCurrentId(docIdToListen);
          } else {
            // Try uppercase or lowercase
            const altQ = query(collection(db, "dofs"), where("refNo", "==", currentRefNo.trim().toUpperCase()));
            const altSnap = await getDocs(altQ);
            if (!altSnap.empty) {
              docIdToListen = altSnap.docs[0].id;
              setCurrentId(docIdToListen);
            }
          }
        }

        if (!docIdToListen) {
          setLoading(false);
          setNotFound(true);
          return;
        }

        // Set up real-time listener for the document
        const docRef = doc(db, "dofs", docIdToListen);
        unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() } as DofForm;
            setDof(data);
            populateForm(data);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
          setLoading(false);
        }, (err) => {
          console.error("Error listening to DOF:", err);
          setLoading(false);
          setNotFound(true);
        });

      } catch (err) {
        console.error("Failed to load DOF:", err);
        setLoading(false);
        setNotFound(true);
      }
    };

    loadDofData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentId, currentRefNo]);

  // Populate state when DOF is loaded
  const populateForm = (data: DofForm) => {
    setType(data.type || "düzeltici");
    setStatus(data.status || "yeni");
    setRiskLevel(data.riskLevel || "Orta");
    setTitle(data.title || "");
    setDescription(data.description || "");
    setProposedAction(data.proposedAction || "");
    setAdminFeedback(data.adminFeedback || "");
    setImageUrl(data.imageUrl || "");
    setTargetCompletionDate(data.targetCompletionDate || "");
    setReferralStatus(data.referralStatus || "beklemede");
    setReferralNote(data.referralNote || "");

    const deptVal = data.department || "";
    setDepartment(deptVal);
    if (deptVal && !departmentsList.includes(deptVal)) {
      setIsCustomDept(true);
      setCustomDeptInput(deptVal);
    }
    setHasUnsavedChanges(false);
  };

  // Image compressor helper
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.72);
        setImageUrl(compressedBase64);
        setHasUnsavedChanges(true);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    if (e.target) e.target.value = "";
  };

  // Save changes to Firestore
  const handleSaveChanges = async () => {
    if (!dof || !dof.id) return;

    setIsSaving(true);
    try {
      const finalDept = isCustomDept ? customDeptInput.trim() || department : department;

      const updates: Partial<DofForm> = {
        type,
        status,
        riskLevel,
        title: title.trim(),
        department: finalDept,
        description: description.trim(),
        proposedAction: proposedAction.trim(),
        adminFeedback: adminFeedback.trim(),
        imageUrl: imageUrl || undefined,
        targetCompletionDate: targetCompletionDate || undefined,
        referralStatus,
        referralNote: referralNote.trim(),
      };

      await updateDof(dof.id, updates);

      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update DOF:", err);
      alert("Form güncellenirken bir hata oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setIsSaving(false);
    }
  };

  // Add Comment/Note
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dof || !dof.id || !newCommentText.trim()) return;

    setIsAddingComment(true);
    try {
      const newComment: DofComment = {
        id: `c_${Date.now()}`,
        userName: authorName.trim() || "Mobil Yetkili",
        userRole: "Saha Yetkilisi",
        text: newCommentText.trim(),
        createdAt: new Date().toISOString(),
      };

      const updatedComments = [...(dof.comments || []), newComment];
      await updateDof(dof.id, { comments: updatedComments });

      setNewCommentText("");
      localStorage.setItem("dof_mobile_user_name", authorName.trim());
    } catch (err) {
      console.error("Error adding comment:", err);
    } finally {
      setIsAddingComment(false);
    }
  };

  // Copy Direct Link
  const handleCopyLink = () => {
    if (!dof) return;
    const url = `${window.location.origin}?view=edit&refNo=${encodeURIComponent(dof.refNo)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Handle Scan result from QR scanner
  const handleScanAnother = (result: ScanResult) => {
    setShowScannerModal(false);
    if (result.refNo) {
      setCurrentRefNo(result.refNo);
      setCurrentId("");
    } else if (result.id) {
      setCurrentId(result.id);
      setCurrentRefNo("");
    }
  };

  // Status configuration helper
  const statusConfigs = [
    {
      value: "yeni" as DofStatus,
      label: "Yeni",
      subtext: "İnceleme Bekliyor",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      activeBg: "bg-blue-600 text-white shadow-md shadow-blue-200 border-blue-600",
      icon: Clock,
    },
    {
      value: "inceleniyor" as DofStatus,
      label: "İnceleniyor",
      subtext: "İşlem / Aksiyon Sürüyor",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      activeBg: "bg-amber-500 text-white shadow-md shadow-amber-200 border-amber-500",
      icon: AlertTriangle,
    },
    {
      value: "cozuldu" as DofStatus,
      label: "Çözüldü",
      subtext: "Faaliyet Tamamlandı",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      activeBg: "bg-emerald-600 text-white shadow-md shadow-emerald-200 border-emerald-600",
      icon: CheckCircle2,
    },
    {
      value: "reddedildi" as DofStatus,
      label: "Reddedildi",
      subtext: "Geçersiz / İptal",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      activeBg: "bg-rose-600 text-white shadow-md shadow-rose-200 border-rose-600",
      icon: XCircle,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28" id="dof-mobile-editor-page">
      
      {/* Top Header Card */}
      <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Geri Dön"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-600 border border-indigo-100/80 px-2.5 py-0.5 rounded-lg">
                {dof?.refNo || currentRefNo || "DÖF FORMU"}
              </span>
              {dof && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                  dof.status === "yeni" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  dof.status === "inceleniyor" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  dof.status === "cozuldu" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  "bg-rose-50 text-rose-700 border-rose-200"
                }`}>
                  {dof.status === "cozuldu" ? "Çözüldü" :
                   dof.status === "inceleniyor" ? "İnceleniyor" :
                   dof.status === "yeni" ? "Yeni" : "Reddedildi"}
                </span>
              )}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-800 truncate mt-0.5">
              {dof ? dof.title : "Mobil DÖF Formu Düzenle"}
            </h1>
          </div>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowScannerModal(true)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 transition cursor-pointer flex items-center gap-1"
            title="Başka Bir QR Kod Tara"
            id="mobile-scan-another-btn"
          >
            <Camera className="h-4 w-4" />
            <span className="text-xs font-bold hidden sm:inline">QR Tara</span>
          </button>

          {dof && (
            <>
              <button
                onClick={() => setShowSingleQrModal(true)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 transition cursor-pointer"
                title="Form QR Kodunu Görüntüle"
                id="mobile-show-qr-btn"
              >
                <QrCode className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopyLink}
                className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 transition cursor-pointer"
                title="Mobil Bağlantıyı Kopyala"
                id="mobile-copy-link-btn"
              >
                {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">DÖF Formu Yükleniyor...</p>
          <p className="text-[11px] text-slate-400">QR kod verileri okunuyor ve form hazırlanıyor</p>
        </div>
      )}

      {/* Not Found State */}
      {!loading && notFound && (
        <div className="bg-white border border-slate-150 rounded-2xl p-8 text-center space-y-4">
          <div className="p-3 bg-amber-50 rounded-2xl inline-block text-amber-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">DÖF Formu Bulunamadı</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Taranan QR koddaki referans koduna veya ID'ye ait bir DÖF kaydı veritabanında bulunamadı.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setShowScannerModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 transition cursor-pointer"
            >
              <Camera className="h-4 w-4" />
              Yeniden QR Kod Tara
            </button>
            {onGoToAdmin && (
              <button
                onClick={onGoToAdmin}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                Yönetim Paneline Git
              </button>
            )}
          </div>
        </div>
      )}

      {/* Form Content */}
      {!loading && dof && (
        <div className="space-y-6">
          
          {/* Quick Info & Notice Banner */}
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-slate-700">
            <ShieldAlert className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] leading-relaxed">
              <span className="font-bold text-indigo-950">Mobil Düzenleme Modu:</span> Form alanlarını telefonunuzdan güncelleyebilir, sahadan kanıt fotoğrafı çekip ekleyebilir ve yapılan faaliyeti kaydedebilirsiniz. Değişiklikler anında veritabanına yansır.
            </div>
          </div>

          {/* Section 1: Durum & Faaliyet Türü Seçimi (Tactile Mobile Cards) */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-indigo-600" />
                Faaliyet Durumu
              </label>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Tıklayarak Güncelleyin</span>
            </div>

            {/* 4 Status Pills Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {statusConfigs.map((cfg) => {
                const isSelected = status === cfg.value;
                const Icon = cfg.icon;
                return (
                  <button
                    key={cfg.value}
                    type="button"
                    onClick={() => {
                      setStatus(cfg.value);
                      setHasUnsavedChanges(true);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between h-20 ${
                      isSelected
                        ? cfg.activeBg
                        : "bg-slate-50/70 hover:bg-slate-100/70 border-slate-200 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold leading-none">{cfg.label}</span>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-[9px] leading-tight ${isSelected ? "text-white/90" : "text-slate-400"}`}>
                      {cfg.subtext}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Type & Risk Level row */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type Switch */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                  Faaliyet Türü
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setType("düzeltici");
                      setHasUnsavedChanges(true);
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      type === "düzeltici"
                        ? "bg-white text-indigo-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Düzeltici Faaliyet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType("önleyici");
                      setHasUnsavedChanges(true);
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                      type === "önleyici"
                        ? "bg-white text-emerald-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Önleyici Faaliyet
                  </button>
                </div>
              </div>

              {/* Risk Level */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                  Risk Derecesi
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {(["Düşük", "Orta", "Yüksek"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setRiskLevel(lvl);
                        setHasUnsavedChanges(true);
                      }}
                      className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                        riskLevel === lvl
                          ? lvl === "Yüksek"
                            ? "bg-rose-500 text-white shadow-xs"
                            : lvl === "Orta"
                            ? "bg-amber-500 text-white shadow-xs"
                            : "bg-emerald-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Temel Bilgiler (Başlık, Departman) */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-indigo-600" />
              Faaliyet Konusu ve Departman
            </h2>

            {/* Title */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Faaliyet / Uygunsuzluk Başlığı *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Örn: Pres Makinesi 2 Acil Durdurma Butonu Arızası"
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none transition"
              />
            </div>

            {/* Department */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  İlgili Bölüm / Departman *
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomDept(!isCustomDept)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  {isCustomDept ? "Listeden Seç" : "+ Özel Bölüm Yaz"}
                </button>
              </div>

              {isCustomDept ? (
                <input
                  type="text"
                  value={customDeptInput}
                  onChange={(e) => {
                    setCustomDeptInput(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Örn: Kalite Kontrol Laboratuvarı"
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none transition"
                />
              ) : (
                <div className="relative">
                  <select
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none transition appearance-none cursor-pointer"
                  >
                    <option value="">Departman Seçin...</option>
                    {departmentsList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Uygunsuzluk & Önerilen Çözüm Açıklamaları */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Uygunsuzluk Tespiti ve Önerilen Çözüm
            </h2>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tespit Edilen Durum / Uygunsuzluk Açıklaması
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Uygunsuzluğun nerede, nasıl ve ne zaman meydana geldiğini açıklayın..."
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl p-3 text-xs text-slate-800 outline-none transition leading-relaxed resize-y"
              />
            </div>

            {/* Proposed Action */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Önerilen Düzeltici / Önleyici Faaliyet (Öneri)
              </label>
              <textarea
                rows={2}
                value={proposedAction}
                onChange={(e) => {
                  setProposedAction(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Tekrarını engellemek için önerilen ilk çözüm adımı..."
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl p-3 text-xs text-slate-800 outline-none transition leading-relaxed resize-y"
              />
            </div>
          </div>

          {/* Section 4: Gerçekleşen Düzeltici İşlem & Saha Aksiyonu (Admin Feedback) */}
          <div className="bg-gradient-to-br from-indigo-50/50 via-white to-white border-2 border-indigo-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                Uygulanan Düzeltici Faaliyet & Saha Çözümü
              </h2>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                Saha & Aksiyon
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Biriminiz veya sahadaki teknik ekip tarafından bu uygunsuzluğu gidermek için yapılan gerçek işlem, alınan tedbir ve faaliyet sonucunu buraya yazın.
            </p>

            <div>
              <textarea
                rows={3}
                value={adminFeedback}
                onChange={(e) => {
                  setAdminFeedback(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Örn: Acil durdurma anahtarı yenisiyle değiştirildi, kablo bağlantıları test edildi ve pres hattı devreye alındı..."
                className="w-full bg-white focus:bg-white border border-indigo-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl p-3 text-xs text-slate-800 outline-none transition leading-relaxed resize-y shadow-xs"
              />
            </div>

            {/* Target completion date & Referral state */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  Hedef Tamamlanma Tarihi (Termin)
                </label>
                <input
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => {
                    setTargetCompletionDate(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Havale / İşlem Durumu
                </label>
                <select
                  value={referralStatus}
                  onChange={(e: any) => {
                    setReferralStatus(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition"
                >
                  <option value="beklemede">Beklemede</option>
                  <option value="islem_devam_ediyor">İşlem Devam Ediyor</option>
                  <option value="yapildi">Yapıldı / Tamamlandı</option>
                  <option value="iptal">İptal Edildi</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 5: Sahadan Fotoğraf Ekleme / Kanıt Görseli */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-indigo-600" />
                Sahadan Fotoğraf & Kanıt Görseli
              </h2>
              <span className="text-[10px] text-slate-400">Kamera ile çekin veya yükleyin</span>
            </div>

            {/* Hidden native file inputs */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={cameraInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Existing Image Display or Upload Controls */}
            {imageUrl ? (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group max-h-72 flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt="DÖF Kanıt Fotoğrafı"
                    className="w-full max-h-72 object-contain bg-slate-950"
                  />
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowImagePreview(true)}
                      className="p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl backdrop-blur-xs transition cursor-pointer"
                      title="Büyüt"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl("");
                        setHasUnsavedChanges(true);
                      }}
                      className="p-2 bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl backdrop-blur-xs transition cursor-pointer"
                      title="Fotoğrafı Kaldır"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Kamerayla Yeniden Çek
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Galeriden Değiştir
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-4 rounded-2xl border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 transition flex flex-col items-center justify-center gap-2 cursor-pointer group"
                >
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs group-hover:scale-105 transition">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-indigo-950 block">Telefon Kamerasıyla Çek</span>
                    <span className="text-[10px] text-indigo-600 block">Doğrudan sahadan anlık fotoğraf</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-100/50 transition flex flex-col items-center justify-center gap-2 cursor-pointer group"
                >
                  <div className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-xs group-hover:scale-105 transition">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-slate-800 block">Galeriden Görsel Yükle</span>
                    <span className="text-[10px] text-slate-500 block">PNG, JPG veya ekran görüntüsü</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Section 6: Bildiren Kişi Kartı */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600">
                <User className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Bildiren Kişi</span>
                <span className="font-bold text-slate-800">{dof.reporterName || "İsimsiz"}</span>
                {dof.reporterContact && (
                  <span className="text-[11px] text-slate-500 ml-1.5 font-mono">
                    ({dof.reporterContact})
                  </span>
                )}
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {dof.createdAt ? new Date(dof.createdAt).toLocaleDateString("tr-TR") : ""}
            </span>
          </div>

          {/* Section 7: Notlar & Yorumlar */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              Süreç İçi Yorumlar ve Notlar ({dof.comments?.length || 0})
            </h2>

            {/* Comment List */}
            {dof.comments && dof.comments.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {dof.comments.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-150 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{c.userName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(c.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-[11px]">{c.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Henüz bir not veya yorum eklenmemiş.</p>
            )}

            {/* Add Comment Input */}
            <form onSubmit={handleAddComment} className="pt-2 space-y-2 border-t border-slate-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Adınız / Ünvanınız"
                  className="w-1/3 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs outline-none"
                />
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Saha notu veya geri bildirim yazın..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:bg-white focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isAddingComment || !newCommentText.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>

        </div>
      )}

      {/* Floating Sticky Mobile Bottom Action Bar */}
      {dof && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-3 shadow-lg print:hidden"
          id="mobile-editor-sticky-bar"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {onGoToTrack && (
                <button
                  type="button"
                  onClick={() => onGoToTrack(dof.refNo)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Durum Takip Sayfası"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Takipte Gör</span>
                </button>
              )}
              {hasUnsavedChanges && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Kaydedilmemiş Değişiklikler
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md ${
                  saveSuccess
                    ? "bg-emerald-600 text-white shadow-emerald-200"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                }`}
                id="mobile-save-changes-btn"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Kaydediliyor...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Başarıyla Kaydedildi!
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Değişiklikleri Kaydet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Image Zoom Modal */}
      {showImagePreview && imageUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowImagePreview(false)}
        >
          <button
            onClick={() => setShowImagePreview(false)}
            className="absolute top-4 right-4 p-2 bg-white/20 text-white hover:bg-white/40 rounded-full transition cursor-pointer"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={imageUrl}
            alt="DÖF Kanıt Görseli Büyük"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* QR Code Scanner Modal */}
      <DofQrScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onScanSuccess={handleScanAnother}
      />

      {/* Single DÖF QR Code Display / Print Modal */}
      <DofSingleQrModal
        dof={dof}
        isOpen={showSingleQrModal}
        onClose={() => setShowSingleQrModal(false)}
      />

    </div>
  );
};
export default DofMobileEditor;
