import { useEffect, useRef, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ProteinListModal } from "./ProteinListModal";
import { useUniprotLookup } from "@/hooks/useUniprotLookup";
import type { Result } from "@/types";

cytoscape.use(fcose);

interface Interaction { source: string; target: string; score: number; }
interface StringData  { interactions: Interaction[]; nodes: string[]; id_map: Record<string, string>; }

interface ModalState { title: string; subtitle?: string; proteins: string[]; }
interface Props { result: Result; }

const SCORE_BINS = ["0–200", "200–400", "400–600", "600–800", "800–1000"];

export function StringNetworkPanel({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "string"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "string"),
  });
  const { toRows } = useUniprotLookup(result.job_id);

  const stringData = raw as StringData | undefined;
  const summary = result.summary as Record<string, number>;

  // Reverse map: stringId → uniprotId
  const reverseMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [uni, sid] of Object.entries(stringData?.id_map ?? {})) m[sid] = uni;
    return m;
  }, [stringData]);

  // Hub proteins (degree centrality)
  const hubs = useMemo(() => {
    if (!stringData?.interactions) return [];
    const degree: Record<string, number> = {};
    for (const { source, target } of stringData.interactions) {
      degree[source] = (degree[source] ?? 0) + 1;
      degree[target] = (degree[target] ?? 0) + 1;
    }
    return Object.entries(degree)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([sid, deg]) => ({ sid, id: reverseMap[sid] ?? sid, degree: deg }));
  }, [stringData, reverseMap]);

  // Proteins in each score bin
  const binProteins = useMemo((): string[][] => {
    const bins: Set<string>[] = Array.from({ length: 5 }, () => new Set());
    for (const { source, target, score } of stringData?.interactions ?? []) {
      const bin = Math.min(Math.floor(score / 200), 4);
      const src = reverseMap[source] ?? source;
      const tgt = reverseMap[target] ?? target;
      bins[bin].add(src);
      bins[bin].add(tgt);
    }
    return bins.map((s) => [...s]);
  }, [stringData, reverseMap]);

  const scoreHistOption = useMemo(() => {
    if (!stringData?.interactions?.length) return null;
    const counts = [0, 0, 0, 0, 0];
    for (const { score } of stringData.interactions) counts[Math.min(Math.floor(score / 200), 4)]++;
    return {
      tooltip: {
        trigger: "axis",
        formatter: (p: { name: string; value: number }[]) =>
          `Score ${p[0].name}: ${p[0].value} edges<br/><span style="color:#94a3b8;font-size:11px">Click to see proteins</span>`,
      },
      xAxis: { type: "category", data: SCORE_BINS, name: "Score" },
      yAxis: { type: "value", name: "Edges" },
      series: [{ type: "bar", cursor: "pointer", data: counts, itemStyle: { color: "#0ea5e9" } }],
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
    };
  }, [stringData]);

  const handleScoreBinClick = (params: { dataIndex: number; name: string }) => {
    const accs = binProteins[params.dataIndex] ?? [];
    setModal({ title: `Proteins in score range ${params.name}`, subtitle: `${accs.length} unique proteins`, proteins: accs });
  };

  // Build Cytoscape network
  useEffect(() => {
    if (!containerRef.current || !stringData?.interactions?.length) return;
    const topEdges = [...stringData.interactions].sort((a, b) => b.score - a.score).slice(0, 100);
    const nodeSet = new Set<string>();
    for (const e of topEdges) { nodeSet.add(e.source); nodeSet.add(e.target); }

    const elements: cytoscape.ElementDefinition[] = [
      ...[...nodeSet].map((id) => ({ data: { id, label: reverseMap[id] ?? id } })),
      ...topEdges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, weight: e.score } })),
    ];
    const cy = cytoscape({
      container: containerRef.current, elements,
      style: [
        { selector: "node", style: { "background-color": "#0ea5e9", label: "data(label)", "font-size": 7, color: "#1e293b", "text-valign": "center", "text-halign": "center", width: 18, height: 18 } },
        { selector: "edge", style: { "line-color": "#94a3b8", width: 1, opacity: 0.5 } },
      ],
      layout: { name: "fcose" } as never,
    });
    // Click on a node → show modal
    cy.on("tap", "node", (evt) => {
      const sid = evt.target.id();
      const acc = reverseMap[sid] ?? sid;
      setModal({ title: `Interactions for ${acc}`, subtitle: `Click protein to open UniProt`, proteins: [acc] });
    });
    return () => cy.destroy();
  }, [stringData, reverseMap]);

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

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(summary).map(([k, v]) => (
          <Card key={k} className="text-center">
            <CardContent className="py-5">
              <div className="text-3xl font-bold text-primary-700">{v}</div>
              <div className="text-sm text-gray-500 mt-1 capitalize">{k.replace(/_/g, " ")}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hubs.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Top Hub Proteins</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Accession</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Gene</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 hidden lg:table-cell">Protein</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Connections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubs.map((h) => {
                        const row = toRows([h.id])[0];
                        return (
                          <tr key={h.sid} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs text-primary-700">
                              <a href={`https://www.uniprot.org/uniprotkb/${h.id}`} target="_blank" rel="noreferrer" className="hover:underline">{h.id}</a>
                            </td>
                            <td className="px-3 py-2 font-semibold">{row.gene_name || "—"}</td>
                            <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">{row.protein_name || "—"}</td>
                            <td className="px-3 py-2 text-right font-bold">{h.degree}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {scoreHistOption && (
              <Card>
                <CardHeader>
                  <CardTitle>Score Distribution
                    <span className="text-xs font-normal text-gray-400 ml-2">— click bar to see proteins</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ReactECharts option={scoreHistOption} style={{ height: 220 }} onEvents={{ click: handleScoreBinClick }} />
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Interaction Network
                <span className="text-sm font-normal text-gray-400 ml-2">(top 100 edges · click node for details)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={containerRef} className="w-full h-96 rounded bg-gray-50" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
