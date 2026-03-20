import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ModuleName } from "@/types";

const ALL_MODULES: ModuleName[] = [
  "uniprot", "string", "gprofiler", "hpa", "signalp", "pharos", "sasp",
];

const MODULE_LABELS: Record<ModuleName, string> = {
  uniprot:    "UniProt Annotation",
  string:     "STRING Network",
  gprofiler:  "Functional Enrichment",
  hpa:        "HPA Concentrations",
  signalp:    "Signal Peptide",
  pharos:     "Pharos Drug Targets",
  sasp:       "SASP Flagging",
  comparison: "Two-Set Comparison",
};

export default function Home() {
  const navigate = useNavigate();
  const { createJob, loading, error, clearError } = useJobStore();

  const [raw, setRaw] = useState("");
  const [label, setLabel] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<ModuleName>>(
    new Set(ALL_MODULES)
  );

  const toggleModule = (mod: ModuleName) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const parseProteins = (text: string): string[] =>
    text
      .split(/[,\n\t\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    const proteins = parseProteins(raw);
    if (proteins.length === 0) return;
    if (proteins.length > 1000) {
      alert("Maximum 1000 proteins per job.");
      return;
    }
    const job = await createJob({
      proteins,
      modules: [...selectedModules],
      label: label || undefined,
    });
    navigate(`/jobs/${job.id}`);
  };

  const proteins = parseProteins(raw);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Secretome Profiler</h1>
        <p className="text-gray-500 text-sm mt-1">
          Enter 1–1000 human UniProt accession IDs to analyse your secretome.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Protein input */}
        <Card>
          <CardHeader>
            <CardTitle>Protein IDs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder={"P05231\nP01375\nP01584\n...\n(paste UniProt accessions, one per line or comma-separated)"}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              {proteins.length} protein{proteins.length !== 1 ? "s" : ""} detected
            </p>
          </CardContent>
        </Card>

        {/* Label */}
        <Card>
          <CardHeader><CardTitle>Job Label (optional)</CardTitle></CardHeader>
          <CardContent>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g. NSCLC plasma secretome"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={255}
            />
          </CardContent>
        </Card>

        {/* Module selection */}
        <Card>
          <CardHeader><CardTitle>Analysis Modules</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MODULES.map((mod) => (
                <label key={mod} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedModules.has(mod)}
                    onChange={() => toggleModule(mod)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{MODULE_LABELS[mod]}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={proteins.length === 0 || selectedModules.size === 0}
          className="w-full justify-center"
        >
          Run Analysis
        </Button>
      </form>
    </div>
  );
}
