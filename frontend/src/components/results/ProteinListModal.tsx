import { useEffect } from "react";

export interface ProteinRow {
  accession: string;
  gene_name: string;
  protein_name: string;
}

interface Props {
  title: string;
  subtitle?: string;
  proteins: ProteinRow[];
  onClose: () => void;
}

export function ProteinListModal({ title, subtitle, proteins, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-gray-400 hover:text-gray-700 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Protein table */}
        <div className="overflow-y-auto flex-1">
          {proteins.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">
              No proteins found for this selection.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 w-24">UniProt</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600 w-20">Gene</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Protein Name</th>
                </tr>
              </thead>
              <tbody>
                {proteins.map((p, i) => (
                  <tr
                    key={p.accession || i}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-primary-700">
                      <a
                        href={`https://www.uniprot.org/uniprotkb/${p.accession}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {p.accession}
                      </a>
                    </td>
                    <td className="px-4 py-2 font-semibold text-gray-800">
                      {p.gene_name || "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs leading-snug">
                      {p.protein_name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
          <span>{proteins.length} protein{proteins.length !== 1 ? "s" : ""}</span>
          <button onClick={onClose} className="text-primary-600 hover:underline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
