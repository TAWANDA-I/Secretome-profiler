import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Result } from "@/types";

const PHASE2_MODULES = new Set(["therapeutic", "receptor_ligand", "safety", "disease_context"]);

const RISK_COLORS: Record<string, string> = {
  Low: "#10b981",
  Moderate: "#f59e0b",
  High: "#ef4444",
};

interface SummaryPanelProps { results: Result[]; }

function TherapeuticSnapshot({ results }: { results: Result[] }) {
  const therapeutic = results.find((r: Result) => r.module_name === "therapeutic");
  const safety = results.find((r: Result) => r.module_name === "safety");
  const rl = results.find((r: Result) => r.module_name === "receptor_ligand");
  const disease = results.find((r: Result) => r.module_name === "disease_context");

  if (!therapeutic && !safety && !rl && !disease) return null;

  const topIndication = therapeutic?.summary?.top_indication as string | undefined;
  const confidence = therapeutic?.summary?.confidence as string | undefined;
  const riskLevel = safety?.summary?.risk_level as string | undefined;
  const pairsMatched = rl?.summary?.pairs_matched as number | undefined;
  const topDisease = disease?.summary?.top_disease as string | undefined;

  return (
    <Card className="border-l-4 border-l-violet-500 mb-2">
      <CardHeader>
        <CardTitle>Therapeutic Snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {topIndication && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Top Indication</div>
              <div className="text-sm font-semibold text-gray-800">{topIndication}</div>
              {confidence && (
                <div className="text-xs text-gray-400">{confidence} confidence</div>
              )}
            </div>
          )}
          {riskLevel && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Safety Risk</div>
              <div
                className="text-sm font-semibold"
                style={{ color: RISK_COLORS[riskLevel] ?? "#6b7280" }}
              >
                {riskLevel}
              </div>
            </div>
          )}
          {pairsMatched !== undefined && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">LR Pairs Matched</div>
              <div className="text-sm font-semibold text-gray-800">{pairsMatched}</div>
            </div>
          )}
          {topDisease && (
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Top Disease Context</div>
              <div className="text-sm font-semibold text-gray-800 truncate" title={topDisease}>
                {topDisease}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryPanel({ results }: SummaryPanelProps) {
  const phase1 = results.filter((r: Result) => !PHASE2_MODULES.has(r.module_name));

  return (
    <div className="space-y-4">
      <TherapeuticSnapshot results={results} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {phase1.map((r: Result) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="capitalize">{r.module_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
                {Object.entries(r.summary).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-gray-500 capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-medium text-gray-900">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
