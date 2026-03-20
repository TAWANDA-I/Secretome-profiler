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

interface SaspData {
  flags: Record<string, boolean>;
  sasp_hits: string[];
  sasp_count: number;
  total: number;
  fraction: number;
}

const SASP_CATEGORIES: Record<string, string> = {
  P05231: "Interleukin", P01584: "Interleukin", P13232: "Interleukin",
  P15248: "Interleukin", P22301: "Interleukin", P60568: "Interleukin",
  P05112: "Interleukin", P05113: "Interleukin",
  P10145: "Chemokine",   P13236: "Chemokine",   P13500: "Chemokine",
  P78552: "Chemokine",   P19875: "Chemokine",   P02778: "Chemokine",
  P01127: "Growth factor", P01133: "Growth factor", P05155: "Growth factor",
  P09038: "Growth factor", P15692: "Growth factor", Q16552: "Growth factor",
  P03956: "MMP", P08253: "MMP", P14780: "MMP", P22894: "MMP", P45452: "MMP",
  P01375: "Cytokine", P05106: "Cytokine", P08887: "Cytokine",
};

interface ModalState { title: string; subtitle?: string; proteins: string[]; }
interface Props { result: Result; }

export function SaspPanel({ result }: Props) {
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "sasp"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "sasp"),
  });
  const { toRows } = useUniprotLookup(result.job_id);

  const saspData = raw as SaspData | undefined;
  const summary = result.summary as { sasp_count: number; total: number };
  const { sasp_count, total } = saspData ?? summary;
  const non_sasp = total - sasp_count;

  const categoryCounts = useMemo(() => {
    if (!saspData?.sasp_hits) return {};
    const counts: Record<string, number> = {};
    for (const acc of saspData.sasp_hits) {
      const cat = SASP_CATEGORIES[acc] ?? "Other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [saspData]);

  const categoryProteins = useMemo(() => {
    if (!saspData?.sasp_hits) return {} as Record<string, string[]>;
    const map: Record<string, string[]> = {};
    for (const acc of saspData.sasp_hits) {
      const cat = SASP_CATEGORIES[acc] ?? "Other";
      (map[cat] ??= []).push(acc);
    }
    return map;
  }, [saspData]);

  const sortedCategories = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]),
    [categoryCounts]
  );

  const pieOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)<br/><span style='color:#94a3b8;font-size:11px'>Click to see proteins</span>" },
    legend: { bottom: 0 },
    series: [{
      type: "pie", radius: ["40%", "70%"], cursor: "pointer",
      data: [
        { value: sasp_count, name: "SASP factors",   itemStyle: { color: "#f59e0b" } },
        { value: non_sasp,   name: "Other proteins", itemStyle: { color: "#0ea5e9" } },
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
    }],
  };

  const barOption = {
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p: { name: string; value: number }[]) =>
        `${p[0].name}: ${p[0].value}<br/><span style="color:#94a3b8;font-size:11px">Click to see proteins</span>`,
    },
    grid: { left: 100, right: 20, top: 10, bottom: 30 },
    xAxis: { type: "value", name: "Count" },
    yAxis: { type: "category", data: sortedCategories },
    series: [{
      type: "bar", cursor: "pointer",
      data: sortedCategories.map((k) => ({ value: categoryCounts[k], itemStyle: { color: "#f59e0b" } })),
    }],
  };

  const handlePieClick = (params: { name: string }) => {
    if (params.name === "SASP factors" && saspData?.sasp_hits) {
      setModal({ title: "SASP Factor Proteins", subtitle: `${sasp_count} proteins`, proteins: saspData.sasp_hits });
    }
  };

  const handleBarClick = (params: { name: string }) => {
    const proteins = categoryProteins[params.name] ?? [];
    setModal({ title: `${params.name} — SASP proteins`, subtitle: `${proteins.length} proteins`, proteins });
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

      <div className="grid grid-cols-3 gap-4 text-center">
        <Card><CardContent className="py-5">
          <div className="text-3xl font-bold text-amber-600">{sasp_count}</div>
          <div className="text-sm text-gray-500 mt-1">SASP factors</div>
        </CardContent></Card>
        <Card><CardContent className="py-5">
          <div className="text-3xl font-bold text-primary-700">{total}</div>
          <div className="text-sm text-gray-500 mt-1">Total proteins</div>
        </CardContent></Card>
        <Card><CardContent className="py-5">
          <div className="text-3xl font-bold text-gray-700">
            {total > 0 ? ((sasp_count / total) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-gray-500 mt-1">SASP fraction</div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Composition
              <span className="text-xs font-normal text-gray-400 ml-2">— click to see proteins</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={pieOption} style={{ height: 260 }} onEvents={{ click: handlePieClick }} />
          </CardContent>
        </Card>
        {sortedCategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>SASP Categories
                <span className="text-xs font-normal text-gray-400 ml-2">— click to see proteins</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReactECharts option={barOption} style={{ height: 260 }} onEvents={{ click: handleBarClick }} />
            </CardContent>
          </Card>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : saspData?.sasp_hits?.length ? (
        <Card>
          <CardHeader><CardTitle>Flagged SASP Proteins ({saspData.sasp_hits.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {saspData.sasp_hits.map((acc) => {
                const row = toRows([acc])[0];
                return (
                  <div key={acc} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <span className="text-xs font-mono font-semibold text-amber-800">{acc}</span>
                    {row.gene_name && row.gene_name !== acc && (
                      <span className="text-xs font-bold text-amber-900">{row.gene_name}</span>
                    )}
                    <Badge variant="warning" className="text-xs">
                      {SASP_CATEGORIES[acc] ?? "SASP"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
