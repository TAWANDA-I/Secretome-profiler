import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { Result } from "@/types";

cytoscape.use(fcose);

interface StringResult {
  nodes: string[];
  interactions: { source: string; target: string; score: number }[];
}

interface Props { result: Result; }

export function StringNetworkPanel({ result }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const summary = result.summary as Record<string, number>;

  useEffect(() => {
    if (!containerRef.current) return;
    // For real data we would fetch from MinIO; here we demo with summary counts
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        { selector: "node", style: { "background-color": "#0ea5e9", label: "data(id)", "font-size": 8 } },
        { selector: "edge", style: { "line-color": "#94a3b8", width: 1, opacity: 0.6 } },
      ],
      layout: { name: "fcose" } as never,
    });
    return () => cy.destroy();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(summary).map(([k, v]) => (
          <Card key={k} className="text-center">
            <CardContent className="py-5">
              <div className="text-3xl font-bold text-primary-700">{v}</div>
              <div className="text-sm text-gray-500 mt-1 capitalize">{k.replace(/_/g, " ")}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Interaction Network (preview)</CardTitle></CardHeader>
        <CardContent>
          <div ref={containerRef} className="w-full h-96 rounded bg-gray-50" />
          <p className="text-xs text-gray-400 mt-2 text-center">
            Network rendered with Cytoscape.js + fCoSE layout
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
