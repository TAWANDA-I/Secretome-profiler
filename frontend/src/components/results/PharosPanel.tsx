import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

interface PharosEntry {
  symbol: string;
  name: string;
  tdl: string;
  disease_associations: number;
}

type PharosData = Record<string, PharosEntry>;

const TDL_COLOR: Record<string, string> = {
  Tclin: "#10b981",
  Tchem: "#0ea5e9",
  Tbio:  "#f59e0b",
  Tdark: "#64748b",
};

const TDL_DESC: Record<string, string> = {
  Tclin: "Clinical drug target",
  Tchem: "Chemical probe exists",
  Tbio:  "Biological info available",
  Tdark: "Understudied target",
};

interface Props { result: Result; }

export function PharosPanel({ result }: Props) {
  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "pharos"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "pharos"),
  });

  const entries = useMemo(() => {
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as PharosData).map(([acc, v]) => ({ acc, ...v }));
  }, [raw]);

  const summary = result.summary as Record<string, number>;

  const tdlCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.tdl] = (c[e.tdl] ?? 0) + 1;
    return c;
  }, [entries]);

  const pieOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      data: Object.entries(tdlCounts).map(([tdl, v]) => ({
        value: v,
        name: `${tdl} — ${TDL_DESC[tdl] ?? tdl}`,
        itemStyle: { color: TDL_COLOR[tdl] ?? "#94a3b8" },
      })),
    }],
  };

  const handleDownload = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pharos_${result.job_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["Tclin", "Tchem", "Tbio", "Tdark"] as const).map((tdl) => (
          <Card key={tdl} className="text-center">
            <CardContent className="py-4">
              <div className="text-2xl font-bold" style={{ color: TDL_COLOR[tdl] }}>
                {summary[tdl.toLowerCase()] ?? tdlCounts[tdl] ?? 0}
              </div>
              <div className="text-xs font-semibold mt-1" style={{ color: TDL_COLOR[tdl] }}>{tdl}</div>
              <div className="text-xs text-gray-400">{TDL_DESC[tdl]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          {Object.keys(tdlCounts).length > 0 && (
            <Card>
              <CardHeader><CardTitle>Target Development Level Distribution</CardTitle></CardHeader>
              <CardContent>
                <ReactECharts option={pieOption} style={{ height: 260 }} />
              </CardContent>
            </Card>
          )}

          {entries.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Target Annotations ({entries.length})</CardTitle>
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
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Gene</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 hidden md:table-cell">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">TDL</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Disease Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries
                      .sort((a, b) => {
                        const order = { Tclin: 0, Tchem: 1, Tbio: 2, Tdark: 3 };
                        return (order[a.tdl as keyof typeof order] ?? 4) - (order[b.tdl as keyof typeof order] ?? 4);
                      })
                      .map((e) => (
                        <tr key={e.acc} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-primary-700">{e.acc}</td>
                          <td className="px-3 py-2 font-semibold">{e.symbol}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs hidden md:table-cell max-w-xs truncate">
                            {e.name}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="secondary"
                              style={{
                                background: (TDL_COLOR[e.tdl] ?? "#94a3b8") + "20",
                                color: TDL_COLOR[e.tdl] ?? "#64748b",
                              }}
                            >
                              {e.tdl}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{e.disease_associations ?? 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
