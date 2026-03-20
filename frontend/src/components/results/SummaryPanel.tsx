import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Result } from "@/types";

interface SummaryPanelProps { results: Result[]; }

export function SummaryPanel({ results }: SummaryPanelProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {results.map((r) => (
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
  );
}
