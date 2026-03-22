import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Indication {
  key: string;
  label: string;
  mechanism: string;
  score: number;
  confidence: "High" | "Moderate" | "Low";
  coverage_pct: number;
  supporting_proteins: string[];
  limiting_factors: string[];
  color: string;
}

interface TherapeuticData {
  indications: Indication[];
  top_indication: string;
  top_indication_key: string;
  overall_confidence: string;
  gene_names_analyzed: string[];
}

interface CellType {
  cell_type: string;
  interaction_count: number;
}

interface Pathway {
  pathway: string;
  interaction_count: number;
}

interface ActivePair {
  ligand: string;
  receptor: string;
  pathway: string;
  target_cells: string[];
  effect: string;
}

interface ReceptorLigandData {
  active_pairs: ActivePair[];
  target_cell_types: CellType[];
  active_pathways: Pathway[];
  total_pairs_matched: number;
  coverage_percent: number;
}

interface DimensionDetail {
  label: string;
  score: number;
  risk_level: string;
  flagged: { gene: string; concern: string }[];
}

interface SafetyData {
  overall_safety_score: number;
  risk_level: string;
  dimensions: Record<string, DimensionDetail>;
  total_flagged: number;
}

interface RankedDisease {
  disease_id: string;
  disease_name: string;
  therapeutic_areas: string[];
  total_score: number;
  supporting_genes: string[];
  evidence_count: number;
}

interface DiseaseData {
  ranked_diseases: RankedDisease[];
  top_disease: string | null;
  proteins_queried: number;
  total_disease_associations: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  Low: "#10b981",
  Moderate: "#f59e0b",
  High: "#ef4444",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "#10b981",
  Moderate: "#0ea5e9",
  Low: "#94a3b8",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function IndicationChart({ data }: { data: TherapeuticData }) {
  const option = useMemo(() => {
    const top10 = data.indications.slice(0, 10);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { name: string; value: number }[]) => {
          const ind = top10.find((i) => i.label === params[0].name);
          if (!ind) return params[0].name;
          return [
            `<b>${ind.label}</b>`,
            `Score: ${ind.score}`,
            `Confidence: ${ind.confidence}`,
            `Supporting proteins: ${ind.supporting_proteins.join(", ") || "—"}`,
            `<span style="color:#94a3b8;font-size:11px">${ind.mechanism}</span>`,
          ].join("<br/>");
        },
      },
      grid: { left: 160, right: 30, top: 10, bottom: 30 },
      xAxis: { type: "value", name: "Score" },
      yAxis: {
        type: "category",
        data: top10.map((i) => i.label),
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: top10.map((i) => ({
            value: i.score,
            itemStyle: { color: i.color },
          })),
        },
      ],
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 340 }} />;
}

function ReceptorBubbleChart({ data }: { data: ReceptorLigandData }) {
  const option = useMemo(() => {
    const cells = data.target_cell_types.slice(0, 15);
    const max = Math.max(1, ...cells.map((c) => c.interaction_count));
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: { name: string; value: number[] }) =>
          `<b>${p.name}</b><br/>Interactions: ${p.value[2]}`,
      },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        data: cells.map((c) => c.cell_type.replace(/_/g, " ")),
        axisLabel: { fontSize: 11 },
      },
      grid: { left: 130, right: 30, top: 10, bottom: 10 },
      series: [
        {
          type: "scatter",
          data: cells.map((c, i) => ({
            name: c.cell_type.replace(/_/g, " "),
            value: [c.interaction_count, i, c.interaction_count],
            symbolSize: Math.max(8, (c.interaction_count / max) * 50),
            itemStyle: { color: "#6366f1", opacity: 0.75 },
          })),
        },
      ],
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 340 }} />;
}

function SafetyRadarChart({ data }: { data: SafetyData }) {
  const dims = Object.values(data.dimensions);
  const option = useMemo(() => ({
    tooltip: { trigger: "item" },
    radar: {
      indicator: dims.map((d) => ({ name: d.label.replace(/ /g, "\n"), max: 10 })),
      radius: "65%",
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: dims.map((d) => d.score),
            name: "Safety Score",
            areaStyle: { color: "rgba(239,68,68,0.15)" },
            lineStyle: { color: "#ef4444" },
            itemStyle: { color: "#ef4444" },
          },
        ],
      },
    ],
  }), [dims]);

  return <ReactECharts option={option} style={{ height: 320 }} />;
}

function DiseaseTreemap({ data }: { data: DiseaseData }) {
  const top20 = data.ranked_diseases.slice(0, 20);
  const option = useMemo(() => ({
    tooltip: {
      formatter: (p: { name: string; value: number; data: { genes: string } }) =>
        `<b>${p.name}</b><br/>Score: ${p.value.toFixed(3)}<br/>Genes: ${p.data.genes}`,
    },
    series: [
      {
        type: "treemap",
        data: top20.map((d) => ({
          name: d.disease_name,
          value: d.total_score,
          genes: d.supporting_genes.join(", "),
          itemStyle: { color: `hsl(${Math.round(d.total_score * 200)},60%,55%)` },
        })),
        label: { fontSize: 11 },
        breadcrumb: { show: false },
      },
    ],
  }), [top20]);

  return <ReactECharts option={option} style={{ height: 320 }} />;
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface TherapeuticTabProps {
  therapeuticResult?: Result;
  receptorLigandResult?: Result;
  safetyResult?: Result;
  diseaseContextResult?: Result;
  jobId: string;
}

export function TherapeuticTab({
  therapeuticResult,
  receptorLigandResult,
  safetyResult,
  diseaseContextResult,
  jobId,
}: TherapeuticTabProps) {
  const { data: therapeuticRaw, isLoading: loadingT } = useQuery({
    queryKey: ["module-data", jobId, "therapeutic"],
    queryFn: () => resultsApi.getModuleData(jobId, "therapeutic"),
    enabled: !!therapeuticResult,
  });

  const { data: rlRaw, isLoading: loadingRL } = useQuery({
    queryKey: ["module-data", jobId, "receptor_ligand"],
    queryFn: () => resultsApi.getModuleData(jobId, "receptor_ligand"),
    enabled: !!receptorLigandResult,
  });

  const { data: safetyRaw, isLoading: loadingS } = useQuery({
    queryKey: ["module-data", jobId, "safety"],
    queryFn: () => resultsApi.getModuleData(jobId, "safety"),
    enabled: !!safetyResult,
  });

  const { data: diseaseRaw, isLoading: loadingD } = useQuery({
    queryKey: ["module-data", jobId, "disease_context"],
    queryFn: () => resultsApi.getModuleData(jobId, "disease_context"),
    enabled: !!diseaseContextResult,
  });

  const therapeuticData = therapeuticRaw as TherapeuticData | undefined;
  const rlData = rlRaw as ReceptorLigandData | undefined;
  const safetyData = safetyRaw as SafetyData | undefined;
  const diseaseData = diseaseRaw as DiseaseData | undefined;

  const isLoading = loadingT || loadingRL || loadingS || loadingD;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Therapeutic Summary Card ── */}
      {therapeuticData && (
        <Card className="border-l-4 border-l-primary-500">
          <CardContent className="py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-500">Top Indication</div>
                <div className="text-base font-semibold text-gray-900 mt-0.5">
                  {therapeuticData.top_indication || "—"}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Confidence</div>
                <div
                  className="text-base font-semibold mt-0.5"
                  style={{ color: CONFIDENCE_COLORS[therapeuticData.overall_confidence] }}
                >
                  {therapeuticData.overall_confidence}
                </div>
              </div>
              {safetyData && (
                <div>
                  <div className="text-sm text-gray-500">Safety Risk</div>
                  <div
                    className="text-base font-semibold mt-0.5"
                    style={{ color: RISK_COLORS[safetyData.risk_level] }}
                  >
                    {safetyData.risk_level}
                  </div>
                </div>
              )}
              {rlData && (
                <div>
                  <div className="text-sm text-gray-500">LR Pairs Matched</div>
                  <div className="text-base font-semibold text-gray-900 mt-0.5">
                    {rlData.total_pairs_matched}
                    <span className="text-xs text-gray-400 ml-1">
                      ({rlData.coverage_percent}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Indication Chart ── */}
      {therapeuticData && (
        <Card>
          <CardHeader>
            <CardTitle>Therapeutic Indication Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <IndicationChart data={therapeuticData} />
          </CardContent>
        </Card>
      )}

      {/* ── Receptor-Ligand + Safety row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rlData && (
          <Card>
            <CardHeader>
              <CardTitle>
                Target Cell Types
                <span className="text-xs font-normal text-gray-400 ml-2">
                  — bubble size = interaction count
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReceptorBubbleChart data={rlData} />
            </CardContent>
          </Card>
        )}

        {safetyData && (
          <Card>
            <CardHeader>
              <CardTitle>
                Safety Radar
                <span className="text-xs font-normal text-gray-400 ml-2">
                  — score 0-10, higher = more risk
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SafetyRadarChart data={safetyData} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Disease Context Treemap ── */}
      {diseaseData && diseaseData.ranked_diseases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Disease Context
              <span className="text-xs font-normal text-gray-400 ml-2">
                — Open Targets evidence scores
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DiseaseTreemap data={diseaseData} />
          </CardContent>
        </Card>
      )}

      {/* ── Safety Details ── */}
      {safetyData && safetyData.total_flagged > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Safety Flags Detail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(safetyData.dimensions).map(([key, dim]) =>
                dim.flagged.length > 0 ? (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-700">{dim.label}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: RISK_COLORS[dim.risk_level] + "20",
                          color: RISK_COLORS[dim.risk_level],
                        }}
                      >
                        {dim.risk_level}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dim.flagged.map((f) => (
                        <div
                          key={f.gene}
                          className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1"
                          title={f.concern}
                        >
                          <span className="font-mono font-semibold text-red-700">{f.gene}</span>
                          <span className="text-gray-500 ml-1">— {f.concern}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Active Pathways ── */}
      {rlData && rlData.active_pathways.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Signaling Pathways</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {rlData.active_pathways.map((p) => (
                <div
                  key={p.pathway}
                  className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5"
                >
                  <span className="text-xs font-semibold text-indigo-700">{p.pathway}</span>
                  <span className="text-xs text-indigo-400">×{p.interaction_count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Top Disease Associations ── */}
      {diseaseData && diseaseData.ranked_diseases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Disease Associations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-2 text-gray-500 font-medium">Disease</th>
                    <th className="pb-2 text-gray-500 font-medium">Therapeutic Area</th>
                    <th className="pb-2 text-gray-500 font-medium">Supporting Genes</th>
                    <th className="pb-2 text-gray-500 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {diseaseData.ranked_diseases.slice(0, 15).map((d) => (
                    <tr key={d.disease_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-800">{d.disease_name}</td>
                      <td className="py-2 text-gray-500 text-xs">
                        {d.therapeutic_areas.slice(0, 2).join(", ") || "—"}
                      </td>
                      <td className="py-2 text-xs text-indigo-600 font-mono">
                        {d.supporting_genes.join(", ")}
                      </td>
                      <td className="py-2 text-right font-mono text-gray-700">
                        {d.total_score.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
