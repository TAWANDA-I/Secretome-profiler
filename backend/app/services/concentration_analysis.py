"""
Quantitative concentration analysis against physiological reference ranges.

Compares user-supplied protein concentrations (pg/mL) to:
- Healthy plasma ranges (p5, median, p95)
- Therapeutic windows (where known)
- Disease-state concentrations
- Toxic thresholds
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Load reference database once at import time ───────────────────────────────

_REF_DB_PATH = Path(__file__).parent.parent / "data" / "plasma_reference_concentrations.json"

def _load_ref_db() -> dict[str, Any]:
    try:
        return json.loads(_REF_DB_PATH.read_text())
    except Exception as exc:
        logger.error("Failed to load plasma reference DB: %s", exc)
        return {}

_REF_DB: dict[str, Any] = _load_ref_db()


# ── Classification helpers ────────────────────────────────────────────────────

_STATUS_COLORS = {
    "sub_physiological": "#94a3b8",          # gray
    "physiological": "#3b82f6",              # blue
    "supra_physiological": "#f59e0b",        # amber
    "potentially_toxic": "#ef4444",          # red
    "within_therapeutic_window": "#22c55e",  # green
    "below_therapeutic_window": "#94a3b8",   # gray
    "above_therapeutic_window": "#f59e0b",   # amber
    "no_reference": "#cbd5e1",               # light gray
}


def _classify_concentration(
    user_conc: float,
    p5: float | None,
    p95: float | None,
    tw_low: float | None,
    tw_high: float | None,
    toxic: float | None,
) -> tuple[str, str]:
    """Return (status_key, color) for a concentration."""
    # Toxic threshold takes priority
    if toxic is not None and user_conc >= toxic:
        return "potentially_toxic", _STATUS_COLORS["potentially_toxic"]

    # Therapeutic window classification (when available)
    if tw_low is not None and tw_high is not None:
        if user_conc < tw_low:
            return "below_therapeutic_window", _STATUS_COLORS["below_therapeutic_window"]
        if user_conc <= tw_high:
            return "within_therapeutic_window", _STATUS_COLORS["within_therapeutic_window"]
        return "above_therapeutic_window", _STATUS_COLORS["above_therapeutic_window"]

    # Physiological range classification
    if p5 is not None and p95 is not None:
        if user_conc < p5:
            return "sub_physiological", _STATUS_COLORS["sub_physiological"]
        if user_conc <= p95:
            return "physiological", _STATUS_COLORS["physiological"]
        return "supra_physiological", _STATUS_COLORS["supra_physiological"]

    return "physiological", _STATUS_COLORS["physiological"]


def _interpret_concentration(
    status: str,
    fold_over_healthy: float | None,
    tw_low: float | None,
    tw_high: float | None,
    user_conc: float,
    gene_name: str,
) -> str:
    tw_range = (
        f"{tw_low:.0f}–{tw_high:.0f} pg/mL"
        if tw_low is not None and tw_high is not None
        else "known therapeutic range"
    )
    tw_min = f"{tw_low:.0f} pg/mL" if tw_low is not None else "the minimum threshold"
    tw_max = f"{tw_high:.0f} pg/mL" if tw_high is not None else "the maximum threshold"
    fold_str = f" ({fold_over_healthy:.1f}× median)" if fold_over_healthy is not None else ""

    messages = {
        "sub_physiological": (
            f"{gene_name} is below the normal physiological range. "
            "May be insufficient for biological signalling at target tissue."
        ),
        "physiological": (
            f"{gene_name} is within the normal physiological range. "
            "Concentration consistent with healthy baseline signalling."
        ),
        "supra_physiological": (
            f"{gene_name} is elevated above normal physiological range{fold_str}. "
            "Sustained supra-physiological levels may trigger adaptive desensitisation."
        ),
        "potentially_toxic": (
            f"CAUTION: {gene_name} exceeds the known toxic threshold. "
            "Monitor closely for adverse effects."
        ),
        "within_therapeutic_window": (
            f"{gene_name} is within the known therapeutic window ({tw_range}). "
            "Concentration likely adequate for therapeutic effect."
        ),
        "below_therapeutic_window": (
            f"{gene_name} is below the therapeutic window (minimum {tw_min}). "
            "Concentration may be insufficient for therapeutic effect."
        ),
        "above_therapeutic_window": (
            f"{gene_name} exceeds the therapeutic window (maximum {tw_max}). "
            "Monitor for potential adverse effects."
        ),
    }
    return messages.get(status, f"{gene_name}: concentration {user_conc:.1f} pg/mL — no reference available.")


def _compare_to_diseases(
    user_conc: float,
    disease_concentrations: dict[str, float],
) -> list[dict]:
    comparisons: list[dict] = []
    for disease, disease_conc in (disease_concentrations or {}).items():
        ratio = user_conc / disease_conc if disease_conc else None
        if ratio is None:
            interp = "No disease reference available"
        elif 0.5 < ratio < 2.0:
            interp = "Similar to disease-state levels"
        elif ratio >= 2.0:
            interp = f"{ratio:.1f}× higher than typical disease-state levels"
        else:
            interp = f"{1/ratio:.1f}× lower than typical disease-state levels"
        comparisons.append({
            "disease": disease.replace("_", " ").title(),
            "disease_concentration_pg_ml": disease_conc,
            "ratio": round(ratio, 3) if ratio else None,
            "interpretation": interp,
        })
    return comparisons


# ── Main analysis function ────────────────────────────────────────────────────

def analyze_concentrations(
    proteins: list[str],
    user_concentrations: dict[str, float],
    uniprot_data: dict[str, Any] | None = None,
) -> dict:
    """
    For each protein in user_concentrations, compare against the plasma
    reference database and return a structured concentration profile.

    Args:
        proteins: full list of proteins in the secretome (gene names or accessions)
        user_concentrations: {identifier: concentration_pg_ml}
        uniprot_data: UniProt annotation dict — either:
                      {accession: {gene_name, protein_name, ...}} (from pipeline)
                      OR {"proteins": [{gene_name, protein_name, ...}, ...]}
    """
    # Build resolution maps: any identifier → gene_name / protein_name
    id_to_gene: dict[str, str] = {}
    id_to_pname: dict[str, str] = {}

    if uniprot_data and isinstance(uniprot_data, dict):
        # Format 1: {accession: {gene_name, protein_name, ...}}
        if any(k not in ("proteins",) for k in uniprot_data):
            for acc, info in uniprot_data.items():
                if not isinstance(info, dict):
                    continue
                gene = info.get("gene_name") or ""
                name = info.get("protein_name") or info.get("recommended_name") or ""
                if acc:
                    id_to_gene[acc.upper()] = gene.upper() if gene else acc.upper()
                    id_to_pname[acc.upper()] = name
                if gene:
                    id_to_gene[gene.upper()] = gene.upper()
                    id_to_pname[gene.upper()] = name
        # Format 2: {"proteins": [{gene_name, protein_name, ...}, ...]}
        for entry in uniprot_data.get("proteins", []):
            if not isinstance(entry, dict):
                continue
            gene = entry.get("gene_name") or ""
            name = entry.get("protein_name") or entry.get("recommended_name") or ""
            acc = entry.get("accession") or ""
            if acc:
                id_to_gene[acc.upper()] = gene.upper() if gene else acc.upper()
                id_to_pname[acc.upper()] = name
            if gene:
                id_to_gene[gene.upper()] = gene.upper()
                id_to_pname[gene.upper()] = name

    profiles: list[dict] = []
    proteins_with_data = 0
    proteins_without_data = 0

    for input_id, user_conc in user_concentrations.items():
        # Resolve input identifier to gene name
        gene_upper = id_to_gene.get(input_id.upper(), input_id.upper())
        protein_name = id_to_pname.get(input_id.upper(), "")
        gene_name = gene_upper

        ref = _REF_DB.get(gene_upper)

        if ref is None:
            proteins_without_data += 1
            # Derive MW-based half-life estimate if UniProt has molecular weight
            mw_note = "No reference concentration data available."
            profiles.append({
                "gene_name": gene_upper,
                "protein_name": protein_name,
                "user_concentration_pg_ml": user_conc,
                "has_reference": False,
                "healthy_plasma_median_pg_ml": None,
                "healthy_plasma_range": [None, None],
                "fold_over_healthy": None,
                "status": "no_reference",
                "status_color": _STATUS_COLORS["no_reference"],
                "therapeutic_window": [None, None],
                "toxic_threshold": None,
                "disease_comparisons": [],
                "interpretation": mw_note,
                "caution_flag": False,
            })
            continue

        proteins_with_data += 1
        median = ref.get("healthy_plasma_median_pg_ml")
        p5 = ref.get("healthy_plasma_p5_pg_ml")
        p95 = ref.get("healthy_plasma_p95_pg_ml")
        tw_low = ref.get("therapeutic_window_low_pg_ml")
        tw_high = ref.get("therapeutic_window_high_pg_ml")
        toxic = ref.get("toxic_threshold_pg_ml")

        fold = (user_conc / median) if median else None

        status, color = _classify_concentration(user_conc, p5, p95, tw_low, tw_high, toxic)
        interpretation = _interpret_concentration(status, fold, tw_low, tw_high, user_conc, gene_upper)
        disease_comps = _compare_to_diseases(user_conc, ref.get("disease_concentrations", {}))

        caution = status in ("potentially_toxic", "above_therapeutic_window", "supra_physiological")
        if fold and fold >= 10:
            caution = True

        profiles.append({
            "gene_name": gene_upper,
            "protein_name": protein_name,
            "user_concentration_pg_ml": user_conc,
            "has_reference": True,
            "healthy_plasma_median_pg_ml": median,
            "healthy_plasma_range": [p5, p95],
            "fold_over_healthy": round(fold, 3) if fold is not None else None,
            "status": status,
            "status_color": color,
            "therapeutic_window": [tw_low, tw_high],
            "toxic_threshold": toxic,
            "disease_comparisons": disease_comps,
            "interpretation": interpretation,
            "caution_flag": caution,
        })

    # Sort by fold_over_healthy descending (most elevated first)
    profiles.sort(key=lambda p: p["fold_over_healthy"] or 0, reverse=True)

    # Compute summary statistics
    status_counts: dict[str, int] = {}
    caution_proteins: list[str] = []
    for p in profiles:
        s = p["status"]
        status_counts[s] = status_counts.get(s, 0) + 1
        if p["caution_flag"]:
            caution_proteins.append(p["gene_name"])

    most_elevated = profiles[0]["gene_name"] if profiles else None
    most_depleted = next(
        (p["gene_name"] for p in reversed(profiles) if p["fold_over_healthy"] is not None),
        None,
    )

    # Auto-generated therapeutic assessment text
    total = len(profiles)
    n_tw = status_counts.get("within_therapeutic_window", 0)
    n_supra = status_counts.get("supra_physiological", 0) + status_counts.get("above_therapeutic_window", 0)
    n_sub = status_counts.get("sub_physiological", 0) + status_counts.get("below_therapeutic_window", 0)
    n_toxic = status_counts.get("potentially_toxic", 0)

    if n_tw > 0:
        assessment = (
            f"Of {total} quantified proteins, {n_tw} are within their known "
            f"therapeutic concentration window, providing direct evidence of "
            f"therapeutically relevant dosing."
        )
    elif n_supra > 0:
        assessment = (
            f"Of {total} quantified proteins, {n_supra} exceed their normal "
            f"physiological range. Verify that supra-physiological concentrations "
            f"are intended; sustained excess may lead to receptor desensitisation."
        )
    else:
        assessment = (
            f"Concentration data provided for {total} proteins. "
            f"Compare to physiological reference ranges for therapeutic assessment."
        )

    if n_toxic > 0:
        caution_names = ", ".join(
            p["gene_name"] for p in profiles if p["status"] == "potentially_toxic"
        )
        assessment += (
            f" CAUTION: {caution_names} exceed known toxic thresholds — "
            f"review dosing immediately."
        )

    return {
        "proteins_with_data": proteins_with_data,
        "proteins_without_data": proteins_without_data,
        "total_quantified": total,
        "concentration_profiles": profiles,
        "summary": {
            "sub_physiological_count": status_counts.get("sub_physiological", 0)
                + status_counts.get("below_therapeutic_window", 0),
            "physiological_count": status_counts.get("physiological", 0),
            "supra_physiological_count": n_supra,
            "potentially_toxic_count": n_toxic,
            "within_therapeutic_window_count": n_tw,
            "caution_proteins": caution_proteins,
            "most_elevated": most_elevated,
            "most_depleted": most_depleted,
        },
        "therapeutic_assessment": assessment,
    }
