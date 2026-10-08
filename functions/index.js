const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const db = admin.firestore();

/**
 * Yardımcı Fonksiyon: Türkçe Karakterleri İngilizceye Çevirme (E-posta adresi için)
 */
function slugifyDepartment(dept) {
  if (!dept) return "kalite";
  const map = {
    "ç": "c", "Ç": "C",
    "ğ": "g", "Ğ": "G",
    "ı": "i", "I": "I",
    "İ": "i",
    "ö": "o", "Ö": "O",
    "ş": "s", "Ş": "S",
    "ü": "u", "Ü": "U",
    " ": ""
  };
  let slug = dept.toLowerCase();
  for (let key in map) {
    slug = slug.replace(new RegExp(key, "g"), map[key]);
  }
  return slug;
}

/**
 * 1. Yeni DÖF Kaydedildiğinde İlgili Birime E-posta Bildirimi Gönderme
 */
exports.onDofCreated = functions.firestore
  .document("dofs/{dofId}")
  .onCreate(async (snapshot, context) => {
    const dofData = snapshot.data();
    if (!dofData) return null;

    const { refNo, title, type, department, reporterName, description, proposedAction } = dofData;
    const deptSlug = slugifyDepartment(department);
    const departmentEmail = `${deptSlug}@sirket.com`;

    console.log(`[Yeni DÖF Tetiklendi] Ref: ${refNo}, Birim: ${department}, E-posta: ${departmentEmail}`);

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0; font-size: 20px;">🚨 Yeni DÖF Bildirimi Alındı</h2>
          <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Sistem tarafından otomatik olarak oluşturulmuştur.</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; color: #475569; width: 150px; font-size: 13px;">DÖF Referans No:</td>
            <td style="padding: 10px; color: #1e293b; font-weight: bold; font-family: monospace; font-size: 14px; color: #4f46e5;">${refNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">Faaliyet Türü:</td>
            <td style="padding: 10px; color: #1e293b; text-transform: capitalize; font-size: 13px;">${type} Faaliyet</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">İlgili Birim / Bölüm:</td>
            <td style="padding: 10px; color: #1e293b; font-weight: bold; font-size: 13px;">${department}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">Bildiren Personel:</td>
            <td style="padding: 10px; color: #1e293b; font-size: 13px;">${reporterName}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">Konu Başlığı:</td>
            <td style="padding: 10px; color: #1e293b; font-weight: bold; font-size: 13px;">${title}</td>
          </tr>
        </table>

        <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
          <h4 style="color: #991b1b; margin: 0 0 8px 0; font-size: 13px; font-weight: bold;">Uygunsuzluk / Durum Açıklaması</h4>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-line;">${description}</p>
        </div>

        ${proposedAction ? `
        <div style="background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h4 style="color: #1e40af; margin: 0 0 8px 0; font-size: 13px; font-weight: bold;">Önerilen Düzeltici Faaliyet</h4>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-line;">${proposedAction}</p>
        </div>
        ` : ""}

        <div style="background-color: #fafafa; border-radius: 8px; padding: 12px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
          Bu bildirim için aksiyon planı hazırlamak, durumunu incelemek veya onaylamak için Kalite Yönetim Temsilcisi yönetim paneline giriş yapınız.
        </div>
      </div>
    `;

    // 1. Yol: Resmi Firebase "Trigger Email" uzantısı (Extension) ile entegrasyon (Daha sürdürülebilir, güvenli ve performanslı yol)
    try {
      await db.collection("email_logs").add({
        to: departmentEmail,
        refNo: refNo,
        type: "yeni_dof",
        subject: `🚨 [YENİ DÖF] ${refNo} - ${title}`,
        html: htmlContent,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "queued"
      });
      console.log(`[Yeni DÖF Bildirim Günlüğü Oluşturuldu] Alıcı: ${departmentEmail}`);
    } catch (err) {
      console.error("Email log error:", err);
    }

    return null;
  });

/**
 * 2. DÖF Kaydı Güncellendiğinde (Durum Değişimi veya İnceleme Bildirimi) E-posta Gönderme
 */
exports.onDofUpdated = functions.firestore
  .document("dofs/{dofId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!beforeData || !afterData) return null;

    // Sadece durum veya geribildirim değiştiyse tetiklensin
    const statusChanged = beforeData.status !== afterData.status;
    const feedbackChanged = beforeData.adminFeedback !== afterData.adminFeedback;

    if (!statusChanged && !feedbackChanged) return null;

    const { refNo, title, department, reporterName, reporterContact, status, adminFeedback } = afterData;

    console.log(`[DÖF Güncellendi] Ref: ${refNo}, Eski Durum: ${beforeData.status}, Yeni Durum: ${status}`);

    const statusTranslations = {
      "yeni": "Yeni Bildirim",
      "inceleniyor": "İnceleme Aşamasında",
      "cozuldu": "Tamamlandı / Çözüldü",
      "reddedildi": "Reddedildi"
    };

    const statusColors = {
      "yeni": "#3b82f6",
      "inceleniyor": "#f59e0b",
      "cozuldu": "#10b981",
      "reddedildi": "#ef4444"
    };

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid ${statusColors[status] || "#6366f1"}; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #1e293b; margin: 0; font-size: 20px;">🔄 DÖF Durumu Güncellendi</h2>
          <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">DÖF takip sistemimiz tarafından otomatik güncellenmiştir.</p>
        </div>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Sayın <strong>${reporterName}</strong>, bildirmiş olduğunuz uygunsuzluk kaydı güncellenmiştir.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; color: #475569; width: 150px; font-size: 13px;">DÖF Referans No:</td>
            <td style="padding: 10px; color: #1e293b; font-weight: bold; font-family: monospace; font-size: 14px; color: #4f46e5;">${refNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">Konu Başlığı:</td>
            <td style="padding: 10px; color: #1e293b; font-weight: bold; font-size: 13px;">${title}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; color: #475569; font-size: 13px;">Yeni Durum:</td>
            <td style="padding: 10px; font-size: 13px;">
              <span style="display: inline-block; background-color: ${statusColors[status] || "#cbd5e1"}15; color: ${statusColors[status] || "#64748b"}; border: 1px solid ${statusColors[status] || "#cbd5e1"}; font-weight: bold; padding: 4px 10px; border-radius: 20px; font-size: 11px; text-transform: uppercase;">
                ${statusTranslations[status] || status}
              </span>
            </td>
          </tr>
        </table>

        ${adminFeedback ? `
        <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
          <h4 style="color: #1e293b; margin: 0 0 6px 0; font-size: 13px; font-weight: bold;">Yönetici / İnceleme Geri Bildirimi</h4>
          <p style="color: #475569; margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-line;">${adminFeedback}</p>
        </div>
        ` : ""}

        <div style="background-color: #fafafa; border-radius: 8px; padding: 12px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
          DÖF kaydınızın son durumunu canlı takip etmek için sisteme giriş yapıp <strong>${refNo}</strong> referans numarası ile arama yapabilirsiniz.
        </div>
      </div>
    `;

    // 1. Yol: E-posta kuyruğu oluşturma
    try {
      const emailTargets = [];
      
      // Bildiren kişiye e-posta gönder (İletişim bilgisi e-posta formatındaysa)
      if (reporterContact && reporterContact.includes("@")) {
        emailTargets.push(reporterContact.trim());
      }
      
      // İlgili departman e-postasını da cc eklemek veya bilgilendirmek için listeye ekleyelim
      const deptSlug = slugifyDepartment(department);
      emailTargets.push(`${deptSlug}@sirket.com`);

      for (const targetEmail of emailTargets) {
        await db.collection("email_logs").add({
          to: targetEmail,
          refNo: refNo,
          type: "durum_guncelleme",
          subject: `🔄 [DÖF DURUM GÜNCELLEME] ${refNo} - Yeni Durum: ${statusTranslations[status] || status}`,
          html: htmlContent,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "queued"
        });
        console.log(`[DÖF Durum Değişim Günlüğü Oluşturuldu] Alıcı: ${targetEmail}`);
      }
    } catch (err) {
      console.error("Email update logging error:", err);
    }

    return null;
  });
