import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

interface SaspData {
  flags: Record<string, boolean>;
  sasp_hits: string[];
  sasp_count: number;
  total: number;
  fraction: number;
}

// SASP category labels (rough groupings by UniProt accession)
const SASP_CATEGORIES: Record<string, string> = {
  P05231: "Interleukin", P01584: "Interleukin", P13232: "Interleukin",
  P15248: "Interleukin", P22301: "Interleukin", P60568: "Interleukin",
  P05112: "Interleukin", P05113: "Interleukin",
  P10145: "Chemokine", P13236: "Chemokine", P13500: "Chemokine",
  P78552: "Chemokine", P19875: "Chemokine", P02778: "Chemokine",
  P01127: "Growth factor", P01133: "Growth factor", P05155: "Growth factor",
  P09038: "Growth factor", P15692: "Growth factor", Q16552: "Growth factor",
  P03956: "MMP", P08253: "MMP", P14780: "MMP", P22894: "MMP", P45452: "MMP",
  P01375: "Cytokine", P05106: "Cytokine", P08887: "Cytokine",
};

interface Props { result: Result; }

export function SaspPanel({ result }: Props) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "sasp"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "sasp"),
  });

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

  const pieOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      data: [
        { value: sasp_count, name: "SASP factors", itemStyle: { color: "#f59e0b" } },
        { value: non_sasp, name: "Other proteins", itemStyle: { color: "#0ea5e9" } },
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
    }],
  };

  const barOption = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 100, right: 20, top: 10, bottom: 30 },
    xAxis: { type: "value", name: "Count" },
    yAxis: {
      type: "category",
      data: Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]),
    },
    series: [{
      type: "bar",
      data: Object.keys(categoryCounts)
        .sort((a, b) => categoryCounts[b] - categoryCounts[a])
        .map((k) => ({ value: categoryCounts[k], itemStyle: { color: "#f59e0b" } })),
    }],
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
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
          <CardHeader><CardTitle>Composition</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={pieOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
        {Object.keys(categoryCounts).length > 0 && (
          <Card>
            <CardHeader><CardTitle>SASP Categories</CardTitle></CardHeader>
            <CardContent>
              <ReactECharts option={barOption} style={{ height: 260 }} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* SASP protein list */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : saspData?.sasp_hits && saspData.sasp_hits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Flagged SASP Proteins ({saspData.sasp_hits.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {saspData.sasp_hits.map((acc) => (
                <div key={acc} className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-mono font-semibold text-amber-800">{acc}</span>
                  <Badge variant="warning" className="text-xs">
                    {SASP_CATEGORIES[acc] ?? "SASP"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
