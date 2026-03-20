"""
Pharos / TCRD drug target data via GraphQL API.
Target Development Level (TDL): Tclin, Tchem, Tbio, Tdark.
"""
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PHAROS_URL = "https://pharos-api.ncats.io/graphql"

# Simplified query using only stable fields
_QUERY = """
query TargetsByUniprots($uniprots: [String]) {
  targets(filter: { uniprots: $uniprots }) {
    targets {
      uniprot
      sym
      name
      tdl
      diseaseAssociationCount
    }
  }
}
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def fetch_targets(proteins: list[str]) -> dict[str, Any]:
    """Returns {uniprot: pharos_target_info}."""
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        resp = await client.post(
            PHAROS_URL,
            json={"query": _QUERY, "variables": {"uniprots": proteins}},
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        body = resp.json()

    if "errors" in body:
        logger.error("Pharos GraphQL errors: %s", body["errors"])

    results: dict[str, Any] = {}
    for target in body.get("data", {}).get("targets", {}).get("targets", []):
        acc = target.get("uniprot", "")
        if acc:
            results[acc] = {
                "symbol": target.get("sym"),
                "name": target.get("name"),
                "tdl": target.get("tdl"),
                "disease_associations": target.get("diseaseAssociationCount", 0),
            }
    return results
