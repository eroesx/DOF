import React from "react";
import { Clock, Calendar, ChevronRight, CheckCircle2 } from "lucide-react";
import { DofForm } from "../types";

interface DofUpcomingDeadlinesProps {
  dofs: DofForm[];
  onSelectDof?: (dof: DofForm) => void;
}

export const DofUpcomingDeadlines: React.FC<DofUpcomingDeadlinesProps> = ({ dofs, onSelectDof }) => {
  const pendingDofsWithDeadlines = dofs
    .filter((d) => d.status === "yeni" || d.status === "inceleniyor")
    .map((d) => {
      let createdDate = new Date();
      if (d.createdAt) {
        try {
          if (typeof d.createdAt.toDate === "function") {
            createdDate = d.createdAt.toDate();
          } else if (d.createdAt.seconds !== undefined) {
            createdDate = new Date(d.createdAt.seconds * 1000);
          } else {
            createdDate = new Date(d.createdAt);
          }
        } catch (e) {
          console.error("Error parsing date: ", e);
        }
      }
      const targetDays = d.type === "düzeltici" ? 7 : 14;
      const terminDate = new Date(createdDate.getTime());
      terminDate.setDate(terminDate.getDate() + targetDays);

      const today = new Date();
      // Clear hours to compare calendar days
      today.setHours(0, 0, 0, 0);
      const terminDateZero = new Date(terminDate.getTime());
      terminDateZero.setHours(0, 0, 0, 0);

      const diffTime = terminDateZero.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      return {
        dof: d,
        terminDate,
        diffDays,
      };
    })
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, 5); // Show top 5 closest deadlines

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300 h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display">
              <Clock className="h-4 w-4 text-indigo-500" /> Yaklaşan Termin Tarihli DÖF'ler
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Maksimum çözüm süresine göre en yakın terminler</p>
          </div>
          <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
            {pendingDofsWithDeadlines.length} Kayıt
          </span>
        </div>

        {pendingDofsWithDeadlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-xs text-slate-700 font-bold">Harika! Bekleyen DÖF Yok</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Tüm düzeltici ve önleyici faaliyetler çözülmüş veya kapatılmış durumda.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[290px] overflow-y-auto pr-1">
            {pendingDofsWithDeadlines.map(({ dof, terminDate, diffDays }) => {
              // Determine status badge color and text
              let badgeColor = "";
              let badgeText = "";

              if (diffDays < 0) {
                badgeColor = "bg-rose-100 border-rose-200 text-rose-700 font-extrabold";
                badgeText = `${Math.abs(diffDays)} Gün Geçti`;
              } else if (diffDays === 0) {
                badgeColor = "bg-rose-100 border-rose-200 text-rose-700 font-extrabold animate-pulse";
                badgeText = "Bugün Son Gün!";
              } else if (diffDays === 1) {
                badgeColor = "bg-rose-50 border-rose-200 text-rose-700 font-bold";
                badgeText = "1 Gün Kaldı";
              } else if (diffDays <= 3) {
                badgeColor = "bg-rose-50 border-rose-100 text-rose-700 font-bold";
                badgeText = `${diffDays} Gün Kaldı`;
              } else {
                badgeColor = "bg-slate-50 border-slate-100 text-slate-600";
                badgeText = `${diffDays} Gün Kaldı`;
              }

              const formattedDate = terminDate.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              });

              const isUrgent = diffDays <= 3;

              return (
                <div
                  key={dof.id}
                  onClick={() => onSelectDof && onSelectDof(dof)}
                  className={`group flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isUrgent
                      ? "bg-rose-50/40 border-rose-100 hover:border-rose-200 hover:bg-rose-50/60"
                      : "bg-slate-50/50 border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/10"
                  } hover:shadow-xs`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                        {dof.refNo}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                        dof.type === "düzeltici" ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-sky-50 border-sky-100 text-sky-700"
                      }`}>
                        {dof.type.toUpperCase()}
                      </span>
                      {isUrgent && (
                        <span className="bg-rose-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider animate-pulse shrink-0">
                          ACİL
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition">
                      {dof.title}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>Termin: {formattedDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${badgeColor} whitespace-nowrap`}>
                      {badgeText}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingDofsWithDeadlines.length > 0 && onSelectDof && (
        <p className="text-[9px] text-slate-400 text-center mt-3 pt-2 border-t border-slate-50">
          💡 Detayları görmek ve işlem yapmak için satırlara tıklayabilirsiniz.
        </p>
      )}
    </div>
  );
};
