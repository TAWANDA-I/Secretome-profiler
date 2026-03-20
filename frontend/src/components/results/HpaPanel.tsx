import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ProteinListModal } from "./ProteinListModal";
import { useUniprotLookup } from "@/hooks/useUniprotLookup";
import type { Result } from "@/types";

interface TissueEntry { tissue: string; cell_type: string; level: string; reliability: string; }
interface BloodConc  { concentration_nm: number | null; assay: string; }
interface HpaEntry {
  gene: string; gene_synonym: string; tissue_specificity: string;
  blood_concentration: BloodConc;
  tissue_expression: TissueEntry[];
  single_cell_expression: { cell_type: string; nTPM: number }[];
}
type HpaData = Record<string, HpaEntry>;

const LEVEL_COLOR: Record<string, string> = { High: "#10b981", Medium: "#f59e0b", Low: "#94a3b8" };

interface ModalState { title: string; subtitle?: string; proteins: string[]; }
interface Props { result: Result; }

export function HpaPanel({ result }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "hpa"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "hpa"),
  });
  const { toRows } = useUniprotLookup(result.job_id);

  const entries = useMemo(() => {
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as HpaData).map(([acc, v]) => ({ acc, ...v }));
  }, [raw]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => !q || e.gene?.toLowerCase().includes(q) || e.acc.toLowerCase().includes(q));
  }, [entries, search]);

  const summary = result.summary as { proteins_with_data: number };

  // Which accessions have high expression in each tissue?
  const tissueProteins = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of entries) {
      for (const t of e.tissue_expression ?? []) {
        if (t.level === "High") (map[t.tissue] ??= []).push(e.acc);
      }
    }
    return map;
  }, [entries]);

  const topTissues = useMemo(() => {
    return Object.entries(tissueProteins)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15);
  }, [tissueProteins]);

  const topTissuesOption = useMemo(() => {
    if (!topTissues.length) return null;
    return {
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow" },
        formatter: (p: { name: string; value: number }[]) =>
          `${p[0].name}: ${p[0].value} proteins<br/><span style="color:#94a3b8;font-size:11px">Click to see protein list</span>`,
      },
      grid: { left: 130, right: 20, top: 10, bottom: 30 },
      xAxis: { type: "value", name: "Proteins (high expression)" },
      yAxis: { type: "category", data: topTissues.map(([t]) => t).reverse() },
      series: [{
        type: "bar", cursor: "pointer",
        data: topTissues.map(([, accs]) => accs.length).reverse(),
        itemStyle: { color: "#10b981" },
      }],
    };
  }, [topTissues]);

  const handleTissueBarClick = (params: { name: string }) => {
    const tissue = params.name;
    const accs = tissueProteins[tissue] ?? [];
    setModal({ title: `High expression in: ${tissue}`, subtitle: `${accs.length} proteins`, proteins: accs });
  };

  const handleDownload = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `hpa_${result.job_id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {modal && (
        <ProteinListModal
          title={modal.title}
          subtitle={modal.subtitle}
          proteins={toRows(modal.proteins)}
          onClose={() => setModal(null)}
        />
      )}

      <Card className="text-center">
        <CardContent className="py-5">
          <div className="text-3xl font-bold text-primary-700">{summary.proteins_with_data}</div>
          <div className="text-sm text-gray-500 mt-1">Proteins with HPA expression data</div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          {topTissuesOption && (
            <Card>
              <CardHeader>
                <CardTitle>Top Tissues (High Expression)
                  <span className="text-xs font-normal text-gray-400 ml-2">— click bar to see proteins</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  option={topTissuesOption}
                  style={{ height: Math.max(280, topTissues.length * 22) }}
                  onEvents={{ click: handleTissueBarClick }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Protein Expression Details</CardTitle>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="Search gene…" value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                  <button onClick={handleDownload} className="text-xs text-primary-600 hover:underline">↓ JSON</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Protein</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600 hidden md:table-cell">Tissue Specificity</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Top Tissues</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 hidden md:table-cell">Blood (nM)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const row = toRows([e.acc])[0];
                    return (
                      <>
                        <tr
                          key={e.acc}
                          onClick={() => setExpanded(expanded === e.acc ? null : e.acc)}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-3 py-2">
                            <span className="font-semibold text-primary-700">{e.gene}</span>
                            <span className="text-xs text-gray-400 ml-1">({e.acc})</span>
                            {row.protein_name && (
                              <div className="text-xs text-gray-400 truncate max-w-xs">{row.protein_name}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">{e.tissue_specificity || "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 flex-wrap">
                              {e.tissue_expression?.slice(0, 3).map((t, i) => (
                                <span key={i} className="text-xs px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: (LEVEL_COLOR[t.level] ?? "#94a3b8") + "20", color: LEVEL_COLOR[t.level] ?? "#64748b" }}>
                                  {t.tissue}
                                </span>
                              ))}
                              {(e.tissue_expression?.length ?? 0) > 3 && (
                                <span className="text-xs text-gray-400">+{e.tissue_expression.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono hidden md:table-cell">
                            {e.blood_concentration?.concentration_nm != null ? `${e.blood_concentration.concentration_nm} nM` : "—"}
                          </td>
                        </tr>
                        {expanded === e.acc && (
                          <tr key={`${e.acc}-detail`} className="bg-blue-50">
                            <td colSpan={4} className="px-4 py-3 text-xs space-y-2">
                              {e.tissue_expression?.length > 0 && (
                                <div>
                                  <span className="font-semibold text-gray-700">Tissue expression: </span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {e.tissue_expression.map((t, i) => (
                                      <span key={i} className="px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80"
                                        style={{ background: (LEVEL_COLOR[t.level] ?? "#94a3b8") + "20", color: LEVEL_COLOR[t.level] ?? "#64748b", border: `1px solid ${LEVEL_COLOR[t.level] ?? "#94a3b8"}40` }}
                                        onClick={(ev) => { ev.stopPropagation(); const accs = tissueProteins[t.tissue] ?? []; setModal({ title: `High expression in: ${t.tissue}`, subtitle: `${accs.length} proteins`, proteins: accs }); }}>
                                        {t.tissue} ({t.cell_type}) — {t.level}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {e.blood_concentration?.concentration_nm != null && (
                                <div>
                                  <span className="font-semibold text-gray-700">Blood: </span>
                                  {e.blood_concentration.concentration_nm} nM
                                  {e.blood_concentration.assay && ` (${e.blood_concentration.assay})`}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && !isLoading && (
                <p className="text-center text-gray-400 py-8">No HPA data available.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
