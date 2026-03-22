"""
Protein pharmacokinetic (PK) and pharmacodynamic (PD) property analysis.

Analyses plasma half-life, molecular weight, and BBB penetration for each
protein in the secretome. Where reference data is unavailable, provides
evidence-based estimates from molecular weight.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Load PK reference database ────────────────────────────────────────────────

_PK_DB_PATH = Path(__file__).parent.parent / "data" / "protein_pk_properties.json"

def _load_pk_db() -> dict[str, Any]:
    try:
        return json.loads(_PK_DB_PATH.read_text())
    except Exception as exc:
        logger.error("Failed to load PK reference DB: %s", exc)
        return {}

_PK_DB: dict[str, Any] = _load_pk_db()


# ── MW → half-life estimation ─────────────────────────────────────────────────

def _estimate_half_life_from_mw(mw_kda: float) -> tuple[float, str]:
    """Return (estimated_hours, category_label)."""
    if mw_kda < 8:
        return 1.0, "< 8 kDa — rapid renal clearance, estimated t½ ~0.5–2 hours"
    if mw_kda < 30:
        return 5.0, "8–30 kDa — moderate clearance, estimated t½ ~2–8 hours"
    if mw_kda < 70:
        return 16.0, "30–70 kDa — slower clearance, estimated t½ ~8–24 hours"
    if mw_kda < 150:
        return 48.0, "70–150 kDa — liver/RES clearance, estimated t½ ~24–96 hours"
    return 336.0, "> 150 kDa — antibody-like clearance, estimated t½ ~1–3 weeks"


def _half_life_category(hours: float) -> str:
    if hours < 2:
        return "Very short (< 2h)"
    if hours < 8:
        return "Short (2–8h)"
    if hours < 24:
        return "Medium (8–24h)"
    if hours < 168:
        return "Long (24–168h)"
    return "Very long (> 1 week)"


def _bbb_class_label(entry: dict | None) -> tuple[str, str]:
    """Return (class_label, color) for BBB classification."""
    if entry is None:
        return "Unknown", "#94a3b8"
    crosses = entry.get("crosses_bbb")
    level = entry.get("evidence_level", "unknown")
    if crosses is True:
        if level == "established":
            return "Established crossing", "#22c55e"
        return "Probable crossing", "#84cc16"
    if crosses is False:
        return "Unlikely", "#ef4444"
    return "Unknown", "#94a3b8"


def _therapeutic_implications(
    gene_name: str,
    half_life_h: float,
    half_life_source: str,
    bbb_class: str,
    mw_kda: float,
    is_glycosylated: bool,
) -> str:
    parts: list[str] = []

    if half_life_h < 1:
        parts.append(
            f"Extremely short half-life (~{half_life_h * 60:.0f} min): "
            "continuous infusion or nanoparticle delivery required for sustained effect."
        )
    elif half_life_h < 4:
        parts.append(
            f"Short half-life (~{half_life_h:.1f}h): "
            "consider sustained-release formulation or repeated dosing."
        )
    elif half_life_h > 48:
        parts.append(
            f"Long half-life (~{half_life_h:.0f}h): "
            "infrequent dosing possible; monitor for accumulation."
        )

    if bbb_class in ("Established crossing", "Probable crossing"):
        parts.append("Has established or probable BBB penetration — CNS effects possible.")
    elif bbb_class == "Unlikely":
        parts.append(
            "Poor BBB penetration: direct CNS delivery (intrathecal, intranasal) "
            "required for neurological applications."
        )

    if mw_kda < 8:
        parts.append(
            "Small protein (< 8 kDa): rapid renal filtration; PEGylation or IGFBP-fusion "
            "may extend effective half-life."
        )

    if is_glycosylated:
        parts.append(
            "Glycosylated protein: recombinant production system affects PK — "
            "glycosylation pattern influences clearance rate."
        )

    if half_life_source == "estimate":
        parts.append("Note: half-life is a MW-based estimate; literature values unavailable.")

    return " ".join(parts) if parts else "No specific delivery challenges identified for this protein."


# ── Main analysis function ────────────────────────────────────────────────────

def analyze_pk_properties(
    proteins: list[str],
    uniprot_data: dict[str, Any] | None = None,
) -> dict:
    """
    For each protein, retrieve or estimate PK properties.

    Args:
        proteins: gene names (uppercase)
        uniprot_data: optional — used for molecular weight and protein names
    """
    # Build gene → UniProt entry map
    gene_to_uniprot: dict[str, dict] = {}
    if uniprot_data and isinstance(uniprot_data, dict):
        for entry in uniprot_data.get("proteins", []):
            gene = entry.get("gene_name", "").upper()
            if gene:
                gene_to_uniprot[gene] = entry

    protein_pks: list[dict] = []

    for gene_name in proteins:
        gene_upper = gene_name.upper()
        ref = _PK_DB.get(gene_upper, {})
        uniprot_entry = gene_to_uniprot.get(gene_upper, {})

        # Protein name
        protein_name = (
            uniprot_entry.get("protein_name")
            or uniprot_entry.get("recommended_name")
            or ref.get("protein_name", "")
        )

        # Molecular weight: prefer UniProt (sequence length × 0.110), then ref DB, then estimate
        seq_len = uniprot_entry.get("sequence_length") or uniprot_entry.get("length")
        mw_kda: float
        mw_source: str
        if seq_len:
            mw_kda = round(seq_len * 0.110, 1)
            mw_source = "calculated from UniProt sequence length"
        elif ref.get("molecular_weight_kda"):
            mw_kda = ref["molecular_weight_kda"]
            mw_source = "literature"
        else:
            mw_kda = 25.0  # rough fallback
            mw_source = "estimate"

        # Half-life
        pk_hl = ref.get("plasma_half_life_hours")
        if pk_hl is not None:
            half_life_h = float(pk_hl)
            hl_source = ref.get("half_life_source", "literature")
            hl_route = ref.get("half_life_route", "IV")
        else:
            half_life_h, _note = _estimate_half_life_from_mw(mw_kda)
            hl_source = "estimate"
            hl_route = "estimated from molecular weight"

        hl_category = _half_life_category(half_life_h)

        # Derived kinetic metrics
        t_to_90pct_clearance = round(half_life_h * 3.32, 1)
        effective_window_h = round(half_life_h * 1.44, 1)

        # BBB penetration
        bbb_entry = ref.get("bbb_penetration")
        bbb_class, bbb_color = _bbb_class_label(bbb_entry)
        bbb_mechanism = bbb_entry.get("mechanism") if bbb_entry else None
        bbb_evidence_level = bbb_entry.get("evidence_level", "unknown") if bbb_entry else "unknown"
        csf_ratio = ref.get("csf_blood_ratio")

        # Other properties
        renal_clearance = ref.get("renal_clearance", mw_kda < 70)
        is_glycosylated = ref.get("is_glycosylated", False)
        transport_receptors = ref.get("active_transport_receptors", [])
        serum_binders = ref.get("serum_binding_proteins", [])
        bioavail_notes = ref.get("bioavailability_notes", "")

        # Therapeutic implications
        implications = _therapeutic_implications(
            gene_upper, half_life_h, hl_source, bbb_class, mw_kda, is_glycosylated
        )

        protein_pks.append({
            "gene_name": gene_upper,
            "protein_name": protein_name,
            "molecular_weight_kda": mw_kda,
            "mw_source": mw_source,
            "plasma_half_life_hours": round(half_life_h, 2),
            "half_life_category": hl_category,
            "half_life_source": hl_source,
            "half_life_route": hl_route,
            "time_to_90pct_clearance_hours": t_to_90pct_clearance,
            "effective_window_hours": effective_window_h,
            "bbb_penetration_class": bbb_class,
            "bbb_penetration_color": bbb_color,
            "bbb_mechanism": bbb_mechanism,
            "bbb_evidence_level": bbb_evidence_level,
            "csf_blood_ratio": csf_ratio,
            "renal_clearance": renal_clearance,
            "is_glycosylated": is_glycosylated,
            "active_transport_receptors": transport_receptors,
            "serum_binding_proteins": serum_binders,
            "bioavailability_notes": bioavail_notes,
            "therapeutic_implications": implications,
        })

    # Summary statistics
    short_hl = [p for p in protein_pks if p["plasma_half_life_hours"] < 2]
    medium_hl = [p for p in protein_pks if 2 <= p["plasma_half_life_hours"] < 24]
    long_hl = [p for p in protein_pks if p["plasma_half_life_hours"] >= 24]
    bbb_crossing = [
        p for p in protein_pks
        if p["bbb_penetration_class"] in ("Established crossing", "Probable crossing")
    ]
    bbb_unlikely = [p for p in protein_pks if p["bbb_penetration_class"] == "Unlikely"]
    delivery_challenges = [
        p["gene_name"] for p in protein_pks
        if p["plasma_half_life_hours"] < 1
        or p["molecular_weight_kda"] > 100
    ]

    mw_values = [p["molecular_weight_kda"] for p in protein_pks]
    mean_mw = round(sum(mw_values) / len(mw_values), 1) if mw_values else 0.0

    # Auto-generated delivery assessment text
    n = len(protein_pks)
    n_short = len(short_hl)
    n_bbb = len(bbb_crossing)
    bbb_names = ", ".join(p["gene_name"] for p in bbb_crossing[:5])
    if len(bbb_crossing) > 5:
        bbb_names += f" and {len(bbb_crossing) - 5} others"

    if n_bbb == 0:
        cns_note = "None of the proteins have established BBB penetration, limiting direct CNS effects."
    else:
        cns_note = (
            f"{n_bbb} protein(s) ({bbb_names}) have established or probable BBB penetration, "
            "enabling direct CNS effects."
        )

    if n_short == 0:
        hl_note = f"All {n} proteins have half-lives ≥ 2 hours."
    else:
        short_names = ", ".join(p["gene_name"] for p in short_hl[:4])
        hl_note = (
            f"{n_short} of {n} proteins ({short_names}) have plasma half-lives under 2 hours, "
            "requiring sustained delivery or repeated dosing for maintained effect."
        )

    delivery_text = f"{hl_note} {cns_note}"

    return {
        "proteins": protein_pks,
        "pk_summary": {
            "total_proteins": n,
            "short_half_life_count": n_short,
            "medium_half_life_count": len(medium_hl),
            "long_half_life_count": len(long_hl),
            "bbb_crossing_count": n_bbb,
            "bbb_unlikely_count": len(bbb_unlikely),
            "mean_molecular_weight_kda": mean_mw,
            "delivery_challenge_proteins": delivery_challenges,
        },
        "therapeutic_implications": delivery_text,
    }
