import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ProteinListModal } from "./ProteinListModal";
import { useUniprotLookup } from "@/hooks/useUniprotLookup";
import type { Result } from "@/types";

interface SignalpEntry {
  has_sp: boolean;
  type: string;
  confidence: number;
  source: string;
  gene_name?: string;
  protein_name?: string;
}
type SignalpData = Record<string, SignalpEntry>;

type FilterType = "ALL" | "Sec/SPI" | "GPI-anchored" | "Unconventional" | "Other";
type EntryItem = SignalpEntry & { acc: string };

const TYPE_COLORS: Record<string, string> = {
  "Sec/SPI": "#10b981",
  "GPI-anchored": "#8b5cf6",
  "Unconventional": "#f59e0b",
  "Other": "#94a3b8",
};

const TYPE_LABELS: Record<string, string> = {
  "Sec/SPI": "Classical SP (Sec/SPI)",
  "GPI-anchored": "GPI-anchored",
  "Unconventional": "Unconventional secretion",
  "Other": "Not secreted",
};

interface ModalState { title: string; subtitle?: string; proteins: string[]; }
interface Props { result: Result; }

export function SignalpPanel({ result }: Props) {
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "signalp"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "signalp"),
  });
  const { toRows } = useUniprotLookup(result.job_id);

  const entries = useMemo((): EntryItem[] => {
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as SignalpData).map(([acc, v]) => ({ acc, ...v }));
  }, [raw]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { "Sec/SPI": 0, "GPI-anchored": 0, "Unconventional": 0, "Other": 0 };
    for (const e of entries) {
      const t = e.type in c ? e.type : "Other";
      c[t]++;
    }
    return c;
  }, [entries]);

  const filtered = useMemo(() =>
    filter === "ALL" ? entries : entries.filter((e) => e.type === filter),
    [entries, filter]
  );

  const summary = result.summary as { classical_sp: number; no_sp: number; gpi_anchored?: number; unconventional?: number };

  const pieOption = {
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)<br/><span style='color:#94a3b8;font-size:11px'>Click to filter table</span>",
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: "pie", radius: ["40%", "70%"], cursor: "pointer",
      data: (Object.entries(typeCounts) as [string, number][])
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: TYPE_LABELS[k] ?? k, value: v, itemStyle: { color: TYPE_COLORS[k] } })),
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
    }],
  };

  const handlePieClick = (params: { name: string }) => {
    const key = Object.keys(TYPE_LABELS).find((k) => TYPE_LABELS[k] === params.name) ?? params.name;
    setFilter((prev: FilterType) => prev === key ? "ALL" : key as FilterType);
  };

  const handleDownload = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `signalp_${result.job_id}.json`; a.click();
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["Sec/SPI", "GPI-anchored", "Unconventional", "Other"] as const).map((t) => (
          <Card key={t} className="text-center cursor-pointer hover:ring-2 ring-primary-300 transition-all"
            onClick={() => setFilter((p) => p === t ? "ALL" : t)}>
            <CardContent className="py-4">
              <div className="text-2xl font-bold" style={{ color: TYPE_COLORS[t] }}>
                {typeCounts[t] || summary[t === "Sec/SPI" ? "classical_sp" : t === "Other" ? "no_sp" : t.toLowerCase().replace("-", "_") as keyof typeof summary] || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">{TYPE_LABELS[t]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-gray-400 italic px-1">
        Classification based on UniProt keywords (Signal, GPI-anchor, Secreted subcellular location) with von Heijne heuristic fallback. Results are predictions and should be verified experimentally.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Secretion Type Composition
              <span className="text-xs font-normal text-gray-400 ml-2">— click to filter</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={pieOption} style={{ height: 280 }} onEvents={{ click: handlePieClick }} />
          </CardContent>
        </Card>

        {/* Filter buttons */}
        <Card>
          <CardHeader><CardTitle>Filter by Type</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(["ALL", "Sec/SPI", "GPI-anchored", "Unconventional", "Other"] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${
                  filter === t ? "text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                style={filter === t ? { background: t === "ALL" ? "#64748b" : TYPE_COLORS[t] } : {}}
              >
                <span>{t === "ALL" ? "All proteins" : TYPE_LABELS[t]}</span>
                <span className="font-mono text-xs opacity-80">
                  {t === "ALL" ? entries.length : typeCounts[t] ?? 0}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : entries.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Per-Protein Classification
                {filter !== "ALL" && (
                  <span className="ml-2 text-xs font-normal" style={{ color: TYPE_COLORS[filter] }}>
                    — {TYPE_LABELS[filter]}
                  </span>
                )}
              </CardTitle>
              <button onClick={handleDownload} className="text-xs text-primary-600 hover:underline">↓ JSON</button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Accession</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Gene</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Protein Name</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Classification</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Confidence</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .sort((a: EntryItem, b: EntryItem) => {
                    const order: Record<string, number> = { "Sec/SPI": 0, "GPI-anchored": 1, "Unconventional": 2, "Other": 3 };
                    return (order[a.type] ?? 3) - (order[b.type] ?? 3) || b.confidence - a.confidence;
                  })
                  .map((e: EntryItem) => {
                    // Prefer embedded names from backend; fall back to useUniprotLookup
                    const row = toRows([e.acc])[0];
                    const gene = e.gene_name || row.gene_name || "—";
                    const protein = e.protein_name || row.protein_name || "—";
                    const typeColor = TYPE_COLORS[e.type] ?? "#94a3b8";
                    return (
                      <tr key={e.acc} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-primary-700">
                          <a href={`https://www.uniprot.org/uniprotkb/${e.acc}`} target="_blank" rel="noreferrer" className="hover:underline">{e.acc}</a>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{gene}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{protein}</td>
                        <td className="px-3 py-2">
                          <Badge style={{ background: typeColor + "20", color: typeColor, border: `1px solid ${typeColor}40` }}>
                            {TYPE_LABELS[e.type] ?? e.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-sm font-semibold"
                          style={{ color: e.confidence > 0.7 ? "#10b981" : e.confidence > 0.4 ? "#f59e0b" : "#94a3b8" }}>
                          {(e.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 capitalize">
                          {e.source === "uniprot" ? "UniProt annotation" : "Heuristic (von Heijne)"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">No proteins in this category.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
