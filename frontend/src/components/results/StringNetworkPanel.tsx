import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

cytoscape.use(fcose);

interface Interaction { source: string; target: string; score: number; }
interface StringData {
  interactions: Interaction[];
  nodes: string[];
  id_map: Record<string, string>;
}

interface Props { result: Result; }

export function StringNetworkPanel({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "string"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "string"),
  });

  const stringData = raw as StringData | undefined;
  const summary = result.summary as Record<string, number>;

  // Reverse id_map: stringId → uniprotId
  const reverseMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [uni, sid] of Object.entries(stringData?.id_map ?? {})) {
      m[sid] = uni;
    }
    return m;
  }, [stringData]);

  // Calculate hub proteins (degree centrality)
  const hubs = useMemo(() => {
    if (!stringData?.interactions) return [];
    const degree: Record<string, number> = {};
    for (const { source, target } of stringData.interactions) {
      degree[source] = (degree[source] ?? 0) + 1;
      degree[target] = (degree[target] ?? 0) + 1;
    }
    return Object.entries(degree)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([sid, deg]) => ({ id: reverseMap[sid] ?? sid, degree: deg }));
  }, [stringData, reverseMap]);

  // Score distribution
  const scoreHistOption = useMemo(() => {
    if (!stringData?.interactions?.length) return null;
    const bins = [0, 0, 0, 0, 0]; // 0-200, 200-400, 400-600, 600-800, 800-1000
    for (const { score } of stringData.interactions) {
      bins[Math.min(Math.floor(score / 200), 4)]++;
    }
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: ["0-200", "200-400", "400-600", "600-800", "800-1000"], name: "Score" },
      yAxis: { type: "value", name: "Edges" },
      series: [{ type: "bar", data: bins, itemStyle: { color: "#0ea5e9" } }],
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
    };
  }, [stringData]);

  // Build Cytoscape graph from top 100 edges by score
  useEffect(() => {
    if (!containerRef.current || !stringData?.interactions?.length) return;

    const topEdges = [...stringData.interactions]
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);

    const nodeSet = new Set<string>();
    for (const e of topEdges) { nodeSet.add(e.source); nodeSet.add(e.target); }

    const elements: cytoscape.ElementDefinition[] = [
      ...[...nodeSet].map((id) => ({
        data: { id, label: reverseMap[id] ?? id },
      })),
      ...topEdges.map((e, i) => ({
        data: { id: `e${i}`, source: e.source, target: e.target, weight: e.score },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#0ea5e9",
            label: "data(label)",
            "font-size": 7,
            color: "#1e293b",
            "text-valign": "center",
            "text-halign": "center",
            width: 18,
            height: 18,
          },
        },
        {
          selector: "edge",
          style: {
            "line-color": "#94a3b8",
            width: 1,
            opacity: 0.5,
          },
        },
      ],
      layout: { name: "fcose" } as never,
    });

    return () => cy.destroy();
  }, [stringData, reverseMap]);

  return (
    <div className="space-y-4">
      {/* Stats */}
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
            {/* Hub proteins */}
            {hubs.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Top Hub Proteins</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Protein</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Connections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubs.map((h) => (
                        <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-primary-700">{h.id}</td>
                          <td className="px-3 py-2 text-right font-bold">{h.degree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Score distribution */}
            {scoreHistOption && (
              <Card>
                <CardHeader><CardTitle>Interaction Score Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ReactECharts option={scoreHistOption} style={{ height: 220 }} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cytoscape network */}
          <Card>
            <CardHeader>
              <CardTitle>
                Interaction Network
                <span className="text-sm font-normal text-gray-400 ml-2">
                  (top 100 edges by score)
                </span>
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
