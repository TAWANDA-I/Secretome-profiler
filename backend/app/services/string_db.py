"""
Fetch protein-protein interactions from STRING DB API v12.
"""
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

STRING_BASE = "https://string-db.org/api/json"
SPECIES = 9606  # Homo sapiens


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def fetch_interactions(
    proteins: list[str], score_threshold: int = 400
) -> dict:
    """Returns interaction network with nodes and edges."""
    async with httpx.AsyncClient() as client:
        # Map UniProt IDs to STRING IDs
        resp = await client.post(
            f"{STRING_BASE}/get_string_ids",
            data={
                "identifiers": "\r".join(proteins),
                "species": SPECIES,
                "limit": 1,
                "echo_query": 1,
            },
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        id_map = {item["queryItem"]: item["stringId"] for item in resp.json()}
        string_ids = list(id_map.values())

        if not string_ids:
            return {"interactions": [], "nodes": [], "id_map": {}}

        # Fetch network interactions
        resp2 = await client.post(
            f"{STRING_BASE}/network",
            data={
                "identifiers": "\r".join(string_ids),
                "species": SPECIES,
                "required_score": score_threshold,
                "network_type": "functional",
            },
            timeout=settings.http_timeout,
        )
        resp2.raise_for_status()
        raw = resp2.json()

    interactions = [
        {
            "source": edge["stringId_A"],
            "target": edge["stringId_B"],
            "score": edge["score"],
        }
        for edge in raw
    ]
    nodes = list({n for edge in interactions for n in (edge["source"], edge["target"])})
    return {"interactions": interactions, "nodes": nodes, "id_map": id_map}
