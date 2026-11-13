import React, { useState } from "react";
import {
  Shield,
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Users,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Lock,
  LayoutDashboard,
  Grid,
  FolderKanban,
  FilePlus2,
  Sparkles,
  Settings,
  EyeOff,
} from "lucide-react";
import {
  AccessRole,
  AccessRoleBadgeColor,
  PanelUser,
  RolePermissions,
} from "../types";
import {
  DEFAULT_ACCESS_ROLES,
  getRoleBadgeClasses,
  saveAccessRoles,
  slugifyRoleId,
} from "../lib/roles";

interface DofRoleManagerProps {
  roles: AccessRole[];
  panelUsers: PanelUser[];
  onRolesChange: (updatedRoles: AccessRole[]) => void;
}

const BADGE_COLOR_OPTIONS: { value: AccessRoleBadgeColor; label: string; dot: string }[] = [
  { value: "indigo", label: "İndigo (Yönetici)", dot: "bg-indigo-600" },
  { value: "blue", label: "Mavi (Birim)", dot: "bg-blue-600" },
  { value: "emerald", label: "Yeşil (Rapor)", dot: "bg-emerald-600" },
  { value: "amber", label: "Amber", dot: "bg-amber-500" },
  { value: "purple", label: "Mor", dot: "bg-purple-600" },
  { value: "rose", label: "Gül", dot: "bg-rose-600" },
  { value: "slate", label: "Gri", dot: "bg-slate-600" },
];

const EMPTY_PERMS: RolePermissions = {
  canViewDashboard: true,
  canViewDofs: false,
  dofScope: "unit",
  canCreateDof: false,
  canEditDof: false,
  canManageFolders: false,
  canViewReports: true,
  canViewSettings: false,
  canManageKvkkAndVersion: false,
  canManageSystemAdmin: false,
};

export const DofRoleManager: React.FC<DofRoleManagerProps> = ({
  roles,
  panelUsers,
  onRolesChange,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleBadgeColor, setRoleBadgeColor] = useState<AccessRoleBadgeColor>("blue");
  const [perms, setPerms] = useState<RolePermissions>({ ...EMPTY_PERMS });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRoleBadgeColor("blue");
    setPerms({ ...EMPTY_PERMS });
    setErrorMsg(null);
  };

  const handleOpenCreate = () => {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRoleBadgeColor("purple");
    setPerms({ ...EMPTY_PERMS });
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (role: AccessRole) => {
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setRoleBadgeColor(role.badgeColor || "indigo");
    setPerms({ ...role.permissions });
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsFormOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = roleName.trim();
    if (!trimmedName) {
      setErrorMsg("Rol adı zorunludur.");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      let nextRoles: AccessRole[];

      if (editingRoleId) {
        nextRoles = roles.map((r) =>
          r.id === editingRoleId
            ? {
                ...r,
                name: trimmedName,
                description: roleDescription.trim(),
                badgeColor: roleBadgeColor,
                permissions:
                  r.id === "admin"
                    ? { ...DEFAULT_ACCESS_ROLES[0].permissions }
                    : { ...perms },
                updatedAt: nowIso,
              }
            : r
        );
      } else {
        let newId = slugifyRoleId(trimmedName);
        if (roles.some((r) => r.id.toLowerCase() === newId.toLowerCase())) {
          newId = `${newId}_${Date.now().toString().slice(-4)}`;
        }
        const newRole: AccessRole = {
          id: newId,
          name: trimmedName,
          description: roleDescription.trim(),
          badgeColor: roleBadgeColor,
          isSystemDefault: false,
          permissions: { ...perms },
          updatedAt: nowIso,
        };
        nextRoles = [...roles, newRole];
      }

      const saved = await saveAccessRoles(nextRoles);
      onRolesChange(saved);
      resetForm();
      setSuccessMsg(
        editingRoleId
          ? "Erişim rolü yetkileri güncellendi."
          : "Yeni erişim rolü başarıyla tanımlandı."
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error("Rol kaydedilirken hata:", err);
      setErrorMsg("Rol kaydedilirken bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (role: AccessRole) => {
    if (role.isSystemDefault) return;
    const assignedCount = panelUsers.filter((u) => u.role === role.id).length;
    if (assignedCount > 0) {
      setErrorMsg(
        `"${role.name}" rolüne atanmış ${assignedCount} kullanıcı bulunuyor. Önce kullanıcıların rolünü değiştirin.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const nextRoles = roles.filter((r) => r.id !== role.id);
      const saved = await saveAccessRoles(nextRoles);
      onRolesChange(saved);
      if (editingRoleId === role.id) resetForm();
      setSuccessMsg(`"${role.name}" rolü kaldırıldı.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Rol silinirken hata:", err);
      setErrorMsg("Rol silinirken bir hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const customOnly = roles.filter((r) => !r.isSystemDefault);
      const saved = await saveAccessRoles([...DEFAULT_ACCESS_ROLES, ...customOnly]);
      onRolesChange(saved);
      resetForm();
      setSuccessMsg("Varsayılan 3 erişim rolü (Yönetici, Birim Sorumlusu, Rapor Yetkisi) sıfırlandı.");
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error("Roller sıfırlanırken hata:", err);
      setErrorMsg("Varsayılan roller yüklenirken hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const isEditingAdmin = editingRoleId === "admin";

  const permissionItems: {
    key: keyof RolePermissions;
    label: string;
    desc: string;
    icon: React.ReactNode;
    adminNote?: boolean;
  }[] = [
    {
      key: "canViewDashboard",
      label: "Dashboard Görme",
      desc: "Özet metrik kartları ve ana kontrol grafiklerini görüntüleme",
      icon: <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600" />,
    },
    {
      key: "canViewDofs",
      label: "DÖF Listesi & Takip Görme",
      desc: "DÖF başvurularını listeleme, detay inceleme ve filtreleme",
      icon: <Grid className="h-3.5 w-3.5 text-blue-600" />,
    },
    {
      key: "canManageFolders",
      label: "Klasör Yönetimi",
      desc: "DÖF klasörleri oluşturma, düzenleme ve arşivleme",
      icon: <FolderKanban className="h-3.5 w-3.5 text-amber-600" />,
    },
    {
      key: "canCreateDof",
      label: "Yeni DÖF Oluşturma",
      desc: "Yönetim paneli içerisinden yeni DÖF kaydı başlatma",
      icon: <FilePlus2 className="h-3.5 w-3.5 text-emerald-600" />,
    },
    {
      key: "canEditDof",
      label: "DÖF Düzenleme & Aksiyon",
      desc: "Uygunsuzluk durumu, havale ve aksiyon adımlarını güncelleme",
      icon: <Edit3 className="h-3.5 w-3.5 text-indigo-600" />,
    },
    {
      key: "canViewReports",
      label: "Raporlar & Analiz",
      desc: "Performans metrikleri, grafikler ve birim dağılım raporları",
      icon: <Sparkles className="h-3.5 w-3.5 text-purple-600" />,
    },
    {
      key: "canViewSettings",
      label: "Ayarlar Ekranını Görme",
      desc: "Termin süreleri, ses, bildirim ve varsayılan sekme ayarları",
      icon: <Settings className="h-3.5 w-3.5 text-slate-600" />,
    },
    {
      key: "canManageKvkkAndVersion",
      label: "KVKK Veri Gizleme & Uygulama Sürümü",
      desc: "Kişisel veri maskeleme ve uygulama versiyon numarası düzenleme (Sadece Admin önerilir)",
      icon: <EyeOff className="h-3.5 w-3.5 text-rose-600" />,
      adminNote: true,
    },
    {
      key: "canManageSystemAdmin",
      label: "Tam Sistem Yönetimi (Yönetici)",
      desc: "Kullanıcılar, Erişim Rolleri, Birimler, QR/Uzak Bağlantı, Loglar ve Veritabanı",
      icon: <Lock className="h-3.5 w-3.5 text-rose-600" />,
      adminNote: true,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in" id="role-management-section">
      {/* Header Banner */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            Erişim Rolü Tanımlama & Yetki Matrisi
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Sistemdeki erişim rollerini ve modül bazlı izinleri tanımlayın. Şu an için{" "}
            <strong>Yönetici</strong>, <strong>Birim Sorumlusu</strong> ve{" "}
            <strong>Rapor Yetkisi</strong> rolleri aktif olup dilerseniz yeni roller ekleyebilir veya yetkileri güncelleyebilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
            title="Varsayılan 3 rolün izinlerini sıfırla"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Varsayılana Sıfırla
          </button>
          <button
            type="button"
            onClick={() => (isFormOpen && !editingRoleId ? resetForm() : handleOpenCreate())}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md shadow-indigo-100"
          >
            <Plus className="h-4 w-4" />
            Yeni Erişim Rolü Ekle
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-xs font-semibold text-rose-700 flex items-center gap-2 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="text-xs font-semibold text-emerald-700 flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Role Create / Edit Form */}
        {isFormOpen && (
          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-md space-y-4 relative">
              <button
                type="button"
                onClick={resetForm}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                title="Formu Kapat"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 pr-6">
                  <Shield className="h-4 w-4 text-indigo-600" />
                  {editingRoleId ? "Erişim Rolünü Düzenle" : "Yeni Erişim Rolü Tanımla"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isEditingAdmin
                    ? "Yönetici rolü sistem güvenliği için daima tam yetkiye sahiptir."
                    : "Bu role atanacak kullanıcıların erişebileceği ekranları ve işlemleri seçin."}
                </p>
              </div>

              <form onSubmit={handleSaveRole} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                    Rol Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="Örn: Kalite Denetçisi"
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-semibold outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                    Açıklama
                  </label>
                  <textarea
                    rows={2}
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Bu rolün yetki kapsamını kısaca açıklayın..."
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-medium outline-none transition resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1.5">
                    Rozet Rengi
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {BADGE_COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setRoleBadgeColor(c.value)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          roleBadgeColor === c.value
                            ? "border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DÖF Kapsamı */}
                {perms.canViewDofs && (
                  <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-blue-900 uppercase tracking-wide block">
                      DÖF Görüntüleme Kapsamı
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isEditingAdmin}
                        onClick={() => setPerms((p) => ({ ...p, dofScope: "unit" }))}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                          perms.dofScope === "unit"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        } disabled:opacity-60`}
                      >
                        Yetkili Birim DÖF'leri
                      </button>
                      <button
                        type="button"
                        disabled={isEditingAdmin}
                        onClick={() => setPerms((p) => ({ ...p, dofScope: "all" }))}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                          perms.dofScope === "all"
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        } disabled:opacity-60`}
                      >
                        Tüm Birim DÖF'leri
                      </button>
                    </div>
                  </div>
                )}

                {/* Yetki Checkboxları */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-600 uppercase block">
                    Modül & İşlem Yetkileri
                  </label>
                  <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                    {permissionItems.map((item) => {
                      const checked = Boolean(perms[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition select-none ${
                            isEditingAdmin ? "opacity-75 cursor-not-allowed" : "cursor-pointer"
                          } ${
                            checked
                              ? item.adminNote
                                ? "bg-rose-50/50 border-rose-200"
                                : "bg-indigo-50/50 border-indigo-200"
                              : "bg-slate-50/60 border-slate-200/80 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isEditingAdmin}
                            checked={checked}
                            onChange={(e) =>
                              setPerms((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {item.icon}
                              <span className="text-xs font-bold text-slate-800">{item.label}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">
                              {item.desc}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isSaving ? "Kaydediliyor..." : editingRoleId ? "Rolü Güncelle" : "Rolü Oluştur"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Role Cards + Permission Matrix */}
        <div className={`${isFormOpen ? "lg:col-span-7" : "lg:col-span-12"} space-y-6`}>
          {/* Role Cards Grid */}
          <div className={`grid grid-cols-1 ${isFormOpen ? "md:grid-cols-1" : "md:grid-cols-3"} gap-4`}>
            {roles.map((role, idx) => {
              const userCount =
                role.id === "admin"
                  ? panelUsers.filter((u) => u.role === "admin").length + 1
                  : panelUsers.filter((u) => u.role === role.id).length;
              const p = role.permissions;

              const activeTags: string[] = [];
              if (p.canViewDashboard) activeTags.push("Dashboard");
              if (p.canViewDofs)
                activeTags.push(p.dofScope === "all" ? "Tüm DÖF'ler" : "Yetkili Birim DÖF'leri");
              if (p.canManageFolders) activeTags.push("Klasör Yönetimi");
              if (p.canCreateDof) activeTags.push("Yeni DÖF Oluşturma");
              if (p.canViewReports) activeTags.push("Raporlar & Analiz");
              if (p.canViewSettings)
                activeTags.push(
                  p.canManageKvkkAndVersion ? "Ayarlar (Tam)" : "Ayarlar (KVKK & Sürüm Hariç)"
                );
              if (p.canManageSystemAdmin) activeTags.push("Yönetim Paneli (Tam Yetki)");

              return (
                <div
                  key={role.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            #{idx + 1}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-extrabold ${getRoleBadgeClasses(
                              role.badgeColor
                            )}`}
                          >
                            <Shield className="h-3 w-3" />
                            {role.name}
                          </span>
                          {role.isSystemDefault && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Varsayılan
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {role.description || "Özel tanımlı erişim rolü."}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(role)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                          title="Rol Yetkilerini Düzenle"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {!role.isSystemDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRole(role)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Rolü Sil"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {activeTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 border border-slate-200/80"
                        >
                          <Check className="h-2.5 w-2.5 text-emerald-600" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <strong>{userCount}</strong> kullanıcı atanmış
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Kod: {role.id}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Yetki Karşılaştırma Matrisi */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Modül Bazlı Yetki Matrisi</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tanımlı tüm rollerin hangi modül ve hassas ayarlara erişebildiğini karşılaştırın.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold">
                    <th className="p-3">Yetki / Modül</th>
                    {roles.map((r) => (
                      <th key={r.id} className="p-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${getRoleBadgeClasses(
                            r.badgeColor
                          )}`}
                        >
                          {r.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      label: "Dashboard Görme",
                      check: (p: RolePermissions) => p.canViewDashboard,
                    },
                    {
                      label: "Yetkili Olduğu Birimlere Ait DÖF Görme",
                      check: (p: RolePermissions) => p.canViewDofs,
                      detail: (p: RolePermissions) =>
                        p.canViewDofs ? (p.dofScope === "all" ? "Tümü" : "Birim") : "—",
                    },
                    {
                      label: "Klasör Yönetimi",
                      check: (p: RolePermissions) => p.canManageFolders,
                    },
                    {
                      label: "Yeni DÖF Oluşturma",
                      check: (p: RolePermissions) => p.canCreateDof,
                    },
                    {
                      label: "Raporlar & Analiz",
                      check: (p: RolePermissions) => p.canViewReports,
                    },
                    {
                      label: "Ayarlar (Genel Parametreler)",
                      check: (p: RolePermissions) => p.canViewSettings,
                    },
                    {
                      label: "KVKK Kişisel Veri Gizleme & Maskeleme",
                      check: (p: RolePermissions) => p.canManageKvkkAndVersion,
                      adminOnly: true,
                    },
                    {
                      label: "Uygulama Versiyon Bilgisi (Sürüm)",
                      check: (p: RolePermissions) => p.canManageKvkkAndVersion,
                      adminOnly: true,
                    },
                    {
                      label: "Kullanıcı, Rol, Birim & Sistem Yönetimi",
                      check: (p: RolePermissions) => p.canManageSystemAdmin,
                      adminOnly: true,
                    },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50/60">
                      <td className="p-3 font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          <span>{row.label}</span>
                          {row.adminOnly && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                              Sadece Admin
                            </span>
                          )}
                        </div>
                      </td>
                      {roles.map((r) => {
                        const allowed = row.check(r.permissions);
                        const detailText = row.detail ? row.detail(r.permissions) : null;
                        return (
                          <td key={r.id} className="p-3 text-center">
                            {allowed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                                <Check className="h-3 w-3" />
                                {detailText || "Yetkili"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold text-[10px]">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DofRoleManager;
