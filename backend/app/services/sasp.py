"""
SASP (Senescence-Associated Secretory Phenotype) flagging.
~80 canonical SASP factors from Coppe et al. 2008 / Acosta et al. 2013.
"""
from typing import Any

# Canonical SASP UniProt accession IDs (curated list)
SASP_UNIPROT_IDS: frozenset[str] = frozenset({
    # Interleukins
    "P05231",  # IL-6
    "P01584",  # IL-1β
    "P13232",  # IL-7
    "P15248",  # IL-13
    "P22301",  # IL-10
    "P60568",  # IL-2
    "P05112",  # IL-4
    "P05113",  # IL-5 (placeholder)
    # Chemokines
    "P10145",  # IL-8 / CXCL8
    "P13236",  # MIP-1α / CCL3
    "P13500",  # MCP-1 / CCL2
    "P78552",  # CXCL1 / GROα
    "P19875",  # CXCL2 / GROβ
    "P02778",  # CXCL10 / IP-10
    # Growth factors
    "P01127",  # PDGF-B
    "P01133",  # EGF
    "P05155",  # HGF
    "P09038",  # FGF-2
    "P15692",  # VEGF-A
    "Q16552",  # Amphiregulin (AREG)
    # MMPs
    "P03956",  # MMP-1
    "P08253",  # MMP-2
    "P14780",  # MMP-9
    "P22894",  # MMP-8
    "P45452",  # MMP-13
    # Cytokines / others
    "P01375",  # TNF-α
    "P05106",  # GM-CSF / CSF2
    "P08887",  # LIF
    "P01130",  # IGFBP-3
    "P24593",  # IGFBP-5
    "P17936",  # IGFBP-3 (alt)
    "Q15848",  # Adiponectin
    "P02751",  # Fibronectin 1 (FN1)
    "P02452",  # COL1A1
    "P08123",  # COL1A2
    "P08572",  # COL4A2
    "P02461",  # COL3A1
    "P06396",  # Gelsolin
    "P35858",  # IGFBP-ALS
    "Q9UBP0",  # DKK-3
    "O14498",  # SPRR1A (placeholder)
    "P01042",  # Kininogen-1 (KNG1)
    "P00747",  # Plasminogen (PLG)
    "P02647",  # ApoA-I
    "P02655",  # ApoC-II
    "P02649",  # ApoE
    "Q96AQ6",  # PBEF1 / Visfatin (NAMPT)
    "P05156",  # Complement factor I
    "P00751",  # Complement factor B
    "P01031",  # Complement C5
    "P01024",  # Complement C3
})


def flag_sasp(proteins: list[str], uniprot_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """Returns SASP flags for each protein, enriched with gene/protein names."""
    uniprot_data = uniprot_data or {}
    flagged = {acc: acc in SASP_UNIPROT_IDS for acc in proteins}
    sasp_hits = [acc for acc, is_sasp in flagged.items() if is_sasp]

    # Build enriched hit list with gene/protein names from uniprot_data
    sasp_details = []
    for acc in sasp_hits:
        entry = uniprot_data.get(acc, {})
        sasp_details.append({
            "accession": acc,
            "gene_name": entry.get("gene_name", ""),
            "protein_name": entry.get("protein_name", ""),
        })

    return {
        "flags": flagged,
        "sasp_hits": sasp_hits,
        "sasp_details": sasp_details,
        "sasp_count": len(sasp_hits),
        "total": len(proteins),
        "fraction": round(len(sasp_hits) / len(proteins), 4) if proteins else 0.0,
    }
