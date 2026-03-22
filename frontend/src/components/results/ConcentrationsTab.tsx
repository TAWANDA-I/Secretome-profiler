import { useState } from "react";
import ReactPlotly from "react-plotly.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConcentrationProfile {
  gene_name: string;
  protein_name: string;
  user_concentration_pg_ml: number;
  has_reference: boolean;
  healthy_plasma_median_pg_ml: number | null;
  healthy_plasma_range: [number | null, number | null];
  fold_over_healthy: number | null;
  status: string;
  status_color: string;
  therapeutic_window: [number | null, number | null];
  toxic_threshold: number | null;
  disease_comparisons: {
    disease: string;
    disease_concentration_pg_ml: number;
    ratio: number | null;
    interpretation: string;
  }[];
  interpretation: string;
  caution_flag: boolean;
}

interface ConcentrationData {
  proteins_with_data: number;
  proteins_without_data: number;
  total_quantified: number;
  concentration_profiles: ConcentrationProfile[];
  summary: {
    sub_physiological_count: number;
    physiological_count: number;
    supra_physiological_count: number;
    potentially_toxic_count: number;
    within_therapeutic_window_count: number;
    caution_proteins: string[];
    most_elevated: string | null;
    most_depleted: string | null;
  };
  therapeutic_assessment: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  sub_physiological: "Sub-physiological",
  physiological: "Physiological",
  supra_physiological: "Supra-physiological",
  potentially_toxic: "Potentially toxic",
  within_therapeutic_window: "Therapeutic window",
  below_therapeutic_window: "Below therapeutic",
  above_therapeutic_window: "Above therapeutic",
  no_reference: "No reference",
};

const STATUS_BADGE: Record<string, string> = {
  sub_physiological: "bg-gray-100 text-gray-600",
  physiological: "bg-blue-100 text-blue-700",
  supra_physiological: "bg-amber-100 text-amber-700",
  potentially_toxic: "bg-red-100 text-red-700",
  within_therapeutic_window: "bg-green-100 text-green-700",
  below_therapeutic_window: "bg-gray-100 text-gray-600",
  above_therapeutic_window: "bg-amber-100 text-amber-700",
  no_reference: "bg-gray-50 text-gray-400",
};

function fmtConc(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} µg/mL`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} ng/mL`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} ng/L`;
  return `${v.toFixed(1)} pg/mL`;
}

// ── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ data }: { data: ConcentrationData }) {
  const { summary } = data;
  const cards = [
    { label: "Physiological range", value: summary.physiological_count, color: "text-blue-600" },
    { label: "Supra-physiological", value: summary.supra_physiological_count, color: "text-amber-600" },
    { label: "Therapeutic window", value: summary.within_therapeutic_window_count, color: "text-green-600" },
    { label: "Caution flags", value: summary.potentially_toxic_count + (summary.caution_proteins.length - summary.potentially_toxic_count), color: "text-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="py-3 text-center">
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Dot plot ──────────────────────────────────────────────────────────────────

function ConcentrationDotPlot({
  profiles,
  selectedDisease,
}: {
  profiles: ConcentrationProfile[];
  selectedDisease: string | null;
}) {
  const withRef = profiles.filter(p => p.has_reference);
  if (withRef.length === 0) return (
    <p className="text-sm text-gray-400">No proteins with reference concentration data.</p>
  );

  const genes = withRef.map(p => p.gene_name);
  const userConcs = withRef.map(p => p.user_concentration_pg_ml);
  const colors = withRef.map(p => p.status_color);

  // Healthy range bars
  const p5s = withRef.map(p => p.healthy_plasma_range[0] ?? p.healthy_plasma_median_pg_ml);
  const p95s = withRef.map(p => p.healthy_plasma_range[1] ?? p.healthy_plasma_median_pg_ml);
  const medians = withRef.map(p => p.healthy_plasma_median_pg_ml);

  // Therapeutic window
  const twLows = withRef.map(p => p.therapeutic_window[0]);
  const twHighs = withRef.map(p => p.therapeutic_window[1]);

  // Disease overlay
  const diseaseConcs = selectedDisease
    ? withRef.map(p => {
        const dc = p.disease_comparisons.find(d => d.disease.toLowerCase().includes(selectedDisease.toLowerCase()));
        return dc?.disease_concentration_pg_ml ?? null;
      })
    : withRef.map(() => null);

  const plotData: Plotly.Data[] = [
    // Healthy range band (error bars styled as horizontal bands)
    {
      type: "scatter" as const,
      x: medians,
      y: genes,
      mode: "markers",
      name: "Healthy median",
      marker: { color: "#94a3b8", size: 8, symbol: "line-ns", line: { width: 2, color: "#94a3b8" } },
      error_x: {
        type: "data" as const,
        symmetric: false,
        array: p95s.map((p95, i) => (p95 && medians[i]) ? p95 - medians[i]! : 0),
        arrayminus: p5s.map((p5, i) => (p5 && medians[i]) ? medians[i]! - p5 : 0),
        color: "#d1d5db",
        thickness: 6,
        width: 0,
      },
      hovertemplate: "<b>%{y}</b><br>Healthy median: %{x:.2e} pg/mL<extra></extra>",
    },
    // User concentration dots
    {
      type: "scatter" as const,
      x: userConcs,
      y: genes,
      mode: "markers",
      name: "Your secretome",
      marker: { color: colors, size: 10, line: { width: 1.5, color: "white" } },
      hovertemplate: "<b>%{y}</b><br>Concentration: %{x:.2e} pg/mL<extra></extra>",
    },
  ];

  // Therapeutic window dots (green diamonds)
  const twProteins = withRef.filter((_, i) => twLows[i] && twHighs[i]);
  if (twProteins.length > 0) {
    plotData.push({
      type: "scatter" as const,
      x: twProteins.map((p) => {
        const i = withRef.indexOf(p);
        return twHighs[i];
      }),
      y: twProteins.map(p => p.gene_name),
      mode: "markers",
      name: "Therapeutic window max",
      marker: { color: "#22c55e", size: 8, symbol: "line-ns", line: { width: 2, color: "#22c55e" } },
      error_x: {
        type: "data" as const,
        symmetric: false,
        array: twProteins.map(() => 0),
        arrayminus: twProteins.map((p) => {
          const i = withRef.indexOf(p);
          return (twHighs[i] && twLows[i]) ? twHighs[i]! - twLows[i]! : 0;
        }),
        color: "#bbf7d0",
        thickness: 4,
        width: 0,
      },
      hovertemplate: "<b>%{y}</b><br>Therapeutic window<extra></extra>",
    });
  }

  // Disease overlay
  const disConcs = diseaseConcs.filter(Boolean);
  if (disConcs.length > 0) {
    plotData.push({
      type: "scatter" as const,
      x: diseaseConcs,
      y: genes,
      mode: "markers",
      name: `${selectedDisease} levels`,
      marker: { color: "#f97316", size: 8, symbol: "diamond", opacity: 0.8 },
      hovertemplate: `<b>%{y}</b><br>${selectedDisease}: %{x:.2e} pg/mL<extra></extra>`,
    });
  }

  const height = Math.max(300, withRef.length * 28 + 80);

  return (
    <ReactPlotly
      data={plotData}
      layout={{
        height,
        margin: { l: 80, r: 30, t: 20, b: 60 },
        xaxis: {
          type: "log",
          title: { text: "Concentration (pg/mL)" },
          showgrid: true,
          gridcolor: "#f1f5f9",
        },
        yaxis: { autorange: "reversed" as const, tickfont: { size: 11 } },
        legend: { orientation: "h" as const, y: -0.12 },
        plot_bgcolor: "white",
        paper_bgcolor: "white",
        hovermode: "y unified" as const,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

// ── Disease comparison dropdown ───────────────────────────────────────────────

function getDiseaseOptions(profiles: ConcentrationProfile[]): string[] {
  const diseases = new Set<string>();
  for (const p of profiles) {
    for (const dc of p.disease_comparisons) {
      diseases.add(dc.disease);
    }
  }
  return Array.from(diseases).sort();
}

// ── Detailed table ────────────────────────────────────────────────────────────

function DetailTable({ profiles }: { profiles: ConcentrationProfile[] }) {
  const [sortKey, setSortKey] = useState<"fold" | "gene" | "status">("fold");
  const sorted = [...profiles].sort((a, b) => {
    if (sortKey === "fold") return (b.fold_over_healthy ?? -Infinity) - (a.fold_over_healthy ?? -Infinity);
    if (sortKey === "gene") return a.gene_name.localeCompare(b.gene_name);
    return (a.status ?? "").localeCompare(b.status ?? "");
  });

  const handleDownload = () => {
    const rows = [
      ["Gene", "Protein Name", "Concentration (pg/mL)", "Healthy Median", "Fold Over Healthy", "Status", "Interpretation"].join(","),
      ...sorted.map(p => [
        p.gene_name,
        `"${p.protein_name}"`,
        p.user_concentration_pg_ml,
        p.healthy_plasma_median_pg_ml ?? "",
        p.fold_over_healthy ?? "",
        STATUS_LABELS[p.status] ?? p.status,
        `"${p.interpretation}"`,
      ].join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = "concentration_analysis.csv";
    a.click();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-xs">
          <span className="text-gray-500">Sort by:</span>
          {(["fold", "gene", "status"] as const).map(k => (
            <button key={k} onClick={() => setSortKey(k)}
              className={`px-2 py-0.5 rounded ${sortKey === k ? "bg-primary-100 text-primary-700 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
              {k === "fold" ? "Fold change" : k === "gene" ? "Gene name" : "Status"}
            </button>
          ))}
        </div>
        <button onClick={handleDownload} className="text-xs text-primary-600 hover:underline">↓ CSV</button>
      </div>
      <div className="overflow-auto max-h-96 rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {["Gene", "Protein Name", "Concentration", "Healthy Median", "Fold", "Status"].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i} className={`border-t border-gray-100 hover:bg-gray-50 ${p.caution_flag ? "bg-red-50/30" : ""}`}>
                <td className="px-3 py-1.5 font-medium">{p.gene_name}{p.caution_flag && <span className="ml-1 text-red-500">⚠</span>}</td>
                <td className="px-3 py-1.5 text-gray-600 max-w-40 truncate" title={p.protein_name}>{p.protein_name || "—"}</td>
                <td className="px-3 py-1.5 font-mono text-blue-700">{fmtConc(p.user_concentration_pg_ml)}</td>
                <td className="px-3 py-1.5 font-mono text-gray-500">{fmtConc(p.healthy_plasma_median_pg_ml)}</td>
                <td className={`px-3 py-1.5 font-mono font-medium ${
                  p.fold_over_healthy && p.fold_over_healthy > 10 ? "text-red-600" :
                  p.fold_over_healthy && p.fold_over_healthy > 2 ? "text-amber-600" : "text-gray-600"}`}>
                  {p.fold_over_healthy != null ? `${p.fold_over_healthy.toFixed(2)}×` : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConcentrationsTab({ data }: { data: ConcentrationData }) {
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);
  const diseases = getDiseaseOptions(data.concentration_profiles);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <OverviewCards data={data} />

      {/* Assessment text */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
        {data.therapeutic_assessment}
      </div>

      {/* Dot plot */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Concentration vs Physiological Reference</CardTitle>
            {diseases.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 text-xs">Compare to:</span>
                <select
                  value={selectedDisease ?? ""}
                  onChange={e => setSelectedDisease(e.target.value || null)}
                  className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="">— none —</option>
                  {diseases.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Gray bars = healthy plasma range (p5–p95) · Green bars = therapeutic window · Blue/amber/red dots = your concentration
          </p>
        </CardHeader>
        <CardContent>
          <ConcentrationDotPlot profiles={data.concentration_profiles} selectedDisease={selectedDisease} />
        </CardContent>
      </Card>

      {/* Detailed table */}
      <Card>
        <CardHeader><CardTitle>Detailed Concentration Table</CardTitle></CardHeader>
        <CardContent>
          <DetailTable profiles={data.concentration_profiles} />
        </CardContent>
      </Card>

      {/* Proteins without reference data */}
      {data.proteins_without_data > 0 && (
        <Card>
          <CardHeader><CardTitle>Proteins Without Reference Data</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.concentration_profiles
                .filter(p => !p.has_reference)
                .map(p => (
                  <span key={p.gene_name} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                    {p.gene_name}
                  </span>
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Physiological reference values not available for these proteins. Add data to
              <span className="font-mono"> plasma_reference_concentrations.json</span> to enable comparison.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
