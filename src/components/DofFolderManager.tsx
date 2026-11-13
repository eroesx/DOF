import React, { useState } from "react";
import { 
  FolderKanban, 
  FolderPlus, 
  Folder, 
  FolderOpen, 
  Edit3, 
  Trash2, 
  Search, 
  Check, 
  AlertCircle, 
  Layers, 
  ArrowRight, 
  Sparkles,
  Info
} from "lucide-react";
import { DofFolder, DofForm } from "../types";
import { createFolder, updateFolder, deleteFolder, removeDofsFromFolder } from "../lib/db";

interface DofFolderManagerProps {
  folders: DofFolder[];
  dofs: DofForm[];
  isSystemAdmin?: boolean;
  onFilterByFolder: (folderId: string) => void;
  onRefresh?: () => void;
  onMoveClosedToFolder?: (folderId: string, folderName: string) => Promise<void>;
}

const COLOR_OPTIONS = [
  { id: "indigo", name: "İndigo", bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200", ring: "ring-indigo-500", dot: "bg-indigo-600" },
  { id: "emerald", name: "Zümrüt", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", ring: "ring-emerald-500", dot: "bg-emerald-600" },
  { id: "blue", name: "Mavi", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", ring: "ring-blue-500", dot: "bg-blue-600" },
  { id: "amber", name: "Kehribar", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", ring: "ring-amber-500", dot: "bg-amber-600" },
  { id: "rose", name: "Gül / Kırmızı", bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", ring: "ring-rose-500", dot: "bg-rose-600" },
  { id: "purple", name: "Mor", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", ring: "ring-purple-500", dot: "bg-purple-600" },
  { id: "slate", name: "Füme / Gri", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300", ring: "ring-slate-500", dot: "bg-slate-600" },
];

export const DofFolderManager: React.FC<DofFolderManagerProps> = ({
  folders,
  dofs,
  isSystemAdmin = true,
  onFilterByFolder,
  onRefresh,
  onMoveClosedToFolder,
}) => {
  const [editingFolder, setEditingFolder] = useState<DofFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [folderColor, setFolderColor] = useState("indigo");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmFolder, setDeleteConfirmFolder] = useState<DofFolder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Set form when editing
  const handleStartEdit = (folder: DofFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDesc(folder.description || "");
    setFolderColor(folder.color || "indigo");
    setErrorMsg(null);
    setSuccessMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderDesc("");
    setFolderColor("indigo");
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setErrorMsg("Lütfen geçerli bir klasör adı girin.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (editingFolder?.id) {
        // Update existing folder
        await updateFolder(editingFolder.id, {
          name: folderName.trim(),
          description: folderDesc.trim(),
          color: folderColor,
        });
        setSuccessMsg(`"${folderName.trim()}" klasörü başarıyla güncellendi.`);
      } else {
        // Create new folder
        await createFolder({
          name: folderName.trim(),
          description: folderDesc.trim(),
          color: folderColor,
        });
        setSuccessMsg(`"${folderName.trim()}" klasörü başarıyla oluşturuldu.`);
      }

      handleCancelEdit();
      if (onRefresh) onRefresh();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error("Folder save error:", err);
      setErrorMsg(err?.message || "Klasör kaydedilirken bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmFolder?.id) return;
    setIsDeleting(true);

    try {
      const folderId = deleteConfirmFolder.id;
      // Find dofs in this folder and remove folder association
      const dofsInFolder = dofs.filter((d) => d.folderId === folderId && d.id).map((d) => d.id as string);
      if (dofsInFolder.length > 0) {
        await removeDofsFromFolder(dofsInFolder);
      }

      await deleteFolder(folderId);
      setSuccessMsg(`"${deleteConfirmFolder.name}" klasörü silindi.`);
      setDeleteConfirmFolder(null);
      if (onRefresh) onRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Folder delete error:", err);
      setErrorMsg("Klasör silinirken bir hata oluştu.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered folders
  const filteredFolders = folders.filter((f) => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Statistics
  const totalFoldersCount = folders.length;
  const assignedDofsCount = dofs.filter((d) => d.folderId).length;
  const unassignedDofsCount = dofs.filter((d) => !d.folderId).length;

  const getColorConfig = (colorId?: string) => {
    return COLOR_OPTIONS.find((c) => c.id === colorId) || COLOR_OPTIONS[0];
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">
                  DÖF Klasör Yönetimi
                </h2>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                  Firestore: dof_folders
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Kapatılan veya açık DÖF'leri organize etmek, arşivlemek ve toplu yönetmek için klasörler oluşturun ve isimlendirin.
              </p>
            </div>
          </div>

          {/* Quick Stats Pill Group */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Klasör</span>
              <span className="text-sm font-black text-slate-800">{totalFoldersCount}</span>
            </div>
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-emerald-600 block uppercase">Klasörlü DÖF</span>
              <span className="text-sm font-black text-emerald-700">{assignedDofsCount}</span>
            </div>
            <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-center">
              <span className="text-[10px] font-bold text-amber-600 block uppercase">Klasörsüz</span>
              <span className="text-sm font-black text-amber-700">{unassignedDofsCount}</span>
            </div>
          </div>
        </div>

        {/* Global Messages */}
        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-800 font-semibold animate-fade-in">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs text-emerald-800 font-semibold animate-fade-in">
            <Check className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Create / Edit Folder Form */}
          <div className="lg:col-span-4">
            <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  {editingFolder ? (
                    <>
                      <Edit3 className="h-4 w-4 text-indigo-600" />
                      <span>KLASÖRÜ DÜZENLE / İSİMLENDİR</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus className="h-4 w-4 text-indigo-600" />
                      <span>YENİ KLASÖR OLUŞTUR</span>
                    </>
                  )}
                </h3>
                {editingFolder && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Vazgeç
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Klasör Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="Örn: 2026 Kalite Denetimleri"
                    className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Örn: 'Kapatılan Arşiv', 'İş Güvenliği', 'Müşteri Bildirimleri'
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Açıklama (Opsiyonel)
                  </label>
                  <textarea
                    rows={2}
                    value={folderDesc}
                    onChange={(e) => setFolderDesc(e.target.value)}
                    placeholder="Bu klasörün amacını veya kapsamını belirtin..."
                    className="w-full bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 px-3 transition text-xs font-medium"
                  />
                </div>

                {/* Color Selection Palette */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Klasör Rengi & Etiketi
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((c) => {
                      const isSelected = folderColor === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setFolderColor(c.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                            isSelected 
                              ? `${c.bg} ${c.text} ${c.border} ring-2 ${c.ring} shadow-xs` 
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition cursor-pointer text-xs shadow-md shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : editingFolder ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Klasör İsmini & Bilgilerini Güncelle</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="h-4 w-4" />
                        <span>Klasörü Oluştur & Kaydet</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Informational Guidance */}
              <div className="mt-5 pt-4 border-t border-slate-200/80 text-[11px] text-slate-500 space-y-1.5">
                <div className="flex items-start gap-1.5 font-medium">
                  <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>Klasörler DÖF listesinde seçimli olarak taşınabilir ve gelişmiş arama filtrelerinde filtrelenebilir.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Existing Folders Grid */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Search and Filters Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Klasörler arasında ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none border border-slate-200 rounded-xl py-2 pl-9 pr-3 transition text-xs font-medium"
                />
              </div>

              <span className="text-xs text-slate-500 font-medium">
                {filteredFolders.length} klasör gösteriliyor
              </span>
            </div>

            {/* Folders List Cards */}
            {filteredFolders.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-3xl p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Folder className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-700">
                  {searchQuery ? "Aramaya uygun klasör bulunamadı" : "Henüz oluşturulmuş klasör bulunmuyor"}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Sol taraftaki formu kullanarak ilk klasörünüzü oluşturun (Örn: '2026 Kapatılan DÖF Arşivi').
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredFolders.map((folder) => {
                  const colorCfg = getColorConfig(folder.color);
                  const countInFolder = dofs.filter((d) => d.folderId === folder.id).length;

                  return (
                    <div
                      key={folder.id}
                      className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
                    >
                      {/* Top Row: Icon, Name and Actions */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-10 h-10 rounded-xl ${colorCfg.bg} ${colorCfg.text} ${colorCfg.border} border flex items-center justify-center shrink-0 shadow-2xs`}>
                              <Folder className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition" title={folder.name}>
                                {folder.name}
                              </h4>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {countInFolder} Adet DÖF Faaliyeti
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(folder)}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-200 text-slate-600 hover:text-indigo-600 transition cursor-pointer"
                              title="İsmini / Bilgilerini Düzenle"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmFolder(folder)}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-100 text-slate-600 hover:text-rose-600 transition cursor-pointer"
                              title="Klasörü Sil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {folder.description && (
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-3 bg-slate-50/60 p-2 rounded-lg border border-slate-100">
                            {folder.description}
                          </p>
                        )}
                      </div>

                      {/* Bottom Row: View Dofs in Folder & Move Closed */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${colorCfg.bg} ${colorCfg.text} border ${colorCfg.border}`}>
                          {colorCfg.name}
                        </span>

                        <div className="flex items-center gap-2">
                          {onMoveClosedToFolder && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Kapatılan/tamamlanan tüm DÖF'leri "${folder.name}" klasörüne taşımak istiyor musunuz?`)) {
                                  onMoveClosedToFolder(folder.id!, folder.name);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition cursor-pointer"
                              title="Tüm Kapatılan / Çözülen DÖF'leri bu klasöre taşı"
                            >
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Kapatılanları Taşı</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onFilterByFolder(folder.id!)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
                          >
                            <span>DÖF'ler</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmFolder && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Klasörü Silmek İstediğinize Emin Misiniz?
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>"{deleteConfirmFolder.name}"</strong> klasörü silinecektir. Bu klasörün içindeki DÖF'ler silinmez, yalnızca klasörsüz (havuz) durumuna geçer.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFolder(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-rose-100 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Evet, Klasörü Sil</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DofFolderManager;
