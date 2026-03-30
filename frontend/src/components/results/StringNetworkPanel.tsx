import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useUniprotLookup } from "@/hooks/useUniprotLookup";
import type { Result } from "@/types";

cytoscape.use(fcose);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Interaction { source: string; target: string; score: number; }
interface StringData { interactions: Interaction[]; nodes: string[]; id_map: Record<string, string>; }
interface NodeDetail {
  sid: string; accession: string; label: string; protein_name: string;
  degree: number; cluster: number;
  topInteractors: { sid: string; accession: string; gene: string; score: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6",
];
const UNASSIGNED_COLOR = "#94a3b8";
const SCORE_BINS = ["0–200", "200–400", "400–600", "600–800", "800–1000"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeDegree(interactions: Interaction[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const { source, target } of interactions) {
    d[source] = (d[source] ?? 0) + 1;
    d[target] = (d[target] ?? 0) + 1;
  }
  return d;
}

function computeClusters(interactions: Interaction[]): Record<string, number> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) { const r = find(p); parent.set(x, r); return r; }
    return x;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const { source, target } of interactions) union(source, target);

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const g = groups.get(root) ?? [];
    g.push(id);
    groups.set(root, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const result: Record<string, number> = {};
  sorted.forEach((group, idx) => group.forEach(id => { result[id] = idx; }));
  return result;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: string[][]): string {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { result: Result; }

export function StringNetworkPanel({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const [scoreThreshold, setScoreThreshold] = useState(400);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [hiddenClusters, setHiddenClusters] = useState<Set<number>>(new Set());
  const [visibleEdges, setVisibleEdges] = useState(0);
  const [visibleNodes, setVisibleNodes] = useState(0);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [largeNetworkNotice, setLargeNetworkNotice] = useState(false);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "string"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "string"),
  });
  const { byAccession } = useUniprotLookup(result.job_id);

  const stringData = raw as StringData | undefined;

  // Reverse map: stringId → uniprotAcc
  const reverseMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [uni, sid] of Object.entries(stringData?.id_map ?? {})) m[sid] = uni;
    return m;
  }, [stringData]);

  // Degree, clusters, computed values
  const { degree, clusters, maxDegree, allNodes } = useMemo((): {
    degree: Record<string, number>;
    clusters: Record<string, number>;
    maxDegree: number;
    allNodes: string[];
  } => {
    if (!stringData?.interactions) return { degree: {}, clusters: {}, maxDegree: 1, allNodes: [] };
    const degree = computeDegree(stringData.interactions);
    const clusters = computeClusters(stringData.interactions);
    const maxDegree = Math.max(1, ...Object.values(degree));
    const nodeSet = new Set<string>();
    for (const { source, target } of stringData.interactions) { nodeSet.add(source); nodeSet.add(target); }
    return { degree, clusters, maxDegree, allNodes: [...nodeSet] };
  }, [stringData]);

  // Hub proteins (top 10 by degree)
  const hubs = useMemo(() => {
    return Object.entries(degree)
      .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10)
      .map(([sid, deg]) => {
        const acc = reverseMap[sid] ?? sid;
        const uni = byAccession[acc];
        return { sid, acc, gene: uni?.gene_name || acc, name: uni?.protein_name || "", degree: deg };
      });
  }, [degree, reverseMap, byAccession]);

  // Cluster summary for legend
  const clusterSummary = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const c of Object.values(clusters) as number[]) counts[c] = (counts[c] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8)
      .map(([idx, count]) => ({ idx: Number(idx), count, color: CLUSTER_COLORS[Number(idx)] ?? UNASSIGNED_COLOR }));
  }, [clusters]);

  // Score histogram
  const scoreHistOption = useMemo(() => {
    if (!stringData?.interactions?.length) return null;
    const counts = [0, 0, 0, 0, 0];
    for (const { score } of stringData.interactions) counts[Math.min(Math.floor(score / 200), 4)]++;
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: SCORE_BINS, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: "Edges", nameTextStyle: { fontSize: 10 } },
      series: [{ type: "bar", data: counts, itemStyle: { color: "#0ea5e9" } }],
      grid: { left: 40, right: 10, top: 10, bottom: 30 },
    };
  }, [stringData]);

  // ── Build & initialise Cytoscape ──────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || !stringData?.interactions?.length || !allNodes.length) return;

    const isLarge = allNodes.length > 300;
    const defaultThreshold = isLarge ? 700 : 400;
    setScoreThreshold(defaultThreshold);
    setLargeNetworkNotice(isLarge);

    const elements: cytoscape.ElementDefinition[] = [
      ...allNodes.map(sid => {
        const acc = reverseMap[sid] ?? sid;
        const uni = byAccession[acc];
        const deg = degree[sid] ?? 0;
        const clusterIdx = clusters[sid] ?? 9;
        const color = clusterIdx < 8 ? CLUSTER_COLORS[clusterIdx] : UNASSIGNED_COLOR;
        const size = Math.max(20, Math.min(60, 20 + (deg / maxDegree) * 40));
        return {
          data: {
            id: sid,
            label: uni?.gene_name || acc,
            accession: acc,
            gene_name: uni?.gene_name || "",
            protein_name: uni?.protein_name || "",
            degree: deg,
            cluster: clusterIdx,
            clusterColor: color,
            size,
          },
        };
      }),
      ...stringData.interactions.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          score: e.score,
          weight: e.score / 1000,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(clusterColor)",
            label: "data(label)",
            "font-size": "8px",
            color: "#0f172a",
            "text-valign": "center",
            "text-halign": "center",
            width: "data(size)",
            height: "data(size)",
            "font-weight": 600,
            "text-outline-color": "#ffffff",
            "text-outline-width": 1,
          } as cytoscape.Css.Node,
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "#fbbf24",
            "border-width": 4,
            "border-color": "#d97706",
            "z-index": 9999,
          } as cytoscape.Css.Node,
        },
        {
          selector: "node.search-hit",
          style: {
            "background-color": "#fbbf24",
            "border-width": 3,
            "border-color": "#d97706",
          } as cytoscape.Css.Node,
        },
        {
          selector: "node.dimmed",
          style: { opacity: 0.1 } as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            "line-color": "#94a3b8",
            width: "mapData(weight, 0.4, 1.0, 1, 4)" as unknown as number,
            opacity: "mapData(score, 400, 1000, 0.25, 0.85)" as unknown as number,
            "curve-style": "straight",
          } as cytoscape.Css.Edge,
        },
        {
          selector: "edge.hidden",
          style: { display: "none" } as cytoscape.Css.Edge,
        },
      ],
      layout: {
        name: "fcose",
        quality: isLarge ? "default" : "proof",
        randomize: true,
        animate: true,
        animationDuration: isLarge ? 500 : 1000,
        idealEdgeLength: 50,
        nodeRepulsion: 4500,
        nodeSeparation: 75,
        packComponents: true,
        stop: () => setLayoutRunning(false),
      } as unknown as cytoscape.LayoutOptions,
    });

    setLayoutRunning(true);

    // Apply initial threshold
    cy.batch(() => {
      cy.edges().forEach(e => {
        e.toggleClass("hidden", e.data("score") < defaultThreshold);
      });
    });

    // Hover: dim non-neighbours
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target as cytoscape.NodeSingular;
      const neighbors = node.neighborhood();
      cy.elements().not(neighbors).not(node).addClass("dimmed");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("dimmed"));

    // Click: show detail panel
    cy.on("tap", "node", (evt) => {
      const node = evt.target as cytoscape.NodeSingular;
      const sid = node.id();
      const acc = reverseMap[sid] ?? sid;
      const uni = byAccession[acc];
      const neighbors = node.neighborhood("node");
      const topInteractors = neighbors
        .toArray()
        .map((nb) => {
          const nbSid = (nb as cytoscape.NodeSingular).id();
          const edge = node.edgesWith(nb as cytoscape.NodeSingular).first();
          return {
            sid: nbSid,
            accession: reverseMap[nbSid] ?? nbSid,
            gene: (nb as cytoscape.NodeSingular).data("gene_name") || nbSid,
            score: edge.data("score") as number ?? 0,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      setSelectedNode({
        sid, accession: acc,
        label: uni?.gene_name || acc,
        protein_name: uni?.protein_name || "",
        degree: node.data("degree") as number,
        cluster: node.data("cluster") as number,
        topInteractors,
      });
    });

    // Click background → deselect
    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelectedNode(null);
    });

    // Update counts after layout
    const updateCounts = () => {
      const visE = cy.edges().filter(e => !e.hasClass("hidden")).length;
      const visN = cy.nodes().filter(n => !n.hasClass("hidden")).length;
      setVisibleEdges(visE);
      setVisibleNodes(visN);
    };
    cy.on("layoutstop", updateCounts);
    updateCounts();

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [stringData, allNodes, reverseMap, byAccession, degree, clusters, maxDegree]);

  // ── Score threshold slider ────────────────────────────────────────────────

  const handleThresholdChange = useCallback((value: number) => {
    setScoreThreshold(value);
    if (!cyRef.current) return;
    cyRef.current.batch(() => {
      cyRef.current!.edges().forEach(e => {
        e.toggleClass("hidden", e.data("score") < value);
      });
    });
    const visE = cyRef.current.edges().filter(e => !e.hasClass("hidden")).length;
    setVisibleEdges(visE);
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    if (!cyRef.current || !searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();
    cyRef.current.nodes().removeClass("search-hit");
    const found = cyRef.current.nodes().filter(n =>
      (n.data("label") as string).toLowerCase().includes(q) ||
      (n.data("accession") as string).toLowerCase().includes(q)
    );
    if (found.length > 0) {
      found.addClass("search-hit");
      cyRef.current.fit(found, 80);
    }
  }, [searchQuery]);

  // ── Cluster toggle ────────────────────────────────────────────────────────

  const handleClusterToggle = useCallback((clusterIdx: number) => {
    setHiddenClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterIdx)) next.delete(clusterIdx);
      else next.add(clusterIdx);
      if (cyRef.current) {
        cyRef.current.batch(() => {
          cyRef.current!.nodes().forEach(n => {
            const c = n.data("cluster") as number;
            if (next.has(c)) {
              n.style({ "background-color": "#e5e7eb", opacity: 0.15 });
            } else {
              n.style({ "background-color": n.data("clusterColor") as string, opacity: 1 });
            }
          });
        });
      }
      return next;
    });
  }, []);

  // ── Legend cluster highlight ───────────────────────────────────────────────

  const handleLegendHover = useCallback((clusterIdx: number | null) => {
    if (!cyRef.current) return;
    if (clusterIdx === null) {
      cyRef.current.nodes().removeClass("dimmed");
      return;
    }
    cyRef.current.nodes().forEach(n => {
      n.toggleClass("dimmed", n.data("cluster") !== clusterIdx);
    });
  }, []);

  // ── Reset / Fit ───────────────────────────────────────────────────────────

  const handleResetLayout = useCallback(() => {
    if (!cyRef.current) return;
    setLayoutRunning(true);
    cyRef.current.layout({
      name: "fcose",
      quality: "default",
      randomize: true,
      animate: true,
      animationDuration: 800,
      stop: () => setLayoutRunning(false),
    } as unknown as cytoscape.LayoutOptions).run();
  }, []);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 40);
  }, []);

  // ── Exports ───────────────────────────────────────────────────────────────

  const handleDownloadPNG = useCallback(() => {
    if (!cyRef.current) return;
    const png = cyRef.current.png({ scale: 3, full: true, bg: "#ffffff" });
    const a = document.createElement("a");
    a.href = png; a.download = "secretome_network.png"; a.click();
  }, []);

  const handleDownloadNodeCSV = useCallback(() => {
    if (!cyRef.current) return;
    const rows: string[][] = [["accession", "gene_name", "protein_name", "degree", "cluster"]];
    cyRef.current.nodes().forEach(n => {
      rows.push([n.data("accession"), n.data("gene_name"), n.data("protein_name"), String(n.data("degree")), String(n.data("cluster"))]);
    });
    downloadBlob(toCSV(rows), "network_nodes.csv", "text/csv");
  }, []);

  const handleDownloadEdgeCSV = useCallback(() => {
    if (!cyRef.current || !stringData) return;
    const rows: string[][] = [["protein_a", "gene_a", "protein_b", "gene_b", "score"]];
    cyRef.current.edges().forEach(e => {
      const srcAcc = reverseMap[e.data("source") as string] ?? e.data("source");
      const tgtAcc = reverseMap[e.data("target") as string] ?? e.data("target");
      rows.push([
        srcAcc, byAccession[srcAcc]?.gene_name || srcAcc,
        tgtAcc, byAccession[tgtAcc]?.gene_name || tgtAcc,
        String(e.data("score")),
      ]);
    });
    downloadBlob(toCSV(rows), "network_edges.csv", "text/csv");
  }, [stringData, reverseMap, byAccession]);

  // ─────────────────────────────────────────────────────────────────────────

  const nodeCount = stringData?.nodes?.length ?? 0;
  const edgeCount = stringData?.interactions?.length ?? 0;
  const density = nodeCount > 1
    ? ((edgeCount / (nodeCount * (nodeCount - 1) / 2)) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Nodes", value: visibleNodes || nodeCount },
          { label: "Edges (visible)", value: visibleEdges || edgeCount },
          { label: "Network Density", value: `${density}%` },
        ].map(({ label, value }) => (
          <Card key={label} className="text-center">
            <CardContent className="py-4">
              <div className="text-2xl font-bold text-primary-700">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {largeNetworkNotice && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Large network detected ({nodeCount} nodes). Showing high-confidence edges only (score ≥ 700). Use slider to show more.
            </div>
          )}

          {/* Main network area */}
          <div className="flex gap-3">
            {/* Left controls panel */}
            <Card className="w-52 flex-shrink-0">
              <CardContent className="p-3 space-y-4">
                {/* Score threshold */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Score threshold: {scoreThreshold}
                  </label>
                  <input
                    type="range" min={400} max={1000} step={50}
                    value={scoreThreshold}
                    onChange={e => handleThresholdChange(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>400</span><span>1000</span>
                  </div>
                </div>

                {/* Search */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Search gene</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSearch()}
                      placeholder="e.g. BDNF"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleSearch}
                      className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
                    >→</button>
                  </div>
                </div>

                {/* Cluster filter */}
                {clusterSummary.length > 1 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-1">Clusters</div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {clusterSummary.map(({ idx, count, color }) => (
                        <label key={idx} className="flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={!hiddenClusters.has(idx)}
                            onChange={() => handleClusterToggle(idx)}
                            className="rounded"
                          />
                          <span
                            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-gray-600">Cluster {idx + 1}</span>
                          <span className="text-gray-400 ml-auto">{count}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layout buttons */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Layout</div>
                  <button
                    onClick={handleResetLayout}
                    disabled={layoutRunning}
                    className="w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 rounded disabled:opacity-50"
                  >
                    {layoutRunning ? "Running…" : "↺ Reset Layout"}
                  </button>
                  <button
                    onClick={handleFit}
                    className="w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1.5 rounded"
                  >
                    ⊞ Fit to Screen
                  </button>
                </div>

                {/* Export */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Export</div>
                  <button
                    onClick={handleDownloadPNG}
                    className="w-full text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1.5 rounded"
                  >
                    ↓ PNG (3×)
                  </button>
                  <button
                    onClick={handleDownloadNodeCSV}
                    className="w-full text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1.5 rounded"
                  >
                    ↓ Nodes CSV
                  </button>
                  <button
                    onClick={handleDownloadEdgeCSV}
                    className="w-full text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1.5 rounded"
                  >
                    ↓ Edges CSV
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Cytoscape canvas */}
            <div className="flex-1 min-w-0">
              <div
                ref={containerRef}
                className="w-full rounded-lg border border-gray-200 bg-gray-50"
                style={{ height: 520 }}
              />
            </div>

            {/* Right: node detail panel */}
            <div className="w-52 flex-shrink-0">
              {selectedNode ? (
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      <span className="text-primary-700 font-bold">{selectedNode.label}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3 text-xs">
                    <div>
                      <div className="text-gray-500 mb-0.5">UniProt</div>
                      <a
                        href={`https://www.uniprot.org/uniprotkb/${selectedNode.accession}`}
                        target="_blank" rel="noreferrer"
                        className="text-primary-600 hover:underline font-mono"
                      >
                        {selectedNode.accession}
                      </a>
                    </div>
                    {selectedNode.protein_name && (
                      <div>
                        <div className="text-gray-500 mb-0.5">Protein</div>
                        <div className="text-gray-800 leading-tight">{selectedNode.protein_name}</div>
                      </div>
                    )}
                    <div className="flex gap-4">
                      <div>
                        <div className="text-gray-500">Degree</div>
                        <div className="font-bold text-gray-900">{selectedNode.degree}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Cluster</div>
                        <div className="flex items-center gap-1">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ background: selectedNode.cluster < 8 ? CLUSTER_COLORS[selectedNode.cluster] : UNASSIGNED_COLOR }}
                          />
                          <span className="font-bold text-gray-900">{selectedNode.cluster + 1}</span>
                        </div>
                      </div>
                    </div>
                    {selectedNode.topInteractors.length > 0 && (
                      <div>
                        <div className="text-gray-500 mb-1">Top Interactors</div>
                        <div className="space-y-1">
                          {selectedNode.topInteractors.map((ti) => (
                            <div key={ti.sid} className="flex justify-between items-center bg-gray-50 rounded px-1.5 py-0.5">
                              <span className="font-semibold text-gray-800">{ti.gene}</span>
                              <span className="text-gray-500">{ti.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="w-full text-xs text-gray-400 hover:text-gray-600 mt-2"
                    >
                      ✕ Close
                    </button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-full border-dashed">
                  <CardContent className="flex items-center justify-center h-full text-xs text-gray-400 text-center p-4">
                    Click any node to see protein details
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Cluster legend */}
          {clusterSummary.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Functional Clusters
                  <span className="text-xs font-normal text-gray-400 ml-2">— hover to highlight cluster in network</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {clusterSummary.map(({ idx, count, color }) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                      onMouseEnter={() => handleLegendHover(idx)}
                      onMouseLeave={() => handleLegendHover(null)}
                    >
                      <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-medium text-gray-700">Cluster {idx + 1}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{count} proteins</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hub proteins + Score histogram */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hubs.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Top Hub Proteins</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Gene</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 hidden lg:table-cell">Protein</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Accession</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Degree</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubs.map(h => (
                        <tr
                          key={h.sid}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            if (!cyRef.current) return;
                            const node = cyRef.current.nodes(`#${CSS.escape(h.sid)}`);
                            cyRef.current.fit(node, 80);
                            node.select();
                          }}
                        >
                          <td className="px-3 py-2 font-semibold">{h.gene}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">{h.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-primary-700">
                            <a href={`https://www.uniprot.org/uniprotkb/${h.acc}`} target="_blank" rel="noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                              {h.acc}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{h.degree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {scoreHistOption && (
              <Card>
                <CardHeader><CardTitle>Score Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ReactECharts option={scoreHistOption} style={{ height: 220 }} />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
