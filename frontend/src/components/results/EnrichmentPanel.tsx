import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Result } from "@/types";

interface Props { result: Result; }

export function EnrichmentPanel({ result }: Props) {
  const summary = result.summary as { term_count: number };

  // Placeholder chart option — real data loaded from MinIO in full implementation
  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", name: "-log10(FDR)" },
    yAxis: { type: "category", data: ["Term A", "Term B", "Term C", "Term D", "Term E"] },
    series: [{
      type: "bar",
      data: [4.2, 3.8, 3.1, 2.7, 2.1],
      itemStyle: { color: "#0ea5e9" },
    }],
    grid: { left: 80, right: 20 },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-5 text-center">
          <div className="text-3xl font-bold text-primary-700">{summary.term_count}</div>
          <div className="text-sm text-gray-500 mt-1">Significant terms (FDR &lt; 0.05)</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Top Enriched Terms</CardTitle></CardHeader>
        <CardContent>
          <ReactECharts option={option} style={{ height: 300 }} />
          <p className="text-xs text-gray-400 mt-2 text-center">
            GO:BP / GO:MF / KEGG / Reactome — full results in JSON download
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
