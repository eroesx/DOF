import React, { useState, useEffect } from "react";
import { 
  FileEdit, 
  Search, 
  Lock, 
  QrCode, 
  ShieldAlert, 
  Info,
  Menu,
  X,
  LogOut,
  Camera,
  Smartphone
} from "lucide-react";
import DofSubmitForm from "./components/DofSubmitForm";
import DofTrack from "./components/DofTrack";
import DofAdmin from "./components/DofAdmin";
import DofQrGenerator from "./components/DofQrGenerator";
import DofMobileEditor from "./components/DofMobileEditor";
import { DofQrScannerModal, ScanResult } from "./components/DofQrScannerModal";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signOut } from "./firebase";

type ViewTab = "submit" | "track" | "admin" | "qr" | "edit";

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>("admin");
  const [initialTrackRef, setInitialTrackRef] = useState<string | null>(null);
  const [editRefNo, setEditRefNo] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isPasscodePassive, setIsPasscodePassive] = useState(false);
  const [isPasscodeAuthed, setIsPasscodeAuthed] = useState(false);

  const computeIsAdmin = (currentUser?: any) => {
    const isPassive = localStorage.getItem("dof_admin_passcode_login_passive") === "true";
    const role = localStorage.getItem("dof_admin_user_role");
    const passcode = localStorage.getItem("dof_admin_passcode");
    const email = localStorage.getItem("dof_admin_authed_email")?.toLowerCase().trim();
    const currEmail = (currentUser || auth.currentUser)?.email?.toLowerCase().trim();

    return (
      isPassive ||
      role === "admin" ||
      passcode === "admin" ||
      email === "gokhan.eroglu@gmail.com" ||
      currEmail === "gokhan.eroglu@gmail.com"
    );
  };

  const [isAdmin, setIsAdmin] = useState<boolean>(() => computeIsAdmin());

  // Monitor auth state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(computeIsAdmin(currentUser));
    });
    setIsPasscodePassive(localStorage.getItem("dof_admin_passcode_login_passive") === "true");
    setIsPasscodeAuthed(localStorage.getItem("dof_admin_passcode_authed") === "true");
    setIsAdmin(computeIsAdmin());

    const handleStorageChange = () => {
      setIsPasscodePassive(localStorage.getItem("dof_admin_passcode_login_passive") === "true");
      setIsPasscodeAuthed(localStorage.getItem("dof_admin_passcode_authed") === "true");
      setIsAdmin(computeIsAdmin());
    };
    window.addEventListener("storage", handleStorageChange);

    const interval = setInterval(() => {
      setIsPasscodePassive(localStorage.getItem("dof_admin_passcode_login_passive") === "true");
      setIsPasscodeAuthed(localStorage.getItem("dof_admin_passcode_authed") === "true");
      setIsAdmin(computeIsAdmin());
    }, 1000);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem("dof_admin_passcode_login_passive");
    localStorage.removeItem("dof_admin_passcode_authed");
    localStorage.removeItem("dof_admin_authed_email");
    localStorage.removeItem("dof_admin_passcode");
    await signOut(auth);
    window.location.reload();
  };

  // Check query parameters on mount to support QR code deep-linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const refNo = params.get("refNo");
    const id = params.get("id");
    const editParam = params.get("edit");

    if (view === "edit" || editParam) {
      setActiveTab("edit");
      if (refNo) {
        setEditRefNo(refNo);
      } else if (editParam) {
        setEditRefNo(editParam);
      }
      if (id) {
        setEditId(id);
      }
    } else if (view === "submit") {
      setActiveTab("submit");
    } else if (view === "track") {
      setActiveTab("track");
      if (refNo) {
        setInitialTrackRef(refNo);
      }
    } else if (view === "admin") {
      setActiveTab("admin");
    } else if (view === "qr") {
      if (computeIsAdmin()) {
        setActiveTab("qr");
      } else {
        setActiveTab("admin");
      }
    }
  }, []);

  const handleGoToTrack = (refNo: string) => {
    setInitialTrackRef(refNo);
    setActiveTab("track");
  };

  const handleShowQr = () => {
    if (isAdmin) {
      setActiveTab("qr");
    } else {
      setActiveTab("admin");
    }
  };

  const handleOpenMobileEdit = (targetRefNo?: string, targetId?: string) => {
    if (targetRefNo) setEditRefNo(targetRefNo);
    if (targetId) setEditId(targetId);
    setActiveTab("edit");
  };

  const handleGlobalScanSuccess = (result: ScanResult) => {
    setIsScannerModalOpen(false);
    if (result.refNo) {
      setEditRefNo(result.refNo);
      setEditId(null);
    } else if (result.id) {
      setEditId(result.id);
      setEditRefNo(null);
    }
    setActiveTab("edit");
  };

  const tabs = [
    { id: "submit", label: "Form Doldur", icon: FileEdit },
    { id: "track", label: "Durum Takip", icon: Search },
    { id: "admin", label: "Yönetim Paneli", icon: Lock },
    ...(isAdmin ? [{ id: "qr", label: "Afiş & QR Kod", icon: QrCode }] : []),
    ...(activeTab === "edit" ? [{ id: "edit", label: "Mobil Düzenle", icon: Smartphone }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Top Banner (Hidden during printing) */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-50 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo/Title */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("submit")}>
              <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-100">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <span className="font-display font-black tracking-tight text-indigo-600 text-base leading-none block">
                  DÖF SİSTEMİ
                </span>
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase block">
                  Düzeltici Önleyici Faaliyet
                </span>
              </div>
            </div>

             {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-4">
              <nav className="flex gap-1.5 bg-slate-100/70 p-1 rounded-xl">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as ViewTab)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition duration-150 cursor-pointer ${
                        isActive
                          ? "bg-white text-indigo-600 shadow-sm border border-slate-200/40"
                          : "text-slate-600 hover:text-indigo-600 hover:bg-white/40"
                      }`}
                      id={`desktop-tab-${tab.id}`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>

              {/* QR Scanner Trigger Button */}
              <button
                onClick={() => setIsScannerModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
                id="header-scan-qr-btn"
                title="Kamera ile DÖF QR Kodu Tara"
              >
                <Camera className="h-4 w-4" />
                QR Kod Tara
              </button>

              {/* Desktop Logout Button */}
              {(user || isPasscodePassive || isPasscodeAuthed) && (
                <div className="flex items-center gap-3 pl-3 border-l border-slate-100">
                  <div className="flex flex-col items-end text-right">
                    <span className="text-[11px] font-bold text-slate-700 max-w-[120px] truncate">
                      {user?.email ? user.email.split("@")[0] : (localStorage.getItem("dof_admin_authed_email")?.split("@")[0] || "Yetkili")}
                    </span>
                    <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">
                      Oturum Açık
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/40 text-[11px] font-bold rounded-lg transition cursor-pointer shadow-xs"
                    title="Güvenli Çıkış"
                    id="header-logout-btn"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Çıkış Yap
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle & Quick Scan */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={() => setIsScannerModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                title="Kamera ile DÖF QR Kodu Tara"
                id="mobile-header-scan-qr-btn"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Tara</span>
              </button>
              {(user || isPasscodePassive || isPasscodeAuthed) && (
                <button
                  onClick={handleLogout}
                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/30 rounded-lg transition cursor-pointer"
                  title="Güvenli Çıkış"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg focus:outline-none cursor-pointer"
                id="mobile-menu-toggle-btn"
              >
                {isMobileMenuOpen ? <X className="h-5.5 w-5.5" /> : <Menu className="h-5.5 w-5.5" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 py-2.5 px-4 shadow-inner space-y-1">
            <button
              onClick={() => {
                setIsScannerModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer mb-2"
            >
              <Camera className="h-4.5 w-4.5 text-indigo-600" />
              Kamera ile QR Kod Tara & Düzenle
            </button>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as ViewTab);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  id={`mobile-tab-${tab.id}`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {tab.label}
                </button>
              );
            })}

            {/* Mobile dropdown exit button */}
            {(user || isPasscodePassive || isPasscodeAuthed) && (
              <div className="border-t border-slate-100 pt-2 mt-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                >
                  <LogOut className="h-4.5 w-4.5 text-rose-500" />
                  Sistemden Çıkış Yap
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Dynamic Views */}
        <div className="w-full">
          {activeTab === "submit" && (
            <DofSubmitForm onGoToTrack={handleGoToTrack} onShowQr={handleShowQr} />
          )}
          {activeTab === "track" && (
            <DofTrack initialRefNo={initialTrackRef} />
          )}
          {activeTab === "admin" && (
            <DofAdmin />
          )}
          {activeTab === "qr" && (
            isAdmin ? (
              <DofQrGenerator onClose={() => setActiveTab("submit")} />
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl p-10 text-center max-w-md mx-auto my-12 shadow-md space-y-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center border border-rose-100">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Yetkisiz Erişim</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Afiş ve QR Kod oluşturma alanına sadece <strong>Yönetici (Admin)</strong> yetkisine sahip kullanıcılar erişebilir.
                </p>
                <button
                  onClick={() => setActiveTab("submit")}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Form Ekranına Dön
                </button>
              </div>
            )
          )}
          {activeTab === "edit" && (
            <DofMobileEditor 
              initialRefNo={editRefNo} 
              initialId={editId}
              onBack={() => setActiveTab("admin")}
              onGoToTrack={handleGoToTrack}
              onGoToAdmin={() => setActiveTab("admin")}
            />
          )}
        </div>

        {/* Global QR Scanner Modal */}
        <DofQrScannerModal 
          isOpen={isScannerModalOpen} 
          onClose={() => setIsScannerModalOpen(false)} 
          onScanSuccess={handleGlobalScanSuccess} 
        />

      </main>

      {/* Footer (Hidden during printing) */}
      <footer className="bg-white border-t border-slate-100 py-6 mt-12 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:justify-between sm:items-center space-y-2.5 sm:space-y-0 text-xs text-slate-400">
          <div className="flex items-center justify-center gap-1.5">
            <Info className="h-4 w-4 text-indigo-500" />
            <span>ISO 9001:2015 Standartlarına uygun Kalite Bildirim Sistemi</span>
          </div>
          <p>© 2026 DÖF Yönetim ve Sürekli İyileştirme Sistemi. Tüm Hakları Saklıdır.</p>
        </div>
      </footer>

    </div>
  );
}

