"""
Fetch protein annotations from UniProt REST API.
Batches requests in groups of 100 with retry logic.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

UNIPROT_BASE = "https://rest.uniprot.org/uniprotkb"
FIELDS = "accession,reviewed,protein_name,gene_names,organism_name,sequence,go_terms,subcellular_location,keyword"
BATCH_SIZE = 100


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _fetch_batch(client: httpx.AsyncClient, ids: list[str]) -> list[dict]:
    query = " OR ".join(f"accession:{acc}" for acc in ids)
    resp = await client.get(
        f"{UNIPROT_BASE}/search",
        params={"query": query, "fields": FIELDS, "format": "json", "size": len(ids)},
        timeout=settings.http_timeout,
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


async def fetch_annotations(proteins: list[str]) -> dict[str, Any]:
    """Returns {accession: annotation_dict} for all proteins."""
    results: dict[str, Any] = {}
    batches = [proteins[i : i + BATCH_SIZE] for i in range(0, len(proteins), BATCH_SIZE)]

    async with httpx.AsyncClient() as client:
        for batch in batches:
            try:
                entries = await _fetch_batch(client, batch)
                for entry in entries:
                    acc = entry.get("primaryAccession", "")
                    results[acc] = {
                        "accession": acc,
                        "reviewed": entry.get("entryType") == "UniProtKB reviewed (Swiss-Prot)",
                        "protein_name": _extract_protein_name(entry),
                        "gene_name": _extract_gene_name(entry),
                        "organism": entry.get("organism", {}).get("scientificName", ""),
                        "sequence": entry.get("sequence", {}).get("value", ""),
                        "subcellular_location": _extract_locations(entry),
                        "go_terms": _extract_go_terms(entry),
                        "keywords": _extract_keywords(entry),
                    }
            except Exception as exc:
                logger.warning("UniProt batch failed: %s", exc)

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


def _extract_go_terms(entry: dict) -> list[dict]:
    terms = []
    for xref in entry.get("uniProtKBCrossReferences", []):
        if xref.get("database") == "GO":
            terms.append({
                "id": xref.get("id"),
                "term": next((p["value"] for p in xref.get("properties", []) if p["key"] == "GoTerm"), ""),
            })
    return terms


def _extract_keywords(entry: dict) -> list[str]:
    return [kw.get("name", "") for kw in entry.get("keywords", [])]
