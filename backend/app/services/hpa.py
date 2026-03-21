"""
Human Protein Atlas (HPA) — tissue expression and blood concentration data.

API note: the old /{gene}.json URL returns 404.
Current working approach:
  Step 1: GET /api/search_download.php?search={gene}&format=json&columns=g,eg,up,rnatsm
          → returns [{Gene, Ensembl, Uniprot, RNA tissue specific nTPM}]
          → find entry whose Uniprot list contains our accession
  Step 2: GET /{ensembl_id}.json
          → full entry with tissue specificity label, blood concentration, evidence
"""
import asyncio
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

HPA_BASE = "https://www.proteinatlas.org"
_MAX_CONCURRENT = 5  # polite rate limit


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=8))
async def _search_gene(client: httpx.AsyncClient, gene: str) -> list[dict]:
    """Search HPA for a gene name; returns list of matching entries."""
    resp = await client.get(
        f"{HPA_BASE}/api/search_download.php",
        params={"search": gene, "format": "json", "columns": "g,eg,up,rnatsm", "compress": "no"},
        timeout=settings.http_timeout,
        follow_redirects=True,
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json() if isinstance(resp.json(), list) else []


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=8))
async def _fetch_ensg(client: httpx.AsyncClient, ensembl_id: str) -> dict:
    """Fetch full HPA JSON for an Ensembl gene ID."""
    resp = await client.get(
        f"{HPA_BASE}/{ensembl_id}.json",
        timeout=settings.http_timeout,
        follow_redirects=True,
    )
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    return resp.json()


def _nTPM_to_level(nTPM: float) -> str:
    if nTPM >= 100:
        return "High"
    if nTPM >= 10:
        return "Medium"
    return "Low"


def _parse_entry(acc: str, gene: str, protein_name: str, full: dict, quick_nTPM: dict | None) -> dict:
    """Build a standardised HPA result entry."""
    # Tissue expression: prefer full entry's nTPM, fall back to search result
    raw_nTPM: dict = full.get("RNA tissue specific nTPM") or quick_nTPM or {}
    tissue_expression = []
    for tissue, val in raw_nTPM.items():
        try:
            nTPM = float(val)
        except (ValueError, TypeError):
            continue
        tissue_expression.append({
            "tissue": tissue,
            "nTPM": round(nTPM, 2),
            "level": _nTPM_to_level(nTPM),
            "cell_type": "",
            "reliability": "",
        })
    tissue_expression.sort(key=lambda x: x["nTPM"], reverse=True)

    # Blood concentration (pg/L from immunoassay)
    blood_pg_l: float | None = None
    raw_blood = full.get("Blood concentration - Conc. blood IM [pg/L]")
    if raw_blood is not None:
        try:
            blood_pg_l = float(raw_blood)
        except (ValueError, TypeError):
            pass

    return {
        "gene": gene,
        "gene_name": gene,
        "accession": acc,
        "protein_name": protein_name,
        "ensembl_id": full.get("Ensembl", ""),
        "tissue_specificity": full.get("RNA tissue specificity", ""),
        "tissue_expression": tissue_expression[:20],
        "blood_concentration": {
            "concentration_pg_l": blood_pg_l,
            "concentration_nm": None,   # not available from this API
            "assay": "immunoassay" if blood_pg_l is not None else "",
        },
        "subcellular_location": full.get("Subcellular main location") or [],
        "hpa_evidence": full.get("HPA evidence", ""),
    }


async def _fetch_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    acc: str,
    gene: str,
    protein_name: str,
) -> tuple[str, dict | None]:
    """Fetch HPA data for one protein (accession + gene name)."""
    async with sem:
        try:
            entries = await _search_gene(client, gene)
            if not entries:
                # Try capitalised variant
                entries = await _search_gene(client, gene.capitalize())

            # Find entry whose Uniprot list contains our accession
            matched = next(
                (e for e in entries if acc in (e.get("Uniprot") or [])),
                entries[0] if entries else None,
            )
            if not matched:
                logger.debug("HPA: no entry for gene=%s acc=%s", gene, acc)
                return acc, None

            ensembl_id = matched.get("Ensembl", "")
            quick_nTPM = matched.get("RNA tissue specific nTPM")

            full: dict = {}
            if ensembl_id:
                full = await _fetch_ensg(client, ensembl_id)

            entry = _parse_entry(acc, gene, protein_name, full, quick_nTPM)
            return acc, entry

        except Exception as exc:
            logger.warning("HPA fetch failed for %s (%s): %s", acc, gene, exc)
            return acc, None


async def fetch_concentrations(
    proteins: list[str],
    gene_names: dict[str, str] | None = None,
    uniprot_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Returns {uniprot_accession: hpa_entry_dict} for proteins that have HPA data.

    gene_names: {accession: gene_symbol} — required for HPA lookup.
    uniprot_data: full UniProt annotation dict — used for protein_name.
    """
    gene_names = gene_names or {}
    uniprot_data = uniprot_data or {}

    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    results: dict[str, Any] = {}

    async with httpx.AsyncClient() as client:
        tasks = []
        for acc in proteins:
            gene = gene_names.get(acc, "").strip()
            if not gene:
                logger.debug("HPA: no gene name for %s — skipping", acc)
                continue
            protein_name = uniprot_data.get(acc, {}).get("protein_name", "")
            tasks.append(_fetch_one(client, sem, acc, gene, protein_name))

        pairs = await asyncio.gather(*tasks)

    for acc, entry in pairs:
        if entry is not None:
            results[acc] = entry

    logger.info("HPA: fetched %d/%d entries", len(results), len(proteins))
    return results
