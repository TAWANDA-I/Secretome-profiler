import { useQuery } from "@tanstack/react-query";
import { resultsApi } from "@/api/results";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

interface Props { result: Result; }

export function UniprotPanel({ result }: Props) {
  const { data: downloadData } = useQuery({
    queryKey: ["result-url", result.id],
    queryFn: () => resultsApi.downloadUrl(result.id),
  });

  const summary = result.summary as Record<string, number>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(summary).map(([k, v]) => (
          <Card key={k} className="text-center">
            <CardContent className="py-5">
              <div className="text-3xl font-bold text-primary-700">{v}</div>
              <div className="text-sm text-gray-500 mt-1 capitalize">{k.replace(/_/g, " ")}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {downloadData && (
        <div className="text-center">
          <a
            href={downloadData.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary-600 hover:underline"
          >
            Download full annotations JSON
          </a>
        </div>
      )}
    </div>
  );
}
