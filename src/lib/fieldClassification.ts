import { DofForm, DofType, FieldInspectionStatus, FieldSeverity } from "../types";

export const DEFAULT_FIELD_LOCATIONS = [
  "Üretim Hattı - A Blok",
  "Montaj & Paketleme Sahası",
  "Bakım & Torna Atölyesi",
  "Ham Madde & Lojistik Deposu",
  "Kompresör & Enerji Dairesi",
  "Kalite Kontrol Laboratuvarı",
  "Açık Saha & Sevkiyat Rampası",
  "Üretim & Ocak Hazırlık Sahası",
];

export const DEFAULT_FIELD_UNITS = ["Üretim", "İSG", "Bakım", "Kalite"];

export const FIELD_PROCEDURES = [
  "Düzeltici - 5 Neden Analizi",
  "Düzeltici - Acil Müdahale & Kök Neden",
  "Düzeltici - 8D Problem Çözme",
  "Önleyici - Risk Analizi & Önlem",
  "Önleyici - FMEA Risk Değerlendirme",
  "Önleyici - İSG Saha İyileştirme",
];

export interface FieldClassificationResult {
  type: DofType;
  recommendedUnit: string;
  procedure: string;
  reason: string;
  source: "kural" | "ai";
}

const PREVENTIVE_REGEX =
  /(risk\s*oluştur|potansiyel|gevşem|gevşek|düşebilir|kayabilir|devrilebilir|aşınmaya|yıpran|tehlike\s*arz|olası|ihtimal|önlem|korkuluk\s*eksik|ergonomi|sıkışabilir|çarpabilir|fırlayabilir|devrilme\s*riski|yangın\s*riski|eğim|eski)/i;

const CORRECTIVE_REGEX =
  /(kırılm|kırık|sızdır|sızıntı|akıt|patlam|kopm|yanmıyor|arızal|arıza|çalışmıyor|dökülm|düşmüş|bozuk|bozulm|tıkan|durmuş|hatalı|yanık|delik|çökm|hasarlı|patlak)/i;

export function classifyFieldFindingByRules(
  subject: string,
  description: string,
  proposedAction: string,
  availableUnits: string[]
): FieldClassificationResult {
  const units = availableUnits.length > 0 ? availableUnits : DEFAULT_FIELD_UNITS;
  const text = `${subject} ${description} ${proposedAction}`.toLocaleLowerCase("tr-TR");

  const isCorrectiveMatch = CORRECTIVE_REGEX.test(text);
  const isPreventiveMatch = PREVENTIVE_REGEX.test(text);

  // If preventive indicators dominate without an existing breakdown, classify as önleyici
  let type: DofType = "düzeltici";
  let reason = "Mevcut tespit edilen uygunsuzluğu gidermek için Düzeltici Faaliyet olarak sınıflandırıldı.";

  if (isPreventiveMatch && !isCorrectiveMatch) {
    type = "önleyici";
    reason = "Potansiyel risk / tehlike öngörüsü içerdiği için Önleyici Faaliyet olarak etiketlendi.";
  } else if (isPreventiveMatch && isCorrectiveMatch) {
    // Compare specific strong future/potential verbs
    if (/(risk\s*oluştur|gevşemiş|düşebilir|tehlike)/.test(text) && !/(kırılmış|sızdırıyor|arızalı|çalışmıyor)/.test(text)) {
      type = "önleyici";
      reason = "Olası arıza veya iş kazası riski tespit edildiğinden Önleyici Faaliyet olarak etiketlendi.";
    } else {
      type = "düzeltici";
      reason = "Gerçekleşmiş uygunsuzluk ifadesi içerdiğinden Düzeltici Faaliyet olarak etiketlendi.";
    }
  } else if (!isCorrectiveMatch && /(kontrol|denetim|düzen|etiket|uyarı|iyileştirme|revizyon)/.test(text)) {
    type = "önleyici";
    reason = "Süreç ve saha iyileştirme önlemi niteliği taşıdığı için Önleyici Faaliyet olarak etiketlendi.";
  }

  // Unit suggestion by domain keywords
  const matchUnit = (keywords: string[]): string | undefined => {
    for (const unit of units) {
      const normUnit = unit.toLocaleLowerCase("tr-TR");
      if (keywords.some((kw) => normUnit.includes(kw))) {
        return unit;
      }
    }
    return undefined;
  };

  let recommendedUnit = units[0] || "Üretim";
  if (/(baretsiz|isg|güvenlik|korkuluk|yangın|tüp|acil\s*çıkış|koruyucu|gözlük|eld[iı]ven|emniyet|düşme|elektrik\s*çarp|bariyer|ikaz|topraklama)/.test(text)) {
    recommendedUnit = matchUnit(["isg", "iş sağlığı", "güvenlik", "emniyet"]) || recommendedUnit;
  } else if (/(yağ|hidrolik|vana|boru|motor|kayış|rulman|konveyör|piston|kompresör|bakım|arıza|gevşe|lamba|aydınlatma|sızdır|kırılm|kablo|pano|pompa)/.test(text)) {
    recommendedUnit = matchUnit(["bakım", "onarım", "teknik", "elektrik", "makine"]) || recommendedUnit;
  } else if (/(kalite|ölçüm|kalibrasyon|numune|hata|etiket|izlenebilirlik|standart|prosedür|belge|rapor|sevkiyat|uygunsuz\s*ürün|tolerans)/.test(text)) {
    recommendedUnit = matchUnit(["kalite", "güvence", "kontrol", "lab"]) || recommendedUnit;
  } else if (/(üretim|hat|makine|pres|tezgah|paket|palet|stok|depo|forklift|tim|ocak)/.test(text)) {
    recommendedUnit = matchUnit(["üretim", "tim", "imalat", "operasyon", "depo"]) || recommendedUnit;
  }

  const procedure =
    type === "önleyici"
      ? /(isg|güvenlik|bariyer|korkuluk|yangın)/.test(text)
        ? "Önleyici - Risk Analizi & Önlem"
        : "Önleyici - FMEA Risk Değerlendirme"
      : /(kırılm|sızdır|patlam|acil|kritik|yangın)/.test(text)
      ? "Düzeltici - Acil Müdahale & Kök Neden"
      : "Düzeltici - 5 Neden Analizi";

  return {
    type,
    recommendedUnit,
    procedure,
    reason,
    source: "kural",
  };
}

export async function requestAiFieldClassification(params: {
  subject: string;
  description: string;
  proposedAction?: string;
  location?: string;
  availableUnits: string[];
}): Promise<FieldClassificationResult | null> {
  try {
    const res = await fetch("/api/classify-field-finding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.fallback || !data?.dofType) return null;
    return {
      type: data.dofType === "önleyici" ? "önleyici" : "düzeltici",
      recommendedUnit: data.recommendedUnit || params.availableUnits[0] || "Üretim",
      procedure:
        data.procedure ||
        (data.dofType === "önleyici" ? "Önleyici - Risk Analizi & Önlem" : "Düzeltici - 5 Neden Analizi"),
      reason: data.reason || "Yapay zeka analizi ile sınıflandırıldı.",
      source: "ai",
    };
  } catch {
    return null;
  }
}

export function toDateMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  if (typeof val?.toMillis === "function") return val.toMillis();
  if (val?.seconds) return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string") {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function formatDateTr(val: any, includeTime = false): string {
  const ms = toDateMillis(val);
  if (!ms) return "-";
  const d = new Date(ms);
  if (includeTime) {
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function toInputDateString(val: any): string {
  const ms = toDateMillis(val);
  if (!ms) return "";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveSeverity(dof: DofForm): FieldSeverity {
  if (dof.severity && ["Düşük", "Orta", "Yüksek", "Kritik"].includes(dof.severity)) {
    return dof.severity;
  }
  if (dof.riskLevel === "Yüksek") return "Yüksek";
  if (dof.riskLevel === "Düşük") return "Düşük";
  return "Orta";
}

export function resolveInspectionStatus(dof: DofForm): FieldInspectionStatus {
  if (dof.status === "cozuldu") return "Kapandı";

  const targetMs = toDateMillis(dof.targetCompletionDate);
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (dof.inspectionStatus) {
    if (dof.inspectionStatus === "Kapandı") return "Kapandı";
    if (targetMs > 0 && targetMs < todayStart.getTime()) {
      return "Gecikmiş";
    }
    return dof.inspectionStatus;
  }

  if (targetMs > 0 && targetMs < todayStart.getTime()) {
    return "Gecikmiş";
  }
  if (dof.status === "inceleniyor") {
    if (dof.referralStatus === "yapildi") return "Doğrulama Bekliyor";
    return "İşlemde";
  }
  if (dof.referralStatus === "yapildi") return "Doğrulama Bekliyor";
  if (dof.referralStatus === "islem_devam_ediyor") return "İşlemde";

  void now;
  return "Açık";
}

export function computeElapsedDays(dof: DofForm): number {
  const startMs = toDateMillis(dof.createdAt);
  if (!startMs) return 0;

  const insStatus = resolveInspectionStatus(dof);
  const endMs =
    insStatus === "Kapandı"
      ? toDateMillis(dof.closedAt) || toDateMillis(dof.updatedAt) || Date.now()
      : Date.now();

  const diffDays = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function isFieldInspectorDof(dof?: Partial<DofForm> | null): boolean {
  if (!dof) return false;
  return (
    dof.isFieldInspector === true ||
    dof.dofSource === "Saha Tesbiti" ||
    Boolean(dof.location && dof.location.trim().length > 0)
  );
}

export function severityToRiskLevel(severity: FieldSeverity): "Düşük" | "Orta" | "Yüksek" {
  if (severity === "Kritik" || severity === "Yüksek") return "Yüksek";
  if (severity === "Düşük") return "Düşük";
  return "Orta";
}

export function mapInspectionStatusToDofStatus(status: FieldInspectionStatus): DofForm["status"] {
  if (status === "Kapandı") return "cozuldu";
  if (status === "İşlemde" || status === "Doğrulama Bekliyor") return "inceleniyor";
  return "yeni";
}

// Realistic initial sample audit items for immediate visualization & testing
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysFromNowDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export const SAMPLE_FIELD_AUDIT_DOFS: (DofForm & { isSample?: boolean })[] = [
  {
    id: "sample-field-1",
    refNo: "SAHA-26-1041",
    type: "düzeltici",
    title: "2 No'lu Hidrolik Pres Yağ Sızıntısı",
    description:
      "Pres alt manifold bağlantı rekorundan zemine hidrolik yağ sızdırıyor. Kayma riski ve yağ basıncı düşüşü mevcut.",
    location: "Üretim Hattı - A Blok",
    severity: "Kritik",
    riskLevel: "Yüksek",
    department: "Bakım",
    reporterName: "Ahmet Yılmaz",
    reporterContact: "ahmet.yilmaz@kurum.local",
    createdAt: daysAgoIso(12),
    updatedAt: daysAgoIso(2),
    targetCompletionDate: daysAgoIso(3).split("T")[0],
    procedure: "Düzeltici - Acil Müdahale & Kök Neden",
    status: "inceleniyor",
    inspectionStatus: "Gecikmiş",
    adminFeedback: "Conta siparişi verildi, hat duruşunda değişim bekleniyor.",
    proposedAction: "Yüksek basınç contası yenilenmeli ve yağ tavası yerleştirilmeli.",
    isSample: true,
  },
  {
    id: "sample-field-2",
    refNo: "SAHA-26-1042",
    type: "önleyici",
    title: "Asma Kat Korkuluk Bağlantı Civataları Gevşemiş",
    description:
      "Bakım platformu korkuluk ayaklarında 3 adet ankraj civatası gevşemiş, yük altında devrilme riski oluşturuyor.",
    location: "Bakım & Torna Atölyesi",
    severity: "Yüksek",
    riskLevel: "Yüksek",
    department: "İSG",
    reporterName: "Mehmet Kaya",
    reporterContact: "mehmet.kaya@kurum.local",
    createdAt: daysAgoIso(5),
    updatedAt: daysAgoIso(1),
    targetCompletionDate: daysFromNowDate(2),
    procedure: "Önleyici - Risk Analizi & Önlem",
    status: "inceleniyor",
    inspectionStatus: "İşlemde",
    adminFeedback: "Alan geçici emniyet şeridi ile kapatıldı; tork kontrolü planlandı.",
    proposedAction: "Tüm korkuluk civataları fiber somunlu olarak sıkılmalı ve işaretlenmeli.",
    isSample: true,
  },
  {
    id: "sample-field-3",
    refNo: "SAHA-26-1043",
    type: "düzeltici",
    title: "Paketleme İstasyonu Kumpas Kalibrasyon Etiketi Eksik",
    description:
      "Son kontrol masasında kullanılan dijital kumpasın kalibrasyon tarihi geçmiş, doğrulama etiketi sökülmüş.",
    location: "Montaj & Paketleme Sahası",
    severity: "Orta",
    riskLevel: "Orta",
    department: "Kalite",
    reporterName: "Zeynep Demir",
    reporterContact: "zeynep.demir@kurum.local",
    createdAt: daysAgoIso(7),
    updatedAt: daysAgoIso(1),
    targetCompletionDate: daysFromNowDate(4),
    procedure: "Düzeltici - 5 Neden Analizi",
    status: "inceleniyor",
    inspectionStatus: "Doğrulama Bekliyor",
    adminFeedback: "Kalibrasyon laboratuvarına gönderildi, güncel sertifika doğrulama bekliyor.",
    proposedAction: "Yedek kalibreli kumpas devreye alınmalı.",
    isSample: true,
  },
  {
    id: "sample-field-4",
    refNo: "SAHA-26-1044",
    type: "önleyici",
    title: "Forklift Yaya Geçidi Uyarı Çizgileri Aşınmış",
    description:
      "Sevkiyat rampası girişindeki sarı yaya yolu çizgileri silinmeye başlamış, araç-yaya çarpışma riski artıyor.",
    location: "Açık Saha & Sevkiyat Rampası",
    severity: "Orta",
    riskLevel: "Orta",
    department: "Üretim",
    reporterName: "Murat Şahin",
    reporterContact: "murat.sahin@kurum.local",
    createdAt: daysAgoIso(2),
    updatedAt: daysAgoIso(2),
    targetCompletionDate: daysFromNowDate(6),
    procedure: "Önleyici - İSG Saha İyileştirme",
    status: "yeni",
    inspectionStatus: "Açık",
    adminFeedback: "Hafta sonu epoksi boyama planına dahil edilecek.",
    proposedAction: "Reflektif zemin boyası ile yeniden çizilmeli.",
    isSample: true,
  },
  {
    id: "sample-field-5",
    refNo: "SAHA-26-1038",
    type: "düzeltici",
    title: "Acil Çıkış Armatürü Bataryası Arızalı",
    description:
      "B Holü doğu kapısı acil durum yönlendirme armatürü test butonunda yanmıyor.",
    location: "Ham Madde & Lojistik Deposu",
    severity: "Düşük",
    riskLevel: "Düşük",
    department: "Bakım",
    reporterName: "Ayşe Çelik",
    reporterContact: "ayse.celik@kurum.local",
    createdAt: daysAgoIso(14),
    updatedAt: daysAgoIso(6),
    closedAt: daysAgoIso(6).split("T")[0],
    targetCompletionDate: daysAgoIso(5).split("T")[0],
    procedure: "Düzeltici - 5 Neden Analizi",
    status: "cozuldu",
    inspectionStatus: "Kapandı",
    adminFeedback: "LED acil çıkış armatürü yenisiyle değiştirildi ve test edildi.",
    proposedAction: "Bataryalı LED armatür değişimi.",
    isSample: true,
  },
];
