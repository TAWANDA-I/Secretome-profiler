"""
Human Protein Atlas (HPA) — tissue expression and blood concentration data.
Uses the HPA JSON API (free, no key required).
Looks up proteins by gene name (from UniProt) since HPA URLs are gene-based.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

HPA_BASE = "https://www.proteinatlas.org"


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=5))
async def _fetch_by_gene(client: httpx.AsyncClient, gene: str) -> dict[str, Any]:
    """Fetch HPA JSON for a gene name (e.g. 'IL6')."""
    resp = await client.get(
        f"{HPA_BASE}/{gene}.json",
        timeout=settings.http_timeout,
        follow_redirects=True,
    )
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    return resp.json()


async def fetch_concentrations(
    proteins: list[str],
    gene_names: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Returns {uniprot_id: {gene, tissue_specificity, blood_concentration, tissue_expression}}.
    gene_names: mapping {uniprot_id: gene_symbol} from UniProt data.
    """
    gene_names = gene_names or {}
    results: dict[str, Any] = {}

    async with httpx.AsyncClient() as client:
        for acc in proteins:
            gene = gene_names.get(acc, "").strip()
            if not gene:
                logger.debug("No gene name for %s — skipping HPA lookup", acc)
                continue
            try:
                data = await _fetch_by_gene(client, gene)
                if not data:
                    continue
                results[acc] = {
                    "gene": data.get("Gene", gene),
                    "gene_synonym": data.get("Gene synonym", ""),
                    "tissue_specificity": data.get("RNA tissue specificity", ""),
                    "blood_concentration": _extract_blood(data),
                    "tissue_expression": _extract_tissues(data),
                    "single_cell_expression": _extract_single_cell(data),
                }
            except Exception as exc:
                logger.warning("HPA fetch failed for %s (%s): %s", acc, gene, exc)

    return results


def _extract_blood(data: dict) -> dict:
    protein_section = data.get("Protein", {})
    if isinstance(protein_section, dict):
        blood_list = protein_section.get("Blood concentration", [])
    else:
        blood_list = []
    for entry in blood_list:
        return {
            "concentration_nm": entry.get("Concentration (nm)"),
            "assay": entry.get("Assay type"),
        }
    return {}


def _extract_tissues(data: dict) -> list[dict]:
    tissues = []
    for entry in data.get("Tissue", []):
        level = entry.get("Level", "")
        if level and level != "Not detected":
            tissues.append({
                "tissue": entry.get("Tissue", ""),
                "cell_type": entry.get("Cell type", ""),
                "level": level,
                "reliability": entry.get("Reliability", ""),
            })
    # Sort by expression level: High > Medium > Low
    _order = {"High": 0, "Medium": 1, "Low": 2}
    tissues.sort(key=lambda x: _order.get(x["level"], 9))
    return tissues[:20]


def _extract_single_cell(data: dict) -> list[dict]:
    cells = []
    for entry in data.get("Single cell type", []):
        cells.append({
            "cell_type": entry.get("Cell type", ""),
            "nTPM": entry.get("nTPM", 0),
        })
    cells.sort(key=lambda x: x.get("nTPM", 0), reverse=True)
    return cells[:10]
