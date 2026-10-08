import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { DofForm, PanelUser } from "../types";

/**
 * Triggers an automatic simulated email notification to all administrator (admin) users
 * whenever a new DÖF is created or an existing DÖF status changes.
 * The details are logged in the 'email_logs' Firestore collection which is viewed in the system logs.
 */
export async function triggerManagerEmailNotification(
  triggerType: "create" | "status_change",
  dof: DofForm,
  details?: { oldStatus?: string; newStatus?: string }
): Promise<void> {
  try {
    // 1. Fetch all admin users
    const panelUsersRef = collection(db, "panel_users");
    const q = query(panelUsersRef, where("role", "==", "admin"));
    const snapshot = await getDocs(q);
    
    const adminEmails: string[] = [];
    snapshot.forEach((doc) => {
      const user = doc.data() as PanelUser;
      if (user.email) {
        adminEmails.push(user.email.toLowerCase().trim());
      }
    });

    // Fallback: if no admins are explicitly set up in database, use the default owner email
    if (adminEmails.length === 0) {
      adminEmails.push("gokhan.eroglu@gmail.com");
    }

    // De-duplicate emails
    const uniqueEmails = Array.from(new Set(adminEmails));

    // 2. Draft the subject and body
    let subject = "";
    let body = "";

    const statusTranslations: Record<string, string> = {
      yeni: "Yeni Bildirim",
      inceleniyor: "İncelemede",
      cozuldu: "Çözüldü / Tamamlandı",
      reddedildi: "Reddedildi / İptal",
    };

    const typeCapitalized = dof.type.toUpperCase();
    const cleanTitle = dof.title || "Başlıksız DÖF";
    const refNo = dof.refNo || "Belirtilmemiş";
    const dept = dof.department || "Genel / Belirtilmemiş";

    if (triggerType === "create") {
      subject = `[DÖF Yeni Kayıt] ${refNo} - ${cleanTitle}`;
      body = `Sistemde yeni bir DÖF (Düzeltici Önleyici Faaliyet) kaydı oluşturuldu.

Süreç Detayları:
------------------------------------------
• Referans No: ${refNo}
• Faaliyet Türü: ${typeCapitalized}
• Departman: ${dept}
• Başlık: ${cleanTitle}
• Bildiren: ${dof.reporterName || "Anonim Personel"}
• Açıklama: ${dof.description || "Açıklama belirtilmemiş."}

İncelemek ve aksiyon almak için lütfen yönetim paneline giriş yapınız.`;
    } else {
      const oldStatusLabel = statusTranslations[details?.oldStatus || ""] || details?.oldStatus || "Bilinmiyor";
      const newStatusLabel = statusTranslations[details?.newStatus || ""] || details?.newStatus || "Bilinmiyor";

      subject = `[DÖF Durum Güncellemesi] ${refNo} - Durum: ${newStatusLabel}`;
      body = `Sistemdeki ${refNo} referans nolu DÖF kaydının durumu güncellendi.

Süreç Güncelleme Detayları:
------------------------------------------
• Referans No: ${refNo}
• Departman: ${dept}
• Başlık: ${cleanTitle}
• Önceki Durum: ${oldStatusLabel}
• Yeni Durum: ${newStatusLabel}
• Güncelleme Tarihi: ${new Date().toLocaleString("tr-TR")}

Sürecin son durumunu takip etmek veya yorum yazmak için lütfen yönetim paneline giriş yapınız.`;
    }

    // 3. Store email log for each unique manager/admin
    const emailLogsRef = collection(db, "email_logs");
    for (const email of uniqueEmails) {
      await addDoc(emailLogsRef, {
        recipient: email,
        subject,
        body,
        sentAt: new Date().toISOString(),
        type: triggerType === "create" ? "dof_created_notification" : "dof_status_changed_notification",
        refNo: refNo,
      });
    }

    console.log(`Email notification triggered successfully to: ${uniqueEmails.join(", ")}`);
  } catch (error) {
    console.error("Error triggering manager email notification:", error);
  }
}
