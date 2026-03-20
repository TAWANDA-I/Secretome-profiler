import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resultsApi } from "@/api/results";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { UniprotPanel } from "@/components/results/UniprotPanel";
import { StringNetworkPanel } from "@/components/results/StringNetworkPanel";
import { EnrichmentPanel } from "@/components/results/EnrichmentPanel";
import { SaspPanel } from "@/components/results/SaspPanel";
import { SignalpPanel } from "@/components/results/SignalpPanel";
import { HpaPanel } from "@/components/results/HpaPanel";
import { PharosPanel } from "@/components/results/PharosPanel";
import { SummaryPanel } from "@/components/results/SummaryPanel";
import type { Result } from "@/types";

const PANEL_MAP: Record<string, React.ComponentType<{ result: Result }>> = {
  uniprot:   UniprotPanel,
  string:    StringNetworkPanel,
  gprofiler: EnrichmentPanel,
  sasp:      SaspPanel,
  signalp:   SignalpPanel,
  hpa:       HpaPanel,
  pharos:    PharosPanel,
};

const TAB_LABELS: Record<string, string> = {
  summary:   "Summary",
  uniprot:   "UniProt",
  string:    "STRING",
  gprofiler: "Enrichment",
  sasp:      "SASP",
  signalp:   "SignalP",
  hpa:       "HPA",
  pharos:    "Pharos",
  comparison: "Comparison",
};

export default function Results() {
  const { jobId } = useParams<{ jobId: string }>();
  const [activeTab, setActiveTab] = useState<string>("summary");

  const { data: results, isLoading } = useQuery({
    queryKey: ["results", jobId],
    queryFn: () => resultsApi.forJob(jobId!),
    enabled: !!jobId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!results?.length) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 text-center text-gray-400">
        No results available for this job.
      </div>
    );
  }

  const tabs = ["summary", ...results.map((r) => r.module_name)];
  const activeResult = results.find((r) => r.module_name === activeTab);
  const Panel = activeResult ? PANEL_MAP[activeResult.module_name] : null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Analysis Results</h1>
      <p className="text-xs text-gray-400 font-mono">{jobId}</p>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary-600 text-primary-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {TAB_LABELS[tab] ?? tab}
          </button>
        ))}
      </div>

      {/* Panel */}
      {activeTab === "summary" ? (
        <SummaryPanel results={results} />
      ) : Panel && activeResult ? (
        <Panel result={activeResult} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-gray-400 text-sm">
            No visualisation available for this module.
            {activeResult?.minio_key && jobId && (
              <DownloadButton jobId={jobId} moduleName={activeResult.module_name} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DownloadButton({ jobId, moduleName }: { jobId: string; moduleName: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const data = await resultsApi.getModuleData(jobId, moduleName);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${moduleName}_${jobId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="text-sm text-primary-600 hover:underline disabled:opacity-40"
      >
        {loading ? "Downloading…" : "↓ Download JSON"}
      </button>
    </div>
  );
}
