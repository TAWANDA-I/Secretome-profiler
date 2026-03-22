import { useState, type ComponentType } from "react";
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
import { SummaryPanel } from "@/components/results/SummaryPanel";
import { TherapeuticTab } from "@/components/results/TherapeuticTab";
import ConcentrationsTab from "@/components/results/ConcentrationsTab";
import PharmacokineticTab from "@/components/results/PharmacokineticTab";
import InterpretationTab from "@/components/results/InterpretationTab";
import ReferenceLibraryTab from "@/components/results/ReferenceLibraryTab";
import SecretomeChat from "@/components/SecretomeChat";
import type { Result } from "@/types";

// Phase 2 modules are rendered together in a single composite tab
const PHASE2_MODULES = new Set(["therapeutic", "receptor_ligand", "safety", "disease_context"]);
// Phase 3+ modules have their own dedicated tabs
const PHASE3_MODULES = new Set(["pk", "concentrations", "reference_library", "llm_interpretation"]);

const PANEL_MAP: Record<string, ComponentType<{ result: Result }>> = {
  uniprot:   UniprotPanel,
  string:    StringNetworkPanel,
  gprofiler: EnrichmentPanel,
  sasp:      SaspPanel,
  signalp:   SignalpPanel,
  hpa:       HpaPanel,
};

const TAB_LABELS: Record<string, string> = {
  summary:           "Summary",
  uniprot:           "UniProt",
  string:            "STRING",
  gprofiler:         "Enrichment",
  sasp:              "SASP",
  signalp:           "SignalP",
  hpa:               "HPA",
  comparison:        "Comparison",
  therapeutic_view:  "Therapeutic",
  pk:                "Pharmacokinetics",
  concentrations:    "Concentrations",
  reference_library: "Reference Library",
  llm_interpretation:"AI Interpretation",
};

export default function Results() {
  const { jobId } = useParams<{ jobId: string }>();
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [showMethodsModal, setShowMethodsModal] = useState(false);

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

  // Separate Phase 2 modules into a single composite "Therapeutic" tab
  const hasPhase2 = results.some((r: Result) => PHASE2_MODULES.has(r.module_name));
  const hasPK = results.some((r: Result) => r.module_name === "pk");
  const hasConcentrations = results.some((r: Result) => r.module_name === "concentrations");
  const hasReferenceLibrary = results.some((r: Result) => r.module_name === "reference_library");
  const hasLLM = results.some((r: Result) => r.module_name === "llm_interpretation");
  const phase1Results = results.filter(
    (r: Result) => !PHASE2_MODULES.has(r.module_name) && !PHASE3_MODULES.has(r.module_name)
  );
  const tabs = [
    "summary",
    ...phase1Results.map((r: Result) => r.module_name),
    ...(hasPhase2 ? ["therapeutic_view"] : []),
    ...(hasPK ? ["pk"] : []),
    ...(hasConcentrations ? ["concentrations"] : []),
    // Always show these tabs — loaders handle missing-data state
    "reference_library",
    "llm_interpretation",
  ];

  const activeResult = results.find((r: Result) => r.module_name === activeTab);
  const Panel = activeResult ? PANEL_MAP[activeResult.module_name] : null;

  const therapeuticResult = results.find((r: Result) => r.module_name === "therapeutic");
  const receptorLigandResult = results.find((r: Result) => r.module_name === "receptor_ligand");
  const safetyResult = results.find((r: Result) => r.module_name === "safety");
  const diseaseContextResult = results.find((r: Result) => r.module_name === "disease_context");

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analysis Results</h1>
          <p className="text-xs text-gray-400 font-mono">{jobId}</p>
        </div>
        <div className="flex gap-2">
          <PDFDownloadButton jobId={jobId!} />
          <button
            onClick={() => setShowMethodsModal(true)}
            className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export Methods
          </button>
        </div>
      </div>

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
      ) : activeTab === "therapeutic_view" ? (
        <TherapeuticTab
          jobId={jobId!}
          therapeuticResult={therapeuticResult}
          receptorLigandResult={receptorLigandResult}
          safetyResult={safetyResult}
          diseaseContextResult={diseaseContextResult}
        />
      ) : activeTab === "pk" ? (
        <PKTabLoader jobId={jobId!} />
      ) : activeTab === "concentrations" ? (
        <ConcentrationsTabLoader jobId={jobId!} />
      ) : activeTab === "reference_library" ? (
        <ReferenceLibraryTabLoader jobId={jobId!} />
      ) : activeTab === "llm_interpretation" ? (
        <LLMTabLoader jobId={jobId!} />
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

      {/* Methods export modal */}
      {showMethodsModal && jobId && (
        <MethodsModal jobId={jobId} onClose={() => setShowMethodsModal(false)} />
      )}

      {/* Floating Q&A assistant */}
      <SecretomeChat jobId={jobId!} />
    </div>
  );
}

function PKTabLoader({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["module_data", jobId, "pk"],
    queryFn: () => resultsApi.getModuleData(jobId, "pk"),
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return <div className="text-center py-8 text-gray-400 text-sm">No pharmacokinetic data available.</div>;
  return <PharmacokineticTab data={data as Parameters<typeof PharmacokineticTab>[0]["data"]} />;
}

function ConcentrationsTabLoader({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["module_data", jobId, "concentrations"],
    queryFn: () => resultsApi.getModuleData(jobId, "concentrations"),
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return <div className="text-center py-8 text-gray-400 text-sm">No concentration data available.</div>;
  return <ConcentrationsTab data={data as Parameters<typeof ConcentrationsTab>[0]["data"]} />;
}

function ReferenceLibraryTabLoader({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["module_data", jobId, "reference_library"],
    queryFn: () => resultsApi.getModuleData(jobId, "reference_library"),
    retry: false,
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return (
    <Card>
      <CardContent className="py-10 text-center space-y-3">
        <div className="text-4xl">📚</div>
        <p className="text-base font-medium text-gray-700">Reference Library not available for this job</p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          This job was created before the Reference Library module was added.
          Submit a new analysis to compare your secretome against 12 curated reference secretomes.
        </p>
      </CardContent>
    </Card>
  );
  return <ReferenceLibraryTab data={data as Parameters<typeof ReferenceLibraryTab>[0]["data"]} />;
}

function LLMTabLoader({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["module_data", jobId, "llm_interpretation"],
    queryFn: () => resultsApi.getModuleData(jobId, "llm_interpretation"),
    retry: false,
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return (
    <Card>
      <CardContent className="py-10 text-center space-y-3">
        <div className="text-4xl">🤖</div>
        <p className="text-base font-medium text-gray-700">AI Interpretation not available for this job</p>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          This job was created before the AI Interpretation module was added.
          Submit a new analysis to generate a Claude-powered scientific report.
        </p>
      </CardContent>
    </Card>
  );
  return <InterpretationTab data={data as Parameters<typeof InterpretationTab>[0]["data"]} />;
}

function PDFDownloadButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/results/job/${jobId}/report.pdf`);
      if (!response.ok) throw new Error("PDF generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `secretome_report_${jobId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors"
    >
      {loading ? "Generating PDF…" : "↓ Download PDF"}
    </button>
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

function MethodsModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["methods_report", jobId],
    queryFn: () => resultsApi.getMethodsReport(jobId),
  });

  const handleCopy = () => {
    if (!data?.text) return;
    navigator.clipboard.writeText(data.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadTxt = () => {
    if (!data?.text) return;
    const blob = new Blob([data.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `methods_${jobId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBib = () => {
    if (!data?.bibtex) return;
    const blob = new Blob([data.bibtex], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `citations_${jobId}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Methods Section — ready for manuscript
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}
          {error && (
            <p className="text-red-600 text-sm">Failed to generate methods section.</p>
          )}
          {data?.text && (
            <textarea
              readOnly
              value={data.text}
              className="w-full h-96 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono text-gray-800 resize-none focus:outline-none"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={handleCopy}
            disabled={!data?.text}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            onClick={handleDownloadTxt}
            disabled={!data?.text}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Download as .txt
          </button>
          <button
            onClick={handleDownloadBib}
            disabled={!data?.bibtex}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Download citations (.bib)
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
