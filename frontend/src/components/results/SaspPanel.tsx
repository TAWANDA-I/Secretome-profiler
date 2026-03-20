import ReactECharts from "echarts-for-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Result } from "@/types";

interface SaspSummary { sasp_count: number; total: number; }
interface Props { result: Result; }

export function SaspPanel({ result }: Props) {
  const { sasp_count, total } = result.summary as SaspSummary;
  const non_sasp = total - sasp_count;

  const option = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      data: [
        { value: sasp_count, name: "SASP factors", itemStyle: { color: "#f59e0b" } },
        { value: non_sasp, name: "Other proteins", itemStyle: { color: "#0ea5e9" } },
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.3)" } },
    }],
  };

  return (
    <div className="space-y-4">
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
      <Card>
        <CardHeader><CardTitle>SASP Composition</CardTitle></CardHeader>
        <CardContent>
          <ReactECharts option={option} style={{ height: 300 }} />
        </CardContent>
      </Card>
    </div>
  );
}
