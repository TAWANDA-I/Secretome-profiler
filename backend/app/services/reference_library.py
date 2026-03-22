"""
Reference secretome library comparison.

Compares a user's secretome against 12 curated reference secretomes
using Jaccard similarity, precision, recall, and F1 score.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REF_PATH = Path(__file__).parent.parent / "data" / "reference_secretomes.json"


def _load_library() -> list[dict[str, Any]]:
    try:
        data = json.loads(_REF_PATH.read_text())
        return data.get("secretomes", [])
    except Exception as exc:
        logger.error("Failed to load reference secretome library: %s", exc)
        return []


_LIBRARY: list[dict[str, Any]] = _load_library()


def _extract_gene_names(proteins: list[str], uniprot_data: dict[str, Any]) -> set[str]:
    """Resolve protein list to upper-cased gene names using uniprot_data."""
    gene_set: set[str] = set()

    # Build accession -> gene name map
    acc_to_gene: dict[str, str] = {}
    for acc, info in uniprot_data.items():
        if not isinstance(info, dict):
            continue
        gene = info.get("gene_name") or ""
        if gene:
            acc_to_gene[acc.upper()] = gene.upper()

    for p in proteins:
        p_upper = p.upper()
        if p_upper in acc_to_gene:
            gene_set.add(acc_to_gene[p_upper])
        else:
            gene_set.add(p_upper)

    return gene_set


def compare_to_references(
    proteins: list[str],
    uniprot_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Compare the query secretome against all reference secretomes.

    Returns:
        {
          "query_size": int,
          "query_genes": list[str],
          "comparisons": list[{
            "reference_id": str,
            "reference_name": str,
            "cell_type": str,
            "source_tissue": str,
            "condition": str,
            "reference_size": int,
            "shared_count": int,
            "shared_proteins": list[str],
            "unique_to_query": list[str],
            "unique_to_reference": list[str],
            "jaccard": float,
            "precision": float,
            "recall": float,
            "f1": float,
            "similarity_pct": float,
            "top_functions": list[str],
            "pmids": list[str],
          }],
          "top_match": dict,
          "summary_text": str,
        }
    """
    if not _LIBRARY:
        return {
            "query_size": len(proteins),
            "query_genes": proteins,
            "comparisons": [],
            "top_match": None,
            "summary_text": "Reference library unavailable.",
        }

    query_genes = _extract_gene_names(proteins, uniprot_data)
    comparisons: list[dict[str, Any]] = []

    for ref in _LIBRARY:
        ref_genes = {g.upper() for g in ref.get("proteins", [])}
        if not ref_genes:
            continue

        shared = query_genes & ref_genes
        union = query_genes | ref_genes

        jaccard = len(shared) / len(union) if union else 0.0
        precision = len(shared) / len(query_genes) if query_genes else 0.0
        recall = len(shared) / len(ref_genes) if ref_genes else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )
        similarity_pct = f1 * 100

        unique_to_query = sorted(query_genes - ref_genes)
        unique_to_ref = sorted(ref_genes - query_genes)

        comparisons.append({
            "reference_id": ref["id"],
            "reference_name": ref["name"],
            "cell_type": ref["cell_type"],
            "source_tissue": ref["source_tissue"],
            "condition": ref.get("condition", ""),
            "reference_size": len(ref_genes),
            "shared_count": len(shared),
            "shared_proteins": sorted(shared),
            "unique_to_query": unique_to_query[:30],
            "unique_to_reference": unique_to_ref[:30],
            "jaccard": round(jaccard, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "similarity_pct": round(similarity_pct, 1),
            "top_functions": ref.get("top_functions", []),
            "pmids": ref.get("pmids", []),
        })

    comparisons.sort(key=lambda x: x["f1"], reverse=True)

    top_match = comparisons[0] if comparisons else None

    # Build summary text
    if top_match:
        summary_text = (
            f"Your secretome most closely resembles the "
            f"{top_match['reference_name']} "
            f"({top_match['similarity_pct']:.0f}% similarity, "
            f"Jaccard={top_match['jaccard']:.2f}). "
            f"{top_match['shared_count']} proteins are shared "
            f"out of {len(query_genes)} in your secretome "
            f"and {top_match['reference_size']} in the reference."
        )
    else:
        summary_text = "No comparable reference secretomes found."

    return {
        "query_size": len(query_genes),
        "query_genes": sorted(query_genes),
        "comparisons": comparisons,
        "top_match": top_match,
        "summary_text": summary_text,
    }
