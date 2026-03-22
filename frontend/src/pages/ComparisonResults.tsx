import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactPlotly from "react-plotly.js";
import { jobsApi } from "@/api/jobs";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

// ── Type helpers ──────────────────────────────────────────────────────────────

interface OverlapData {
  set_a_count: number; set_b_count: number;
  shared_count: number; unique_a_count: number; unique_b_count: number;
  jaccard_similarity: number;
  shared_proteins: ProteinRow[]; unique_a_proteins: ProteinRow[]; unique_b_proteins: ProteinRow[];
}
interface ProteinRow { accession: string; gene_name: string; protein_name: string; }
interface VolcanoData {
  x: number[]; y: number[]; labels: string[]; sources: string[];
  gene_count_a: number[]; gene_count_b: number[];
  colors: string[]; significant_count_a: number; significant_count_b: number;
}
interface PathwayTerm {
  term_id: string; term_name: string; source: string;
  p_val_a: number; p_val_b: number; log2fc: number;
  fisher_p_adjusted: number; significant: boolean; direction: string;
  gene_count_a: number; gene_count_b: number;
}
interface TherapeuticInd {
  name: string; label: string; score_a: number; score_b: number;
  delta: number; direction: string; interpretation: string;
}
interface SafetyDim { dimension: string; risk_a: string; risk_b: string; unique_flags_a: string[]; unique_flags_b: string[]; shared_flags: string[]; }
interface DiffData {
  set_a_label: string; set_b_label: string;
  overlap: OverlapData;
  pathway: { terms: PathwayTerm[]; volcano: VolcanoData };
  pca: { available: boolean; set_a_coords?: number[]; set_b_coords?: number[]; variance_explained?: number[] };
  therapeutic: { indications: TherapeuticInd[]; top_differentiated: string[]; shared_strengths: string[]; set_a_unique_strengths: string[]; set_b_unique_strengths: string[] };
  safety: { overall_risk_a: string; overall_risk_b: string; dimension_comparison: SafetyDim[]; safety_summary: string; radar_axes: string[]; radar_a: number[]; radar_b: number[] };
  expression: { shared_protein_expression: { gene_name: string; protein_name: string; conc_a_nm: number | null; conc_b_nm: number | null; expression_change: string }[]; };
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Protein Overlap", "Pathways", "Therapeutic", "Safety", "Expression", "Set A", "Set B"];

// ── Venn SVG ──────────────────────────────────────────────────────────────────

function VennDiagram({ overlap, labelA, labelB, onRegionClick, selected }: {
  overlap: OverlapData; labelA: string; labelB: string;
  onRegionClick: (region: "shared" | "unique_a" | "unique_b") => void;
  selected: string | null;
}) {
  const W = 420; const H = 220;
  const total = overlap.set_a_count + overlap.set_b_count - overlap.shared_count;
  const rA = Math.max(55, Math.min(90, 55 + (overlap.set_a_count / Math.max(total, 1)) * 35));
  const rB = Math.max(55, Math.min(90, 55 + (overlap.set_b_count / Math.max(total, 1)) * 35));
  const j = overlap.jaccard_similarity;
  // Center distance: tangent when j=0, overlap of 80% when j=1
  const d = Math.max(10, (rA + rB) * (1 - Math.min(j * 1.3, 0.85)));
  const cx = W / 2;
  const cy = H / 2;
  const cxA = cx - d / 2;
  const cxB = cx + d / 2;

  return (
    <svg width={W} height={H} className="mx-auto select-none">
      <defs>
        <clipPath id="clipA"><circle cx={cxA} cy={cy} r={rA} /></clipPath>
        <clipPath id="clipB"><circle cx={cxB} cy={cy} r={rB} /></clipPath>
      </defs>
      {/* Circle A */}
      <circle cx={cxA} cy={cy} r={rA}
        className="cursor-pointer transition-opacity"
        fill={selected === "unique_a" ? "#93c5fd" : "#bfdbfe"}
        fillOpacity={0.7} stroke="#3b82f6" strokeWidth={2}
        onClick={() => onRegionClick("unique_a")} />
      {/* Circle B */}
      <circle cx={cxB} cy={cy} r={rB}
        className="cursor-pointer transition-opacity"
        fill={selected === "unique_b" ? "#fdba74" : "#fed7aa"}
        fillOpacity={0.7} stroke="#f97316" strokeWidth={2}
        onClick={() => onRegionClick("unique_b")} />
      {/* Overlap region (drawn over both circles) */}
      <circle cx={cxB} cy={cy} r={rB} clipPath="url(#clipA)"
        className="cursor-pointer transition-opacity"
        fill={selected === "shared" ? "#c084fc" : "#e9d5ff"}
        fillOpacity={0.85} stroke="none"
        onClick={() => onRegionClick("shared")} />
      {/* Labels */}
      <text x={cxA - d * 0.3} y={cy} textAnchor="middle" dy="0.35em"
        fontSize={12} fontWeight={700} fill="#1d4ed8" className="pointer-events-none">
        {overlap.unique_a_count}
      </text>
      <text x={cx} y={cy} textAnchor="middle" dy="0.35em"
        fontSize={12} fontWeight={700} fill="#6b21a8" className="pointer-events-none">
        {overlap.shared_count}
      </text>
      <text x={cxB + d * 0.3} y={cy} textAnchor="middle" dy="0.35em"
        fontSize={12} fontWeight={700} fill="#c2410c" className="pointer-events-none">
        {overlap.unique_b_count}
      </text>
      {/* Set labels below circles */}
      <text x={cxA} y={cy + rA + 18} textAnchor="middle" fontSize={11} fill="#374151">
        {labelA} ({overlap.set_a_count})
      </text>
      <text x={cxB} y={cy + rB + 18} textAnchor="middle" fontSize={11} fill="#374151">
        {labelB} ({overlap.set_b_count})
      </text>
    </svg>
  );
}

// ── Protein table ─────────────────────────────────────────────────────────────

function ProteinTable({ proteins, downloadName }: { proteins: ProteinRow[]; downloadName: string }) {
  const [search, setSearch] = useState("");
  const filtered = proteins.filter(p =>
    !search || p.gene_name.toLowerCase().includes(search.toLowerCase()) || p.protein_name.toLowerCase().includes(search.toLowerCase())
  );
  const handleDownload = () => {
    const csv = ["Gene,Protein Name,Accession", ...filtered.map(p => `${p.gene_name},"${p.protein_name}",${p.accession}`)].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = downloadName; a.click();
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <button onClick={handleDownload} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">↓ CSV</button>
      </div>
      <div className="overflow-auto max-h-72 rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>{["Gene", "Protein Name", "Accession"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((p, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5 font-medium">{p.gene_name}</td>
                <td className="px-3 py-1.5 text-gray-600">{p.protein_name}</td>
                <td className="px-3 py-1.5 font-mono text-gray-400">
                  <a href={`https://uniprot.org/uniprot/${p.accession}`} target="_blank" rel="noreferrer" className="hover:text-blue-600">{p.accession}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{filtered.length} proteins{filtered.length < proteins.length && ` (showing filtered)`}</p>
    </div>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function OverviewTab({ diff }: { diff: DiffData }) {
  const { overlap, therapeutic, safety } = diff;
  const topInd = therapeutic.indications?.[0];
  const jaccardPct = Math.round(overlap.jaccard_similarity * 100);
  const jaccardLabel = jaccardPct >= 70 ? "High" : jaccardPct >= 40 ? "Moderate" : "Low";

  const cards = [
    { label: "Jaccard Similarity", value: overlap.jaccard_similarity.toFixed(2), sub: jaccardLabel },
    { label: "Shared Proteins", value: overlap.shared_count, sub: `of ${overlap.set_a_count + overlap.set_b_count - overlap.shared_count} unique` },
    { label: `Unique to ${diff.set_a_label}`, value: overlap.unique_a_count, sub: `${Math.round(overlap.unique_a_count / overlap.set_a_count * 100)}% of set A` },
    { label: `Unique to ${diff.set_b_label}`, value: overlap.unique_b_count, sub: `${Math.round(overlap.unique_b_count / overlap.set_b_count * 100)}% of set B` },
    { label: "Top Indication", value: topInd ? topInd.label : "—", sub: topInd ? `A:${topInd.score_a} B:${topInd.score_b}` : "" },
    { label: "Safety", value: `A: ${safety.overall_risk_a}`, sub: `B: ${safety.overall_risk_b}` },
  ];

  const autoText = [
    `${diff.set_a_label} and ${diff.set_b_label} share ${overlap.shared_count} proteins (Jaccard: ${overlap.jaccard_similarity.toFixed(2)} — ${jaccardLabel} similarity).`,
    overlap.unique_a_count > overlap.unique_b_count
      ? `${diff.set_a_label} has ${overlap.unique_a_count} unique proteins vs ${overlap.unique_b_count} in ${diff.set_b_label}.`
      : `${diff.set_b_label} has ${overlap.unique_b_count} unique proteins vs ${overlap.unique_a_count} in ${diff.set_a_label}.`,
    topInd && Math.abs(topInd.delta) > 5
      ? `${topInd.delta > 0 ? diff.set_a_label : diff.set_b_label} shows stronger ${topInd.label} potential (score difference: ${Math.abs(topInd.delta).toFixed(1)}).`
      : topInd ? `Both sets show comparable ${topInd.label} potential.` : "",
    safety.overall_risk_a === safety.overall_risk_b
      ? `Safety profiles are similar (${safety.overall_risk_a} risk for both).`
      : `Safety profiles differ: ${diff.set_a_label} is ${safety.overall_risk_a} risk; ${diff.set_b_label} is ${safety.overall_risk_b} risk.`,
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c, i) => (
          <Card key={i}>
            <CardContent className="py-4 text-center">
              <div className="text-xs text-gray-500 mb-1">{c.label}</div>
              <div className="text-xl font-bold text-gray-900">{c.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Key Findings</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 leading-relaxed">{autoText}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function OverlapTab({ diff }: { diff: DiffData }) {
  const [region, setRegion] = useState<"shared" | "unique_a" | "unique_b">("shared");
  const [subTab, setSubTab] = useState<"shared" | "unique_a" | "unique_b">("shared");
  const { overlap } = diff;
  const proteins = region === "shared" ? overlap.shared_proteins : region === "unique_a" ? overlap.unique_a_proteins : overlap.unique_b_proteins;
  const handleRegionClick = (r: "shared" | "unique_a" | "unique_b") => { setRegion(r); setSubTab(r); };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Protein Overlap</CardTitle>
            <span className="text-sm text-gray-500">Jaccard = {diff.overlap.jaccard_similarity.toFixed(3)}</span>
          </div>
        </CardHeader>
        <CardContent>
          <VennDiagram overlap={overlap} labelA={diff.set_a_label} labelB={diff.set_b_label} onRegionClick={handleRegionClick} selected={region} />
          <p className="text-xs text-center text-gray-400 mt-2">Click a region to explore proteins</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex gap-1">
            {(["shared", "unique_a", "unique_b"] as const).map(t => {
              const count = t === "shared" ? overlap.shared_count : t === "unique_a" ? overlap.unique_a_count : overlap.unique_b_count;
              const label = t === "shared" ? `Shared (${count})` : t === "unique_a" ? `Only in ${diff.set_a_label} (${count})` : `Only in ${diff.set_b_label} (${count})`;
              return (
                <button key={t} onClick={() => { setSubTab(t); setRegion(t); }}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${subTab === t ? "bg-primary-100 text-primary-700" : "text-gray-500 hover:text-gray-700"}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ProteinTable proteins={proteins} downloadName={`${subTab}_proteins.csv`} />
        </CardContent>
      </Card>
    </div>
  );
}

function PathwaysTab({ diff }: { diff: DiffData }) {
  const { pathway } = diff;
  const volcano = pathway.volcano;
  const [filter, setFilter] = useState<"all" | "A" | "B" | "both">("all");
  const [search, setSearch] = useState("");

  const filteredTerms = (pathway.terms || []).filter(t => {
    if (filter === "A" && t.direction !== "A_enriched") return false;
    if (filter === "B" && t.direction !== "B_enriched") return false;
    if (filter === "both" && t.direction !== "both") return false;
    if (search && !t.term_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const colorMap: Record<string, string> = { A_enriched: "#ef4444", B_enriched: "#3b82f6", ns: "#9ca3af" };
  const plotColors = (volcano.colors || []).map(c => colorMap[c] || "#9ca3af");

  return (
    <div className="space-y-6">
      {volcano.x?.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pathway Enrichment Volcano</CardTitle>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-red-500 font-medium">▲ {volcano.significant_count_a} enriched in {diff.set_a_label}</span>
                <span className="text-blue-500 font-medium">▼ {volcano.significant_count_b} enriched in {diff.set_b_label}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ReactPlotly
              data={[{
                x: volcano.x, y: volcano.y, text: volcano.labels,
                mode: "markers",
                marker: { color: plotColors, size: 7, opacity: 0.8 },
                hovertemplate: "<b>%{text}</b><br>log2FC: %{x:.2f}<br>-log10(p): %{y:.2f}<extra></extra>",
                type: "scatter",
              }]}
              layout={{
                height: 350, margin: { l: 55, r: 20, t: 20, b: 45 },
                xaxis: { title: { text: "log2(fold change)" }, zeroline: true, zerolinecolor: "#e5e7eb" },
                yaxis: { title: { text: "-log10(adjusted p)" } },
                shapes: [
                  { type: "line", x0: 1, x1: 1, y0: 0, y1: 1, yref: "paper", line: { color: "#fca5a5", dash: "dash" } },
                  { type: "line", x0: -1, x1: -1, y0: 0, y1: 1, yref: "paper", line: { color: "#93c5fd", dash: "dash" } },
                  { type: "line", x0: 0, x1: 1, xref: "paper", y0: 1.301, y1: 1.301, line: { color: "#d1d5db", dash: "dot" } },
                ],
                plot_bgcolor: "white", paper_bgcolor: "white",
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2 items-center">
            <CardTitle>Enrichment Table</CardTitle>
            <div className="flex gap-1 ml-auto">
              {(["all", "A", "B", "both"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${filter === f ? "bg-primary-100 text-primary-700" : "text-gray-500 hover:text-gray-700"}`}>
                  {f === "all" ? "All" : f === "A" ? `↑ ${diff.set_a_label}` : f === "B" ? `↑ ${diff.set_b_label}` : "Both"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <input type="text" placeholder="Search terms..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <div className="overflow-auto max-h-80 rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["Term", "Source", `p (${diff.set_a_label})`, `p (${diff.set_b_label})`, "log2FC", "Direction"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTerms.slice(0, 200).map((t, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 max-w-48 truncate" title={t.term_name}>{t.term_name}</td>
                    <td className="px-3 py-1.5 text-gray-400">{t.source}</td>
                    <td className="px-3 py-1.5 font-mono">{t.p_val_a.toExponential(2)}</td>
                    <td className="px-3 py-1.5 font-mono">{t.p_val_b.toExponential(2)}</td>
                    <td className={`px-3 py-1.5 font-mono font-medium ${t.log2fc > 1 ? "text-red-600" : t.log2fc < -1 ? "text-blue-600" : "text-gray-500"}`}>
                      {t.log2fc.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5">
                      {t.direction === "A_enriched" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">↑ {diff.set_a_label}</span>
                      )}
                      {t.direction === "B_enriched" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">↑ {diff.set_b_label}</span>
                      )}
                      {t.direction === "both" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Both</span>
                      )}
                      {t.direction === "neither" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">~</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">{filteredTerms.length} terms</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TherapeuticTab({ diff }: { diff: DiffData }) {
  const { therapeutic } = diff;
  const inds = therapeutic.indications || [];
  const indNames = inds.map(i => i.label);
  const scoresA = inds.map(i => i.score_a);
  const scoresB = inds.map(i => i.score_b);
  const deltas = inds.map(i => i.delta);

  return (
    <div className="space-y-6">
      {inds.length > 0 && (
        <>
          <Card>
            <CardHeader><CardTitle>Score Comparison by Indication</CardTitle></CardHeader>
            <CardContent>
              <ReactPlotly
                data={[
                  { name: diff.set_a_label, x: indNames, y: scoresA, type: "bar", marker: { color: "#3b82f6" } },
                  { name: diff.set_b_label, x: indNames, y: scoresB, type: "bar", marker: { color: "#f97316" } },
                ]}
                layout={{
                  barmode: "group", height: 320, margin: { l: 50, r: 10, t: 10, b: 120 },
                  yaxis: { title: { text: "Score (0–100)" }, range: [0, 105] },
                  xaxis: { tickangle: -35 },
                  legend: { orientation: "h", y: 1.1 },
                  plot_bgcolor: "white", paper_bgcolor: "white",
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Score Delta (Set A − Set B)</CardTitle></CardHeader>
            <CardContent>
              <ReactPlotly
                data={[{
                  x: deltas, y: indNames, type: "bar", orientation: "h",
                  marker: { color: deltas.map(d => d > 0 ? "#3b82f6" : "#f97316") },
                }]}
                layout={{
                  height: 300, margin: { l: 160, r: 30, t: 10, b: 40 },
                  xaxis: { title: { text: "Score A − Score B" }, zeroline: true },
                  plot_bgcolor: "white", paper_bgcolor: "white",
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Comparison Table</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {["Indication", `Score (${diff.set_a_label})`, `Score (${diff.set_b_label})`, "Delta", "Interpretation"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inds.map((ind, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{ind.label}</td>
                    <td className="px-3 py-2 font-mono text-blue-700">{ind.score_a.toFixed(1)}</td>
                    <td className="px-3 py-2 font-mono text-orange-600">{ind.score_b.toFixed(1)}</td>
                    <td className={`px-3 py-2 font-mono font-medium ${ind.delta > 5 ? "text-blue-700" : ind.delta < -5 ? "text-orange-600" : "text-gray-500"}`}>
                      {ind.delta > 0 ? "+" : ""}{ind.delta.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{ind.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(therapeutic.set_a_unique_strengths.length > 0 || therapeutic.set_b_unique_strengths.length > 0) && (
        <Card>
          <CardContent className="py-4 space-y-2 text-sm text-gray-700">
            {therapeutic.set_a_unique_strengths.length > 0 && (
              <p><span className="font-medium text-blue-700">{diff.set_a_label}</span> shows stronger potential for: {therapeutic.set_a_unique_strengths.join(", ")}.</p>
            )}
            {therapeutic.set_b_unique_strengths.length > 0 && (
              <p><span className="font-medium text-orange-600">{diff.set_b_label}</span> shows stronger potential for: {therapeutic.set_b_unique_strengths.join(", ")}.</p>
            )}
            {therapeutic.shared_strengths.length > 0 && (
              <p>Both sets show comparable scores for: {therapeutic.shared_strengths.slice(0, 5).join(", ")}.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SafetyTab({ diff }: { diff: DiffData }) {
  const { safety } = diff;
  const axes = safety.radar_axes || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-xs text-gray-500 mb-1">{diff.set_a_label} Overall Risk</div>
            <div className={`text-lg font-bold ${safety.overall_risk_a === "Low" ? "text-green-600" : safety.overall_risk_a === "Moderate" ? "text-amber-600" : "text-red-600"}`}>
              {safety.overall_risk_a}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-xs text-gray-500 mb-1">{diff.set_b_label} Overall Risk</div>
            <div className={`text-lg font-bold ${safety.overall_risk_b === "Low" ? "text-green-600" : safety.overall_risk_b === "Moderate" ? "text-amber-600" : "text-red-600"}`}>
              {safety.overall_risk_b}
            </div>
          </CardContent>
        </Card>
      </div>

      {axes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Safety Radar</CardTitle></CardHeader>
          <CardContent>
            <ReactPlotly
              data={[
                {
                  type: "scatterpolar", r: [...(safety.radar_a || []), (safety.radar_a || [])[0]],
                  theta: [...axes, axes[0]], fill: "toself", name: diff.set_a_label,
                  line: { color: "#3b82f6" }, fillcolor: "rgba(59,130,246,0.2)",
                },
                {
                  type: "scatterpolar", r: [...(safety.radar_b || []), (safety.radar_b || [])[0]],
                  theta: [...axes, axes[0]], fill: "toself", name: diff.set_b_label,
                  line: { color: "#f97316" }, fillcolor: "rgba(249,115,22,0.2)",
                },
              ]}
              layout={{
                polar: { radialaxis: { visible: true, range: [0, 4], tickvals: [1, 2, 3, 4], ticktext: ["Low", "Mod", "High", "Crit"] } },
                legend: { orientation: "h", y: -0.1 },
                height: 320, margin: { l: 30, r: 30, t: 20, b: 50 },
                paper_bgcolor: "white",
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%" }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Dimension Comparison</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {["Dimension", `Risk (${diff.set_a_label})`, `Risk (${diff.set_b_label})`, "Unique flags A", "Unique flags B"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(safety.dimension_comparison || []).map((d, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium capitalize">{d.dimension.replace(/_/g, " ")}</td>
                    <td className={`px-3 py-2 font-medium ${d.risk_a === "Low" ? "text-green-600" : d.risk_a === "High" ? "text-red-600" : "text-amber-600"}`}>{d.risk_a}</td>
                    <td className={`px-3 py-2 font-medium ${d.risk_b === "Low" ? "text-green-600" : d.risk_b === "High" ? "text-red-600" : "text-amber-600"}`}>{d.risk_b}</td>
                    <td className="px-3 py-2 text-gray-500">{d.unique_flags_a.slice(0, 3).join(", ")}</td>
                    <td className="px-3 py-2 text-gray-500">{d.unique_flags_b.slice(0, 3).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600 mt-3">{safety.safety_summary}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ExpressionTab({ diff }: { diff: DiffData }) {
  const { expression } = diff;
  const proteins = expression.shared_protein_expression || [];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Shared Protein Expression (Blood/Plasma)</CardTitle></CardHeader>
        <CardContent>
          {proteins.length === 0 ? (
            <p className="text-sm text-gray-400">No quantitative expression data available for shared proteins.</p>
          ) : (
            <div className="overflow-auto max-h-96 rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {["Gene", "Protein Name", `Conc A (nM)`, `Conc B (nM)`, "Change"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proteins.map((p, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-medium">{p.gene_name}</td>
                      <td className="px-3 py-1.5 text-gray-600 max-w-40 truncate">{p.protein_name}</td>
                      <td className="px-3 py-1.5 font-mono text-blue-700">{p.conc_a_nm != null ? p.conc_a_nm.toFixed(3) : "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-orange-600">{p.conc_b_nm != null ? p.conc_b_nm.toFixed(3) : "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          p.expression_change === "Higher in A" ? "bg-blue-100 text-blue-700" :
                          p.expression_change === "Higher in B" ? "bg-orange-100 text-orange-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{p.expression_change}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SetModuleTab({ jobId, suffix, label }: { jobId: string; suffix: "A" | "B"; label: string }) {
  const modules = ["uniprot", "gprofiler", "hpa", "signalp", "sasp", "therapeutic", "safety"];
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 font-medium">{label} — module results</p>
      <div className="grid grid-cols-2 gap-3">
        {modules.map(mod => (
          <ModuleResultCard key={mod} jobId={jobId} moduleName={`${mod}_${suffix}`} displayName={mod} />
        ))}
      </div>
    </div>
  );
}

function ModuleResultCard({ jobId, moduleName, displayName }: { jobId: string; moduleName: string; displayName: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["module", jobId, moduleName],
    queryFn: () => resultsApi.getModuleData(jobId, moduleName),
  });
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${moduleName}.json`; a.click();
  };
  return (
    <Card>
      <CardContent className="py-3 flex items-center justify-between">
        <span className="text-sm font-medium capitalize text-gray-700">{displayName.replace(/_/g, " ")}</span>
        {isLoading ? <Spinner size="sm" /> : error ? <span className="text-xs text-red-500">Error</span> :
          data ? <button onClick={handleDownload} className="text-xs text-primary-600 hover:underline">↓ JSON</button> : null}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparisonResults() {
  const { jobId } = useParams<{ jobId: string }>();
  const [activeTab, setActiveTab] = useState(0);

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobsApi.get(jobId!),
    enabled: !!jobId,
  });

  const { data: diffData, isLoading: diffLoading } = useQuery({
    queryKey: ["diff", jobId],
    queryFn: () => resultsApi.getModuleData(jobId!, "differential"),
    enabled: !!jobId && job?.status === "completed",
  });

  const diff = diffData as DiffData | undefined;
  const labelA = job?.set_a_label || "Set A";
  const labelB = job?.set_b_label || "Set B";
  const dynamicTabs = [...TABS.slice(0, 6), labelA, labelB];

  if (diffLoading || !diff) {
    return (
      <div className="max-w-5xl mx-auto py-10 px-4 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comparative Analysis</h1>
          <p className="text-sm text-gray-500">{labelA} vs {labelB}</p>
        </div>
        {job?.status !== "completed" ? (
          <Card><CardContent className="py-10 text-center text-sm text-gray-500">
            Analysis is still running. Check progress on the <a href={`/jobs/${jobId}`} className="text-primary-600 hover:underline">job status page</a>.
          </CardContent></Card>
        ) : (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comparative Analysis</h1>
          <p className="text-gray-600 font-medium mt-0.5">
            <span className="text-blue-600">{labelA}</span>
            <span className="text-gray-400 mx-2">vs</span>
            <span className="text-orange-500">{labelB}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {diff.overlap.set_a_count} proteins · {diff.overlap.set_b_count} proteins · {diff.overlap.shared_count} shared
          </p>
        </div>
        <p className="text-xs text-gray-400 font-mono">{jobId}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {dynamicTabs.map((tab, i) => (
          <button key={tab} onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === i ? "border-b-2 border-primary-600 text-primary-700" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 0 && <OverviewTab diff={diff} />}
      {activeTab === 1 && <OverlapTab diff={diff} />}
      {activeTab === 2 && <PathwaysTab diff={diff} />}
      {activeTab === 3 && <TherapeuticTab diff={diff} />}
      {activeTab === 4 && <SafetyTab diff={diff} />}
      {activeTab === 5 && <ExpressionTab diff={diff} />}
      {activeTab === 6 && jobId && <SetModuleTab jobId={jobId} suffix="A" label={labelA} />}
      {activeTab === 7 && jobId && <SetModuleTab jobId={jobId} suffix="B" label={labelB} />}
    </div>
  );
}
