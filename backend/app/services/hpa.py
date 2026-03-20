"""
Human Protein Atlas (HPA) — tissue expression and blood concentration data.
Uses the HPA JSON API (free, no key required).
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

HPA_BASE = "https://www.proteinatlas.org"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _fetch_protein(client: httpx.AsyncClient, uniprot_id: str) -> dict[str, Any]:
    resp = await client.get(
        f"{HPA_BASE}/{uniprot_id}.json",
        timeout=settings.http_timeout,
    )
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    return resp.json()


async def fetch_concentrations(proteins: list[str]) -> dict[str, Any]:
    """Returns {uniprot_id: {tissue_expression, blood_concentration, ...}} """
    results: dict[str, Any] = {}

    async with httpx.AsyncClient() as client:
        for acc in proteins:
            try:
                data = await _fetch_protein(client, acc)
                if not data:
                    continue
                results[acc] = {
                    "gene": data.get("Gene", ""),
                    "gene_synonym": data.get("Gene synonym", ""),
                    "tissue_specificity": data.get("RNA tissue specificity", ""),
                    "blood_concentration": _extract_blood(data),
                    "tissue_expression": _extract_tissues(data),
                }
            except Exception as exc:
                logger.warning("HPA fetch failed for %s: %s", acc, exc)

    return results


def _extract_blood(data: dict) -> dict:
    for entry in data.get("Protein", {}).get("Blood concentration", []):
        return {
            "concentration_nm": entry.get("Concentration (nm)"),
            "assay": entry.get("Assay type"),
        }
    return {}


def _extract_tissues(data: dict) -> list[dict]:
    tissues = []
    for entry in data.get("Tissue", []):
        tissues.append({
            "tissue": entry.get("Tissue", ""),
            "cell_type": entry.get("Cell type", ""),
            "level": entry.get("Level", ""),
            "reliability": entry.get("Reliability", ""),
        })
    return tissues[:20]  # cap to avoid huge payloads
