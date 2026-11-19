export type DofStatus = "yeni" | "inceleniyor" | "cozuldu" | "reddedildi";
export type DofType = "düzeltici" | "önleyici";

export interface DofComment {
  id: string;
  userName: string;
  userRole: string;
  text: string;
  createdAt: string;
}

export type FieldSeverity = "Düşük" | "Orta" | "Yüksek" | "Kritik";
export type FieldInspectionStatus =
  | "Açık"
  | "İşlemde"
  | "Doğrulama Bekliyor"
  | "Gecikmiş"
  | "Kapandı";

export interface FieldCartItem {
  localId: string;
  location: string;
  subject: string;
  description: string;
  proposedAction?: string;
  severity: FieldSeverity;
  type: DofType;
  targetUnit: string;
  procedure: string;
  imageUrl?: string;
  classificationSource: "kural" | "ai" | "manuel";
  classificationReason?: string;
  isAiRefining?: boolean;
  createdAtIso: string;
}

export interface DofForm {
  id?: string;
  refNo: string;
  type: DofType;
  title: string;
  department: string;
  user_department?: string;
  location?: string; // Saha / Lokasyon bilgisi
  severity?: FieldSeverity; // Önem / Aciliyet Derecesi
  procedure?: string; // DÖF İçin İzlenen Prosedür
  inspectionStatus?: FieldInspectionStatus; // Saha Denetim Durumu
  closedAt?: string; // Kapanma Tarihi (ISO / YYYY-MM-DD)
  dofSource?: string; // DÖF Kaynağı (ör: "Saha Tesbiti", "Müşteri Şikayeti / Bildirim")
  isFieldInspector?: boolean; // Saha Görevlisi tarafından oluşturulduysa KVKK maskelemesinden muaf
  reporterName: string;
  reporterContact: string; // Email or Phone number
  description: string;
  proposedAction?: string;
  imageUrl?: string; // base64 or URL
  beforeImageUrl?: string; // Faaliyet Öncesi Fotoğraf (Önce)
  afterImageUrl?: string; // Faaliyet Sonrası Fotoğraf (Sonra)
  status: DofStatus;
  adminFeedback?: string;
  createdAt: any; // Firestore Timestamp or ISO string
  updatedAt: any; // Firestore Timestamp or ISO string
  // Referral tracking fields (Havale alanları)
  assignedUnit?: string; // Doğrudan havale edilen birim adı
  assignedUserId?: string;
  assignedUserIds?: string[]; // Birimde yetkili birden fazla sorumlu ID'leri
  assignedUserName?: string;
  assignedUserEmail?: string;
  assignedUserEmails?: string[]; // Birimde yetkili birden fazla sorumlu e-postaları
  referralStatus?: "beklemede" | "islem_devam_ediyor" | "yapildi" | "iptal";
  referralNote?: string;
  referralResultNote?: string;
  referralUpdatedAt?: any;
  riskLevel?: "Düşük" | "Orta" | "Yüksek";
  targetCompletionDate?: string;
  completionDays?: number;
  currentStep?: number;
  rootCauses?: string[]; // 5 Kök Neden Analizi (5 Whys)
  comments?: DofComment[];
  folderId?: string; // Atanan klasörün ID'si
  folderName?: string; // Atanan klasörün adı
}

export interface GeminiAnalysisResult {
  riskLevel: "Düşük" | "Orta" | "Yüksek";
  riskReason: string;
  actionSuggestions: string[];
  feedbackDraft: string;
}

export type PanelUserRole = string;

export type AccessRoleBadgeColor =
  | "indigo"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "slate"
  | "purple";

export interface RolePermissions {
  canViewDashboard: boolean;
  canViewDofs: boolean;
  dofScope: "all" | "unit";
  canCreateDof: boolean;
  canEditDof: boolean;
  canManageFolders: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
  canManageKvkkAndVersion: boolean;
  canManageSystemAdmin: boolean;
}

export interface AccessRole {
  id: string;
  name: string;
  description?: string;
  badgeColor?: AccessRoleBadgeColor;
  isSystemDefault?: boolean;
  permissions: RolePermissions;
  updatedAt?: string;
}

export interface PanelUser {
  id?: string;
  email: string;
  name: string;
  role: PanelUserRole;
  password?: string;
  department?: string;
  canSeeAllDofs?: boolean;
  canEditDof?: boolean; // Yetkili Düzenle
  isActive?: boolean;   // Kullanıcı Aktif / Pasif
  createdAt: any;
  updatedAt: any;
}

export interface Department {
  id?: string;
  name: string;
  responsibleEmail?: string;
  responsibleName?: string;
  responsibleEmails?: string[]; // Birden fazla sorumlu e-postası
  responsibleNames?: string[];  // Birden fazla sorumlu adı
  isCustomQr?: boolean;
  directReferral?: boolean;
  referralUserId?: string;
  referralUserIds?: string[];   // Birim sorumlusu olarak seçilen birden fazla yetkili ID'si
  order?: number; // Sıralama Sırası (ör: 1, 2, 3...)
  isActive?: boolean; // Aktif / Pasif durumu (varsayılan: true)
  createdAt?: any;
  updatedAt?: any;
}

export interface DofFolder {
  id?: string;
  name: string;
  description?: string;
  color?: string; // örn: "indigo" | "emerald" | "amber" | "rose" | "blue" | "purple" | "slate"
  icon?: string;
  createdAt?: any;
  updatedAt?: any;
  createdByName?: string;
  createdByEmail?: string;
}


