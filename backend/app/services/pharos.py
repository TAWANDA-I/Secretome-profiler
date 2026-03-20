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

_QUERY = """
query TargetsByUniprots($uniprots: [String]) {
  targets(filter: { uniprots: $uniprots }) {
    targets {
      uniprot
      sym
      name
      tdl
      diseaseAssociationCount
      ligandCounts { ligandCount }
      dto { name }
    }
  }
}
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def fetch_targets(proteins: list[str]) -> dict[str, Any]:
    """Returns {uniprot: pharos_target_info}."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            PHAROS_URL,
            json={"query": _QUERY, "variables": {"uniprots": proteins}},
            headers={"Content-Type": "application/json"},
            timeout=settings.http_timeout,
        )
        resp.raise_for_status()
        data = resp.json()

    results: dict[str, Any] = {}
    for target in data.get("data", {}).get("targets", {}).get("targets", []):
        acc = target.get("uniprot", "")
        if acc:
            results[acc] = {
                "symbol": target.get("sym"),
                "name": target.get("name"),
                "tdl": target.get("tdl"),
                "disease_associations": target.get("diseaseAssociationCount", 0),
                "ligand_count": target.get("ligandCounts", {}).get("ligandCount", 0),
                "dto_class": (target.get("dto") or [{}])[0].get("name"),
            }
    return results
