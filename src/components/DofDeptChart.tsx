import React from "react";
import { Building, BarChart3, ArrowRight } from "lucide-react";
import { DofForm } from "../types";

interface DofDeptChartProps {
  dofs: DofForm[];
  onSelectDept?: (deptName: string) => void;
}

export const DofDeptChart: React.FC<DofDeptChartProps> = ({ dofs, onSelectDept }) => {
  const total = dofs.length;

  // Calculate department distribution
  const deptDistribution = dofs.reduce((acc, curr) => {
    const dept = curr.department || "Belirtilmemiş";
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(deptDistribution)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);

  const maxVal = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 1;

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-display">
              <BarChart3 className="h-4 w-4 text-indigo-500" /> Departman Bazlı DÖF Dağılımı
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">DÖF kayıtlarının departmanlara göre dağılımı</p>
          </div>
          <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
            {data.length} Departman
          </span>
        </div>

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Building className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs text-slate-400 font-medium">Veri bulunamadı</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[290px] overflow-y-auto pr-1">
            {data.map((item, index) => {
              const pctOfTotal = total > 0 ? Math.round((item.value / total) * 100) : 0;
              const pctOfMax = Math.round((item.value / maxVal) * 100);

              // Cycle colors beautifully
              const barColors = [
                "from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700",
                "from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700",
                "from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700",
                "from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
                "from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700",
              ];
              const colorIdx = index % barColors.length;

              return (
                <div
                  key={item.name}
                  onClick={() => onSelectDept && onSelectDept(item.name)}
                  className="group p-2 rounded-xl hover:bg-slate-50 transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-100"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5 gap-2 min-w-0">
                    <span className="font-semibold text-slate-700 group-hover:text-indigo-600 transition flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${index === 0 ? "bg-indigo-500" : "bg-slate-400"} shrink-0`}></span>
                      <span className="truncate" title={item.name}>{item.name}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <span className="font-mono text-[11px] font-bold text-slate-500 whitespace-nowrap">
                        {item.value} Adet
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap">
                        ({pctOfTotal}%)
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${barColors[colorIdx]} transition-all duration-500`}
                      style={{ width: `${pctOfMax}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.length > 0 && onSelectDept && (
        <p className="text-[9px] text-slate-400 text-center mt-3 pt-2 border-t border-slate-50">
          💡 İlgili departmanın kayıtlarını listelemek için satırlara tıklayabilirsiniz.
        </p>
      )}
    </div>
  );
};
