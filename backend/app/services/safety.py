"""
Safety Profiling Module.

Evaluates 5 safety dimensions for a secretome:
  1. Pro-tumorigenic signals
  2. Cytokine storm risk
  3. Coagulation interference
  4. Immune activation risk
  5. Organ-specific toxicity
"""
from __future__ import annotations

from typing import Any

# ─── Safety databases ─────────────────────────────────────────────────────────

PRO_TUMORIGENIC: dict[str, str] = {
    "VEGFA": "promotes tumor angiogenesis",
    "VEGFB": "promotes tumor angiogenesis",
    "HGF": "MET pathway — pro-invasive and metastatic",
    "EGF": "EGFR activation — promotes tumor cell proliferation",
    "AREG": "EGFR — tumor resistance to EGFR inhibitors",
    "TGFB1": "late-stage immunosuppression and metastasis promotion",
    "TGFB2": "immunosuppression and metastasis",
    "FGF2": "pro-angiogenic and mitogenic in tumors",
    "IGF1": "IGF1R — anti-apoptotic and pro-proliferative",
    "IGF2": "imprinting and tumor growth",
    "PDGFB": "PDGFR — stroma activation",
    "CXCL12": "CXCR4 — tumor migration and metastatic niche",
    "MDK": "broad tumor survival signal",
    "PTN": "ALK/PTPRZ1 — glioma and other malignancies",
    "CTGF": "fibrotic and cancer-promoting stroma",
    "SPP1": "promotes invasion and immune evasion",
    "MMP2": "ECM degradation enabling invasion",
    "MMP9": "ECM degradation enabling invasion",
    "GPC3": "hepatocellular carcinoma — promotes Wnt/Hedgehog",
    "NODAL": "breast cancer — promotes stem cell phenotype",
}

CYTOKINE_STORM: dict[str, str] = {
    "IL6": "central cytokine storm mediator (CRS)",
    "IL1B": "NLRP3 inflammasome — hyper-inflammatory",
    "TNF": "TNFA — systemic inflammatory response",
    "TNFA": "systemic inflammatory response syndrome",
    "IFNG": "macrophage activation syndrome",
    "IL18": "macrophage activation and hyperferritinemia",
    "IL33": "mast cell and ILC2 activation cascade",
    "HMGB1": "late-mediator of sepsis",
    "S100A8": "neutrophil activation and NETosis",
    "S100A9": "myeloid-derived suppressor promotion",
    "IL17A": "neutrophil recruitment storm",
    "CSF2": "granulocyte storm — CAR-T toxicity",
    "CXCL8": "neutrophil storm — ARDS risk",
    "IL3": "mast cell and basophil degranulation",
    "IL5": "eosinophil degranulation",
}

COAGULATION: dict[str, str] = {
    "F2": "thrombin precursor — procoagulant",
    "F3": "tissue factor — initiates coagulation",
    "F7": "factor VII — extrinsic pathway",
    "VWF": "platelet adhesion and thrombosis",
    "THPO": "thrombopoietin — platelet excess risk",
    "VEGFA": "endothelial permeability affects hemostasis",
    "ANGPT2": "vessel destabilization — coagulopathy risk",
    "PDGFB": "pericyte activation — vessel tone",
    "HMGB1": "promotes thromboinflammation",
    "S100A8": "platelet activation and NET formation",
    "PLAUR": "fibrinolysis dysregulation",
    "THBS1": "activates latent TGFb — coagulation modulation",
}

IMMUNE_ACTIVATION: dict[str, str] = {
    "IL12": "Th1 polarization — autoimmune risk",
    "IL15": "NK and CD8 expansion — cytotoxicity",
    "IL21": "B cell and NK expansion",
    "IL23": "Th17 polarization — autoimmune risk",
    "IL27": "modulates immune activation",
    "RANKL": "osteoclast and DC activation",
    "CD40LG": "strong B cell and DC activation",
    "IFNA1": "antiviral but also autoimmune trigger",
    "IFNB1": "antiviral response — systemic effects",
    "IFNG": "macrophage activation",
    "IL4": "Th2 polarization — allergy risk",
    "IL13": "Th2 and allergy promotion",
    "IL33": "ILC2 and mast cell activation",
    "TSLP": "atopic march initiation",
    "LIGHT": "T cell and endothelial activation",
    "BAFF": "B cell survival — autoimmune lymphoproliferation",
}

ORGAN_TOXICITY: dict[str, str] = {
    "TGFB1": "pulmonary, hepatic, and renal fibrosis",
    "EDN1": "vasoconstriction — pulmonary hypertension, renal hypoperfusion",
    "AGT": "angiotensin — hypertension and cardiac hypertrophy",
    "IL6": "hepatotoxicity in high doses (CRS)",
    "TNF": "hepatotoxicity and cardiac depression",
    "TNFA": "hepatotoxicity and cardiac depression",
    "VEGFA": "proteinuria and hypertension (anti-VEGF side effects reversed here)",
    "IGF1": "acromegaly-like effects at high doses",
    "GH1": "acromegaly — organomegaly",
    "FGF23": "hyperphosphaturia — kidney and bone mineral disorder",
    "S100A8": "kidney tubular toxicity",
    "HMGB1": "multi-organ damage in sepsis",
    "ANGPT2": "vascular leakage — pulmonary edema risk",
    "MMP9": "disrupts BBB — CNS toxicity",
    "TRAIL": "hepatotoxicity",
    "FASL": "hepatocyte apoptosis",
}


def _extract_gene_names(proteins: list[str], uniprot_data: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for acc in proteins:
        info = uniprot_data.get(acc, {})
        gn = info.get("gene_name") or info.get("gene_names", "")
        if isinstance(gn, str) and gn:
            names.add(gn.upper())
        elif isinstance(gn, list):
            names.update(g.upper() for g in gn if g)
    if not names:
        names = {p.upper() for p in proteins}
    return names


def _score_dimension(
    gene_names: set[str],
    reference: dict[str, str],
    max_score: float = 10.0,
) -> tuple[float, list[dict]]:
    """Score one safety dimension. Returns (score 0-10, flagged items)."""
    hits = []
    for gn, reason in reference.items():
        if gn.upper() in gene_names:
            hits.append({"gene": gn, "concern": reason})

    raw = len(hits)
    # Clamp: 0 hits → 0, 1 hit → ~2, 3 hits → ~5, 6+ hits → ~10
    score = min(raw / max(1, len(reference)) * max_score * 3, max_score)
    return round(score, 1), hits


def _risk_level(score: float) -> str:
    if score >= 6.0:
        return "High"
    elif score >= 2.5:
        return "Moderate"
    return "Low"


def profile_safety(
    proteins: list[str],
    uniprot_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Run all 5 safety dimensions and return an overall safety profile.
    """
    gene_names = _extract_gene_names(proteins, uniprot_data)

    tumor_score, tumor_hits = _score_dimension(gene_names, PRO_TUMORIGENIC)
    storm_score, storm_hits = _score_dimension(gene_names, CYTOKINE_STORM)
    coag_score, coag_hits = _score_dimension(gene_names, COAGULATION)
    immune_score, immune_hits = _score_dimension(gene_names, IMMUNE_ACTIVATION)
    organ_score, organ_hits = _score_dimension(gene_names, ORGAN_TOXICITY)

    dimension_scores = [tumor_score, storm_score, coag_score, immune_score, organ_score]
    overall = round(sum(dimension_scores) / len(dimension_scores), 1)

    return {
        "overall_safety_score": overall,
        "risk_level": _risk_level(overall),
        "dimensions": {
            "pro_tumorigenic": {
                "label": "Pro-tumorigenic Signals",
                "score": tumor_score,
                "risk_level": _risk_level(tumor_score),
                "flagged": tumor_hits,
            },
            "cytokine_storm": {
                "label": "Cytokine Storm Risk",
                "score": storm_score,
                "risk_level": _risk_level(storm_score),
                "flagged": storm_hits,
            },
            "coagulation": {
                "label": "Coagulation Interference",
                "score": coag_score,
                "risk_level": _risk_level(coag_score),
                "flagged": coag_hits,
            },
            "immune_activation": {
                "label": "Immune Activation Risk",
                "score": immune_score,
                "risk_level": _risk_level(immune_score),
                "flagged": immune_hits,
            },
            "organ_toxicity": {
                "label": "Organ-specific Toxicity",
                "score": organ_score,
                "risk_level": _risk_level(organ_score),
                "flagged": organ_hits,
            },
        },
        "total_flagged": sum(len(h) for h in [
            tumor_hits, storm_hits, coag_hits, immune_hits, organ_hits
        ]),
        "gene_names_analyzed": sorted(gene_names),
    }
