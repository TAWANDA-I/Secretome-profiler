import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

interface SignalpEntry {
  has_sp: boolean;
  type: string;
  confidence: number;
  source: string;
}

type SignalpData = Record<string, SignalpEntry>;

interface Props { result: Result; }

export function SignalpPanel({ result }: Props) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "signalp"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "signalp"),
  });

  const entries = useMemo(() => {
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as SignalpData).map(([acc, v]) => ({ acc, ...v }));
  }, [raw]);

  const classical = entries.filter((e) => e.has_sp && e.type === "Sec/SPI");
  const notSP = entries.filter((e) => !e.has_sp);
  const summary = result.summary as { classical_sp: number; no_sp: number };

  const pieOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      data: [
        { value: classical.length || summary.classical_sp, name: "Classical SP (Sec/SPI)", itemStyle: { color: "#10b981" } },
        { value: notSP.length || summary.no_sp, name: "No signal peptide", itemStyle: { color: "#94a3b8" } },
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" } },
    }],
  };

  const badgeVariant = (e: { has_sp: boolean; type: string }) => {
    if (e.has_sp) return "success";
    return "secondary";
  };

  const handleDownload = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signalp_${result.job_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center">
          <CardContent className="py-5">
            <div className="text-3xl font-bold text-emerald-600">
              {classical.length || summary.classical_sp}
            </div>
            <div className="text-sm text-gray-500 mt-1">Classical SP (Sec/SPI)</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="py-5">
            <div className="text-3xl font-bold text-gray-500">
              {notSP.length || summary.no_sp}
            </div>
            <div className="text-sm text-gray-500 mt-1">No signal peptide</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Signal Peptide Composition</CardTitle></CardHeader>
        <CardContent>
          <ReactECharts option={pieOption} style={{ height: 260 }} />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : entries.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Per-Protein Classification</CardTitle>
              <button onClick={handleDownload} className="text-xs text-primary-600 hover:underline">
                ↓ JSON
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Accession</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Classification</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Confidence</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .sort((a, b) => (b.has_sp ? 1 : 0) - (a.has_sp ? 1 : 0) || b.confidence - a.confidence)
                  .map((e) => (
                    <tr key={e.acc} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-primary-700">{e.acc}</td>
                      <td className="px-3 py-2">
                        <Badge variant={badgeVariant(e)}>
                          {e.has_sp ? "Classical SP" : "Not secreted"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: e.confidence > 0.7 ? "#10b981" : e.confidence > 0.4 ? "#f59e0b" : "#94a3b8" }}
                        >
                          {(e.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 capitalize">
                        {e.source === "uniprot" ? "UniProt annotation" : "Heuristic (von Heijne)"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
