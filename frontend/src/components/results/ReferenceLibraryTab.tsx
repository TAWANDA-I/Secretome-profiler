import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";

interface ReferenceComparison {
  reference_id: string;
  reference_name: string;
  cell_type: string;
  source_tissue: string;
  condition: string;
  reference_size: number;
  shared_count: number;
  shared_proteins: string[];
  unique_to_query: string[];
  unique_to_reference: string[];
  jaccard: number;
  precision: number;
  recall: number;
  f1: number;
  similarity_pct: number;
  top_functions: string[];
  pmids: string[];
}

interface ReferenceLibraryData {
  query_size: number;
  query_genes: string[];
  comparisons: ReferenceComparison[];
  top_match: ReferenceComparison | null;
  summary_text: string;
}

interface ReferenceLibraryTabProps {
  data: ReferenceLibraryData;
}

export default function ReferenceLibraryTab({ data }: ReferenceLibraryTabProps) {
  const [selected, setSelected] = useState<string | null>(
    data.comparisons[0]?.reference_id ?? null
  );

  const selectedComp = data.comparisons.find((c) => c.reference_id === selected);

  if (!data.comparisons.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-400 text-sm">
          No reference secretomes available for comparison.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900">Reference Secretome Library</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {data.query_size} proteins compared to {data.comparisons.length} curated reference secretomes
        </p>
      </div>

      {/* Summary banner */}
      {data.summary_text && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {data.summary_text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: ranked list */}
        <div className="lg:col-span-2 space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
            Similarity Ranking
          </p>
          {data.comparisons.map((comp, idx) => (
            <button
              key={comp.reference_id}
              onClick={() => setSelected(comp.reference_id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                selected === comp.reference_id
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-gray-400 w-4 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {comp.reference_name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 ml-5 truncate">{comp.cell_type}</p>
                </div>
                <div className="shrink-0 text-right">
                  <SimilarityBadge pct={comp.similarity_pct} />
                  <p className="text-xs text-gray-400 mt-0.5">{comp.shared_count} shared</p>
                </div>
              </div>
              {/* Mini similarity bar */}
              <div className="mt-2 ml-5 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${comp.similarity_pct}%`,
                    backgroundColor: getSimilarityColor(comp.similarity_pct),
                  }}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Right: detail panel */}
        <div className="lg:col-span-3">
          {selectedComp ? (
            <DetailPanel comp={selectedComp} querySize={data.query_size} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-gray-400 text-sm">
                Select a reference to view details.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  comp,
  querySize,
}: {
  comp: ReferenceComparison;
  querySize: number;
}) {
  return (
    <Card>
      <CardContent className="py-4 px-5 space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{comp.reference_name}</h3>
          <p className="text-xs text-gray-500">{comp.cell_type} · {comp.source_tissue}</p>
          {comp.condition && (
            <p className="text-xs text-gray-400 mt-0.5 italic">{comp.condition}</p>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard label="Similarity" value={`${comp.similarity_pct.toFixed(1)}%`} sub="F1 × 100" />
          <MetricCard label="Jaccard" value={comp.jaccard.toFixed(3)} sub="overlap index" />
          <MetricCard label="Precision" value={`${(comp.precision * 100).toFixed(1)}%`} sub="of your hits" />
          <MetricCard label="Recall" value={`${(comp.recall * 100).toFixed(1)}%`} sub="of reference" />
        </div>

        {/* Venn summary */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-2">
            <div className="text-lg font-bold text-blue-700">{comp.shared_count}</div>
            <div className="text-gray-500">Shared</div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-2">
            <div className="text-lg font-bold text-gray-600">{querySize - comp.shared_count}</div>
            <div className="text-gray-500">Only in yours</div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-2">
            <div className="text-lg font-bold text-gray-600">
              {comp.reference_size - comp.shared_count}
            </div>
            <div className="text-gray-500">Only in reference</div>
          </div>
        </div>

        {/* Shared proteins */}
        {comp.shared_proteins.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              Shared proteins ({comp.shared_proteins.length})
            </p>
            <ProteinPillList proteins={comp.shared_proteins} color="blue" />
          </div>
        )}

        {/* Unique to query */}
        {comp.unique_to_query.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              Unique to your secretome ({comp.unique_to_query.length > 30 ? "top 30" : comp.unique_to_query.length})
            </p>
            <ProteinPillList proteins={comp.unique_to_query.slice(0, 30)} color="gray" />
          </div>
        )}

        {/* Top functions */}
        {comp.top_functions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Reference top functions</p>
            <div className="flex flex-wrap gap-1">
              {comp.top_functions.map((fn) => (
                <span
                  key={fn}
                  className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-100"
                >
                  {fn}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* PMIDs */}
        {comp.pmids.length > 0 && (
          <p className="text-xs text-gray-400">
            Key references (PubMed): {comp.pmids.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-base font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-400">{sub}</div>
    </div>
  );
}

function ProteinPillList({
  proteins,
  color,
}: {
  proteins: string[];
  color: "blue" | "gray";
}) {
  const cls =
    color === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-100"
      : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
      {proteins.map((p) => (
        <span key={p} className={`px-1.5 py-0.5 rounded text-xs border font-mono ${cls}`}>
          {p}
        </span>
      ))}
    </div>
  );
}

function SimilarityBadge({ pct }: { pct: number }) {
  const color =
    pct >= 40
      ? "bg-green-100 text-green-700"
      : pct >= 20
      ? "bg-blue-100 text-blue-700"
      : pct >= 10
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

function getSimilarityColor(pct: number): string {
  if (pct >= 40) return "#22c55e";
  if (pct >= 20) return "#3b82f6";
  if (pct >= 10) return "#f59e0b";
  return "#d1d5db";
}
