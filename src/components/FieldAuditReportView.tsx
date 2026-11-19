import React, { useState, useMemo } from "react";
import {
  Printer,
  Search,
  Image as ImageIcon,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  X,
  Plus,
  Edit3,
  Check,
  Building,
  Layers,
} from "lucide-react";
import {
  Department,
  DofForm,
  FieldInspectionStatus,
  FieldSeverity,
} from "../types";
import { updateDof } from "../lib/db";
import {
  DEFAULT_FIELD_UNITS,
  FIELD_PROCEDURES,
  SAMPLE_FIELD_AUDIT_DOFS,
  computeElapsedDays,
  formatDateTr,
  mapInspectionStatusToDofStatus,
  resolveInspectionStatus,
  resolveSeverity,
  toInputDateString,
} from "../lib/fieldClassification";
import { printElement } from "../utils/posterExporter";

interface FieldAuditReportViewProps {
  dofs: DofForm[];
  departments?: Department[];
  canEdit?: boolean;
  onRefresh?: () => Promise<void> | void;
  onOpenFieldCapture?: () => void;
}

const INSPECTION_STATUS_OPTIONS: FieldInspectionStatus[] = [
  "Açık",
  "İşlemde",
  "Doğrulama Bekliyor",
  "Gecikmiş",
  "Kapandı",
];

const SEVERITY_FILTER_OPTIONS: FieldSeverity[] = [
  "Kritik",
  "Yüksek",
  "Orta",
  "Düşük",
];

function getSeverityBadgeClass(severity: FieldSeverity): string {
  switch (severity) {
    case "Kritik":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "Yüksek":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "Orta":
      return "bg-sky-100 text-sky-800 border-sky-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function getStatusBadgeClass(status: FieldInspectionStatus): string {
  switch (status) {
    case "Kapandı":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Gecikmiş":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "Doğrulama Bekliyor":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "İşlemde":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default:
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

export default function FieldAuditReportView({
  dofs,
  departments = [],
  canEdit = true,
  onRefresh,
  onOpenFieldCapture,
}: FieldAuditReportViewProps) {
  const [includeSamples, setIncludeSamples] = useState(true);
  const [sampleRecords, setSampleRecords] = useState(SAMPLE_FIELD_AUDIT_DOFS);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Inline note editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Photo / Detail preview modal
  const [previewItem, setPreviewItem] = useState<
    (DofForm & { isSample?: boolean }) | null
  >(null);

  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    departments.forEach((d) => {
      if (d.name && d.isActive !== false) set.add(d.name.trim());
    });
    DEFAULT_FIELD_UNITS.forEach((u) => {
      if (
        !Array.from(set).some(
          (x) => x.toLocaleLowerCase("tr-TR") === u.toLocaleLowerCase("tr-TR")
        )
      ) {
        set.add(u);
      }
    });
    dofs.forEach((d) => {
      if (d.department) set.add(d.department.trim());
    });
    return Array.from(set);
  }, [departments, dofs]);

  const combinedRows = useMemo(() => {
    const live = dofs.map((d) => ({ ...d, isSample: false }));
    if (!includeSamples) return live;
    return [...live, ...sampleRecords];
  }, [dofs, includeSamples, sampleRecords]);

  // Top KPI summary metrics
  const kpi = useMemo(() => {
    let total = combinedRows.length;
    let open = 0;
    let overdue = 0;
    let completed = 0;

    combinedRows.forEach((row) => {
      const st = resolveInspectionStatus(row);
      if (st === "Kapandı") {
        completed++;
      } else {
        open++;
        if (st === "Gecikmiş") {
          overdue++;
        }
      }
    });

    return { total, open, overdue, completed };
  }, [combinedRows]);

  const filteredRows = useMemo(() => {
    return combinedRows.filter((row) => {
      const sev = resolveSeverity(row);
      const st = resolveInspectionStatus(row);

      if (unitFilter !== "all") {
        if (
          (row.department || "").toLocaleLowerCase("tr-TR") !==
          unitFilter.toLocaleLowerCase("tr-TR")
        ) {
          return false;
        }
      }

      if (statusFilter !== "all" && st !== statusFilter) {
        return false;
      }

      if (severityFilter !== "all" && sev !== severityFilter) {
        return false;
      }

      if (typeFilter !== "all" && row.type !== typeFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLocaleLowerCase("tr-TR").trim();
        const hay = [
          row.refNo,
          row.title,
          row.description,
          row.reporterName,
          row.department,
          row.location,
          row.adminFeedback,
          row.procedure,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    combinedRows,
    unitFilter,
    statusFilter,
    severityFilter,
    typeFilter,
    searchTerm,
  ]);

  const handlePatchRow = async (
    row: DofForm & { isSample?: boolean },
    patch: Partial<DofForm>
  ) => {
    if (!canEdit) return;
    const rowId = row.id || row.refNo;

    if (row.isSample) {
      setSampleRecords((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
        )
      );
      return;
    }

    if (!row.id) return;
    setSavingRowId(rowId);
    try {
      await updateDof(row.id, patch);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error("Failed to update audit row:", err);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleStatusChange = async (
    row: DofForm & { isSample?: boolean },
    nextStatus: FieldInspectionStatus
  ) => {
    const dofStatus = mapInspectionStatusToDofStatus(nextStatus);
    const todayDate = new Date().toISOString().split("T")[0];
    await handlePatchRow(row, {
      inspectionStatus: nextStatus,
      status: dofStatus,
      closedAt: nextStatus === "Kapandı" ? row.closedAt || todayDate : "",
    });
  };

  const handleSaveInlineNote = async (row: DofForm & { isSample?: boolean }) => {
    await handlePatchRow(row, { adminFeedback: noteDraft.trim() });
    setEditingNoteId(null);
  };

  const handlePrintReport = () => {
    printElement(
      "field-audit-report-printable",
      "Saha Uygunsuzluk ve DÖF Denetim Raporu",
      "landscape"
    );
  };

  const filterSummaryText = [
    unitFilter === "all" ? "Tüm Birimler" : `Birim: ${unitFilter}`,
    statusFilter === "all" ? "Tüm Durumlar" : `Durum: ${statusFilter}`,
    severityFilter === "all" ? "Tüm Önemler" : `Önem: ${severityFilter}`,
    typeFilter === "all"
      ? "Tüm Türler"
      : typeFilter === "düzeltici"
      ? "Düzeltici"
      : "Önleyici",
  ].join(" · ");

  return (
    <div className="space-y-5">
      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 print:hidden">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Toplam Tespit
            </span>
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 tabular-nums">
            {kpi.total}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Açık DÖF&apos;ler
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-700 mt-2 tabular-nums">
            {kpi.open}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Gecikenler
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-2 tabular-nums">
            {kpi.overdue}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Tamamlananlar
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2 tabular-nums">
            {kpi.completed}
          </p>
        </div>
      </div>

      {/* Filter & Action Toolbar (Hidden in print) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-display font-bold text-slate-900">
              Saha Uygunsuzluk Kontrol & Denetim Raporu
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Birimlere dağıtılan DÖF&apos;lerin statüsünü, termin tarihini, prosedürünü ve aksiyon notunu yönetin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSamples}
                onChange={(e) => setIncludeSamples(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Örnek Veriler ({sampleRecords.length})</span>
            </label>

            {onOpenFieldCapture && (
              <button
                type="button"
                onClick={onOpenFieldCapture}
                className="min-h-[40px] px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <Plus className="h-4 w-4" />
                <span>Sahada Hızlı Tespit</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintReport}
              className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition shadow-xs"
            >
              <Printer className="h-4 w-4" />
              <span>Raporu Yazdır / PDF İndir</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative lg:col-span-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Konu, sorumlu, saha ara..."
              className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-indigo-500"
            />
          </div>

          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Tüm Sorumlu Birimler</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Tüm Durumlar</option>
            {INSPECTION_STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Tüm Önem Dereceleri</option>
            {SEVERITY_FILTER_OPTIONS.map((sv) => (
              <option key={sv} value={sv}>
                {sv}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Tüm Faaliyet Türleri</option>
            <option value="düzeltici">Düzeltici Faaliyet</option>
            <option value="önleyici">Önleyici Faaliyet</option>
          </select>
        </div>
      </div>

      {/* Printable A4 Landscape Audit Sheet + Mandatory 10-Column Table */}
      <div
        id="field-audit-report-printable"
        className="print-audit-sheet bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
      >
        {/* Report Header (Visible both on screen and crisp in A4 print) */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
              KALİTE & İSG DENETİM KONTROL FORMU
            </span>
            <h3 className="text-base sm:text-lg font-display font-bold text-slate-900">
              Saha Uygunsuzluk ve DÖF Takip Raporu
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Filtre Özeti: {filterSummaryText}
            </p>
          </div>
          <div className="text-left sm:text-right text-[11px] text-slate-600 tabular-nums space-y-0.5">
            <div>
              <strong>Rapor Tarihi:</strong>{" "}
              {new Date().toLocaleString("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div>
              <strong>Listelenen Kayıt:</strong> {filteredRows.length} ·{" "}
              <strong>Açık:</strong> {kpi.open} · <strong>Geciken:</strong>{" "}
              {kpi.overdue} · <strong>Kapalı:</strong> {kpi.completed}
            </div>
          </div>
        </div>

        {/* 10-Column Audit Table */}
        <div className="overflow-x-auto">
          <table className="print-audit-table w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-2.5 font-bold border border-slate-700 w-[10%]">
                  1. Oluşturan Sorumlu & Tarih
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[16%]">
                  2. Uygunsuzluğun Konusu
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[7%]">
                  3. Önem Derecesi
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[9%]">
                  4. Termin Tarihi
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[7%]">
                  5. Geçen Süre
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[13%]">
                  6. DÖF İçin İzlenen Prosedür
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[9%]">
                  7. Sorumlu Birim
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[10%]">
                  8. Uygunsuzluk Durumu
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[8%]">
                  9. Kapanma Tarihi
                </th>
                <th className="p-2.5 font-bold border border-slate-700 w-[11%]">
                  10. İşlem / Not
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="p-8 text-center text-slate-400 border border-slate-200"
                  >
                    Seçili filtrelere uygun saha uygunsuzluğu veya DÖF kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowId = row.id || row.refNo;
                  const sev = resolveSeverity(row);
                  const insStatus = resolveInspectionStatus(row);
                  const elapsedDays = computeElapsedDays(row);
                  const photoUrl = row.beforeImageUrl || row.imageUrl;
                  const procedureVal =
                    row.procedure ||
                    (row.type === "önleyici"
                      ? "Önleyici - Risk Analizi & Önlem"
                      : "Düzeltici - 5 Neden Analizi");
                  const isEditingNote = editingNoteId === rowId;
                  const isSaving = savingRowId === rowId;

                  return (
                    <tr
                      key={rowId}
                      className="border-b border-slate-200 hover:bg-slate-50/80 transition-colors align-top"
                    >
                      {/* 1. Oluşturan Sorumlu & Tarih */}
                      <td className="p-2.5 border border-slate-200">
                        <div className="font-bold text-slate-900 leading-snug">
                          {row.reporterName || "Yetkili"}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {formatDateTr(row.createdAt, true)}
                        </div>
                        <div className="text-[10px] font-mono text-indigo-700 mt-0.5">
                          {row.refNo}
                        </div>
                      </td>

                      {/* 2. Uygunsuzluğun Konusu */}
                      <td className="p-2.5 border border-slate-200">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 leading-snug">
                              {row.title}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                              {row.description}
                            </div>
                            {row.location && (
                              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                Saha: {row.location}
                              </div>
                            )}
                          </div>
                          {photoUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewItem(row)}
                              className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shrink-0 cursor-pointer print:hidden"
                              title="Kanıt Fotoğrafını Görüntüle"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 3. Önem Derecesi */}
                      <td className="p-2.5 border border-slate-200">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${getSeverityBadgeClass(
                            sev
                          )}`}
                        >
                          {sev}
                        </span>
                      </td>

                      {/* 4. Termin Tarihi */}
                      <td className="p-2.5 border border-slate-200 tabular-nums">
                        {canEdit ? (
                          <>
                            <input
                              type="date"
                              value={toInputDateString(row.targetCompletionDate)}
                              onChange={(e) =>
                                handlePatchRow(row, {
                                  targetCompletionDate: e.target.value,
                                })
                              }
                              className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 outline-none focus:border-indigo-500 print:hidden"
                            />
                            <span className="hidden print:inline">
                              {formatDateTr(row.targetCompletionDate)}
                            </span>
                          </>
                        ) : (
                          <span>{formatDateTr(row.targetCompletionDate)}</span>
                        )}
                      </td>

                      {/* 5. Geçen Süre */}
                      <td className="p-2.5 border border-slate-200 tabular-nums font-bold text-slate-800 whitespace-nowrap">
                        <span
                          className={
                            insStatus === "Gecikmiş"
                              ? "text-rose-700"
                              : insStatus === "Kapandı"
                              ? "text-emerald-700"
                              : "text-slate-800"
                          }
                        >
                          {elapsedDays} Gün
                        </span>
                      </td>

                      {/* 6. DÖF İçin İzlenen Prosedür */}
                      <td className="p-2.5 border border-slate-200">
                        {canEdit ? (
                          <>
                            <select
                              value={procedureVal}
                              onChange={(e) =>
                                handlePatchRow(row, {
                                  procedure: e.target.value,
                                })
                              }
                              className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer print:hidden"
                            >
                              {!FIELD_PROCEDURES.includes(procedureVal) && (
                                <option value={procedureVal}>
                                  {procedureVal}
                                </option>
                              )}
                              {FIELD_PROCEDURES.map((proc) => (
                                <option key={proc} value={proc}>
                                  {proc}
                                </option>
                              ))}
                            </select>
                            <span className="hidden print:inline font-medium">
                              {procedureVal}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium">{procedureVal}</span>
                        )}
                      </td>

                      {/* 7. Sorumlu Birim */}
                      <td className="p-2.5 border border-slate-200">
                        {canEdit ? (
                          <>
                            <select
                              value={row.department}
                              onChange={(e) =>
                                handlePatchRow(row, {
                                  department: e.target.value,
                                  assignedUnit: e.target.value,
                                })
                              }
                              className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer print:hidden"
                            >
                              {!unitOptions.includes(row.department) && (
                                <option value={row.department}>
                                  {row.department}
                                </option>
                              )}
                              {unitOptions.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                            <span className="hidden print:inline font-bold">
                              {row.department}
                            </span>
                          </>
                        ) : (
                          <span className="font-bold">{row.department}</span>
                        )}
                      </td>

                      {/* 8. Uygunsuzluk Durumu */}
                      <td className="p-2.5 border border-slate-200">
                        {canEdit ? (
                          <>
                            <select
                              value={insStatus}
                              disabled={isSaving}
                              onChange={(e) =>
                                handleStatusChange(
                                  row,
                                  e.target.value as FieldInspectionStatus
                                )
                              }
                              className={`w-full px-1.5 py-1 rounded-lg border text-[11px] font-bold outline-none cursor-pointer print:hidden ${getStatusBadgeClass(
                                insStatus
                              )}`}
                            >
                              {INSPECTION_STATUS_OPTIONS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            <span
                              className={`hidden print:inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${getStatusBadgeClass(
                                insStatus
                              )}`}
                            >
                              {insStatus}
                            </span>
                          </>
                        ) : (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${getStatusBadgeClass(
                              insStatus
                            )}`}
                          >
                            {insStatus}
                          </span>
                        )}
                      </td>

                      {/* 9. Kapanma Tarihi */}
                      <td className="p-2.5 border border-slate-200 tabular-nums whitespace-nowrap">
                        {insStatus === "Kapandı"
                          ? formatDateTr(row.closedAt || row.updatedAt)
                          : "-"}
                      </td>

                      {/* 10. İşlem / Not */}
                      <td className="p-2.5 border border-slate-200">
                        {isEditingNote ? (
                          <div className="space-y-1.5 print:hidden">
                            <textarea
                              rows={2}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              className="w-full p-1.5 bg-white border border-indigo-400 rounded-lg text-[11px] text-slate-900 outline-none"
                              placeholder="Aksiyon veya yönetici notu..."
                            />
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold cursor-pointer"
                              >
                                İptal
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveInlineNote(row)}
                                className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                <Check className="h-3 w-3" />
                                Kaydet
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-1.5 group">
                            <span className="text-[11px] text-slate-700 leading-snug">
                              {row.adminFeedback ||
                                row.referralResultNote ||
                                "-"}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(rowId);
                                  setNoteDraft(
                                    row.adminFeedback ||
                                      row.referralResultNote ||
                                      ""
                                  );
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50 shrink-0 cursor-pointer print:hidden"
                                title="Notu Düzenle"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidence Photo & Detail Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-indigo-600">
                  {previewItem.refNo}
                </span>
                <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                  {previewItem.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {(previewItem.beforeImageUrl || previewItem.imageUrl) && (
              <img
                src={previewItem.beforeImageUrl || previewItem.imageUrl}
                alt="Uygunsuzluk Kanıtı"
                className="w-full max-h-[340px] object-contain rounded-2xl bg-slate-50 border border-slate-200"
              />
            )}

            <div className="space-y-1.5 text-xs text-slate-600">
              <p className="leading-relaxed">{previewItem.description}</p>
              <div className="flex flex-wrap gap-3 pt-2 text-[11px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Building className="h-3.5 w-3.5" />
                  {previewItem.department}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5" />
                  {previewItem.procedure || previewItem.type}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Termin: {formatDateTr(previewItem.targetCompletionDate)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
