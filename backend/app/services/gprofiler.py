"""
Functional enrichment via g:Profiler REST API.
Sources: GO (BP, MF, CC), KEGG, Reactome.
"""
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GPROFILER_BASE = "https://biit.cs.ut.ee/gprofiler/api/gost/profile/"


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
                "no_evidences": False,
            },
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        data = resp.json()

    results = data.get("result", [])
    return {
        "results": [
            {
                "source": r["source"],
                "term_id": r["native"],
                "term_name": r["name"],
                "p_value": r["p_value"],
                "significant": r["significant"],
                "intersection_size": r["intersection_size"],
                "query_size": r["query_size"],
                "term_size": r["term_size"],
                "genes": r.get("intersections", []),
            }
            for r in results
        ],
        "meta": data.get("meta", {}),
    }
