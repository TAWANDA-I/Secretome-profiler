"""
Therapeutic Indication Scoring Module.

Scores a secretome against 12 therapeutic indications using a gene-name-based
multi-step algorithm: positive score + negative penalty + context bonus.
"""
from __future__ import annotations

from typing import Any

# ─── Indication definitions ──────────────────────────────────────────────────
# Each indication has:
#   positive: gene names that support this indication (weighted 1.0 each)
#   negative: gene names that work against it (penalty -0.5 each)
#   mechanism: short description
# ─────────────────────────────────────────────────────────────────────────────

INDICATIONS: dict[str, dict[str, Any]] = {
    "neuroregeneration": {
        "label": "Neuroregeneration",
        "mechanism": "Promotes neuronal survival, axonal growth, and synaptic plasticity",
        "positive": {
            "BDNF", "NGF", "NT3", "NT4", "GDNF", "NRTN", "ARTN", "CNTF", "LIF",
            "HGF", "IGF1", "IGF2", "FGF2", "FGF1", "FGF9", "FGF20", "VEGFA",
            "IL6", "CXCL12", "MDK", "PTN", "NRG1", "PGRN", "CLU", "GDF11",
            "FNDC5", "MANF", "CDNF", "PEDF", "CNTFR", "OSMR",
        },
        "negative": {
            "TNF", "IL1B", "IL17A", "FASL", "TRAIL", "TNFA",
        },
        "color": "#6366f1",
    },
    "angiogenesis": {
        "label": "Angiogenesis / Vascular Repair",
        "mechanism": "Stimulates blood vessel formation and endothelial function",
        "positive": {
            "VEGFA", "VEGFB", "VEGFC", "VEGFD", "PLGF", "HGF", "FGF2", "FGF1",
            "FGF4", "ANGPT1", "ANGPT4", "PDGFB", "PDGFA", "CXCL12", "MDK",
            "NRG1", "IGF1", "EGF", "HBEGF", "CYR61", "APLN", "ADM",
            "SDF1", "CXCL5", "CXCL6", "PECAM1",
        },
        "negative": {
            "THBS1", "THBS2", "ANGPT2", "TIMP1", "TIMP2", "VEGI", "PF4",
        },
        "color": "#ef4444",
    },
    "immunomodulation": {
        "label": "Immunomodulation",
        "mechanism": "Balances immune responses; suppresses autoimmunity or chronic inflammation",
        "positive": {
            "IL10", "TGFB1", "TGFB3", "IL4", "IL13", "IL27", "IL37", "IL38",
            "TSG6", "HGF", "VIP", "ADCYAP1", "PROS1", "GAS6", "PGRN",
            "IDO1", "PDCD1LG2", "LGALS1", "LGALS9",
        },
        "negative": {
            "IL1B", "IL6", "TNF", "TNFA", "IL17A", "IL23", "HMGB1",
            "IFNG", "IL18", "IL33",
        },
        "color": "#8b5cf6",
    },
    "wound_healing": {
        "label": "Wound Healing / Tissue Repair",
        "mechanism": "Accelerates re-epithelialization, granulation tissue formation, and remodeling",
        "positive": {
            "EGF", "HBEGF", "AREG", "EREG", "FGF2", "FGF7", "FGF10", "FGF1",
            "PDGFA", "PDGFB", "TGFB1", "VEGFA", "HGF", "IGF1", "KITLG",
            "CCL2", "CXCL8", "PPBP", "SPP1", "FN1", "LAMA1", "IL10",
            "CTGF", "CYR61", "MMP2", "MMP9",
        },
        "negative": {
            "TRAIL", "FASL", "TNF", "IL17A",
        },
        "color": "#10b981",
    },
    "cardioprotection": {
        "label": "Cardioprotection",
        "mechanism": "Protects cardiomyocytes from ischemia, promotes cardiac repair",
        "positive": {
            "VEGFA", "HGF", "IGF1", "FGF2", "NRG1", "BDNF", "CNTF", "LIF",
            "ANGPT1", "APLN", "UCN2", "UCN3", "FSTL1", "GDF11", "NPPB",
            "NPPA", "GLP1R", "GHRELIN", "GHRL", "PDGFB",
        },
        "negative": {
            "TNF", "TNFA", "IL1B", "IL18", "HMGB1", "ANGPT2", "EDN1",
        },
        "color": "#f59e0b",
    },
    "anti_fibrotic": {
        "label": "Anti-fibrotic",
        "mechanism": "Reduces pathological fibrosis in lung, liver, kidney, and heart",
        "positive": {
            "HGF", "IL10", "TGFB3", "BMP7", "GREM1", "GREM2", "BMPER",
            "FSTL1", "FST", "DAN", "CHRD", "NOGGIN", "FGF21",
            "FGF1", "TIMP1", "TIMP2",
        },
        "negative": {
            "TGFB1", "TGFB2", "CTGF", "PDGFB", "PDGFD", "FN1",
            "POSTN", "IL13", "CCL2", "CCL18",
        },
        "color": "#0ea5e9",
    },
    "bone_cartilage": {
        "label": "Bone & Cartilage Regeneration",
        "mechanism": "Supports osteogenesis, chondrogenesis, and bone remodeling",
        "positive": {
            "BMP2", "BMP4", "BMP7", "GDF5", "GDF6", "GDF11", "IGF1", "IGF2",
            "FGF23", "PDGFA", "PDGFB", "NELL1", "CTGF", "WISP1", "WISP2",
            "NPPC", "PTH", "PTHLH", "SPP1", "RANKL", "POSTN", "THBS1",
        },
        "negative": {
            "RANKL", "TNF", "IL1B", "IL6", "DKK1", "SOST", "SCLEROSTIN",
        },
        "color": "#d97706",
    },
    "metabolic": {
        "label": "Metabolic Disorders",
        "mechanism": "Improves insulin sensitivity, lipid profile, and energy homeostasis",
        "positive": {
            "ADIPOQ", "FGF19", "FGF21", "GDF15", "IRISIN", "FNDC5",
            "METRNL", "ANGPTL6", "LEP", "NAMPT", "GLP1R", "GIPR",
            "IGF1", "INSL3",
        },
        "negative": {
            "RETN", "TNF", "IL1B", "IL6", "ANGPTL3", "APOC3",
        },
        "color": "#84cc16",
    },
    "renal": {
        "label": "Renoprotection",
        "mechanism": "Protects against acute kidney injury and chronic kidney disease",
        "positive": {
            "HGF", "BMP7", "VEGFA", "IGF1", "FGF2", "IL10", "KL", "KLOTHO",
            "ANGPT1", "UMOD", "EPOR", "EPO", "GDF11",
        },
        "negative": {
            "TGFB1", "TNF", "IL1B", "CTGF", "EDN1", "AGT",
        },
        "color": "#22d3ee",
    },
    "hepatoprotection": {
        "label": "Hepatoprotection",
        "mechanism": "Supports hepatocyte survival, regeneration, and anti-fibrotic effects in liver",
        "positive": {
            "HGF", "EGF", "HBEGF", "IGF1", "FGF1", "FGF2", "IL22",
            "OSM", "LIF", "IL6", "IL10", "VEGFA", "ANGPT1",
        },
        "negative": {
            "TGFB1", "TNF", "TRAIL", "FASL", "IL17A",
        },
        "color": "#a78bfa",
    },
    "pulmonary": {
        "label": "Pulmonary Repair",
        "mechanism": "Promotes alveolar repair and reduces pulmonary fibrosis or ARDS",
        "positive": {
            "KGF", "FGF7", "FGF10", "VEGFA", "HGF", "IGF1", "BMP4",
            "IL10", "ANGPT1", "TSLP", "CXCL12",
        },
        "negative": {
            "TGFB1", "IL13", "IL4", "CCL2", "CTGF", "POSTN",
        },
        "color": "#38bdf8",
    },
    "anti_senescence": {
        "label": "Anti-Senescence / Rejuvenation",
        "mechanism": "Clears senescent cells or reverses hallmarks of aging",
        "positive": {
            "GDF11", "KLOTHO", "KL", "IRISIN", "FNDC5", "FGF21", "METRNL",
            "GDF15", "ADIPOQ", "NAMPT", "SIRT1", "IGF1",
        },
        "negative": {
            "IL6", "IL8", "CXCL8", "IL1B", "TNF", "TNFA", "MMP2", "MMP9",
            "HMGB1", "IGFBP3",
        },
        "color": "#f472b6",
    },
}


def _gene_names_from_uniprot(uniprot_data: dict[str, Any]) -> set[str]:
    """Extract all gene names (upper-cased) from UniProt annotation dict."""
    names: set[str] = set()
    for info in uniprot_data.values():
        gn = info.get("gene_name") or info.get("gene_names", "")
        if isinstance(gn, str) and gn:
            names.add(gn.upper())
        elif isinstance(gn, list):
            names.update(g.upper() for g in gn if g)
    return names


def score_therapeutic_indications(
    proteins: list[str],
    uniprot_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Score the secretome against all therapeutic indications.

    Returns a dict with:
      indications: list of ranked indication objects
      top_indication: name of highest scoring indication
      overall_confidence: "High"/"Moderate"/"Low"
    """
    gene_names = _gene_names_from_uniprot(uniprot_data)
    # Fallback: if no uniprot data, treat protein IDs themselves as gene names
    if not gene_names:
        gene_names = {p.upper() for p in proteins}

    scored: list[dict[str, Any]] = []
    for ind_key, ind in INDICATIONS.items():
        positive_hits = gene_names & ind["positive"]
        negative_hits = gene_names & ind["negative"]

        raw_score = len(positive_hits) * 1.0 - len(negative_hits) * 0.5

        # Network coherence bonus: if >3 positive hits, small bonus
        coherence_bonus = 0.3 if len(positive_hits) > 3 else 0.0
        final_score = max(0.0, raw_score + coherence_bonus)

        # Confidence from positive hit fraction
        max_possible = len(ind["positive"]) or 1
        coverage = len(positive_hits) / max_possible
        if coverage >= 0.15:
            confidence = "High"
        elif coverage >= 0.05:
            confidence = "Moderate"
        else:
            confidence = "Low"

        scored.append({
            "key": ind_key,
            "label": ind["label"],
            "mechanism": ind["mechanism"],
            "score": round(final_score, 2),
            "confidence": confidence,
            "coverage_pct": round(coverage * 100, 1),
            "supporting_proteins": sorted(positive_hits),
            "limiting_factors": sorted(negative_hits),
            "positive_hit_count": len(positive_hits),
            "negative_hit_count": len(negative_hits),
            "color": ind.get("color", "#6b7280"),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)

    top = scored[0] if scored else {}
    max_score = top.get("score", 0)
    if max_score >= 3.0:
        overall_confidence = "High"
    elif max_score >= 1.0:
        overall_confidence = "Moderate"
    else:
        overall_confidence = "Low"

    return {
        "indications": scored,
        "top_indication": top.get("label", ""),
        "top_indication_key": top.get("key", ""),
        "overall_confidence": overall_confidence,
        "gene_names_analyzed": sorted(gene_names),
    }
