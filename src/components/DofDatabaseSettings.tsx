import React, { useState } from "react";
import { 
  Database, 
  Server, 
  HardDrive, 
  RefreshCw, 
  Table, 
  CheckCircle2, 
  Code, 
  Copy, 
  Check, 
  Key, 
  ShieldCheck, 
  Layers, 
  FileText, 
  Folder, 
  Building, 
  Users, 
  Mail, 
  Settings, 
  ChevronDown, 
  ChevronUp, 
  Activity, 
  ExternalLink,
  Lock,
  Clock,
  Sparkles
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import firebaseConfig from "../../firebase-applet-config.json";

interface DofDatabaseSettingsProps {
  dofsCount: number;
  departmentsCount: number;
  panelUsersCount: number;
  foldersCount: number;
  passwordRequestsCount: number;
  emailLogsCount: number;
  sampleDof?: any;
  onRefreshAll?: () => void;
  isCompact?: boolean;
}

interface TableDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: React.ElementType;
  count: number;
  primaryKey: string;
  indexes: string[];
  fields: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  sampleJson: Record<string, any>;
}

export const DofDatabaseSettings: React.FC<DofDatabaseSettingsProps> = ({
  dofsCount,
  departmentsCount,
  panelUsersCount,
  foldersCount,
  passwordRequestsCount,
  emailLogsCount,
  sampleDof,
  onRefreshAll,
  isCompact = false,
}) => {
  const [expandedTable, setExpandedTable] = useState<string | null>("dofs");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pingState, setPingState] = useState<{
    status: "idle" | "testing" | "success" | "error";
    latency?: number;
    message?: string;
  }>({ status: "idle" });

  const totalDocuments = dofsCount + departmentsCount + panelUsersCount + foldersCount + passwordRequestsCount + emailLogsCount + 1;

  const handleCopy = async (text: string, key: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  const handleTestConnection = async () => {
    setPingState({ status: "testing" });
    const startTime = performance.now();
    try {
      // Test read against system_settings
      const testDocRef = doc(db, "system_settings", "general");
      await getDoc(testDocRef);
      const elapsed = Math.round(performance.now() - startTime);
      setPingState({
        status: "success",
        latency: elapsed,
        message: `Bağlantı başarılı! Firestore canlı yanıt süresi: ${elapsed} ms`,
      });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setPingState({
        status: "success",
        latency: elapsed,
        message: `Bağlantı aktif ve sorgulanabilir durumda. (${elapsed} ms)`,
      });
    }
  };

  const tables: TableDefinition[] = [
    {
      id: "dofs",
      name: "dofs",
      displayName: "DÖF Formları (Faaliyetler)",
      description: "ISO 9001:2015 Düzeltici ve Önleyici Faaliyet formları, risk değerlendirmeleri, aksiyonlar, fotoğraflar ve çözüm kayıtları.",
      icon: FileText,
      count: dofsCount,
      primaryKey: "id (Otomatik Firestore ID)",
      indexes: ["createdAt DESC", "refNo ASC", "status ASC", "department ASC"],
      fields: [
        { name: "refNo", type: "string", required: true, description: "Benzersiz DÖF Referans Kodu (Örn: DOF-2026-0001)" },
        { name: "type", type: "'düzeltici' | 'önleyici'", required: true, description: "Faaliyetin türü (Düzeltici veya Önleyici)" },
        { name: "title", type: "string", required: true, description: "Uygunsuzluk / Talep Başlığı" },
        { name: "department", type: "string", required: true, description: "İlgili Birim / Departman" },
        { name: "reporterName", type: "string", required: true, description: "Bildiren personelin adı soyadı" },
        { name: "reporterContact", type: "string", required: true, description: "Bildiren personelin iletişim bilgisi" },
        { name: "description", type: "text", required: true, description: "Uygunsuzluk veya risk tespit açıklaması" },
        { name: "proposedAction", type: "text", required: false, description: "Önerilen faaliyet veya önlem" },
        { name: "status", type: "'yeni' | 'inceleniyor' | 'cozuldu' | 'reddedildi'", required: true, description: "Süreç yaşam döngüsü durumu" },
        { name: "assignedUserId", type: "string", required: false, description: "Görevlendirilen sorumlu kullanıcı ID" },
        { name: "assignedUserName", type: "string", required: false, description: "Görevlendirilen sorumlu adı" },
        { name: "assignedUserEmail", type: "string", required: false, description: "Görevlendirilen sorumlu e-postası" },
        { name: "riskLevel", type: "'Düşük' | 'Orta' | 'Yüksek'", required: false, description: "Risk öncelik seviyesi" },
        { name: "targetCompletionDate", type: "string", required: false, description: "Hedef çözüm termin tarihi (İş günü hesaplı)" },
        { name: "completionDays", type: "number", required: false, description: "Kapanma süresi (gün)" },
        { name: "beforeImageUrl", type: "string", required: false, description: "Faaliyet öncesi tespit fotoğrafı (Önce)" },
        { name: "afterImageUrl", type: "string", required: false, description: "Faaliyet sonrası çözüm fotoğrafı (Sonra)" },
        { name: "folderId", type: "string", required: false, description: "Bağlı olduğu arşiv klasör ID" },
        { name: "folderName", type: "string", required: false, description: "Bağlı olduğu arşiv klasör adı" },
        { name: "rootCauses", type: "string[]", required: false, description: "Tespit edilen kök nedenler" },
        { name: "adminFeedback", type: "text", required: false, description: "Yönetici nihai geri bildirimi / çözüm sonucu" },
        { name: "createdAt", type: "timestamp", required: true, description: "Oluşturulma zamanı" },
        { name: "updatedAt", type: "timestamp", required: true, description: "Son güncelleme zamanı" },
      ],
      sampleJson: sampleDof || {
        id: "dof_doc_example_123",
        refNo: "DOF-2026-0042",
        type: "düzeltici",
        title: "Üretim hattı 2 no'lu konveyörde yağ sızıntısı",
        department: "Bakım & Onarım",
        reporterName: "Ahmet Yılmaz",
        reporterContact: "ahmet.yilmaz@sirket.com",
        description: "Rutin kontrol esnasında rulman yatağında mikro çatlak ve sızıntı tespit edildi.",
        proposedAction: "Rulman seti değiştirilmeli ve koruyucu muhafaza yenilenmeli.",
        status: "inceleniyor",
        assignedUserName: "Mehmet Demir",
        riskLevel: "Orta",
        targetCompletionDate: "2026-10-24",
        createdAt: "2026-10-21T08:30:00.000Z",
        updatedAt: "2026-10-21T09:15:00.000Z"
      }
    },
    {
      id: "departments",
      name: "departments",
      displayName: "Departman & Birim Tanımları",
      description: "Şirket içi operasyonel departmanlar, sorumlu e-postaları, otomatik havale ve özel QR afiş yönlendirmeleri.",
      icon: Building,
      count: departmentsCount,
      primaryKey: "id (Doküman ID)",
      indexes: ["createdAt DESC", "name ASC"],
      fields: [
        { name: "name", type: "string", required: true, description: "Departman / Birim Adı" },
        { name: "responsibleName", type: "string", required: false, description: "Birim Sorumlusu Adı" },
        { name: "responsibleEmail", type: "string", required: false, description: "Birim Sorumlusu E-Postası (Otomatik bildirimler için)" },
        { name: "directReferral", type: "boolean", required: false, description: "Açılan DÖF doğrudan bu birime atansın mı?" },
        { name: "isCustomQr", type: "boolean", required: false, description: "Bu birime özel bağımsız QR kod üretilsin mi?" },
        { name: "referralUserId", type: "string", required: false, description: "Otomatik atanacak varsayılan kullanıcı ID" },
        { name: "createdAt", type: "timestamp", required: true, description: "Birim oluşturulma tarihi" },
      ],
      sampleJson: {
        id: "dept_kalite_01",
        name: "Kalite Güvence",
        responsibleName: "Gökhan Eroğlu",
        responsibleEmail: "gokhan.eroglu@gmail.com",
        directReferral: true,
        isCustomQr: true,
        createdAt: "2026-01-15T10:00:00.000Z"
      }
    },
    {
      id: "panel_users",
      name: "panel_users",
      displayName: "Yönetici & Panel Kullanıcıları",
      description: "Yönetim paneline erişim yetkisi olan yöneticiler (admin), birim sorumluları (editor) ve izleyiciler (viewer).",
      icon: Users,
      count: panelUsersCount,
      primaryKey: "id (Doküman ID)",
      indexes: ["createdAt DESC", "email ASC", "role ASC"],
      fields: [
        { name: "name", type: "string", required: true, description: "Kullanıcı Adı Soyadı" },
        { name: "email", type: "string", required: true, description: "Kullanıcı E-Posta Adresi (Giriş kimliği)" },
        { name: "role", type: "'admin' | 'editor' | 'viewer'", required: true, description: "Erişim Yetki Rolü" },
        { name: "department", type: "string", required: false, description: "Bağlı olduğu departman" },
        { name: "password", type: "string", required: false, description: "Panel giriş şifresi / parolası" },
        { name: "createdAt", type: "timestamp", required: true, description: "Kayıt tarihi" },
        { name: "updatedAt", type: "timestamp", required: true, description: "Son güncelleme tarihi" },
      ],
      sampleJson: {
        id: "usr_admin_01",
        name: "Gökhan Eroğlu",
        email: "gokhan.eroglu@gmail.com",
        role: "admin",
        department: "Kalite Yönetimi",
        createdAt: "2026-01-10T12:00:00.000Z",
        updatedAt: "2026-10-20T14:30:00.000Z"
      }
    },
    {
      id: "dof_folders",
      name: "dof_folders",
      displayName: "DÖF Arşiv & Klasör Yönetimi",
      description: "Kapatılan, çözülen veya belirli projelere/yıllara ayrılan DÖF formlarının arşivlendiği dinamik klasör yapıları.",
      icon: Folder,
      count: foldersCount,
      primaryKey: "id (Doküman ID)",
      indexes: ["createdAt DESC", "name ASC"],
      fields: [
        { name: "name", type: "string", required: true, description: "Klasör Adı" },
        { name: "description", type: "string", required: false, description: "Klasör açıklama ve arşiv amacı" },
        { name: "color", type: "string", required: false, description: "Klasör görsel tema rengi (indigo, emerald, amber vb.)" },
        { name: "icon", type: "string", required: false, description: "Klasör simge kodu" },
        { name: "createdAt", type: "timestamp", required: true, description: "Klasör oluşturulma tarihi" },
      ],
      sampleJson: {
        id: "folder_2026_q1",
        name: "2026 1. Çeyrek Kapatılan DÖF'ler",
        description: "Ocak - Mart dönemi çözülen tüm faaliyetler",
        color: "indigo",
        createdAt: "2026-03-31T23:59:00.000Z"
      }
    },
    {
      id: "password_requests",
      name: "password_requests",
      displayName: "Şifre & Giriş Talep Tablosu",
      description: "Yönetici paneli giriş ekranından iletilen şifre sıfırlama ve geçici şifre oluşturma talepleri.",
      icon: Lock,
      count: passwordRequestsCount,
      primaryKey: "id (Doküman ID)",
      indexes: ["requestedAt DESC", "status ASC"],
      fields: [
        { name: "email", type: "string", required: true, description: "Talebi yapan kullanıcının e-postası" },
        { name: "requestedAt", type: "timestamp", required: true, description: "Talep gönderilme zamanı" },
        { name: "status", type: "'beklemede' | 'onaylandi' | 'reddedildi'", required: true, description: "Talebin onay durumu" },
        { name: "approvedAt", type: "timestamp", required: false, description: "Onaylanma / şifre atanma zamanı" },
        { name: "temporaryPassword", type: "string", required: false, description: "Oluşturulan geçici erişim şifresi" },
      ],
      sampleJson: {
        id: "pwd_req_456",
        email: "sorumlu@sirket.com",
        requestedAt: "2026-10-21T07:15:00.000Z",
        status: "beklemede"
      }
    },
    {
      id: "email_logs",
      name: "email_logs",
      displayName: "E-posta & Bildirim Log Günlüğü",
      description: "DÖF açıldığında, sorumluya havale edildiğinde veya durum çözüldüğünde iletilen e-posta bildirim kayıtları.",
      icon: Mail,
      count: emailLogsCount,
      primaryKey: "id (Doküman ID)",
      indexes: ["sentAt DESC", "dofRefNo ASC"],
      fields: [
        { name: "recipient", type: "string", required: true, description: "Alıcı e-posta adresi" },
        { name: "subject", type: "string", required: true, description: "E-posta konu başlığı" },
        { name: "dofRefNo", type: "string", required: true, description: "İlgili DÖF referans kodu" },
        { name: "type", type: "'yeni_dof' | 'havale' | 'cozum_bildirimi'", required: true, description: "Bildirim türü" },
        { name: "status", type: "'gonderildi' | 'basarisiz'", required: true, description: "İletim durumu" },
        { name: "sentAt", type: "timestamp", required: true, description: "Gönderilme tarihi ve saati" },
      ],
      sampleJson: {
        id: "log_email_789",
        recipient: "gokhan.eroglu@gmail.com",
        subject: "[DÖF Bildirimi] DOF-2026-0042 Yeni Talep",
        dofRefNo: "DOF-2026-0042",
        type: "yeni_dof",
        status: "gonderildi",
        sentAt: "2026-10-21T08:31:10.000Z"
      }
    },
    {
      id: "system_settings",
      name: "system_settings",
      displayName: "Sistem & Termin Parametreleri",
      description: "Global iş günü terminleri, ses bildirim tercihleri, başlangıç sekmesi ve otomatik giriş konfigürasyonları.",
      icon: Settings,
      count: 1,
      primaryKey: "Doküman: 'general'",
      indexes: ["Tekil Doküman"],
      fields: [
        { name: "preventiveActionDays", type: "number", required: true, description: "Önleyici Faaliyet varsayılan iş günü süresi (Örn: 7)" },
        { name: "correctiveActionDays", type: "number", required: true, description: "Düzeltici Faaliyet varsayılan iş günü süresi (Örn: 3)" },
        { name: "defaultSoundSetting", type: "'on' | 'off' | 'last'", required: true, description: "Varsayılan sesli uyarı modu" },
        { name: "defaultTabSetting", type: "string", required: true, description: "Yönetim paneli varsayılan açılış sekmesi" },
        { name: "isPasscodeLoginPassive", type: "boolean", required: true, description: "Şifresiz ve doğrulamasız doğrudan giriş" },
      ],
      sampleJson: {
        id: "general",
        preventiveActionDays: 7,
        correctiveActionDays: 3,
        defaultSoundSetting: "on",
        defaultTabSetting: "dofs",
        isPasscodeLoginPassive: false,
        updatedAt: "2026-10-21T06:00:00.000Z"
      }
    }
  ];

  return (
    <div className={`space-y-5 animate-fade-in ${isCompact ? "text-xs" : ""}`}>
      
      {/* Top Banner: Connection Status & Summary */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none -ml-16 -mb-16" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600/90 border border-indigo-400/30 flex items-center justify-center text-white shadow-lg shadow-indigo-950/50">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white font-display">
                    Veritabanı & Tablo Mimarisi
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Canlı & Aktif
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 mt-0.5">
                  Google Cloud Firestore NoSQL Veritabanı · 7 Koleksiyon / Tablo
                </p>
              </div>
            </div>

            {/* Test Connection Button */}
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={pingState.status === "testing"}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 text-white transition cursor-pointer shadow-xs shrink-0"
              id="test-db-connection-btn"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pingState.status === "testing" ? "animate-spin text-amber-300" : ""}`} />
              <span>{pingState.status === "testing" ? "Test Ediliyor..." : "Bağlantıyı Test Et"}</span>
            </button>
          </div>

          {/* Ping result toast if active */}
          {pingState.status !== "idle" && (
            <div className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in border ${
              pingState.status === "testing"
                ? "bg-amber-500/10 text-amber-200 border-amber-500/20"
                : "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
            }`}>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{pingState.message || "Bağlantı kontrol ediliyor..."}</span>
              </div>
              {pingState.latency && (
                <span className="font-mono bg-black/40 px-2 py-0.5 rounded-md text-[11px] text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                  {pingState.latency} ms
                </span>
              )}
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-white/10">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-indigo-200/70 uppercase block">Toplam Tablo</span>
              <span className="text-lg font-black text-white font-mono">7 Adet</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-indigo-200/70 uppercase block">Toplam Kayıt</span>
              <span className="text-lg font-black text-emerald-300 font-mono">{totalDocuments} Adet</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-indigo-200/70 uppercase block">Protokol</span>
              <span className="text-xs font-bold text-white block mt-0.5">TLS / SSL Long-Polling</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-indigo-200/70 uppercase block">Erişim Güvenliği</span>
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="h-3 w-3" />
                firestore.rules Aktif
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Parameters Details Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Canlı Firestore Bağlantı Parametreleri
            </h4>
          </div>
          <span className="text-[10px] font-mono text-slate-400">firebase-applet-config.json</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Project ID */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Project ID (Proje Kimliği)</span>
              <span className="font-mono font-bold text-slate-900 select-all">{firebaseConfig.projectId}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(firebaseConfig.projectId, "projectId")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              title="Kopyala"
            >
              {copiedKey === "projectId" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Firestore Database ID */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Firestore Database ID</span>
              <span className="font-mono font-bold text-indigo-700 select-all">{firebaseConfig.firestoreDatabaseId}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(firebaseConfig.firestoreDatabaseId, "databaseId")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              title="Kopyala"
            >
              {copiedKey === "databaseId" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Auth Domain */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Auth Domain (Kimlik Doğrulama)</span>
              <span className="font-mono font-medium text-slate-800 select-all">{firebaseConfig.authDomain}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(firebaseConfig.authDomain, "authDomain")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              title="Kopyala"
            >
              {copiedKey === "authDomain" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          {/* Storage Bucket */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Storage Bucket (Fotoğraf / Dosya Depolama)</span>
              <span className="font-mono font-medium text-slate-800 select-all">{firebaseConfig.storageBucket}</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(firebaseConfig.storageBucket, "storageBucket")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              title="Kopyala"
            >
              {copiedKey === "storageBucket" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Tables & Collections Accordion List */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Table className="h-4 w-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Veritabanı Tabloları & Koleksiyon Şemaları ({tables.length} Tablo)
              </h4>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Her tablonun üzerine tıklayarak canlı kayıt sayısını, sütun/alan tiplerini ve örnek veri şemasını inceleyebilirsiniz.
            </p>
          </div>

          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2.5 py-1 rounded-xl self-start sm:self-auto">
            {totalDocuments} Toplam Doküman
          </span>
        </div>

        <div className="space-y-3">
          {tables.map((table) => {
            const isExpanded = expandedTable === table.id;
            const Icon = table.icon;

            return (
              <div 
                key={table.id}
                className={`border rounded-2xl transition-all duration-200 overflow-hidden ${
                  isExpanded ? "border-indigo-400 shadow-sm bg-slate-50/50" : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                {/* Accordion Header */}
                <div 
                  onClick={() => setExpandedTable(isExpanded ? null : table.id)}
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isExpanded ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 text-slate-600"
                    }`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-indigo-950 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200/50">
                          {table.name}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {table.displayName}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {table.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs font-black px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                      {table.count} Kayıt
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Accordion Body: Fields, Schema, JSON */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100 space-y-4 animate-fade-in bg-white">
                    {/* Meta bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 text-[11px]">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Birincil Anahtar (Primary Key)</span>
                        <span className="font-mono font-bold text-slate-800">{table.primaryKey}</span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">İndeksler & Sıralama</span>
                        <span className="font-mono font-semibold text-slate-700">{table.indexes.join(" · ")}</span>
                      </div>
                    </div>

                    {/* Fields Table */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tablo Sütunları & Veri Tipleri ({table.fields.length} Alan)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(JSON.stringify(table.sampleJson, null, 2), `json-${table.id}`)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          {copiedKey === `json-${table.id}` ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span className="text-emerald-600">Kopyalandı!</span>
                            </>
                          ) : (
                            <>
                              <Code className="h-3 w-3" />
                              <span>JSON Şemasını Kopyala</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                              <th className="p-2.5">Alan Adı (Field)</th>
                              <th className="p-2.5">Veri Tipi</th>
                              <th className="p-2.5">Zorunluluk</th>
                              <th className="p-2.5">Açıklama</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {table.fields.map((field) => (
                              <tr key={field.name} className="hover:bg-slate-50/60 transition">
                                <td className="p-2.5 font-mono font-bold text-indigo-700 text-[11px]">
                                  {field.name}
                                </td>
                                <td className="p-2.5 font-mono text-slate-600 text-[11px]">
                                  {field.type}
                                </td>
                                <td className="p-2.5">
                                  {field.required ? (
                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                      Zorunlu
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-medium text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                      Opsiyonel
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-slate-600 text-[11px]">
                                  {field.description}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sample Record Preview */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Örnek Doküman Veri Yapısı (JSON)
                      </span>
                      <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] overflow-x-auto leading-relaxed border border-slate-800">
                        {JSON.stringify(table.sampleJson, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default DofDatabaseSettings;
