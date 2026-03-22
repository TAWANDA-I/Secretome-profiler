"""
Disease Context Matching Module.

Queries the Open Targets GraphQL API to build disease enrichment scores
for each protein in the secretome.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPENTARGETS_URL = settings.opentargets_api_url

_QUERY = """
query DiseaseAssociations($ensemblId: String!, $size: Int!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    associatedDiseases(page: {index: 0, size: $size}) {
      count
      rows {
        disease {
          id
          name
          therapeuticAreas {
            name
          }
        }
        score
        datatypeScores {
          componentId
          score
        }
      }
    }
  }
}
"""

_UNIPROT_TO_ENSEMBL_QUERY = """
query UniprotToEnsembl($uniprotId: String!) {
  targets(
    page: {index: 0, size: 1}
    filter: {
      aggregations: null
      enableIndirect: false
      ids: null
    }
    queryString: $uniprotId
  ) {
    rows {
      id
      approvedSymbol
    }
  }
}
"""


async def _fetch_ensembl_id(client: httpx.AsyncClient, uniprot_acc: str) -> str | None:
    """Try to resolve a UniProt accession to an Ensembl gene ID via Open Targets."""
    try:
        resp = await client.post(
            OPENTARGETS_URL,
            json={"query": _UNIPROT_TO_ENSEMBL_QUERY, "variables": {"uniprotId": uniprot_acc}},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("data", {}).get("targets", {}).get("rows", [])
        return rows[0]["id"] if rows else None
    except Exception as exc:
        logger.debug("Ensembl lookup failed for %s: %s", uniprot_acc, exc)
        return None


async def _fetch_disease_associations(
    client: httpx.AsyncClient,
    ensembl_id: str,
    symbol: str,
    size: int = 10,
) -> list[dict]:
    """Fetch top disease associations for one target from Open Targets."""
    try:
        resp = await client.post(
            OPENTARGETS_URL,
            json={"query": _QUERY, "variables": {"ensemblId": ensembl_id, "size": size}},
            timeout=25,
        )
        resp.raise_for_status()
        data = resp.json()
        target_data = (data.get("data") or {}).get("target")
        if not target_data:
            return []
        rows = target_data.get("associatedDiseases", {}).get("rows", [])
        result = []
        for row in rows:
            disease = row.get("disease", {})
            areas = [a["name"] for a in disease.get("therapeuticAreas", [])]
            result.append({
                "disease_id": disease.get("id"),
                "disease_name": disease.get("name"),
                "therapeutic_areas": areas,
                "score": round(row.get("score", 0), 4),
                "gene_symbol": symbol,
                "ensembl_id": ensembl_id,
            })
        return result
    except Exception as exc:
        logger.debug("Disease assoc fetch failed for %s: %s", ensembl_id, exc)
        return []


def _aggregate_diseases(all_assocs: list[dict]) -> list[dict]:
    """Aggregate per-protein disease associations into ranked disease list."""
    disease_map: dict[str, dict] = {}
    for assoc in all_assocs:
        did = assoc.get("disease_id")
        if not did:
            continue
        if did not in disease_map:
            disease_map[did] = {
                "disease_id": did,
                "disease_name": assoc.get("disease_name", ""),
                "therapeutic_areas": assoc.get("therapeutic_areas", []),
                "total_score": 0.0,
                "supporting_genes": [],
                "evidence_count": 0,
            }
        disease_map[did]["total_score"] += assoc.get("score", 0.0)
        gene = assoc.get("gene_symbol")
        if gene and gene not in disease_map[did]["supporting_genes"]:
            disease_map[did]["supporting_genes"].append(gene)
        disease_map[did]["evidence_count"] += 1

    ranked = sorted(disease_map.values(), key=lambda x: x["total_score"], reverse=True)
    for item in ranked:
        item["total_score"] = round(item["total_score"], 4)
    return ranked[:30]


async def fetch_disease_context(
    proteins: list[str],
    uniprot_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Query Open Targets for each protein and build a disease enrichment profile.
    """
    # Build gene-symbol → accession map from uniprot_data
    gene_symbols: dict[str, str] = {}
    for acc, info in uniprot_data.items():
        gn = info.get("gene_name", "")
        if gn:
            gene_symbols[acc] = gn

    per_protein: dict[str, Any] = {}
    all_assocs: list[dict] = []

    async with httpx.AsyncClient(timeout=30) as client:
        # Resolve Ensembl IDs concurrently (up to 20 proteins to avoid rate limits)
        targets_to_query = proteins[:20]
        ensembl_tasks = [_fetch_ensembl_id(client, acc) for acc in targets_to_query]
        ensembl_ids = await asyncio.gather(*ensembl_tasks, return_exceptions=True)

        # Fetch disease associations concurrently for resolved IDs
        assoc_tasks = []
        task_meta = []
        for acc, eid in zip(targets_to_query, ensembl_ids):
            if isinstance(eid, str) and eid:
                symbol = gene_symbols.get(acc, acc)
                assoc_tasks.append(_fetch_disease_associations(client, eid, symbol))
                task_meta.append((acc, eid, symbol))

        if assoc_tasks:
            results = await asyncio.gather(*assoc_tasks, return_exceptions=True)
            for (acc, eid, symbol), assocs in zip(task_meta, results):
                if isinstance(assocs, list):
                    per_protein[acc] = {
                        "ensembl_id": eid,
                        "gene_symbol": symbol,
                        "association_count": len(assocs),
                        "top_disease": assocs[0]["disease_name"] if assocs else None,
                    }
                    all_assocs.extend(assocs)

    ranked_diseases = _aggregate_diseases(all_assocs)

    return {
        "ranked_diseases": ranked_diseases,
        "per_protein": per_protein,
        "proteins_queried": len(per_protein),
        "total_proteins": len(proteins),
        "total_disease_associations": len(all_assocs),
        "top_disease": ranked_diseases[0]["disease_name"] if ranked_diseases else None,
    }
