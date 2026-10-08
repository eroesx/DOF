import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Search, 
  FileText, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  CornerDownRight, 
  User, 
  Mail, 
  Building,
  Calendar,
  Layers,
  ArrowRight,
  Send,
  MessageSquare,
  MessageCircle,
  QrCode,
  Smartphone,
  Copy,
  Check
} from "lucide-react";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DofForm, DofStatus } from "../types";
import { DofSingleQrModal } from "./DofSingleQrModal";

interface DofTrackProps {
  initialRefNo?: string | null;
}

export default function DofTrack({ initialRefNo }: DofTrackProps) {
  const [searchQuery, setSearchQuery] = useState(initialRefNo || "");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DofForm[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQrDof, setSelectedQrDof] = useState<DofForm | null>(null);
  const [copiedRefNo, setCopiedRefNo] = useState<string | null>(null);

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

  // States for commenting
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [commentNames, setCommentNames] = useState<Record<string, string>>({});
  const [isCommentSending, setIsCommentSending] = useState<Record<string, boolean>>({});

  const handleAddComment = async (dofId: string) => {
    const text = commentTexts[dofId]?.trim();
    if (!text) return;

    setIsCommentSending((prev) => ({ ...prev, [dofId]: true }));
    try {
      const name = commentNames[dofId]?.trim() || "Süreç Sahibi / Personel";
      const newComment = {
        id: Math.random().toString(36).substring(2, 11),
        userName: name,
        userRole: "Personel",
        text,
        createdAt: new Date().toISOString(),
      };

      const dof = results.find((r) => r.id === dofId);
      if (dof) {
        const updatedComments = [...(dof.comments || []), newComment];

        // Update Firestore
        const docRef = doc(db, "dofs", dofId);
        await updateDoc(docRef, { comments: updatedComments });

        // Update local state
        setResults((prev) =>
          prev.map((r) => (r.id === dofId ? { ...r, comments: updatedComments } : r))
        );

        // Reset input fields
        setCommentTexts((prev) => ({ ...prev, [dofId]: "" }));
        setCommentNames((prev) => ({ ...prev, [dofId]: "" }));
      }
    } catch (err) {
      console.error("Yorum ekleme hatası:", err);
      alert("Yorum gönderilirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsCommentSending((prev) => ({ ...prev, [dofId]: false }));
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    let queryStr = searchQuery.trim().toUpperCase();
    // Normalize user-typed DÖF to DOF for standard database queries
    if (queryStr.startsWith("DÖF-")) {
      queryStr = queryStr.replace("DÖF-", "DOF-");
    }

    if (!queryStr) {
      setError("Lütfen bir takip numarası veya iletişim e-postası girin.");
      return;
    }

    setIsLoading(true);
    setResults([]);
    setHasSearched(true);

    try {
      const dofRef = collection(db, "dofs");
      let q;

      // Check if user entered an email address or a Ref No (starts with DOF-)
      if (queryStr.includes("@") || !queryStr.startsWith("DOF-")) {
        // Search by email/contact
        q = query(dofRef, where("reporterContact", "==", queryStr.toLowerCase()));
      } else {
        // Search by exact Ref Number
        q = query(dofRef, where("refNo", "==", queryStr));
      }

      const querySnapshot = await getDocs(q);
      const tempResults: DofForm[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Record<string, any>;
        tempResults.push({ id: doc.id, ...data } as DofForm);
      });

      // Sort by creation date manually if querying by email (since composite indexes are not pre-defined)
      tempResults.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      });

      setResults(tempResults);
    } catch (err: any) {
      console.error(err);
      setError("Arama yapılırken bir hata oluştu. Lütfen bağlantınızı kontrol edin.");
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial search if refNo was passed from parent success page
  useEffect(() => {
    if (initialRefNo) {
      setSearchQuery(initialRefNo);
      handleSearch();
    }
  }, [initialRefNo]);

  const getStatusBadge = (status: DofStatus) => {
    switch (status) {
      case "yeni":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Yeni Bildirim
          </span>
        );
      case "inceleniyor":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
            <Clock className="h-3 w-3 text-amber-500" />
            İnceleniyor
          </span>
        );
      case "cozuldu":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Çözüldü / Tamamlandı
          </span>
        );
      case "reddedildi":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
            <XCircle className="h-3 w-3 text-rose-500" />
            Reddedildi
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    // Check if it's a Firestore timestamp
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

  return (
    <div className="max-w-3xl mx-auto">
      {/* Search Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
          DÖF Durum Sorgulama ve Takip
        </h1>
        <p className="mt-2 text-slate-500 text-sm max-w-xl mx-auto">
          Daha önce gönderdiğiniz formların güncel durumunu, atanan aksiyonları ve kalite yöneticisinin geri bildirimlerini anlık olarak sorgulayın.
        </p>
      </div>

      {/* Search Form Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xl mb-6" id="search-card-container">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 uppercase block mb-1.5">Takip Numarası veya E-posta</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Örn: DÖF-26-57492 veya e-posta adresiniz"
                  className="w-full bg-slate-50/50 hover:bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-3 pl-11 pr-4 transition text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-medium rounded-xl transition duration-200 shadow-md shadow-indigo-100 cursor-pointer text-sm shrink-0"
                id="search-submit-btn"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>Sorgula <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-xs font-medium text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </form>
      </div>

      {/* Results Section */}
      <div className="space-y-6" id="tracking-results-list">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3" />
            <p className="text-slate-400 text-sm">Veriler sorgulanıyor...</p>
          </div>
        )}

        {hasSearched && !isLoading && results.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-md text-center">
            <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-800">Eşleşen Kayıt Bulunamadı</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              Girdiğiniz takip numarası veya e-posta ile eşleşen bir Düzeltici Önleyici Faaliyet (DÖF) kaydı bulunamadı. Lütfen bilgileri kontrol edip tekrar deneyin.
            </p>
          </div>
        )}

        {!isLoading && results.map((dof) => (
          <motion.div
            key={dof.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-100 rounded-2xl shadow-lg overflow-hidden"
          >
            {/* Header Area */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold text-slate-400 tracking-wider">REF KODU</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h3 className="text-lg font-mono font-bold text-indigo-600">{dof.refNo}</h3>
                  <button
                    type="button"
                    onClick={() => handleCopyRefNo(dof.refNo)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer border shadow-2xs ${
                      copiedRefNo === dof.refNo
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                    title="Takip Kodunu Kopyala"
                  >
                    {copiedRefNo === dof.refNo ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold text-[11px]">Kopyalandı!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-600 text-[11px] font-medium">Kodu Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {getStatusBadge(dof.status)}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  dof.type === "düzeltici" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                }`}>
                  {dof.type === "düzeltici" ? "Düzeltici" : "Önleyici"}
                </span>
                <button
                  onClick={() => setSelectedQrDof(dof)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 rounded-full text-xs font-semibold text-slate-700 transition shadow-2xs cursor-pointer"
                  title="Mobil QR Kodunu Görüntüle ve Düzenle"
                >
                  <QrCode className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Mobil QR & Düzenle</span>
                </button>
              </div>
            </div>

            {/* Form Details Content */}
            <div className="p-6 space-y-6">
              {/* Grid with metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">BİLDİREN</span>
                    <span className="font-medium text-slate-700">{dof.reporterName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">BÖLÜM/BİRİM</span>
                    <span className="font-medium text-slate-700">{dof.department}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">TARİH</span>
                    <span className="font-medium text-slate-700">{formatDate(dof.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <h4 className="text-md font-display font-bold text-slate-900 mb-1">{dof.title}</h4>
                <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line bg-slate-50/30 p-4 border border-slate-100 rounded-xl">
                  {dof.description}
                </div>
              </div>

              {/* Proposed Action (Optional) */}
              {dof.proposedAction && (
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Sizin Önerdiğiniz Çözüm</h5>
                  <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-line bg-slate-50/30 p-4 border border-slate-100 rounded-xl">
                    {dof.proposedAction}
                  </div>
                </div>
              )}

              {/* Image attachment if exists */}
              {dof.imageUrl && (
                <div>
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Eklenen Fotoğraf/Belge</h5>
                  <div className="max-w-md border border-slate-100 rounded-xl overflow-hidden shadow-inner">
                    <img src={dof.imageUrl} alt="Belge" className="w-full h-auto max-h-80 object-cover" />
                  </div>
                </div>
              )}

              {/* Manager Feedback Reply Section */}
              <div className="border-t border-slate-100 pt-6">
                <div className="bg-indigo-50/40 rounded-2xl p-5 border border-indigo-100/60">
                  <h4 className="text-sm font-bold text-slate-950 flex items-center gap-2 mb-3">
                    <CornerDownRight className="h-4 w-4 text-indigo-600" />
                    Yönetici Değerlendirmesi ve Geri Dönüşü
                  </h4>
                  {dof.adminFeedback ? (
                    <div className="space-y-3">
                      <div className="text-slate-800 text-sm leading-relaxed whitespace-pre-line">
                        {dof.adminFeedback}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Son Değerlendirme Tarihi: {formatDate(dof.updatedAt)}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Bu bildirim henüz incelenme aşamasındadır. Kalite ekibimiz değerlendirdiğinde burada resmi geri dönüş ve aksiyon planı yayınlanacaktır.
                    </p>
                  )}
                </div>

                {dof.rootCauses && dof.rootCauses.some(c => c && c.trim().length > 0) && (
                  <div className="mt-4 bg-amber-50/50 rounded-2xl p-4.5 border border-amber-200/80">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-5 h-5 rounded bg-amber-500 text-white font-mono font-bold text-[10px] flex items-center justify-center">5Y</span>
                      <h4 className="text-xs font-bold text-amber-950">5 Kök Neden Analizi (5 Whys)</h4>
                    </div>
                    <div className="space-y-1.5">
                      {dof.rootCauses.map((cause, idx) => {
                        if (!cause || !cause.trim()) return null;
                        const isFinal = idx === 4 || idx === dof.rootCauses!.filter(c => c && c.trim()).length - 1;
                        return (
                          <div key={idx} className={`p-2 rounded-lg text-xs flex items-start gap-2 ${isFinal ? "bg-amber-100/70 text-amber-950 font-medium" : "bg-white/80 text-slate-700 border border-amber-100"}`}>
                            <span className="font-mono font-bold text-[10px] text-amber-800 shrink-0">{idx + 1}.</span>
                            <span className="leading-snug">{cause}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Comments Thread Section */}
              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 font-display">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  Süreç Notları & İletişim Geçmişi ({dof.comments?.length || 0})
                </h4>

                {/* Comment Bubbles */}
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1 mb-4 scrollbar-thin">
                  {dof.comments && dof.comments.length > 0 ? (
                    dof.comments.map((comment) => {
                      const isAdmin = comment.userRole === "Yönetici" || comment.userRole === "Editör" || comment.userRole === "Sorumlu";
                      return (
                        <div
                          key={comment.id}
                          className={`flex flex-col p-3.5 rounded-2xl border transition-all text-sm ${
                            isAdmin
                              ? "bg-slate-50/80 border-indigo-100 ml-8"
                              : "bg-indigo-50/10 border-slate-100 mr-8"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`font-bold ${isAdmin ? "text-indigo-700" : "text-slate-800"}`}>
                              {comment.userName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded-full tracking-wider shrink-0">
                              {comment.userRole}
                            </span>
                          </div>
                          <p className="text-slate-600 leading-relaxed text-xs whitespace-pre-line">
                            {comment.text}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-2 block font-mono text-right">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl bg-slate-50/20">
                      <MessageCircle className="h-8 w-8 text-slate-300 mx-auto mb-1.5" />
                      <p className="text-xs text-slate-400">Henüz eklenmiş not veya yorum bulunmuyor.</p>
                    </div>
                  )}
                </div>

                {/* Comment Input Box */}
                <div className="bg-slate-50/50 border border-slate-150 p-4 rounded-2xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Adınız / Unvanınız</label>
                      <input
                        type="text"
                        placeholder="Örn: Ahmet Yılmaz (Kalite Müh.)"
                        value={commentNames[dof.id!] || ""}
                        onChange={(e) => setCommentNames(prev => ({ ...prev, [dof.id!]: e.target.value }))}
                        className="w-full bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">Yorumunuz / Süreç Notu</label>
                    <div className="relative">
                      <textarea
                        rows={2}
                        placeholder="Sürece dair bilgi verin, soru sorun veya güncelleme notu ekleyin..."
                        value={commentTexts[dof.id!] || ""}
                        onChange={(e) => setCommentTexts(prev => ({ ...prev, [dof.id!]: e.target.value }))}
                        className="w-full bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl p-3 pr-10 text-xs resize-none"
                      />
                      <button
                        onClick={() => handleAddComment(dof.id!)}
                        disabled={isCommentSending[dof.id!] || !commentTexts[dof.id!]?.trim()}
                        className="absolute right-2 bottom-3 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg transition duration-200 cursor-pointer"
                        title="Gönder"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Single DOF QR Code Modal */}
      <DofSingleQrModal
        dof={selectedQrDof}
        onClose={() => setSelectedQrDof(null)}
      />
    </div>
  );
}
