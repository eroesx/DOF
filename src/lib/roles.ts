import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { AccessRole, AccessRoleBadgeColor, PanelUser, RolePermissions } from "../types";

const ACCESS_ROLES_STORAGE_KEY = "dof_access_roles_v1";

export const DEFAULT_ACCESS_ROLES: AccessRole[] = [
  {
    id: "admin",
    name: "Yönetici",
    description: "Tüm sistem modülleri, kullanıcılar, birimler, roller, KVKK ve sürüm ayarları dahil tam yetki.",
    badgeColor: "indigo",
    isSystemDefault: true,
    permissions: {
      canViewDashboard: true,
      canViewDofs: true,
      dofScope: "all",
      canCreateDof: true,
      canEditDof: true,
      canManageFolders: true,
      canViewReports: true,
      canViewSettings: true,
      canManageKvkkAndVersion: true,
      canManageSystemAdmin: true,
    },
  },
  {
    id: "editor",
    name: "Birim Sorumlusu",
    description:
      "Yetkili olduğu birimlere ait DÖF'leri görme, Dashboard, Klasör Yönetimi, Yeni DÖF oluşturma, Raporlar & Analiz ve temel Ayarlar (KVKK ve Sürüm hariç).",
    badgeColor: "blue",
    isSystemDefault: true,
    permissions: {
      canViewDashboard: true,
      canViewDofs: true,
      dofScope: "unit",
      canCreateDof: true,
      canEditDof: true,
      canManageFolders: true,
      canViewReports: true,
      canViewSettings: true,
      canManageKvkkAndVersion: false,
      canManageSystemAdmin: false,
    },
  },
  {
    id: "viewer",
    name: "Rapor Yetkisi",
    description: "Yalnızca Dashboard ile Rapor ve Analiz ekranlarını görüntüleme yetkisi.",
    badgeColor: "emerald",
    isSystemDefault: true,
    permissions: {
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
    },
  },
];

function cloneDefaultRoles(): AccessRole[] {
  return DEFAULT_ACCESS_ROLES.map((r) => ({
    ...r,
    permissions: { ...r.permissions },
  }));
}

function normalizeRole(role: Partial<AccessRole>, fallbackBase?: AccessRole): AccessRole {
  const basePerms: RolePermissions = fallbackBase?.permissions || {
    canViewDashboard: true,
    canViewDofs: false,
    dofScope: "unit",
    canCreateDof: false,
    canEditDof: false,
    canManageFolders: false,
    canViewReports: false,
    canViewSettings: false,
    canManageKvkkAndVersion: false,
    canManageSystemAdmin: false,
  };

  const p = (role.permissions || {}) as Partial<RolePermissions>;
  const id = (role.id || fallbackBase?.id || "").trim();

  // Safety lock: Built-in admin role always preserves full privileges
  if (id === "admin") {
    return {
      id: "admin",
      name: role.name?.trim() || "Yönetici",
      description: role.description?.trim() || fallbackBase?.description || "",
      badgeColor: (role.badgeColor as AccessRoleBadgeColor) || "indigo",
      isSystemDefault: true,
      permissions: {
        canViewDashboard: true,
        canViewDofs: true,
        dofScope: "all",
        canCreateDof: true,
        canEditDof: true,
        canManageFolders: true,
        canViewReports: true,
        canViewSettings: true,
        canManageKvkkAndVersion: true,
        canManageSystemAdmin: true,
      },
      updatedAt: role.updatedAt,
    };
  }

  return {
    id,
    name: role.name?.trim() || fallbackBase?.name || id,
    description: role.description?.trim() ?? fallbackBase?.description ?? "",
    badgeColor: (role.badgeColor as AccessRoleBadgeColor) || fallbackBase?.badgeColor || "slate",
    isSystemDefault: fallbackBase?.isSystemDefault ?? Boolean(role.isSystemDefault),
    permissions: {
      canViewDashboard: typeof p.canViewDashboard === "boolean" ? p.canViewDashboard : basePerms.canViewDashboard,
      canViewDofs: typeof p.canViewDofs === "boolean" ? p.canViewDofs : basePerms.canViewDofs,
      dofScope: p.dofScope === "all" || p.dofScope === "unit" ? p.dofScope : basePerms.dofScope,
      canCreateDof: typeof p.canCreateDof === "boolean" ? p.canCreateDof : basePerms.canCreateDof,
      canEditDof: typeof p.canEditDof === "boolean" ? p.canEditDof : basePerms.canEditDof,
      canManageFolders: typeof p.canManageFolders === "boolean" ? p.canManageFolders : basePerms.canManageFolders,
      canViewReports: typeof p.canViewReports === "boolean" ? p.canViewReports : basePerms.canViewReports,
      canViewSettings: typeof p.canViewSettings === "boolean" ? p.canViewSettings : basePerms.canViewSettings,
      canManageKvkkAndVersion:
        typeof p.canManageKvkkAndVersion === "boolean"
          ? p.canManageKvkkAndVersion
          : basePerms.canManageKvkkAndVersion,
      canManageSystemAdmin:
        typeof p.canManageSystemAdmin === "boolean"
          ? p.canManageSystemAdmin
          : basePerms.canManageSystemAdmin,
    },
    updatedAt: role.updatedAt,
  };
}

export function mergeWithDefaultRoles(inputRoles?: Partial<AccessRole>[] | null): AccessRole[] {
  const defaults = cloneDefaultRoles();
  if (!Array.isArray(inputRoles) || inputRoles.length === 0) {
    return defaults;
  }

  const byId = new Map<string, AccessRole>();
  defaults.forEach((d) => byId.set(d.id, d));

  inputRoles.forEach((raw) => {
    const id = (raw?.id || "").trim();
    if (!id) return;
    const base = defaults.find((d) => d.id === id);
    byId.set(id, normalizeRole(raw, base));
  });

  // Preserve default order first, then any custom roles
  const ordered: AccessRole[] = [];
  defaults.forEach((d) => {
    const item = byId.get(d.id);
    if (item) ordered.push(item);
  });
  byId.forEach((item, key) => {
    if (!defaults.some((d) => d.id === key)) {
      ordered.push(item);
    }
  });
  return ordered;
}

export function getStoredAccessRoles(): AccessRole[] {
  if (typeof window === "undefined") return cloneDefaultRoles();
  try {
    const raw = localStorage.getItem(ACCESS_ROLES_STORAGE_KEY);
    if (!raw) return cloneDefaultRoles();
    const parsed = JSON.parse(raw);
    return mergeWithDefaultRoles(parsed);
  } catch {
    return cloneDefaultRoles();
  }
}

export async function syncAccessRolesFromFirestore(): Promise<AccessRole[]> {
  try {
    const docRef = doc(db, "system_settings", "access_roles");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const merged = mergeWithDefaultRoles(data?.roles);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACCESS_ROLES_STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    }
  } catch (err) {
    console.warn("Could not sync access roles from Firestore:", err);
  }
  return getStoredAccessRoles();
}

export async function saveAccessRoles(roles: AccessRole[]): Promise<AccessRole[]> {
  const normalized = mergeWithDefaultRoles(roles);
  if (typeof window !== "undefined") {
    localStorage.setItem(ACCESS_ROLES_STORAGE_KEY, JSON.stringify(normalized));
  }
  try {
    const docRef = doc(db, "system_settings", "access_roles");
    await setDoc(
      docRef,
      {
        roles: normalized,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save access roles to Firestore:", err);
  }
  return normalized;
}

export function slugifyRoleId(name: string): string {
  const trMap: Record<string, string> = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    I: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u",
  };
  let s = (name || "").trim();
  Object.entries(trMap).forEach(([k, v]) => {
    s = s.replace(new RegExp(k, "g"), v);
  });
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || `rol_${Date.now()}`
  );
}

export function getRoleById(roleId?: string | null, roles?: AccessRole[]): AccessRole {
  const list = roles && roles.length > 0 ? roles : getStoredAccessRoles();
  const normalizedId = (roleId || "").trim().toLowerCase();

  // Alias mapping for Turkish labels if stored directly
  const aliasId =
    normalizedId === "yönetici" || normalizedId === "yonetici"
      ? "admin"
      : normalizedId === "birim sorumlusu" || normalizedId === "birim_sorumlusu"
      ? "editor"
      : normalizedId === "rapor yetkisi" || normalizedId === "rapor_yetkisi"
      ? "viewer"
      : normalizedId;

  const matched =
    list.find((r) => r.id.toLowerCase() === aliasId) ||
    list.find((r) => r.id.toLowerCase() === normalizedId) ||
    list.find((r) => r.name.toLowerCase() === normalizedId);

  if (matched) return matched;
  return list.find((r) => r.id === "editor") || DEFAULT_ACCESS_ROLES[1];
}

export function getRoleDisplayName(roleId?: string | null, roles?: AccessRole[]): string {
  return getRoleById(roleId, roles).name;
}

export function getRoleBadgeClasses(color?: AccessRoleBadgeColor): string {
  switch (color) {
    case "indigo":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "blue":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "emerald":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "amber":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "rose":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "purple":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function resolveEffectivePermissions(
  user: PanelUser | null,
  roles?: AccessRole[],
  isSystemAdminOverride?: boolean
): RolePermissions {
  const email = (user?.email || (typeof window !== "undefined" ? localStorage.getItem("dof_admin_authed_email") : "") || "")
    .toLowerCase()
    .trim();
  const dept = (user?.department || (typeof window !== "undefined" ? localStorage.getItem("dof_admin_user_dept") : "") || "")
    .trim();
  const roleId = user?.role || (typeof window !== "undefined" ? localStorage.getItem("dof_admin_user_role") : "") || "";

  if (isSystemAdminOverride || email === "gokhan.eroglu@gmail.com") {
    return { ...DEFAULT_ACCESS_ROLES[0].permissions };
  }

  const matchedRole = getRoleById(roleId, roles);
  const perms: RolePermissions = { ...matchedRole.permissions };

  // Unit-assigned users (non-super) never get full system admin panel unless they have no unit restriction
  const hasSpecificDept = Boolean(dept && dept.toLowerCase() !== "tüm birimler");
  if (email === "sahin@gmail.com" || hasSpecificDept) {
    perms.canManageSystemAdmin = false;
    // Also ensure KVKK and App Version remain strictly admin-only when user has unit scope or is not admin role
    if (matchedRole.id !== "admin") {
      perms.canManageKvkkAndVersion = false;
    }
    if (matchedRole.id !== "admin" && !user?.canSeeAllDofs) {
      perms.dofScope = "unit";
    }
  }

  if (user?.canSeeAllDofs && !hasSpecificDept) {
    perms.dofScope = "all";
  }

  return perms;
}
