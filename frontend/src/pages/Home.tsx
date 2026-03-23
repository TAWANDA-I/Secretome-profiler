import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { ModuleName } from "@/types";

const ALL_MODULES: ModuleName[] = [
  "uniprot", "string", "gprofiler", "hpa", "signalp", "sasp",
  "therapeutic", "receptor_ligand", "safety", "disease_context",
  "pk", "reference_library", "llm_interpretation",
];

const MODULE_LABELS: Record<string, string> = {
  uniprot:           "UniProt Annotation",
  string:            "STRING Network",
  gprofiler:         "Functional Enrichment",
  hpa:               "HPA Concentrations",
  signalp:           "Signal Peptide",
  sasp:              "SASP Flagging",
  comparison:        "Two-Set Comparison",
  therapeutic:       "Therapeutic Scoring",
  receptor_ligand:   "Receptor-Ligand",
  safety:            "Safety Profiling",
  disease_context:   "Disease Context",
  pk:                "Pharmacokinetics",
  reference_library: "Reference Library",
  llm_interpretation:"AI Interpretation",
};

const parseProteins = (text: string): string[] =>
  text
    .split(/[,\n\t\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

// Parse "GENE, 12345.0" lines → {gene: number}
function parseConcentrations(text: string): Record<string, number> | null {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const result: Record<string, number> = {};
  for (const line of lines) {
    const parts = line.split(/,\s*/);
    if (parts.length >= 2) {
      const gene = parts[0].trim().toUpperCase();
      const conc = parseFloat(parts[1]);
      if (gene && !isNaN(conc) && conc > 0) result[gene] = conc;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export default function Home() {
  const navigate = useNavigate();
  const { createJob, loading, error, clearError } = useJobStore();

  const [mode, setMode] = useState<"single" | "comparison">("single");

  // Single mode state
  const [raw, setRaw] = useState("");
  const [label, setLabel] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<ModuleName>>(
    new Set(ALL_MODULES)
  );
  // Concentration input mode
  const [concMode, setConcMode] = useState<"names" | "concentrations">("names");

  // Comparison mode state
  const [rawA, setRawA] = useState("");
  const [labelA, setLabelA] = useState("");
  const [rawB, setRawB] = useState("");
  const [labelB, setLabelB] = useState("");
  const [compLabel, setCompLabel] = useState("");

  const toggleModule = (mod: ModuleName) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const proteins = parseProteins(raw);
  const proteinsA = parseProteins(rawA);
  const proteinsB = parseProteins(rawB);

  // Quick overlap preview (no API call)
  const sharedEstimate = (() => {
    if (!proteinsA.length || !proteinsB.length) return 0;
    const setA = new Set(proteinsA);
    return proteinsB.filter((p) => setA.has(p)).length;
  })();

  const handleSingleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (proteins.length === 0) return;
    if (proteins.length > 1000) { alert("Maximum 1000 proteins per job."); return; }

    const concentrations = concMode === "concentrations" ? parseConcentrations(raw) : null;

    const job = await createJob({
      job_type: "single",
      proteins: concentrations ? Object.keys(concentrations) : proteins,
      modules: [...selectedModules],
      label: label || undefined,
      protein_concentrations: concentrations ?? undefined,
    });
    navigate(`/jobs/${job.id}`);
  };

  const handleComparisonSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (proteinsA.length < 10) { alert("Set A requires at least 10 proteins."); return; }
    if (proteinsB.length < 10) { alert("Set B requires at least 10 proteins."); return; }
    if (!labelA.trim()) { alert("Set A label is required."); return; }
    if (!labelB.trim()) { alert("Set B label is required."); return; }
    if (proteinsA.length > 1000 || proteinsB.length > 1000) {
      alert("Maximum 1000 proteins per set.");
      return;
    }
    const job = await createJob({
      job_type: "comparison",
      set_a_proteins: proteinsA,
      set_a_label: labelA.trim(),
      set_b_proteins: proteinsB,
      set_b_label: labelB.trim(),
      label: compLabel || undefined,
    });
    navigate(`/jobs/${job.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Secretome Profiler</h1>
        <p className="text-gray-500 text-sm mt-1">
          Characterise your secretome or compare two conditions side-by-side.
        </p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`p-4 rounded-xl border-2 text-left transition-colors ${
            mode === "single"
              ? "border-primary-600 bg-primary-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="font-semibold text-gray-900 mb-1">Single Secretome</div>
          <div className="text-xs text-gray-500">
            Characterise one protein set with full annotation, network, enrichment,
            therapeutic and safety modules.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("comparison")}
          className={`p-4 rounded-xl border-2 text-left transition-colors ${
            mode === "comparison"
              ? "border-primary-600 bg-primary-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="font-semibold text-gray-900 mb-1">Compare Two Sets</div>
          <div className="text-xs text-gray-500">
            Analyse differences between conditions, treatments or cell types.
            Generates Venn, volcano, and therapeutic comparison views.
          </div>
        </button>
      </div>

      {/* ── Single mode form ── */}
      {mode === "single" && (
        <form onSubmit={handleSingleSubmit} className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Protein IDs</CardTitle>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => { setConcMode("names"); setRaw(""); }}
                    className={`px-3 py-1.5 transition-colors ${concMode === "names" ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    Gene names only
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConcMode("concentrations"); setRaw(""); }}
                    className={`px-3 py-1.5 transition-colors ${concMode === "concentrations" ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    + Concentrations (pg/mL)
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {concMode === "concentrations" && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                  Enter one protein per line as <span className="font-mono">GENE_NAME, concentration_pg_ml</span>
                  <br/>Example: <span className="font-mono">IL6, 45230</span> — enables Concentrations tab with physiological reference comparison.
                </div>
              )}
              <textarea
                className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                placeholder={concMode === "concentrations"
                  ? "IL6, 45230\nVEGFA, 18900\nHGF, 2340\nTGFB1, 890\n..."
                  : "P05231\nP01375\nP01584\n...\n(paste UniProt accessions, one per line or comma-separated)"}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                {concMode === "concentrations"
                  ? (() => {
                      const concs = parseConcentrations(raw);
                      const n = concs ? Object.keys(concs).length : 0;
                      return `${n} protein${n !== 1 ? "s" : ""} with concentrations detected`;
                    })()
                  : `${proteins.length} protein${proteins.length !== 1 ? "s" : ""} detected`
                }
              </p>
            </CardContent>
          </Card>

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
            disabled={
              (concMode === "names" ? proteins.length === 0 : !parseConcentrations(raw)) ||
              selectedModules.size === 0
            }
            className="w-full justify-center"
          >
            Analyse
          </Button>
        </form>
      )}

      {/* ── Comparison mode form ── */}
      {mode === "comparison" && (
        <form onSubmit={handleComparisonSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {/* Set A */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2" />
                  Set A
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Label, e.g. Normoxia MSC"
                  value={labelA}
                  onChange={(e) => setLabelA(e.target.value)}
                  maxLength={100}
                  required
                />
                <textarea
                  className="w-full h-36 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder={"P05231\nP01375\n..."}
                  value={rawA}
                  onChange={(e) => setRawA(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  {proteinsA.length} protein{proteinsA.length !== 1 ? "s" : ""}
                  {proteinsA.length > 0 && proteinsA.length < 10 && (
                    <span className="text-amber-600"> — min. 10 required</span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Set B */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-block w-3 h-3 rounded-full bg-orange-400 mr-2" />
                  Set B
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  type="text"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Label, e.g. Hypoxia MSC"
                  value={labelB}
                  onChange={(e) => setLabelB(e.target.value)}
                  maxLength={100}
                  required
                />
                <textarea
                  className="w-full h-36 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder={"P05231\nP01375\n..."}
                  value={rawB}
                  onChange={(e) => setRawB(e.target.value)}
                />
                <p className="text-xs text-gray-400">
                  {proteinsB.length} protein{proteinsB.length !== 1 ? "s" : ""}
                  {proteinsB.length > 0 && proteinsB.length < 10 && (
                    <span className="text-amber-600"> — min. 10 required</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          {(proteinsA.length > 0 || proteinsB.length > 0) && (
            <Card>
              <CardContent className="py-3">
                <div className="flex items-center gap-6 text-sm text-gray-600">
                  <span>
                    <span className="font-medium text-blue-600">{proteinsA.length}</span> in Set A
                  </span>
                  <span>
                    <span className="font-medium text-orange-500">{proteinsB.length}</span> in Set B
                  </span>
                  {proteinsA.length > 0 && proteinsB.length > 0 && (
                    <span>
                      <span className="font-medium text-purple-600">{sharedEstimate}</span> shared identifiers
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Analysis Label (optional)</CardTitle></CardHeader>
            <CardContent>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. Normoxia vs Hypoxia MSC secretome"
                value={compLabel}
                onChange={(e) => setCompLabel(e.target.value)}
                maxLength={255}
              />
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={loading}
            disabled={proteinsA.length < 10 || proteinsB.length < 10 || !labelA.trim() || !labelB.trim()}
            className="w-full justify-center"
          >
            Compare Sets
          </Button>
        </form>
      )}
    </div>
  );
}
