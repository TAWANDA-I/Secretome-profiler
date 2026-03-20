import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resultsApi } from "@/api/results";
import type { ProteinRow } from "@/components/results/ProteinListModal";

interface UniprotEntry {
  accession: string;
  gene_name: string;
  protein_name: string;
}

/**
 * Fetches the uniprot module result and returns lookup maps.
 * byAccession: { P05231 → ProteinRow }
 * byGene:      { IL6    → ProteinRow }
 * toRows:      convert a list of accessions or gene symbols → ProteinRow[]
 */
export function useUniprotLookup(jobId: string) {
  const { data: raw } = useQuery({
    queryKey: ["module-data", jobId, "uniprot"],
    queryFn: () => resultsApi.getModuleData(jobId, "uniprot"),
    staleTime: Infinity,
  });

  const byAccession = useMemo((): Record<string, ProteinRow> => {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, ProteinRow> = {};
    for (const [acc, v] of Object.entries(raw as Record<string, UniprotEntry>)) {
      out[acc] = {
        accession: acc,
        gene_name: v.gene_name ?? "",
        protein_name: v.protein_name ?? "",
      };
    }
    return out;
  }, [raw]);

  const byGene = useMemo((): Record<string, ProteinRow> => {
    const out: Record<string, ProteinRow> = {};
    for (const row of Object.values(byAccession)) {
      if (row.gene_name) out[row.gene_name.toUpperCase()] = row;
    }
    return out;
  }, [byAccession]);

  /**
   * Convert a list of identifiers (accessions OR gene symbols) → ProteinRow[].
   * Falls back to creating a minimal row with just the identifier.
   */
  const toRows = (ids: string[]): ProteinRow[] =>
    ids.map((id) => {
      const upper = id.toUpperCase();
      return (
        byAccession[id] ??
        byGene[upper] ??
        { accession: id, gene_name: id, protein_name: "" }
      );
    });

  return { byAccession, byGene, toRows };
}
