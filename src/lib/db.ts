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
  serverTimestamp
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { DofForm, PanelUser, Department } from "../types";

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

export async function listDofs(): Promise<DofForm[]> {
  const path = COLLECTION_NAME;
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const list: DofForm[] = [];
    querySnapshot.forEach((doc) => {
      list.push({ id: doc.id, ...doc.data() } as DofForm);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
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

    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
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

export async function listDepartments(): Promise<Department[]> {
  const path = DEPARTMENTS_COLLECTION;
  try {
    const q = query(collection(db, DEPARTMENTS_COLLECTION), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const list: Department[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list.push({ id: doc.id, ...data } as Department);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function createDepartment(deptData: Omit<Department, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = doc(collection(db, DEPARTMENTS_COLLECTION));
  const newId = docRef.id;

  const dataToSave = {
    ...deptData,
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



