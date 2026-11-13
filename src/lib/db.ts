import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { DofForm, PanelUser, Department, DofFolder } from "../types";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Generate unique Ref No like DOF-Y26-xxxxx
export function generateRefNo(): string {
  const year = new Date().getFullYear().toString().substring(2);
  const randomNum = Math.floor(10000 + Math.random() * 90000); // 5 digits
  return `DOF-${year}-${randomNum}`;
}

// DB Operations

const COLLECTION_NAME = "dofs";

export async function createDof(formData: Omit<DofForm, "createdAt" | "updatedAt">): Promise<string> {
  const docRef = doc(collection(db, COLLECTION_NAME));
  const newId = docRef.id;

  const dataToSave = {
    ...formData,
    user_department: formData.department,
    id: newId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, dataToSave);
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${COLLECTION_NAME}/${newId}`);
    return "";
  }
}

export async function getDof(id: string): Promise<DofForm | null> {
  const path = `${COLLECTION_NAME}/${id}`;
  try {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as DofForm;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function getDofByRefNo(refNo: string): Promise<DofForm | null> {
  const path = COLLECTION_NAME;
  try {
    const q = query(collection(db, COLLECTION_NAME), where("refNo", "==", refNo));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as DofForm;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

// Centralized Authorization & Access Filter
export interface UserAuthContext {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  authorizedDepartments?: string[];
  canSeeAllDofs?: boolean;
}

export function normalizeUnitText(value?: string | null): string {
  return (value || "").trim().toLocaleLowerCase("tr-TR");
}

export function splitDepartmentNames(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  raw.split(",").forEach((part) => {
    const trimmed = part.trim();
    const norm = normalizeUnitText(trimmed);
    if (!trimmed || norm === "tüm birimler") return;
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(trimmed);
    }
  });
  return result;
}

export function isUserAssignedToDepartment(
  user: Pick<PanelUser, "id" | "email" | "department">,
  dept: Department
): boolean {
  const uId = (user.id || "").trim();
  const uEmail = normalizeUnitText(user.email);

  if (uId) {
    if (Array.isArray(dept.referralUserIds) && dept.referralUserIds.includes(uId)) {
      return true;
    }
    if (dept.referralUserId && dept.referralUserId === uId) {
      return true;
    }
  }

  if (uEmail) {
    if (
      Array.isArray(dept.responsibleEmails) &&
      dept.responsibleEmails.some((e) => normalizeUnitText(e) === uEmail)
    ) {
      return true;
    }
    if (
      dept.responsibleEmail &&
      dept.responsibleEmail
        .split(",")
        .some((e) => normalizeUnitText(e) === uEmail)
    ) {
      return true;
    }
  }

  // Legacy fallback ONLY if department has never stored explicit responsible IDs/emails
  const hasExplicitAssignments =
    Array.isArray(dept.referralUserIds) ||
    Boolean(dept.referralUserId) ||
    (Array.isArray(dept.responsibleEmails) && dept.responsibleEmails.length > 0) ||
    Boolean(dept.responsibleEmail && dept.responsibleEmail.trim());

  if (!hasExplicitAssignments) {
    const deptNorm = normalizeUnitText(dept.name);
    if (
      deptNorm &&
      splitDepartmentNames(user.department).some((part) => normalizeUnitText(part) === deptNorm)
    ) {
      return true;
    }
  }

  return false;
}

export function getAuthorizedDepartmentsForUser(
  user: Pick<PanelUser, "id" | "email" | "department"> | null | undefined,
  depts: Department[]
): string[] {
  if (!user) return [];
  const seen = new Set<string>();
  const names: string[] = [];

  if (Array.isArray(depts) && depts.length > 0) {
    depts.forEach((dept) => {
      if (isUserAssignedToDepartment(user, dept)) {
        const norm = normalizeUnitText(dept.name);
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          names.push(dept.name.trim());
        }
      }
    });
    return names;
  }

  return splitDepartmentNames(user.department);
}

export function getCurrentUserAuthContext(): UserAuthContext {
  const email = (localStorage.getItem("dof_admin_authed_email") || "").toLowerCase().trim();
  const role = (localStorage.getItem("dof_admin_user_role") || "").toLowerCase().trim();
  const department = localStorage.getItem("dof_admin_user_dept") || "";
  const userId = localStorage.getItem("dof_admin_user_id") || auth.currentUser?.uid || null;
  let authorizedDepartments: string[] = [];
  try {
    const rawAuthDepts = localStorage.getItem("dof_admin_user_authorized_depts");
    if (rawAuthDepts) {
      const parsed = JSON.parse(rawAuthDepts);
      if (Array.isArray(parsed)) {
        authorizedDepartments = parsed.filter((x) => typeof x === "string" && x.trim().length > 0);
      }
    }
  } catch {}
  
  const canSeeAllStored = localStorage.getItem("dof_admin_user_can_see_all") === "true";

  if (email) {
    return {
      userId,
      email,
      role: email === "sahin@gmail.com" ? "editor" : role,
      department: email === "sahin@gmail.com" ? (department || "Üzülmez TİM") : department,
      authorizedDepartments,
      canSeeAllDofs: email === "sahin@gmail.com" ? false : canSeeAllStored
    };
  }

  // Only fallback to auth.currentUser if no panel user is stored
  const googleEmail = (auth.currentUser?.email || "").toLowerCase().trim();
  return {
    userId,
    email: googleEmail,
    role: googleEmail === "gokhan.eroglu@gmail.com" ? "admin" : role,
    department: googleEmail === "gokhan.eroglu@gmail.com" ? "Tüm Birimler" : department,
    authorizedDepartments,
    canSeeAllDofs: canSeeAllStored
  };
}

/**
 * accessFilter: Centralized constraint function enforcing department, user_department, or user_id constraint on DÖF records.
 * Non-admin users strictly see only records belonging to their department(s) or assigned to them.
 * Rejected DOFs are restricted strictly to system admins.
 */
export function accessFilter(dof: DofForm, context?: UserAuthContext | null): boolean {
  const ctx = context || getCurrentUserAuthContext();
  const email = (ctx.email || "").toLowerCase().trim();
  const dept = (ctx.department || "").trim();
  const role = (ctx.role || "").toLowerCase().trim();
  const userId = ctx.userId || null;

  // sahin@gmail.com or users with specific departments are strictly unit users, NEVER super admin
  const isSuper = email !== "sahin@gmail.com" &&
    ((role === "admin" && (!dept || dept === "Tüm Birimler" || dept.toLowerCase() === "tüm birimler")) ||
     (email === "gokhan.eroglu@gmail.com" && (!dept || dept === "Tüm Birimler")));
  
  // 1. Reddedilen DÖF'leri SADECE en üst yetkili (sistem yöneticisi / admin) görebilir
  const st = (dof.status || "").toLowerCase().trim();
  const isRejected = st === "reddedildi" || st === "iptal";
  if (isRejected && !isSuper) {
    return false;
  }

  // 2. Tam yetkili sistem yöneticisi tüm DÖF'leri görebilir
  if (isSuper) {
    return true;
  }

  // Türkçe karakterlere duyarlı normalizasyon
  const norm = normalizeUnitText;
  const dofDept = norm(dof.department);
  const dofUserDept = norm((dof as any).user_department);
  const dofAssignedUnit = norm(dof.assignedUnit);

  // Birim eşleşmesi (kullanıcının birimi ile DÖF birimi, user_department veya assignedUnit)
  const authorizedNormDepts = new Set<string>();
  splitDepartmentNames(dept).forEach((part) => {
    const n = norm(part);
    if (n && n !== "tüm birimler") authorizedNormDepts.add(n);
  });
  if (Array.isArray(ctx.authorizedDepartments)) {
    ctx.authorizedDepartments.forEach((d) => {
      splitDepartmentNames(d).forEach((part) => {
        const n = norm(part);
        if (n && n !== "tüm birimler") authorizedNormDepts.add(n);
      });
    });
  }

  if (authorizedNormDepts.size > 0) {
    if (
      (dofDept && authorizedNormDepts.has(dofDept)) ||
      (dofUserDept && authorizedNormDepts.has(dofUserDept)) ||
      (dofAssignedUnit && authorizedNormDepts.has(dofAssignedUnit))
    ) {
      return true;
    }
  }

  // Kullanıcı ID eşleşmesi (tekil veya çoklu birim sorumlusu listesi)
  if (userId) {
    if (dof.assignedUserId && dof.assignedUserId === userId) {
      return true;
    }
    if (Array.isArray(dof.assignedUserIds) && dof.assignedUserIds.includes(userId)) {
      return true;
    }
  }

  // Kullanıcıya atanmış DÖF (tekil veya çoklu e-posta eşleşmesi)
  if (email) {
    if (dof.assignedUserEmail && norm(dof.assignedUserEmail) === email) {
      return true;
    }
    if (Array.isArray(dof.assignedUserEmails) && dof.assignedUserEmails.some((e) => norm(e) === email)) {
      return true;
    }
  }

  // Kullanıcının bizzat raporladığı DÖF
  if (dof.reporterContact && email && norm(dof.reporterContact) === email) {
    return true;
  }

  // Rapor yetkisi (birimi olmayan / Tüm Birimler) veya açık Tüm DÖF'ler yetkisi (birimi olmayan)
  if (
    email !== "sahin@gmail.com" &&
    authorizedNormDepts.size === 0 &&
    (ctx.canSeeAllDofs || role === "viewer")
  ) {
    return true;
  }

  return false;
}

/**
 * filterAuthorizedDofs: Filters an array of DÖFs by the given or current user authorization context.
 */
export function filterAuthorizedDofs(dofs: DofForm[], context?: UserAuthContext | null): DofForm[] {
  const ctx = context || getCurrentUserAuthContext();
  return dofs.filter((dof) => accessFilter(dof, ctx));
}

/**
 * authorizedQuery: Prepares a Firestore query enforcing department / user_department filter if applicable.
 * To avoid composite index requirements in Firestore, sorting is done in memory.
 */
export function authorizedQuery(context?: UserAuthContext | null) {
  const ctx = context || getCurrentUserAuthContext();
  const colRef = collection(db, COLLECTION_NAME);
  const email = (ctx.email || "").toLowerCase().trim();
  const dept = (ctx.department || "").trim();
  const role = (ctx.role || "").toLowerCase().trim();
  const isSuper = email !== "sahin@gmail.com" &&
    ((role === "admin" && (!dept || dept === "Tüm Birimler" || dept.toLowerCase() === "tüm birimler")) ||
     (email === "gokhan.eroglu@gmail.com" && (!dept || dept === "Tüm Birimler")));

  if (!isSuper) {
    const unitMap = new Map<string, string>();
    [...splitDepartmentNames(dept), ...(ctx.authorizedDepartments || []).flatMap((d) => splitDepartmentNames(d))].forEach(
      (unitName) => {
        const norm = normalizeUnitText(unitName);
        if (norm && !unitMap.has(norm)) {
          unitMap.set(norm, unitName);
        }
      }
    );
    const unitList = Array.from(unitMap.values());
    if (unitList.length === 0 && email !== "sahin@gmail.com" && (ctx.canSeeAllDofs || role === "viewer")) {
      return query(colRef);
    }
    if (unitList.length === 1) {
      return query(colRef, where("department", "==", unitList[0]));
    } else if (unitList.length > 1) {
      return query(colRef, where("department", "in", unitList.slice(0, 30)));
    }
  }

  return query(colRef);
}

export async function listAuthorizedDofs(context?: UserAuthContext | null): Promise<DofForm[]> {
  return listDofs(context);
}

export async function listDofs(context?: UserAuthContext | null): Promise<DofForm[]> {
  const path = COLLECTION_NAME;
  const ctx = context || getCurrentUserAuthContext();
  try {
    const q = authorizedQuery(ctx);
    const querySnapshot = await getDocs(q);
    const list: DofForm[] = [];
    querySnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() } as DofForm);
    });
    // In-memory sorting by createdAt descending
    list.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });
    return filterAuthorizedDofs(list, ctx);
  } catch (error) {
    // Graceful fallback
    try {
      const qFallback = query(collection(db, COLLECTION_NAME));
      const querySnapshot = await getDocs(qFallback);
      const list: DofForm[] = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DofForm);
      });
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
      return filterAuthorizedDofs(list, ctx);
    } catch (fallbackError) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  }
}

export async function updateDof(id: string, updates: Partial<DofForm>): Promise<void> {
  const path = `${COLLECTION_NAME}/${id}`;
  try {
    const docRef = doc(db, COLLECTION_NAME, id);

    // Automatically trigger notification if status is updated and has changed
    if (updates.status) {
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const oldDof = docSnap.data() as DofForm;
          const oldStatus = oldDof.status;
          const newStatus = updates.status;

          if (oldStatus !== newStatus) {
            // Lazy import to avoid circular dependency
            const { triggerManagerEmailNotification } = await import("./notifications");
            triggerManagerEmailNotification("status_change", { ...oldDof, ...updates, id }, { oldStatus, newStatus })
              .catch((err) => console.error("Background notification error:", err));
          }
        }
      } catch (err) {
        console.error("Failed to fetch old DOF for email notification:", err);
      }
    }

    const fieldsToUpdate: any = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    if (updates.department) {
      fieldsToUpdate.user_department = updates.department;
    }

    await updateDoc(docRef, fieldsToUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDof(id: string): Promise<void> {
  const path = `${COLLECTION_NAME}/${id}`;
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Panel Users Management
const PANEL_USERS_COLLECTION = "panel_users";

export async function listPanelUsers(): Promise<PanelUser[]> {
  const path = PANEL_USERS_COLLECTION;
  try {
    const q = query(collection(db, PANEL_USERS_COLLECTION), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const list: PanelUser[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as Record<string, any>;
      list.push({ id: doc.id, ...data } as PanelUser);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function createPanelUser(userData: Omit<PanelUser, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = doc(collection(db, PANEL_USERS_COLLECTION));
  const newId = docRef.id;

  const dataToSave = {
    ...userData,
    id: newId,
    email: userData.email.toLowerCase().trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, dataToSave);
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PANEL_USERS_COLLECTION}/${newId}`);
    return "";
  }
}

export async function updatePanelUser(id: string, updates: Partial<PanelUser>): Promise<void> {
  const path = `${PANEL_USERS_COLLECTION}/${id}`;
  try {
    const docRef = doc(db, PANEL_USERS_COLLECTION, id);
    const dataToUpdate: Record<string, any> = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    if (updates.email) {
      dataToUpdate.email = updates.email.toLowerCase().trim();
    }
    await updateDoc(docRef, dataToUpdate);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePanelUser(id: string): Promise<void> {
  const path = `${PANEL_USERS_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, PANEL_USERS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Email Notifications Log Retrieval
export async function listEmailLogs(): Promise<any[]> {
  const path = "email_logs";
  try {
    const q = query(collection(db, "email_logs"), orderBy("sentAt", "desc"));
    const querySnapshot = await getDocs(q);
    const list: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({ id: doc.id, ...data });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Departments Management
const DEPARTMENTS_COLLECTION = "departments";

export async function listDepartments(onlyActive = false): Promise<Department[]> {
  const path = DEPARTMENTS_COLLECTION;
  try {
    const q = query(collection(db, DEPARTMENTS_COLLECTION));
    const querySnapshot = await getDocs(q);
    const list: Department[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({ id: doc.id, ...data } as Department);
    });

    // In-memory sort:
    // 1) By order ascending (1, 2, 3...) - undefined/null placed at the end (999999)
    // 2) Alphabetical Turkish locale by name
    const getOrderValue = (d: Department) => {
      if (d.order !== undefined && d.order !== null && String(d.order).trim() !== "") {
        const parsed = Number(d.order);
        if (!isNaN(parsed)) return parsed;
      }
      return 999999;
    };

    list.sort((a, b) => {
      const orderA = getOrderValue(a);
      const orderB = getOrderValue(b);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "", "tr-TR");
    });

    if (onlyActive) {
      return list.filter((dept) => dept.isActive !== false);
    }

    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function createDepartment(deptData: Omit<Department, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = doc(collection(db, DEPARTMENTS_COLLECTION));
  const newId = docRef.id;

  const parsedOrder = deptData.order !== undefined && deptData.order !== null ? Number(deptData.order) : NaN;
  const dataToSave = {
    ...deptData,
    order: !isNaN(parsedOrder) ? parsedOrder : 999,
    isActive: deptData.isActive !== false,
    id: newId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, dataToSave);
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${DEPARTMENTS_COLLECTION}/${newId}`);
    return "";
  }
}

export async function updateDepartment(id: string, updates: Partial<Department>): Promise<void> {
  const path = `${DEPARTMENTS_COLLECTION}/${id}`;
  try {
    const docRef = doc(db, DEPARTMENTS_COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDepartment(id: string): Promise<void> {
  const path = `${DEPARTMENTS_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, DEPARTMENTS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==========================================
// DÖF Folders (Klasör Yönetimi - dof_folders)
// ==========================================
export const FOLDERS_COLLECTION = "dof_folders";

export async function listFolders(): Promise<DofFolder[]> {
  const path = FOLDERS_COLLECTION;
  try {
    const q = query(collection(db, FOLDERS_COLLECTION), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const list: DofFolder[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({ id: doc.id, ...data } as DofFolder);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function createFolder(folderData: Omit<DofFolder, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = doc(collection(db, FOLDERS_COLLECTION));
  const newId = docRef.id;

  const dataToSave = {
    ...folderData,
    id: newId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, dataToSave);
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FOLDERS_COLLECTION}/${newId}`);
    return "";
  }
}

export async function updateFolder(id: string, updates: Partial<DofFolder>): Promise<void> {
  const path = `${FOLDERS_COLLECTION}/${id}`;
  try {
    const docRef = doc(db, FOLDERS_COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFolder(id: string): Promise<void> {
  const path = `${FOLDERS_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, FOLDERS_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function moveDofsToFolder(dofIds: string[], folderId: string, folderName: string): Promise<void> {
  for (const id of dofIds) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, {
        folderId: folderId || "",
        folderName: folderName || "",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(`Error moving dof ${id} to folder:`, err);
    }
  }
}

export async function removeDofsFromFolder(dofIds: string[]): Promise<void> {
  for (const id of dofIds) {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, {
        folderId: "",
        folderName: "",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(`Error removing dof ${id} from folder:`, err);
    }
  }
}

export interface BulkDeleteSelection {
  dofs?: boolean;
  users?: boolean;
  departments?: boolean;
  folders?: boolean;
  emailLogs?: boolean;
  passwordRequests?: boolean;
  accessRoles?: boolean;
}

export interface BulkDeleteResult {
  deletedCounts: {
    dofs: number;
    users: number;
    departments: number;
    folders: number;
    emailLogs: number;
    passwordRequests: number;
    accessRolesReset: boolean;
  };
  totalDeleted: number;
}

async function deleteCollectionDocuments(
  collectionName: string,
  shouldDelete?: (data: Record<string, any>, docId: string) => boolean
): Promise<number> {
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const refsToDelete = snapshot.docs
      .filter((d) => (shouldDelete ? shouldDelete(d.data(), d.id) : true))
      .map((d) => d.ref);

    if (refsToDelete.length === 0) return 0;

    // Firestore writeBatch limit is 500 operations per batch
    const chunkSize = 450;
    for (let i = 0; i < refsToDelete.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = refsToDelete.slice(i, i + chunkSize);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return refsToDelete.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, collectionName);
    return 0;
  }
}

export async function bulkDeleteSystemData(
  selection: BulkDeleteSelection,
  currentAdminEmail?: string
): Promise<BulkDeleteResult> {
  const deletedCounts = {
    dofs: 0,
    users: 0,
    departments: 0,
    folders: 0,
    emailLogs: 0,
    passwordRequests: 0,
    accessRolesReset: false,
  };

  if (selection.dofs) {
    deletedCounts.dofs = await deleteCollectionDocuments(COLLECTION_NAME);
  }

  if (selection.users) {
    const normalizedCurrent = (currentAdminEmail || "").toLowerCase().trim();
    deletedCounts.users = await deleteCollectionDocuments(
      PANEL_USERS_COLLECTION,
      (data) => {
        const role = String(data?.role || "").toLowerCase().trim();
        const email = String(data?.email || "").toLowerCase().trim();
        // Admin kullanıcıları ve süper yönetici hesabını kesinlikle koru
        if (role === "admin" || role === "yönetici" || role === "yonetici") {
          return false;
        }
        if (email === "gokhan.eroglu@gmail.com") {
          return false;
        }
        if (normalizedCurrent && email === normalizedCurrent) {
          return false;
        }
        return true;
      }
    );
  }

  if (selection.departments) {
    deletedCounts.departments = await deleteCollectionDocuments(DEPARTMENTS_COLLECTION);
  }

  if (selection.folders) {
    deletedCounts.folders = await deleteCollectionDocuments(FOLDERS_COLLECTION);
    // DÖF kayıtları silinmediyse kalan DÖF'lerdeki silinen klasör referanslarını temizle
    if (!selection.dofs) {
      try {
        const dofsSnap = await getDocs(collection(db, COLLECTION_NAME));
        const toClear = dofsSnap.docs.filter((d) => {
          const data = d.data();
          return Boolean(data?.folderId || data?.folderName);
        });
        const chunkSize = 450;
        for (let i = 0; i < toClear.length; i += chunkSize) {
          const batch = writeBatch(db);
          toClear.slice(i, i + chunkSize).forEach((d) => {
            batch.update(d.ref, {
              folderId: "",
              folderName: "",
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.warn("Could not clear folder references from remaining DOFs:", err);
      }
    }
  }

  if (selection.emailLogs) {
    deletedCounts.emailLogs = await deleteCollectionDocuments("email_logs");
  }

  if (selection.passwordRequests) {
    deletedCounts.passwordRequests = await deleteCollectionDocuments("password_requests");
  }

  if (selection.accessRoles) {
    const { DEFAULT_ACCESS_ROLES, saveAccessRoles } = await import("./roles");
    await saveAccessRoles(
      DEFAULT_ACCESS_ROLES.map((r) => ({ ...r, permissions: { ...r.permissions } }))
    );
    deletedCounts.accessRolesReset = true;
  }

  const totalDeleted =
    deletedCounts.dofs +
    deletedCounts.users +
    deletedCounts.departments +
    deletedCounts.folders +
    deletedCounts.emailLogs +
    deletedCounts.passwordRequests;

  return { deletedCounts, totalDeleted };
}




