"""
Receptor-Ligand Matching Module.

Matches secretome proteins against the CellChat ligand-receptor database
to identify which cell types are likely targeted and which pathways are active.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_LR_PAIRS: list[dict] | None = None
_DATA_FILE = Path(__file__).parent.parent / "data" / "cellchat_lr_pairs.json"


def _load_lr_pairs() -> list[dict]:
    global _LR_PAIRS
    if _LR_PAIRS is None:
        with open(_DATA_FILE, encoding="utf-8") as fh:
            _LR_PAIRS = json.load(fh)
    return _LR_PAIRS


def _extract_gene_names(proteins: list[str], uniprot_data: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for acc in proteins:
        info = uniprot_data.get(acc, {})
        gn = info.get("gene_name") or info.get("gene_names", "")
        if isinstance(gn, str) and gn:
            names.add(gn.upper())
        elif isinstance(gn, list):
            names.update(g.upper() for g in gn if g)
    # Fallback: treat accessions as gene names if no uniprot data
    if not names:
        names = {p.upper() for p in proteins}
    return names


def match_receptor_ligand(
    proteins: list[str],
    uniprot_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Match secretome gene names against CellChat LR database.

    Returns:
      active_pairs: list of matched LR pairs with details
      target_cell_types: ranked list of targeted cell types with scores
      active_pathways: ranked list of activated pathways
      coverage_percent: fraction of LR database covered
    """
    lr_pairs = _load_lr_pairs()
    gene_names = _extract_gene_names(proteins, uniprot_data)

    active_pairs: list[dict] = []
    cell_scores: dict[str, int] = {}
    pathway_scores: dict[str, int] = {}

    for pair in lr_pairs:
        ligand = (pair.get("ligand") or "").upper()
        if ligand not in gene_names:
            continue

        active_pairs.append({
            "ligand": pair.get("ligand"),
            "receptor": pair.get("receptor"),
            "pathway": pair.get("pathway"),
            "target_cells": pair.get("target_cells", []),
            "effect": pair.get("effect"),
        })

        for cell in pair.get("target_cells", []):
            cell_scores[cell] = cell_scores.get(cell, 0) + 1

        pw = pair.get("pathway", "")
        if pw:
            pathway_scores[pw] = pathway_scores.get(pw, 0) + 1

    # Rank target cell types
    ranked_cells = [
        {"cell_type": cell, "interaction_count": count}
        for cell, count in sorted(cell_scores.items(), key=lambda x: x[1], reverse=True)
    ]

    # Rank pathways
    ranked_pathways = [
        {"pathway": pw, "interaction_count": count}
        for pw, count in sorted(pathway_scores.items(), key=lambda x: x[1], reverse=True)
    ]

    coverage_pct = round(len(active_pairs) / len(lr_pairs) * 100, 1) if lr_pairs else 0.0

    return {
        "active_pairs": active_pairs,
        "target_cell_types": ranked_cells[:20],
        "active_pathways": ranked_pathways[:15],
        "total_pairs_matched": len(active_pairs),
        "total_pairs_in_db": len(lr_pairs),
        "coverage_percent": coverage_pct,
        "gene_names_used": sorted(gene_names),
    }
