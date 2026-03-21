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

interface GprofilerResult {
  source: string;
  term_id: string;
  term_name: string;
  p_value: number;
  significant: boolean;
  intersection_size: number;
  query_size: number;
  term_size: number;
  genes: string[];   // intersections flattened to single gene list
}

interface GprofilerData { results: GprofilerResult[]; }

const SOURCE_COLORS: Record<string, string> = {
  "GO:BP": "#0ea5e9", "GO:MF": "#8b5cf6", "GO:CC": "#10b981",
  "KEGG": "#f59e0b",  "REAC": "#ef4444",
};
const SOURCE_LABELS: Record<string, string> = {
  "GO:BP": "GO Biological Process", "GO:MF": "GO Molecular Function",
  "GO:CC": "GO Cellular Component", "KEGG": "KEGG", "REAC": "Reactome",
};

interface ModalState { title: string; subtitle: string; genes: string[]; termId: string; source: string; }
interface Props { result: Result; }

function termDbUrl(termId: string, source: string): string {
  if (source.startsWith("GO:")) return `https://www.ebi.ac.uk/QuickGO/term/${termId}`;
  if (source === "KEGG") return `https://www.kegg.jp/pathway/${termId.replace("KEGG:", "")}`;
  if (source === "REAC") return `https://reactome.org/content/detail/${termId}`;
  if (source === "WP") return `https://www.wikipathways.org/pathways/${termId}`;
  return `https://www.ebi.ac.uk/QuickGO/term/${termId}`;
}

export function EnrichmentPanel({ result }: Props) {
  const [activeSource, setActiveSource] = useState("ALL");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "gprofiler"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "gprofiler"),
  });
  const { toRows } = useUniprotLookup(result.job_id);

  const allTerms: GprofilerResult[] = useMemo(() => {
    return (raw as GprofilerData | undefined)?.results ?? [];
  }, [raw]);

  const sources = useMemo(
    () => ["ALL", ...Array.from(new Set(allTerms.map((t) => t.source)))],
    [allTerms]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allTerms
      .filter((t) => t.significant)
      .filter((t) => activeSource === "ALL" || t.source === activeSource)
      .filter((t) => !q || t.term_name.toLowerCase().includes(q) || t.term_id.toLowerCase().includes(q))
      .sort((a, b) => a.p_value - b.p_value);
  }, [allTerms, activeSource, search]);

  const top20 = filtered.slice(0, 20);

  // Reversed list for chart (bottom-up display)
  const chartTerms = useMemo(() => [...top20].reverse(), [top20]);

  const openModal = (term: GprofilerResult) => {
    const geneCount = (term.genes ?? []).length || term.intersection_size;
    setModal({
      title: term.term_name,
      subtitle: `${term.term_id} · ${SOURCE_LABELS[term.source] ?? term.source} · p = ${term.p_value.toExponential(2)} · ${geneCount} proteins`,
      genes: term.genes ?? [],
      termId: term.term_id,
      source: term.source,
    });
  };

  const chartOption = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        return `${p.name}<br/>-log₁₀(p) = ${p.value.toFixed(2)}<br/><span style="color:#94a3b8;font-size:11px">Click to see proteins</span>`;
      },
    },
    grid: { left: 220, right: 30, top: 10, bottom: 30 },
    xAxis: { type: "value", name: "-log₁₀(p-value)" },
    yAxis: {
      type: "category",
      data: chartTerms.map((t) => t.term_name.slice(0, 42)),
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: "bar",
      cursor: "pointer",
      data: chartTerms.map((t) => ({
        value: parseFloat((-Math.log10(t.p_value)).toFixed(2)),
        itemStyle: { color: SOURCE_COLORS[t.source] ?? "#64748b" },
      })),
    }],
  }), [chartTerms]);

  const handleChartClick = (params: { dataIndex: number }) => {
    const term = chartTerms[params.dataIndex];
    if (term) openModal(term);
  };

  const handleRowClick = (term: GprofilerResult) => openModal(term);

  const handleDownloadJson = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `gprofiler_${result.job_id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (!filtered.length) return;
    const header = "source,term_id,term_name,p_value,intersection_size,query_size,gene_ratio";
    const rows = filtered.map((t) => {
      const ratio = t.query_size > 0 ? (t.intersection_size / t.query_size).toFixed(4) : "";
      return [t.source, t.term_id, `"${t.term_name.replace(/"/g, '""')}"`, t.p_value, t.intersection_size, t.query_size, ratio].join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `gprofiler_${result.job_id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const summary = result.summary as { term_count: number };

  return (
    <div className="space-y-4">
      {modal && (
        <ProteinListModal
          title={modal.title}
          subtitle={modal.subtitle}
          proteins={toRows(modal.genes)}
          onClose={() => setModal(null)}
          headerExtra={
            <a
              href={termDbUrl(modal.termId, modal.source)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-600 hover:underline"
            >
              View in database ↗
            </a>
          }
          emptyFallback={
            modal.genes.length === 0
              ? `This term has ${modal.subtitle.match(/(\d+) proteins/)?.[1] ?? "some"} proteins from your set. Re-run analysis to see the gene list.`
              : undefined
          }
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center">
          <CardContent className="py-5">
            <div className="text-3xl font-bold text-primary-700">{summary.term_count}</div>
            <div className="text-sm text-gray-500 mt-1">Significant terms (FDR &lt; 0.05)</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="py-5">
            <div className="text-3xl font-bold text-primary-700">{filtered.length}</div>
            <div className="text-sm text-gray-500 mt-1">
              {activeSource === "ALL" ? "All sources" : SOURCE_LABELS[activeSource] ?? activeSource}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source filter */}
      <div className="flex gap-1 flex-wrap">
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              activeSource === src ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            style={activeSource === src ? { background: SOURCE_COLORS[src] ?? "#64748b" } : {}}
          >
            {src === "ALL" ? "All" : SOURCE_LABELS[src] ?? src}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          {top20.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top {top20.length} Enriched Terms
                  <span className="text-xs font-normal text-gray-400 ml-2">— click bar to see proteins</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReactECharts
                  option={chartOption}
                  style={{ height: Math.max(260, top20.length * 22) }}
                  onEvents={{ click: handleChartClick }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>All Significant Terms
                  <span className="text-xs font-normal text-gray-400 ml-2">— click row to see proteins</span>
                </CardTitle>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="Search terms…" value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                  <button onClick={handleDownloadJson} className="text-xs text-primary-600 hover:underline">↓ JSON</button>
                  <button onClick={handleDownloadCsv} className="text-xs text-primary-600 hover:underline">↓ CSV</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Term</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">p-value</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Genes</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Gene Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((t) => (
                    <tr
                      key={t.term_id}
                      onClick={() => handleRowClick(t)}
                      className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer"
                    >
                      <td className="px-3 py-1.5">
                        <Badge variant="secondary" style={{ background: SOURCE_COLORS[t.source] + "20", color: SOURCE_COLORS[t.source] }}>
                          {t.source}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-gray-800">
                        <span className="font-mono text-gray-400 mr-1">{t.term_id}</span>
                        {t.term_name}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-gray-600">{t.p_value.toExponential(2)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{t.intersection_size}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">
                        {t.query_size > 0 ? `${((t.intersection_size / t.query_size) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">No significant terms found.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
