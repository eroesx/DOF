import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { 
  FileText, 
  Send, 
  Upload, 
  Image as ImageIcon, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Layers, 
  User, 
  Mail, 
  Building, 
  Check,
  QrCode,
  ChevronDown
} from "lucide-react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { createDof, generateRefNo } from "../lib/db";
import { DofForm, DofType } from "../types";
import { compressImageToBase64 } from "../utils/imageCompressor";
import { triggerManagerEmailNotification } from "../lib/notifications";

interface DofSubmitFormProps {
  onGoToTrack: (refNo: string) => void;
  onShowQr: () => void;
}

export default function DofSubmitForm({ onGoToTrack, onShowQr }: DofSubmitFormProps) {
  const [type, setType] = useState<DofType>("düzeltici");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [description, setDescription] = useState("");
  const [proposedAction, setProposedAction] = useState("");
  const [image, setImage] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successRefNo, setSuccessRefNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Departments from database
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [isDeptLocked, setIsDeptLocked] = useState(false);

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const q = query(collection(db, "departments"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setDepartmentsList(list);

        // Check if there is a dept parameter in the URL
        const params = new URLSearchParams(window.location.search);
        const deptParam = params.get("dept");
        if (deptParam) {
          // Find matching department case-insensitively
          const matched = list.find(d => d.name.toLowerCase().trim() === deptParam.toLowerCase().trim());
          if (matched) {
            setDepartment(matched.name);
            setIsDeptLocked(true);
          } else {
            setDepartment(deptParam);
          }
        }
      } catch (err) {
        console.error("Departments could not be fetched:", err);
      }
    };
    fetchDepts();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Yalnızca görsel dosyaları (.jpg, .jpeg, .png) yükleyebilirsiniz.");
      return;
    }
    
    try {
      // Compress and convert to base64
      const base64 = await compressImageToBase64(file, 1024, 0.7);
      setImage(base64);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Görsel işlenirken bir hata oluştu. Lütfen başka bir dosya deneyin.");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = () => {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !reporterName.trim() || !description.trim()) {
      setError("Lütfen zorunlu alanların (*) tümünü doldurun.");
      return;
    }

    setIsSubmitting(true);
    const refNo = generateRefNo();

    const dofData: any = {
      refNo,
      type,
      title: title.trim(),
      department: department.trim() || "Belirtilmedi",
      reporterName: reporterName.trim(),
      reporterContact: reporterContact.trim() || "Belirtilmedi",
      description: description.trim(),
      status: "yeni",
      riskLevel: "Orta"
    };

    if (proposedAction.trim()) {
      dofData.proposedAction = proposedAction.trim();
    }

    if (image) {
      dofData.imageUrl = image;
    }

    try {
      // Automatic task assignment check
      let matchedUser: any = null;
      let isDirectReferral = false;

      // Find matching department details in our fetched list
      const matchedDept = departmentsList.find(
        (d) => d.name.toLowerCase().trim() === department.toLowerCase().trim()
      );

      if (matchedDept && matchedDept.directReferral && matchedDept.referralUserId) {
        // Direct Referral is enabled for this department! 
        isDirectReferral = true;
        matchedUser = {
          id: matchedDept.referralUserId,
          name: matchedDept.responsibleName || "Bilinmeyen Sorumlu",
          email: matchedDept.responsibleEmail || ""
        };
      } else {
        // Fallback to searching panel_users with matching department
        const usersQuery = query(collection(db, "panel_users"));
        const usersSnap = await getDocs(usersQuery);
        usersSnap.forEach((doc) => {
          const u = doc.data();
          if (u.department && u.department.toLowerCase().trim() === department.toLowerCase().trim()) {
            matchedUser = { id: doc.id, ...u };
          }
        });
      }

      if (matchedUser) {
        dofData.assignedUserId = matchedUser.id;
        dofData.assignedUserName = matchedUser.name;
        dofData.assignedUserEmail = matchedUser.email;
        dofData.referralStatus = "islem_devam_ediyor";
        dofData.referralNote = isDirectReferral 
          ? "Otomatik Doğrudan Havale: Bu departmana açılan DÖF'ler sistem tarafından otomatik olarak atanmıştır."
          : "Otomatik Departman Sorumlusu ataması sistem tarafından gerçekleştirilmiştir.";
        dofData.referralUpdatedAt = new Date().toISOString();
      }

      await createDof(dofData);
      
      // Trigger manager notification in background (non-blocking)
      triggerManagerEmailNotification("create", {
        ...dofData,
        createdAt: new Date().toISOString()
      }).catch((e) => console.error("Notification trigger error:", e));

      setSuccessRefNo(refNo);
      // Reset form fields
      setTitle("");
      if (!isDeptLocked) {
        setDepartment("");
      }
      setReporterName("");
      setReporterContact("");
      setDescription("");
      setProposedAction("");
      setImage(null);
    } catch (err: any) {
      console.error("DÖF Kaydetme Hatası:", err);
      let detailMsg = "";
      try {
        if (err?.message) {
          if (err.message.startsWith("{")) {
            const parsed = JSON.parse(err.message);
            detailMsg = ` (${parsed.error || "İzin Hatası"})`;
          } else {
            detailMsg = ` (${err.message})`;
          }
        }
      } catch (e) {
        detailMsg = ` (${err?.message || err})`;
      }
      setError(`Form kaydedilirken bir hata oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.${detailMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successRefNo) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto bg-white border border-slate-100 rounded-2xl p-8 shadow-xl text-center"
        id="success-card"
      >
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-emerald-50 mb-6 border border-emerald-100">
          <Check className="h-10 w-10 text-emerald-500" />
        </div>
        <h2 className="text-3xl font-display font-bold text-slate-900 tracking-tight mb-2">
          Form Başarıyla Gönderildi!
        </h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
          Düzeltici Önleyici Faaliyet (DÖF) talebiniz kalite yönetim sistemimize başarıyla kaydedilmiştir. Form takip numaranız aşağıdadır.
        </p>

        {/* Ref No Display Box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 mb-8 max-w-sm mx-auto">
          <span className="text-xs font-mono font-medium tracking-wider text-slate-400 uppercase block mb-1">TAKİP NUMARASI</span>
          <span className="text-2xl font-mono font-bold tracking-widest text-indigo-600 block">{successRefNo}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => onGoToTrack(successRefNo)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition duration-200 shadow-lg shadow-indigo-200 border border-indigo-600"
            id="track-button-success"
          >
            <FileText className="h-4 w-4" /> Durumu Takip Et
          </button>
          <button
            onClick={() => setSuccessRefNo(null)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition duration-200 border border-slate-200"
            id="new-form-button"
          >
            Yeni Form Doldur
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header Banner */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight sm:text-4xl">
          Düzeltici Önleyici Faaliyet (DÖF) Bildirim Formu
        </h1>
        <p className="mt-2 text-slate-500 text-sm max-w-xl mx-auto">
          Kurumumuz içerisindeki uygunsuzlukları bildirmek, süreçleri iyileştirmek ve olası riskleri önlemek için aşağıdaki formu doldurabilirsiniz.
        </p>
        <button
          onClick={onShowQr}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100/60 rounded-full px-3 py-1 transition duration-150"
          id="show-qr-link"
        >
          <QrCode className="h-3.5 w-3.5" /> Bu Formu Mobil Cihazda Aç (QR)
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-100 rounded-2xl p-6 sm:p-8 shadow-xl"
        id="submission-form-container"
      >
        {error && (
          <div className="flex items-start gap-2.5 p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-sm mb-6">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Action Type Selector */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-3">Faaliyet Türü *</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setType("düzeltici")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition duration-200 ${
                  type === "düzeltici"
                    ? "bg-indigo-50/60 border-indigo-500 text-indigo-900 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-500"
                }`}
                id="type-duzeltici-btn"
              >
                <div className={`p-2 rounded-lg mb-2 ${type === "düzeltici" ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span className="font-semibold text-sm">Düzeltici Faaliyet</span>
                <span className="text-xs text-slate-400 mt-1">Oluşmuş bir uygunsuzluğu gidermek için</span>
              </button>

              <button
                type="button"
                onClick={() => setType("önleyici")}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition duration-200 ${
                  type === "önleyici"
                    ? "bg-indigo-50/60 border-indigo-500 text-indigo-900 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-500"
                }`}
                id="type-onleyici-btn"
              >
                <div className={`p-2 rounded-lg mb-2 ${type === "önleyici" ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  <Layers className="h-5 w-5" />
                </div>
                <span className="font-semibold text-sm">Önleyici Faaliyet</span>
                <span className="text-xs text-slate-400 mt-1">Olası bir uygunsuzluğu önceden engellemek için</span>
              </button>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Reporter Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-1.5">
              <User className="h-4 w-4 text-indigo-500" /> 1. Bildirim Yapan Bilgileri
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">Ad Soyad *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 transition text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">İletişim (E-posta veya Telefon) (İsteğe Bağlı)</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={reporterContact}
                    onChange={(e) => setReporterContact(e.target.value)}
                    placeholder="Örn: ahmet@sirket.com (veya Telefon)"
                    className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 transition text-sm"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block leading-none">Değerlendirme sonucunda bilgi verilmesini isterseniz doldurabilirsiniz.</span>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Issue Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-indigo-500" /> 2. Uygunsuzluk / Durum Detayları
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">Konu / Başlık *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Durumu özetleyen kısa bir başlık"
                    className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 px-4 transition text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">İlgili Bölüm / Birim (İsteğe Bağlı)</label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <select
                      value={department}
                      disabled={isDeptLocked}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 transition text-sm appearance-none cursor-pointer"
                    >
                      <option value="">Bölüm Seçin...</option>
                      {departmentsList.length > 0 ? (
                        departmentsList.map((dept) => (
                          <option key={dept.id} value={dept.name}>
                            {dept.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Destek Hizmetleri">Destek Hizmetleri</option>
                          <option value="Hukuk Müşavirliği">Hukuk Müşavirliği</option>
                          <option value="Üzülmez TİM">Üzülmez TİM</option>
                          <option value="Karadon TİM">Karadon TİM</option>
                          <option value="Kozlu TİM">Kozlu TİM</option>
                          <option value="Müesseseler">Müesseseler</option>
                          <option value="Üretim">Üretim</option>
                          <option value="Bilgi İşlem">Bilgi İşlem</option>
                          <option value="Depo / Lojistik">Depo / Lojistik</option>
                          <option value="İnsan Kaynakları">İnsan Kaynakları</option>
                          <option value="Satın Alma">Satın Alma</option>
                          <option value="Kalite Kontrol">Kalite Kontrol</option>
                        </>
                      )}
                    </select>
                    {!isDeptLocked && (
                      <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  {isDeptLocked && (
                    <span className="text-[10px] text-indigo-600 font-bold mt-1 block">
                      📌 Bu form sadece {department} birimi için özelleştirilmiştir.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">Durum ve Uygunsuzluk Açıklaması *</label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tespit edilen durumu, varsa tarih ve yer bilgisi vererek ayrıntılı şekilde açıklayın..."
                  className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-4 transition text-sm resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">Sizin Önerdiğiniz Çözüm / Faaliyet (İsteğe Bağlı)</label>
                <textarea
                  rows={3}
                  value={proposedAction}
                  onChange={(e) => setProposedAction(e.target.value)}
                  placeholder="Bu uygunsuzluğun giderilmesi veya tekrarlanmaması için ne yapılmasını önerirsiniz?"
                  className="w-full bg-slate-50/40 hover:bg-slate-50/70 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-4 transition text-sm resize-none"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: File/Photo Upload */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-indigo-500" /> 3. Fotoğraf veya Belge Ekle (İsteğe Bağlı)
            </h3>

            {image ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 p-2.5 max-w-md">
                <img src={image} alt="Yüklenen Belge" className="w-full h-48 object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-950 text-white transition cursor-pointer"
                  title="Görseli Kaldır"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition duration-200 flex flex-col items-center justify-center ${
                  dragActive
                    ? "border-indigo-500 bg-indigo-50/40"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/20 hover:bg-slate-50/40"
                }`}
                id="image-drag-drop-zone"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-slate-400 mb-2.5" />
                <p className="text-sm font-medium text-slate-600">
                  Dosya Sürükleyin veya Dosya Seçin
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Kamera ile fotoğraf çekebilir veya cihazınızdan görsel (.jpg, .png) yükleyebilirsiniz
                </p>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold rounded-xl transition duration-200 shadow-lg shadow-indigo-100 border border-indigo-600 cursor-pointer text-sm"
              id="submit-form-button"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Formu Gönder ve Takip Kodu Al
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
