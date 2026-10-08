import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" })); // Support large JSON payloads (e.g. for photo uploads)

// Load Firebase configuration
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
try {
  if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  }
} catch (e) {
  console.warn("Could not load firebase-applet-config.json:", e);
}

let firebaseApp: any = null;
let db: any = null;
try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
} catch (e) {
  console.warn("Firebase initialization failed:", e);
}

function slugifyDepartment(dept: string): string {
  if (!dept) return "kalite";
  const map: Record<string, string> = {
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

function setupNotificationListener() {
  if (!db) {
    console.warn("[DÖF Notification Trigger] Firestore DB is not initialized. Listener skipped.");
    return;
  }
  console.log("Initializing server-side DÖF Notification Trigger Listener...");
  let isInitialLoad = true;

  onSnapshot(collection(db, "dofs"), (snapshot) => {
    if (isInitialLoad) {
      isInitialLoad = false;
      console.log(`[DÖF Notification Trigger] Initial loading complete. Monitoring ${snapshot.size} records.`);
      return;
    }

    snapshot.docChanges().forEach(async (change) => {
      const dofData = change.doc.data();

      if (change.type === "added") {
        const { refNo, title, type, department, reporterName, description, proposedAction } = dofData;
        const deptSlug = slugifyDepartment(department);
        const departmentEmail = `${deptSlug}@sirket.com`;

        console.log(`\n=============================================================`);
        console.log(`[TRIGGER: NEW DÖF SUBMITTED] Ref: ${refNo}`);
        console.log(`Birim: ${department} -> Alıcı: ${departmentEmail}`);
        console.log(`Konu: ${title}`);
        console.log(`-------------------------------------------------------------`);
        console.log(`Açıklama: ${description}`);
        console.log(`=============================================================\n`);

        const htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f1f5f9; border-radius: 12px; background-color: #ffffff;">
            <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="color: #1e293b; margin: 0; font-size: 20px;">🚨 Yeni DÖF Bildirimi Alındı</h2>
              <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Sistem tarafından otomatik olarak oluşturulmuştur (Simülatör).</p>
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
              Sisteminizde otomatik mail bildirim uzantısı kuruludur. E-posta başarılı bir şekilde kuyruğa eklenmiştir.
            </div>
          </div>
        `;

        try {
          await addDoc(collection(db, "email_logs"), {
            to: departmentEmail,
            refNo,
            type: "yeni_dof",
            subject: `🚨 [YENİ DÖF] ${refNo} - ${title}`,
            html: htmlContent,
            sentAt: serverTimestamp(),
            status: "sent"
          });
          console.log(`[DÖF Notification Logged in Firestore] for ${departmentEmail}`);
        } catch (e) {
          console.error("Failed to log notification in Firestore:", e);
        }

      } else if (change.type === "modified") {
        const { refNo, title, department, reporterName, reporterContact, status, adminFeedback } = dofData;

        console.log(`\n=============================================================`);
        console.log(`[TRIGGER: DÖF UPDATED] Ref: ${refNo}`);
        console.log(`Yeni Durum: ${status}`);
        console.log(`Geri Bildirim: ${adminFeedback || "Girilmedi"}`);
        console.log(`=============================================================\n`);

        const statusTranslations: Record<string, string> = {
          "yeni": "Yeni Bildirim",
          "inceleniyor": "İnceleme Aşamasında",
          "cozuldu": "Tamamlandı / Çözüldü",
          "reddedildi": "Reddedildi"
        };

        const statusColors: Record<string, string> = {
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

        try {
          const emailTargets: string[] = [];
          if (reporterContact && reporterContact.includes("@")) {
            emailTargets.push(reporterContact.trim());
          }
          const deptSlug = slugifyDepartment(department);
          emailTargets.push(`${deptSlug}@sirket.com`);

          for (const targetEmail of emailTargets) {
            await addDoc(collection(db, "email_logs"), {
              to: targetEmail,
              refNo,
              type: "durum_guncelleme",
              subject: `🔄 [DÖF DURUM GÜNCELLEME] ${refNo} - Yeni Durum: ${statusTranslations[status] || status}`,
              html: htmlContent,
              sentAt: serverTimestamp(),
              status: "sent"
            });
            console.log(`[DÖF Update Logged in Firestore] for ${targetEmail}`);
          }
        } catch (e) {
          console.error("Failed to log update notification in Firestore:", e);
        }
      }
    });
  });
}

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not defined. AI features will be unavailable.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API endpoint to analyze DOF form using Gemini AI
app.post("/api/analyze-dof", async (req, res) => {
  const { title, type, department, description, proposedAction } = req.body;

  if (!title || !type || !description) {
    return res.status(400).json({ error: "Eksik bilgi: Başlık, tip ve açıklama zorunludur." });
  }

  try {
    const ai = getGeminiClient();
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Gemini API key is not configured on the server.");
    }

    const prompt = `
Aşağıda bir kullanıcının bildirdiği Düzeltici Önleyici Faaliyet (DOF) formuna ait detaylar yer almaktadır.
Lütfen bu uygunsuzluk durumunu profesyonel bir Kalite Yönetim Temsilcisi (QMR) olarak analiz et.

[DOF Detayları]
- Konu / Başlık: ${title}
- Faaliyet Türü: ${type}
- İlgili Bölüm: ${department || "Belirtilmemiş"}
- Durum / Uygunsuzluk Açıklaması: ${description}
- Önerilen Çözüm / Faaliyet: ${proposedAction || "Belirtilmemiş"}

Senden beklenenler:
1. Risk Seviyesi Analizi: Bu durumun kurum/süreç için oluşturduğu risk seviyesini (Düşük, Orta, Yüksek) belirle ve kısaca nedenini açıkla.
2. Faaliyet Planı Değerlendirmesi: Kullanıcının önerdiği faaliyeti değerlendir. Varsa eksikleri tamamlayan, ISO 9001 standartlarına uygun, somut ve takip edilebilir 3 adımlı bir "Aksiyon/Düzeltme Planı" öner.
3. Geri Bildirim Yanıt Taslağı: Formu bildiren kişiye hitaben yazılmış; teşekkür eden, konunun incelendiğini belirten ve sonraki adımları açıklayan nazik, profesyonel bir Türkçe e-posta/mesaj taslağı oluştur.

Lütfen yanıtı kesinlikle geçerli bir JSON formatında döndür. JSON yapısı tam olarak şu şekilde olmalıdır ve başka hiçbir metin veya markdown sarmalayıcısı (\`\`\`json vs.) içermemelidir:
{
  "riskLevel": "Düşük" | "Orta" | "Yüksek",
  "riskReason": "Risk seviyesinin gerekçesi...",
  "actionSuggestions": [
    "Aksiyon 1...",
    "Aksiyon 2...",
    "Aksiyon 3..."
  ],
  "feedbackDraft": "Merhaba Sayın [İsim]..."
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    // Try parsing the JSON safely
    const analysisResult = JSON.parse(responseText);
    res.json(analysisResult);

  } catch (error: any) {
    console.error("Gemini analysis error:", error);
    res.status(500).json({
      error: "AI Analizi sırasında bir hata oluştu.",
      details: error.message || error,
      fallback: {
        riskLevel: "Orta",
        riskReason: "Yapay zeka analizi şu anda kullanılamıyor. Lütfen formu manuel değerlendiriniz.",
        actionSuggestions: [
          "Uygunsuzluğun kök nedenini araştırın.",
          "Geçici bir düzeltici faaliyet uygulayın.",
          "Faaliyetin etkinliğini 30 gün sonra kontrol edin."
        ],
        feedbackDraft: "Bildiriminiz için teşekkür ederiz. Kalite yönetim ekibimiz konuyu en kısa sürede inceleyecektir."
      }
    });
  }
});

// Configure Vite middleware or static files depending on environment
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite dev server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production build...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    setupNotificationListener();
  });
}

setupViteOrStatic().catch((err) => {
  console.error("Failed to start server:", err);
});
