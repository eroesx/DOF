export type DofStatus = "yeni" | "inceleniyor" | "cozuldu" | "reddedildi";
export type DofType = "düzeltici" | "önleyici";

export interface DofComment {
  id: string;
  userName: string;
  userRole: string;
  text: string;
  createdAt: string;
}

export interface DofForm {
  id?: string;
  refNo: string;
  type: DofType;
  title: string;
  department: string;
  reporterName: string;
  reporterContact: string; // Email or Phone number
  description: string;
  proposedAction?: string;
  imageUrl?: string; // base64 or URL
  status: DofStatus;
  adminFeedback?: string;
  createdAt: any; // Firestore Timestamp or ISO string
  updatedAt: any; // Firestore Timestamp or ISO string
  // Referral tracking fields (Havale alanları)
  assignedUserId?: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
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
}

export interface GeminiAnalysisResult {
  riskLevel: "Düşük" | "Orta" | "Yüksek";
  riskReason: string;
  actionSuggestions: string[];
  feedbackDraft: string;
}

export type PanelUserRole = "admin" | "editor" | "viewer";

export interface PanelUser {
  id?: string;
  email: string;
  name: string;
  role: PanelUserRole;
  password?: string;
  department?: string;
  canSeeAllDofs?: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Department {
  id?: string;
  name: string;
  responsibleEmail?: string;
  responsibleName?: string;
  isCustomQr?: boolean;
  directReferral?: boolean;
  referralUserId?: string;
  createdAt?: any;
  updatedAt?: any;
}


