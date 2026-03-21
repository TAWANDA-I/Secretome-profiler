"""
Fetch protein annotations from UniProt REST API.
Uses individual per-accession GET /uniprotkb/{accession} with concurrent gather.
Also provides normalization of gene-name aliases → UniProt accessions.
"""
import asyncio
import logging
import re
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

UNIPROT_BASE = "https://rest.uniprot.org/uniprotkb"
_MAX_CONCURRENT = 10  # semaphore slots for parallel fetches

# Accession pattern: e.g. P05231, Q9UBP0, A0A000XXX (6 or 10 chars)
_ACCESSION_RE = re.compile(r"^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$")

# Gene-name / protein-alias → canonical gene symbol
ALIAS_TO_GENE: dict[str, str] = {
    "CK18": "KRT18",
    "sFRP-3": "FRZB",
    "Ferritin": "FTH1",
    "GROa": "CXCL1",
    "Thrombomodulin": "THBD",
    "CA125": "MUC16",
    "Dkk-3": "DKK3",
    "OPN": "SPP1",
    "Procalcitonin": "CALCA",
    "LAG-3": "LAG3",
    "CK19": "KRT19",
    "GP73": "GOLM1",
    "TSP-4": "COMP",
    "RANK": "TNFRSF11A",
    "TFPI": "TFPI",
    "IGFBP-2": "IGFBP2",
    "IGFBP-3": "IGFBP3",
}


async def normalize_protein_ids(raw_ids: list[str]) -> list[str]:
    """
    Convert a mixed list (UniProt accessions + gene aliases) to UniProt accessions.
    - Proper accessions pass through unchanged.
    - Known aliases are mapped to gene symbols then resolved via UniProt search.
    - Unknown strings are searched directly in UniProt.
    """
    normalized: list[str] = []
    to_resolve: list[str] = []

    for raw in raw_ids:
        clean = raw.strip()
        if not clean:
            continue
        if _ACCESSION_RE.match(clean):
            normalized.append(clean)
        else:
            gene = ALIAS_TO_GENE.get(clean, clean)
            to_resolve.append(gene)

    if to_resolve:
        resolved = await _resolve_gene_symbols(to_resolve)
        normalized.extend(resolved)

    return list(dict.fromkeys(normalized))  # deduplicate, preserve order


async def _resolve_gene_symbols(genes: list[str]) -> list[str]:
    """Search UniProt for each gene symbol and return accession(s)."""
    accessions: list[str] = []
    async with httpx.AsyncClient() as client:
        for gene in genes:
            try:
                resp = await client.get(
                    f"{UNIPROT_BASE}/search",
                    params={
                        "query": f"gene_exact:{gene} AND organism_id:9606 AND reviewed:true",
                        "fields": "accession",
                        "format": "json",
                        "size": 1,
                    },
                    timeout=settings.http_timeout,
                )
                resp.raise_for_status()
                hits = resp.json().get("results", [])
                if hits:
                    accessions.append(hits[0]["primaryAccession"])
                else:
                    logger.warning("No UniProt accession found for gene/alias: %s", gene)
            except Exception as exc:
                logger.warning("Failed to resolve gene symbol %s: %s", gene, exc)
    return accessions


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _fetch_one(client: httpx.AsyncClient, acc: str) -> dict | None:
    """Fetch a single UniProt entry by accession. Returns None on 404."""
    resp = await client.get(
        f"{UNIPROT_BASE}/{acc}",
        params={"format": "json"},
        timeout=settings.http_timeout,
    )
    if resp.status_code == 404:
        logger.warning("UniProt accession not found: %s", acc)
        return None
    resp.raise_for_status()
    return resp.json()


async def _fetch_with_semaphore(
    client: httpx.AsyncClient, sem: asyncio.Semaphore, acc: str
) -> tuple[str, dict | None]:
    """Acquire semaphore slot, fetch entry, return (accession, entry_or_None)."""
    async with sem:
        try:
            entry = await _fetch_one(client, acc)
            return acc, entry
        except Exception as exc:
            logger.warning("UniProt fetch failed for %s: %s", acc, exc)
            return acc, None


async def fetch_annotations(proteins: list[str]) -> dict[str, Any]:
    """Returns {accession: annotation_dict} for all proteins via individual lookups."""
    sem = asyncio.Semaphore(_MAX_CONCURRENT)
    results: dict[str, Any] = {}

    async with httpx.AsyncClient() as client:
        tasks = [_fetch_with_semaphore(client, sem, acc) for acc in proteins]
        pairs = await asyncio.gather(*tasks)

    for acc, entry in pairs:
        if entry is None:
            continue
        fetched_acc = entry.get("primaryAccession", acc)
        results[fetched_acc] = {
            "accession": fetched_acc,
            "reviewed": entry.get("entryType") == "UniProtKB reviewed (Swiss-Prot)",
            "protein_name": _extract_protein_name(entry),
            "gene_name": _extract_gene_name(entry),
            "organism": entry.get("organism", {}).get("scientificName", ""),
            "length": entry.get("sequence", {}).get("length", 0),
            "sequence": entry.get("sequence", {}).get("value", ""),
            "subcellular_location": _extract_locations(entry),
            "function": _extract_function(entry),
            "go_terms": _extract_go_terms(entry),
            "keywords": _extract_keywords(entry),
        }

    logger.info("UniProt: fetched %d/%d entries", len(results), len(proteins))
    return results


def _extract_protein_name(entry: dict) -> str:
    try:
        return entry["proteinDescription"]["recommendedName"]["fullName"]["value"]
    except (KeyError, TypeError):
        try:
            return entry["proteinDescription"]["submittedNames"][0]["fullName"]["value"]
        except (KeyError, TypeError, IndexError):
            return ""


def _extract_gene_name(entry: dict) -> str:
    try:
        return entry["genes"][0]["geneName"]["value"]
    except (KeyError, TypeError, IndexError):
        return ""


def _extract_locations(entry: dict) -> list[str]:
    locations = []
    for comment in entry.get("comments", []):
        if comment.get("commentType") == "SUBCELLULAR LOCATION":
            for loc in comment.get("subcellularLocations", []):
                loc_val = loc.get("location", {}).get("value", "")
                if loc_val:
                    locations.append(loc_val)
    return locations


def _extract_function(entry: dict) -> str:
    for comment in entry.get("comments", []):
        if comment.get("commentType") == "FUNCTION":
            texts = comment.get("texts", [])
            if texts:
                return texts[0].get("value", "")
    return ""


def _extract_go_terms(entry: dict) -> list[dict]:
    terms = []
    for xref in entry.get("uniProtKBCrossReferences", []):
        if xref.get("database") == "GO":
            terms.append({
                "id": xref.get("id"),
                "term": next(
                    (p["value"] for p in xref.get("properties", []) if p["key"] == "GoTerm"),
                    "",
                ),
            })
    return terms


def _extract_keywords(entry: dict) -> list[str]:
    return [kw.get("name", "") for kw in entry.get("keywords", [])]
