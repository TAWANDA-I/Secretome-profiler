import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resultsApi } from "@/api/results";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { Result } from "@/types";

interface UniprotEntry {
  accession: string;
  reviewed: boolean;
  protein_name: string;
  gene_name: string;
  organism: string;
  length: number;
  function: string;
  subcellular_location: string[];
  go_terms: { id: string; term: string }[];
  keywords: string[];
}

interface Props { result: Result; }

type SortKey = "gene_name" | "protein_name" | "organism" | "length";

export function UniprotPanel({ result }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("gene_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ["module-data", result.job_id, "uniprot"],
    queryFn: () => resultsApi.getModuleData(result.job_id, "uniprot"),
  });

  const entries: UniprotEntry[] = useMemo(() => {
    if (!raw || typeof raw !== "object") return [];
    return Object.values(raw as Record<string, UniprotEntry>);
  }, [raw]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries
      .filter(
        (e) =>
          !q ||
          e.gene_name?.toLowerCase().includes(q) ||
          e.protein_name?.toLowerCase().includes(q) ||
          e.accession?.toLowerCase().includes(q) ||
          e.function?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const va = String(a[sortKey] ?? "");
        const vb = String(b[sortKey] ?? "");
        if (sortKey === "length") {
          return sortAsc ? (a.length - b.length) : (b.length - a.length);
        }
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
  }, [entries, search, sortKey, sortAsc]);

  const summary = result.summary as Record<string, number>;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleDownload = () => {
    if (!raw) return;
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uniprot_${result.job_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button
      onClick={() => handleSort(col)}
      className="ml-1 text-gray-400 hover:text-gray-700"
    >
      {sortKey === col ? (sortAsc ? "▲" : "▼") : "⇅"}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
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

      {/* Controls */}
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search gene, protein, function…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        <button
          onClick={handleDownload}
          disabled={!raw}
          className="text-sm text-primary-600 hover:underline disabled:opacity-40"
        >
          ↓ Download JSON
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {filtered.length} / {entries.length} proteins
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Gene <SortBtn col="gene_name" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">
                    Protein Name <SortBtn col="protein_name" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 hidden md:table-cell">
                    Organism <SortBtn col="organism" />
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 hidden md:table-cell">
                    Length <SortBtn col="length" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 hidden lg:table-cell">
                    Location
                  </th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <>
                    <tr
                      key={e.accession}
                      onClick={() => setExpanded(expanded === e.accession ? null : e.accession)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-primary-700">
                        {e.gene_name || e.accession}
                        <span className="text-xs text-gray-400 ml-1">({e.accession})</span>
                      </td>
                      <td className="px-3 py-2 text-gray-800 max-w-xs truncate">
                        {e.protein_name}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs hidden md:table-cell">
                        {e.organism}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 text-xs hidden md:table-cell">
                        {e.length} aa
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 hidden lg:table-cell max-w-xs truncate">
                        {e.subcellular_location?.join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={e.reviewed ? "success" : "secondary"}>
                          {e.reviewed ? "Swiss-Prot" : "TrEMBL"}
                        </Badge>
                      </td>
                    </tr>
                    {expanded === e.accession && (
                      <tr key={`${e.accession}-detail`} className="bg-blue-50">
                        <td colSpan={6} className="px-4 py-3 text-sm space-y-2">
                          {e.function && (
                            <div>
                              <span className="font-semibold text-gray-700">Function: </span>
                              <span className="text-gray-600">{e.function}</span>
                            </div>
                          )}
                          {e.subcellular_location?.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700">Subcellular location: </span>
                              <span className="text-gray-600">{e.subcellular_location.join(" · ")}</span>
                            </div>
                          )}
                          {e.keywords?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {e.keywords.slice(0, 15).map((kw) => (
                                <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                              ))}
                            </div>
                          )}
                          {e.go_terms?.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700">GO ({e.go_terms.length}): </span>
                              <span className="text-gray-500 text-xs">
                                {e.go_terms.slice(0, 5).map((g) => g.term).join(", ")}
                                {e.go_terms.length > 5 ? ` +${e.go_terms.length - 5} more` : ""}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && !isLoading && (
              <p className="text-center text-gray-400 py-8 text-sm">No proteins match your search.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
