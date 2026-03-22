import { useState } from "react";
import Plot from "react-plotly.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PKProtein {
  gene_name: string;
  protein_name: string;
  molecular_weight_kda: number | null;
  plasma_half_life_hours: number | null;
  half_life_category: string;
  half_life_source: string; // "literature" | "estimate"
  half_life_route: string;
  bbb_penetration_class: string;
  bbb_penetration_color: string;
  bbb_mechanism: string | null;
  bbb_evidence_level: string; // "established" | "probable" | "unlikely" | "unknown"
  csf_blood_ratio: number | null;
  renal_clearance: boolean | null;
  is_glycosylated: boolean | null;
  active_transport_receptors: string[];
  serum_binding_proteins: string[];
  bioavailability_notes: string;
}

interface PKSummary {
  total_proteins: number;
  bbb_crossing_count: number;
  bbb_unlikely_count: number;
  short_half_life_count: number;
  medium_half_life_count: number;
  long_half_life_count: number;
  mean_molecular_weight_kda: number;
}

interface PKData {
  proteins: PKProtein[];
  pk_summary: PKSummary;
  therapeutic_implications: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BBB_COLORS: Record<string, string> = {
  established: "#10B981",
  probable:    "#3B82F6",
  unlikely:    "#EF4444",
  unknown:     "#9CA3AF",
};

const BBB_BADGE_CLASS: Record<string, string> = {
  established: "bg-green-100 text-green-700",
  probable:    "bg-blue-100 text-blue-700",
  unlikely:    "bg-red-100 text-red-700",
  unknown:     "bg-gray-100 text-gray-500",
};

const HALF_LIFE_BINS = ["<2h", "2–6h", "6–12h", "12–24h", "24–72h", ">72h"];

function getHalfLifeBin(hours: number): string {
  if (hours < 2)  return "<2h";
  if (hours < 6)  return "2–6h";
  if (hours < 12) return "6–12h";
  if (hours < 24) return "12–24h";
  if (hours < 72) return "24–72h";
  return ">72h";
}

function boolSymbol(val: boolean | null): string {
  if (val === null || val === undefined) return "?";
  return val ? "✓" : "✗";
}

function boolClass(val: boolean | null): string {
  if (val === null || val === undefined) return "text-gray-400";
  return val ? "text-green-600" : "text-red-500";
}

function fmtHl(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1)   return `${(hours * 60).toFixed(0)} min`;
  if (hours >= 24) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}

function evidenceLevelLabel(level: string): string {
  const map: Record<string, string> = {
    established: "Established",
    probable:    "Probable",
    unlikely:    "Unlikely",
    unknown:     "Unknown",
  };
  return map[level] ?? level;
}

// ── Section A: Overview Cards ─────────────────────────────────────────────────

function OverviewCards({ summary, proteins }: { summary: PKSummary; proteins: PKProtein[] }) {
  const hlValues = proteins.map((p) => p.plasma_half_life_hours).filter((v): v is number => v !== null);
  const meanHl = hlValues.length > 0 ? hlValues.reduce((a, b) => a + b, 0) / hlValues.length : null;

  const cards = [
    {
      label: "BBB Crossing",
      value: summary.bbb_crossing_count,
      suffix: "",
      colorClass: "text-green-600",
      badgeClass: "bg-green-100 text-green-700",
    },
    {
      label: "Short Half-life (<6h)",
      value: summary.short_half_life_count,
      suffix: "",
      colorClass: "text-amber-600",
      badgeClass: "bg-amber-100 text-amber-700",
    },
    {
      label: "Mean MW",
      value: summary.mean_molecular_weight_kda != null ? summary.mean_molecular_weight_kda.toFixed(1) : "—",
      suffix: " kDa",
      colorClass: "text-blue-600",
      badgeClass: "bg-blue-100 text-blue-700",
    },
    {
      label: "Mean Half-life",
      value: meanHl != null ? meanHl.toFixed(1) : "—",
      suffix: " h",
      colorClass: "text-purple-600",
      badgeClass: "bg-purple-100 text-purple-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className={`text-3xl font-bold ${c.colorClass}`}>
            {c.value}{c.suffix}
          </div>
          <div className="text-xs text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Section B: Half-life Distribution Bar Chart ───────────────────────────────

function HalfLifeHistogram({ proteins }: { proteins: PKProtein[] }) {
  const counts: Record<string, number> = Object.fromEntries(
    HALF_LIFE_BINS.map((b) => [b, 0])
  );

  for (const p of proteins) {
    if (p.plasma_half_life_hours !== null && p.plasma_half_life_hours !== undefined) {
      const bin = getHalfLifeBin(p.plasma_half_life_hours);
      counts[bin] = (counts[bin] ?? 0) + 1;
    }
  }

  const yValues = HALF_LIFE_BINS.map((b) => counts[b] ?? 0);

  return (
    <Plot
      data={[
        {
          type: "bar",
          x: HALF_LIFE_BINS,
          y: yValues,
          marker: { color: "#3B82F6" },
          hovertemplate: "<b>%{x}</b><br>Count: %{y}<extra></extra>",
        },
      ]}
      layout={{
        height: 280,
        margin: { l: 45, r: 20, t: 30, b: 45 },
        title: { text: "Plasma Half-life Distribution", font: { size: 13 } },
        xaxis: { title: { text: "Half-life range" }, tickfont: { size: 11 } },
        yaxis: { title: { text: "Count" }, tickfont: { size: 11 } },
        plot_bgcolor: "white",
        paper_bgcolor: "white",
        bargap: 0.2,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

// ── Section C: BBB Penetration Summary ───────────────────────────────────────

function BBBAccordionItem({
  title,
  proteins,
  defaultOpen,
}: {
  title: string;
  proteins: PKProtein[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"} {proteins.length} proteins</span>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-1.5 bg-white">
          {proteins.length === 0 ? (
            <p className="text-xs text-gray-400">None</p>
          ) : (
            proteins.map((p) => (
              <div key={p.gene_name} className="flex items-start gap-2 text-xs">
                <span className="font-mono font-semibold text-gray-800 shrink-0 w-16">{p.gene_name}</span>
                <span className="text-gray-500">{p.bbb_mechanism || "—"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BBBPenetrationSection({
  proteins,
  summary,
}: {
  proteins: PKProtein[];
  summary: PKSummary;
}) {
  const establishedOrProbable = proteins.filter((p) => {
    const lvl = p.bbb_evidence_level;
    return lvl === "established" || lvl === "probable";
  });

  const unlikelyOrUnknown = proteins.filter((p) => {
    const lvl = p.bbb_evidence_level;
    return lvl === "unlikely" || lvl === "unknown";
  });

  const nEstablished = proteins.filter((p) => p.bbb_evidence_level === "established").length;
  const nProbable = proteins.filter((p) => p.bbb_evidence_level === "probable").length;
  const nUnknown = proteins.filter((p) => p.bbb_evidence_level === "unknown").length;

  const donutValues = [
    nEstablished,
    nProbable,
    summary.bbb_unlikely_count,
    nUnknown,
  ];
  const donutLabels = ["Established", "Probable", "Unlikely", "Unknown"];
  const donutColors = [
    BBB_COLORS.established,
    BBB_COLORS.probable,
    BBB_COLORS.unlikely,
    BBB_COLORS.unknown,
  ];

  return (
    <div className="flex flex-col md:flex-row gap-4 items-start">
      {/* Donut chart */}
      <div className="shrink-0 w-full md:w-56">
        <Plot
          data={[
            {
              type: "pie",
              hole: 0.55,
              values: donutValues,
              labels: donutLabels,
              marker: { colors: donutColors },
              textinfo: "label+value",
              textfont: { size: 11 },
              hovertemplate: "<b>%{label}</b><br>%{value} proteins<extra></extra>",
            },
          ]}
          layout={{
            height: 220,
            margin: { l: 10, r: 10, t: 10, b: 10 },
            showlegend: false,
            plot_bgcolor: "white",
            paper_bgcolor: "white",
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
        />
      </div>

      {/* Accordion */}
      <div className="flex-1 space-y-2 w-full">
        <BBBAccordionItem
          title="Established / Probable BBB Crossing"
          proteins={establishedOrProbable}
          defaultOpen={true}
        />
        <BBBAccordionItem
          title="BBB Unlikely / Unknown"
          proteins={unlikelyOrUnknown}
          defaultOpen={false}
        />
      </div>
    </div>
  );
}

// ── Section D: MW vs Half-life Scatter ───────────────────────────────────────

function MWvsHalfLifeScatter({ proteins }: { proteins: PKProtein[] }) {
  const withData = proteins.filter(
    (p) => p.molecular_weight_kda !== null && p.plasma_half_life_hours !== null
  );

  if (withData.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Not enough data for scatter plot (requires MW and half-life values).
      </p>
    );
  }

  // Group by evidence level for coloring
  const groups: Record<string, PKProtein[]> = {
    established: [],
    probable:    [],
    unlikely:    [],
    unknown:     [],
  };

  for (const p of withData) {
    const lvl = p.bbb_evidence_level ?? "unknown";
    if (groups[lvl]) {
      groups[lvl].push(p);
    } else {
      groups.unknown.push(p);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traces: any[] = Object.entries(groups)
    .filter(([, ps]) => ps.length > 0)
    .map(([level, ps]) => ({
      type: "scatter" as const,
      mode: "markers" as const,
      name: evidenceLevelLabel(level),
      x: ps.map((p) => p.molecular_weight_kda),
      y: ps.map((p) => p.plasma_half_life_hours),
      marker: {
        color: BBB_COLORS[level] ?? "#9CA3AF",
        size: 9,
        opacity: 0.85,
        line: { width: 1, color: "white" },
      },
      text: ps.map(
        (p) =>
          `${p.gene_name}<br>MW: ${p.molecular_weight_kda?.toFixed(1)} kDa<br>t½: ${fmtHl(p.plasma_half_life_hours)}`
      ),
      hovertemplate: "%{text}<extra></extra>",
    }));

  return (
    <Plot
      data={traces}
      layout={{
        height: 320,
        margin: { l: 55, r: 20, t: 35, b: 50 },
        title: { text: "Molecular Weight vs Plasma Half-life", font: { size: 13 } },
        xaxis: { title: { text: "Molecular Weight (kDa)" }, tickfont: { size: 11 } },
        yaxis: {
          title: { text: "Plasma Half-life (h)" },
          type: "log",
          tickfont: { size: 11 },
        },
        legend: { orientation: "h", y: -0.18, font: { size: 11 } },
        plot_bgcolor: "white",
        paper_bgcolor: "white",
        hovermode: "closest",
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  );
}

// ── Section E: Detailed PK Table ─────────────────────────────────────────────

type SortKey = "gene" | "mw" | "half_life" | "source" | "bbb" | "renal" | "glyco";
type SortDir = "asc" | "desc";

function PKTable({ proteins }: { proteins: PKProtein[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("half_life");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...proteins].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "gene":
        cmp = a.gene_name.localeCompare(b.gene_name);
        break;
      case "mw":
        cmp = (a.molecular_weight_kda ?? -Infinity) - (b.molecular_weight_kda ?? -Infinity);
        break;
      case "half_life":
        cmp = (a.plasma_half_life_hours ?? -Infinity) - (b.plasma_half_life_hours ?? -Infinity);
        break;
      case "source":
        cmp = (a.half_life_source ?? "").localeCompare(b.half_life_source ?? "");
        break;
      case "bbb":
        cmp = (a.bbb_evidence_level ?? "").localeCompare(b.bbb_evidence_level ?? "");
        break;
      case "renal":
        cmp = String(a.renal_clearance ?? "").localeCompare(String(b.renal_clearance ?? ""));
        break;
      case "glyco":
        cmp = String(a.is_glycosylated ?? "").localeCompare(String(b.is_glycosylated ?? ""));
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortHeader = ({
    label,
    colKey,
  }: {
    label: string;
    colKey: SortKey;
  }) => (
    <th
      className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-gray-900"
      onClick={() => handleSort(colKey)}
    >
      {label}
      {sortKey === colKey && (
        <span className="ml-1 text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="overflow-auto max-h-[480px] rounded-lg border border-gray-200">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <SortHeader label="Gene"            colKey="gene"      />
            <SortHeader label="Protein Name"    colKey="gene"      />
            <SortHeader label="MW (kDa)"        colKey="mw"        />
            <SortHeader label="Half-life"       colKey="half_life" />
            <SortHeader label="HL Source"       colKey="source"    />
            <SortHeader label="BBB Penetration" colKey="bbb"       />
            <SortHeader label="Renal"           colKey="renal"     />
            <SortHeader label="Glyco"           colKey="glyco"     />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const evidLvl = p.bbb_evidence_level ?? "unknown";
            const hlSource =
              p.half_life_source === "literature"
                ? "Lit."
                : p.half_life_source === "mw_estimate"
                ? "Est."
                : p.half_life_source || "—";
            const hlSourceTitle =
              p.half_life_source === "literature"
                ? "From literature"
                : p.half_life_source === "mw_estimate"
                ? "Estimated from molecular weight"
                : p.half_life_source;

            return (
              <tr
                key={i}
                className="border-t border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">
                  {p.gene_name}
                </td>
                <td
                  className="px-3 py-1.5 text-gray-600 max-w-44 truncate"
                  title={p.protein_name}
                >
                  {p.protein_name || "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-gray-700">
                  {p.molecular_weight_kda !== null && p.molecular_weight_kda !== undefined
                    ? p.molecular_weight_kda.toFixed(1)
                    : "—"}
                </td>
                <td className="px-3 py-1.5 font-mono text-blue-700">
                  {fmtHl(p.plasma_half_life_hours)}
                </td>
                <td
                  className="px-3 py-1.5 text-gray-500"
                  title={hlSourceTitle}
                >
                  {hlSource}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      BBB_BADGE_CLASS[evidLvl] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {evidenceLevelLabel(evidLvl)}
                  </span>
                </td>
                <td className={`px-3 py-1.5 font-medium ${boolClass(p.renal_clearance)}`}>
                  {boolSymbol(p.renal_clearance)}
                </td>
                <td className={`px-3 py-1.5 font-medium ${boolClass(p.is_glycosylated)}`}>
                  {boolSymbol(p.is_glycosylated)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PharmacokineticTab({ data }: { data: PKData }) {
  if (!data || !data.proteins || data.proteins.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        No PK data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: Overview Cards */}
      <OverviewCards summary={data.pk_summary} proteins={data.proteins} />

      {/* Section B: Half-life Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Half-life Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <HalfLifeHistogram proteins={data.proteins} />
        </CardContent>
      </Card>

      {/* Section C: BBB Penetration */}
      <Card>
        <CardHeader>
          <CardTitle>BBB Penetration Summary</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Evidence levels: Established (green) · Probable (blue) · Unlikely (red) · Unknown (gray)
          </p>
        </CardHeader>
        <CardContent>
          <BBBPenetrationSection proteins={data.proteins} summary={data.pk_summary} />
        </CardContent>
      </Card>

      {/* Section D: MW vs Half-life Scatter */}
      <Card>
        <CardHeader>
          <CardTitle>MW vs Plasma Half-life</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Color = BBB evidence level · Y-axis log scale
          </p>
        </CardHeader>
        <CardContent>
          <MWvsHalfLifeScatter proteins={data.proteins} />
        </CardContent>
      </Card>

      {/* Section E: Detailed PK Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed PK Table</CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Click column headers to sort · HL Source: Lit. = literature, Est. = MW-based estimate
          </p>
        </CardHeader>
        <CardContent>
          <PKTable proteins={data.proteins} />
        </CardContent>
      </Card>

      {/* Section F: Therapeutic Implications */}
      {data.therapeutic_implications && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-1">
            Delivery &amp; Pharmacokinetic Assessment
          </h3>
          <p className="text-sm text-blue-800 leading-relaxed">
            {data.therapeutic_implications}
          </p>
        </div>
      )}
    </div>
  );
}
