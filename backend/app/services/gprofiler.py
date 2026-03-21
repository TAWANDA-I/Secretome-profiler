"""
Functional enrichment via g:Profiler REST API.
Sources: GO (BP, MF, CC), KEGG, Reactome.

Uses no_evidences=False so that the `intersections` field is returned,
which is a parallel array to the query gene list. Non-empty evidence list
means that gene is in the intersection for a given term.
"""
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GPROFILER_BASE = "https://biit.cs.ut.ee/gprofiler/api/gost/profile/"


def _extract_gene_list(meta: dict, results: list[dict]) -> list[dict]:
    """
    For each term, extract the list of query genes in the intersection.

    The API returns `intersections` as a list parallel to the ordered query
    gene list (from meta). Each element is the evidence-code list for that
    gene; non-empty → gene IS in the intersection.
    """
    # gene_order: ordered list of submitted gene/accession IDs
    try:
        query_data = meta["genes_metadata"]["query"]["query_1"]
        gene_order = list(query_data["mapping"].keys())
    except (KeyError, TypeError):
        gene_order = []

    enriched = []
    for r in results:
        ints = r.get("intersections") or []
        if gene_order and ints:
            genes = [gene_order[i] for i, ev in enumerate(ints) if ev]
        else:
            genes = []
        enriched.append({
            "source": r["source"],
            "term_id": r["native"],
            "term_name": r["name"],
            "p_value": r["p_value"],
            "significant": r["significant"],
            "intersection_size": r["intersection_size"],
            "query_size": r["query_size"],
            "term_size": r["term_size"],
            "genes": genes,
        })
    return enriched


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def run_enrichment(proteins: list[str]) -> dict:
    """Returns enrichment results grouped by source."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GPROFILER_BASE,
            json={
                "organism": "hsapiens",
                "query": proteins,
                "sources": ["GO:BP", "GO:MF", "GO:CC", "KEGG", "REAC"],
                "user_threshold": 0.05,
                "significance_threshold_method": "fdr",
                # no_evidences=False → intersections array included in each term
                "no_evidences": False,
            },
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        data = resp.json()

    raw_results = data.get("result", [])
    meta = data.get("meta", {})
    results = _extract_gene_list(meta, raw_results)

    significant = [r for r in results if r["significant"]]
    sources = sorted({r["source"] for r in significant})

    return {
        "results": results,
        "total_terms": len(significant),
        "sources_found": sources,
        "meta": {
            "organism": meta.get("query_metadata", {}).get("organism", "hsapiens"),
        },
    }
