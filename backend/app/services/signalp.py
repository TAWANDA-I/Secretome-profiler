"""
Signal peptide classification using BioPython + heuristics.
Falls back to UniProt subcellular location data.
No external SignalP server required.

Classification types:
  Sec/SPI       — classical signal peptide (UniProt keyword "Signal" or heuristic)
  GPI-anchored  — GPI-anchor attachment (UniProt keyword "GPI-anchor")
  Unconventional — secreted without classical signal (Secreted location, no signal/GPI)
  Other         — no secretion evidence found
"""
import logging
import re
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Heuristic: classical secretory signal = ~15-30 aa hydrophobic N-terminal leader
_HYDROPHOBIC = set("AVILMFYWCG")
_MIN_H_STRETCH = 8


def _heuristic_signal_peptide(sequence: str) -> dict:
    """Simple von Heijne-inspired heuristic on first 30 aa."""
    if not sequence:
        return {"has_sp": False, "type": "Other", "confidence": 0.0}

    h_region = sequence[5:30]
    h_count = sum(1 for aa in h_region if aa in _HYDROPHOBIC)
    has_h_stretch = h_count >= _MIN_H_STRETCH

    # Check for cleavage site motif (AXA pattern ~3 aa before cut)
    has_cleavage = bool(re.search(r"[ACGILSV][ACGILSV]A", sequence[15:35]))

    if has_h_stretch and has_cleavage:
        sp_type = "Sec/SPI"
        confidence = min(0.5 + (h_count - _MIN_H_STRETCH) * 0.05, 0.95)
    elif has_h_stretch:
        sp_type = "Sec/SPI"
        confidence = 0.4
    else:
        sp_type = "Other"
        confidence = 0.8

    return {"has_sp": sp_type == "Sec/SPI", "type": sp_type, "confidence": round(confidence, 2)}


async def classify_signal_peptides(
    proteins: list[str], uniprot_data: dict[str, Any]
) -> dict[str, Any]:
    """Classify each protein. Prefers UniProt annotation, falls back to heuristic."""
    results: dict[str, Any] = {}

    for acc in proteins:
        entry = uniprot_data.get(acc, {})
        sequence = entry.get("sequence", "")
        locations = entry.get("subcellular_location", [])
        keywords = entry.get("keywords", [])
        gene_name = entry.get("gene_name", "")
        protein_name = entry.get("protein_name", "")

        is_secreted = any("Secreted" in loc for loc in locations)
        has_signal_kw = "Signal" in keywords
        has_gpi_kw = "GPI-anchor" in keywords

        if has_gpi_kw:
            result = {
                "has_sp": False,
                "type": "GPI-anchored",
                "confidence": 1.0,
                "source": "uniprot",
            }
        elif has_signal_kw:
            result = {
                "has_sp": True,
                "type": "Sec/SPI",
                "confidence": 1.0,
                "source": "uniprot",
            }
        elif is_secreted:
            # Secreted but no classical signal peptide keyword → unconventional secretion
            result = {
                "has_sp": False,
                "type": "Unconventional",
                "confidence": 0.9,
                "source": "uniprot",
            }
        else:
            pred = _heuristic_signal_peptide(sequence)
            result = {**pred, "source": "heuristic"}

        result["gene_name"] = gene_name
        result["protein_name"] = protein_name
        results[acc] = result

    return results
