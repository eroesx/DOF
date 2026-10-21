import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export const DEFAULT_PREVENTIVE_DAYS = 7; // Önleyici Faaliyet: 7 İş Günü
export const DEFAULT_CORRECTIVE_DAYS = 3;  // Düzenleyici / Düzeltici Faaliyet: 3 İş Günü

export interface SystemSettings {
  preventiveActionDays: number;
  correctiveActionDays: number;
  defaultSoundSetting: "on" | "off" | "last";
  defaultTabSetting: string;
  defaultStatusFilterSetting: string;
  defaultNotificationSetting: "on" | "off";
  isPasscodeLoginPassive: boolean;
  isKvkkMaskingEnabled: boolean;
}

export function isKvkkActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("dof_admin_kvkk_masking") === "true";
}

export function maskKvkkText(
  text?: string | null,
  isKvkkEnabled = false,
  fallback = "-"
): string {
  if (isKvkkEnabled || isKvkkActive()) {
    return "*** Gizli (KVKK) ***";
  }
  return text?.trim() ? text : fallback;
}


/**
 * Başlangıç tarihine verilen iş günü (Pazartesi-Cuma) kadar ekler.
 * Cumartesi ve Pazar günleri otomatik atlanır.
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const result = new Date(startDate.getTime());
  let added = 0;
  // Negatif veya 0 durumunu koru
  if (businessDays <= 0) return result;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Pazar, 6 = Cumartesi
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return result;
}

/**
 * İki tarih arasındaki kalan iş günü sayısını hesaplar.
 */
export function getRemainingBusinessDays(targetDateStr: string | Date): {
  days: number;
  isOverdue: boolean;
  isToday: boolean;
  text: string;
} {
  const target = new Date(targetDateStr);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(target.getTime())) {
    return { days: 0, isOverdue: false, isToday: false, text: "Belirtilmemiş" };
  }

  const diffTime = target.getTime() - today.getTime();
  const diffCalendarDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffCalendarDays === 0) {
    return { days: 0, isOverdue: false, isToday: true, text: "Bugün Son Gün!" };
  }

  if (diffCalendarDays < 0) {
    // Gecikmiş iş günlerini hesapla
    let count = 0;
    const cur = new Date(target.getTime());
    while (cur < today) {
      cur.setDate(cur.getDate() + 1);
      const day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return {
      days: -count,
      isOverdue: true,
      isToday: false,
      text: `Gecikmiş (${count} İş Günü)`,
    };
  }

  // Kalan iş günlerini hesapla
  let count = 0;
  const cur = new Date(today.getTime());
  while (cur < target) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }

  return {
    days: count,
    isOverdue: false,
    isToday: false,
    text: `${count} İş Günü Kaldı`,
  };
}

/**
 * DÖF oluşturulduğu tarihten itibaren türüne göre hedef tamamlama tarihini hesaplar (YYYY-MM-DD).
 */
export function computeTargetCompletionDate(
  createdAtInput: any,
  type: "düzeltici" | "önleyici",
  overrideDays?: number
): string {
  let createdDate = new Date();
  if (createdAtInput) {
    try {
      if (typeof createdAtInput.toDate === "function") {
        createdDate = createdAtInput.toDate();
      } else if (createdAtInput.seconds !== undefined) {
        createdDate = new Date(createdAtInput.seconds * 1000);
      } else {
        const parsed = new Date(createdAtInput);
        if (!isNaN(parsed.getTime())) createdDate = parsed;
      }
    } catch {
      // default to now
    }
  }

  const settings = getStoredSettings();
  const days =
    typeof overrideDays === "number" && overrideDays > 0
      ? overrideDays
      : type === "önleyici"
      ? settings.preventiveActionDays
      : settings.correctiveActionDays;

  const targetDate = addBusinessDays(createdDate, days);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * LocalStorage'dan kayıtlı sistem ayarlarını alır.
 */
export function getStoredSettings(): SystemSettings {
  const prevDays = Number(localStorage.getItem("dof_admin_preventive_days"));
  const corrDays = Number(localStorage.getItem("dof_admin_corrective_days"));

  return {
    preventiveActionDays:
      !isNaN(prevDays) && prevDays > 0 ? prevDays : DEFAULT_PREVENTIVE_DAYS,
    correctiveActionDays:
      !isNaN(corrDays) && corrDays > 0 ? corrDays : DEFAULT_CORRECTIVE_DAYS,
    defaultSoundSetting:
      (localStorage.getItem("dof_admin_default_sound_setting") as any) || "on",
    defaultTabSetting:
      localStorage.getItem("dof_admin_default_tab_setting") || "dofs",
    defaultStatusFilterSetting: (() => {
      const saved = localStorage.getItem("dof_admin_default_status_filter_setting");
      return saved && saved !== "all" ? saved : "acik";
    })(),
    defaultNotificationSetting:
      (localStorage.getItem("dof_admin_default_notification_setting") as any) ||
      "on",
    isPasscodeLoginPassive:
      localStorage.getItem("dof_admin_passcode_login_passive") === "true",
    isKvkkMaskingEnabled:
      localStorage.getItem("dof_admin_kvkk_masking") === "true",
  };
}

/**
 * Firestore'dan sistem ayarlarını çeker ve localStorage'ı günceller.
 */
export async function syncSettingsFromFirestore(): Promise<SystemSettings> {
  try {
    const docRef = doc(db, "system_settings", "dof_config");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.preventiveActionDays === "number") {
        localStorage.setItem(
          "dof_admin_preventive_days",
          String(data.preventiveActionDays)
        );
      }
      if (typeof data.correctiveActionDays === "number") {
        localStorage.setItem(
          "dof_admin_corrective_days",
          String(data.correctiveActionDays)
        );
      }
      if (data.defaultSoundSetting) {
        localStorage.setItem(
          "dof_admin_default_sound_setting",
          data.defaultSoundSetting
        );
      }
      if (data.defaultTabSetting) {
        localStorage.setItem(
          "dof_admin_default_tab_setting",
          data.defaultTabSetting
        );
      }
      if (data.defaultStatusFilterSetting) {
        const eff = data.defaultStatusFilterSetting !== "all" ? data.defaultStatusFilterSetting : "acik";
        localStorage.setItem(
          "dof_admin_default_status_filter_setting",
          eff
        );
      }
      if (data.defaultNotificationSetting) {
        localStorage.setItem(
          "dof_admin_default_notification_setting",
          data.defaultNotificationSetting
        );
      }
      if (typeof data.isKvkkMaskingEnabled === "boolean") {
        localStorage.setItem(
          "dof_admin_kvkk_masking",
          data.isKvkkMaskingEnabled ? "true" : "false"
        );
      }
      if (typeof data.isPasscodeLoginPassive === "boolean") {
        localStorage.setItem(
          "dof_admin_passcode_login_passive",
          data.isPasscodeLoginPassive ? "true" : "false"
        );
      }
    }
  } catch (err) {
    console.warn("Could not sync settings from Firestore:", err);
  }
  return getStoredSettings();
}

/**
 * Ayarları hem localStorage'a hem de Firestore'a kaydeder.
 */
export async function saveSystemSettings(
  settings: Partial<SystemSettings>
): Promise<void> {
  // 1. LocalStorage güncelle
  if (typeof settings.preventiveActionDays === "number") {
    localStorage.setItem(
      "dof_admin_preventive_days",
      String(settings.preventiveActionDays)
    );
  }
  if (typeof settings.correctiveActionDays === "number") {
    localStorage.setItem(
      "dof_admin_corrective_days",
      String(settings.correctiveActionDays)
    );
  }
  if (settings.defaultSoundSetting) {
    localStorage.setItem(
      "dof_admin_default_sound_setting",
      settings.defaultSoundSetting
    );
  }
  if (settings.defaultTabSetting) {
    localStorage.setItem(
      "dof_admin_default_tab_setting",
      settings.defaultTabSetting
    );
  }
  if (settings.defaultStatusFilterSetting) {
    localStorage.setItem(
      "dof_admin_default_status_filter_setting",
      settings.defaultStatusFilterSetting
    );
  }
  if (settings.defaultNotificationSetting) {
    localStorage.setItem(
      "dof_admin_default_notification_setting",
      settings.defaultNotificationSetting
    );
  }
  if (typeof settings.isPasscodeLoginPassive === "boolean") {
    localStorage.setItem(
      "dof_admin_passcode_login_passive",
      settings.isPasscodeLoginPassive ? "true" : "false"
    );
  }
  if (typeof settings.isKvkkMaskingEnabled === "boolean") {
    localStorage.setItem(
      "dof_admin_kvkk_masking",
      settings.isKvkkMaskingEnabled ? "true" : "false"
    );
  }

  // 2. Firestore güncelle
  try {
    const docRef = doc(db, "system_settings", "dof_config");
    await setDoc(
      docRef,
      {
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not write settings to Firestore:", err);
  }
}
