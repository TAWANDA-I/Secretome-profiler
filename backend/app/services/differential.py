"""
Differential Analysis Service.

Computes six categories of comparisons between two secretome sets:
  1. Protein overlap (Venn / Jaccard)
  2. Pathway enrichment comparison (volcano data via Fisher + BH-FDR)
  3. PCA of GO-term space
  4. Therapeutic indication profile comparison
  5. Safety dimension comparison
  6. HPA expression pattern comparison
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.stats import false_discovery_control, fisher_exact
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


# ── 1. Protein overlap ────────────────────────────────────────────────────────

def _get_gene_info(uniprot_data: dict) -> list[dict]:
    """Extract [accession, gene_name, protein_name] dicts from uniprot data."""
    items = []
    if isinstance(uniprot_data, dict):
        for acc, info in uniprot_data.items():
            if isinstance(info, dict):
                items.append({
                    "accession": acc,
                    "gene_name": info.get("gene_name", acc),
                    "protein_name": info.get("protein_name", ""),
                })
    return items


def compute_protein_overlap(uniprot_a: Any, uniprot_b: Any) -> dict:
    proteins_a = _get_gene_info(uniprot_a)
    proteins_b = _get_gene_info(uniprot_b)

    genes_a = {p["gene_name"].upper() for p in proteins_a if p["gene_name"]}
    genes_b = {p["gene_name"].upper() for p in proteins_b if p["gene_name"]}

    shared_genes = genes_a & genes_b
    unique_a_genes = genes_a - genes_b
    unique_b_genes = genes_b - genes_a
    union = genes_a | genes_b

    jaccard = len(shared_genes) / len(union) if union else 0.0

    # Build protein records keyed by gene name
    a_by_gene = {p["gene_name"].upper(): p for p in proteins_a if p["gene_name"]}
    b_by_gene = {p["gene_name"].upper(): p for p in proteins_b if p["gene_name"]}

    shared_proteins = [a_by_gene[g] for g in sorted(shared_genes) if g in a_by_gene]
    unique_a_proteins = [a_by_gene[g] for g in sorted(unique_a_genes) if g in a_by_gene]
    unique_b_proteins = [b_by_gene[g] for g in sorted(unique_b_genes) if g in b_by_gene]

    return {
        "set_a_count": len(proteins_a),
        "set_b_count": len(proteins_b),
        "shared_count": len(shared_genes),
        "unique_a_count": len(unique_a_genes),
        "unique_b_count": len(unique_b_genes),
        "jaccard_similarity": round(jaccard, 4),
        "shared_proteins": shared_proteins,
        "unique_a_proteins": unique_a_proteins,
        "unique_b_proteins": unique_b_proteins,
    }


# ── 2. Pathway enrichment comparison ──────────────────────────────────────────

def _extract_terms(gprofiler_data: Any) -> dict[str, dict]:
    """Return {term_id: {name, source, p_value, intersection_size, query_size}} dict."""
    terms: dict[str, dict] = {}
    if not isinstance(gprofiler_data, dict):
        return terms
    for r in gprofiler_data.get("results", []):
        tid = r.get("native") or r.get("id") or r.get("name", "")
        if tid:
            terms[tid] = {
                "name": r.get("name", tid),
                "source": r.get("source", ""),
                "p_value": float(r.get("p_value", 1.0)),
                "intersection_size": int(r.get("intersection_size", 0)),
                "query_size": int(r.get("query_size", 1)),
            }
    return terms


def compute_pathway_comparison(
    gprofiler_a: Any,
    gprofiler_b: Any,
    n_a: int,
    n_b: int,
) -> dict:
    terms_a = _extract_terms(gprofiler_a)
    terms_b = _extract_terms(gprofiler_b)
    all_term_ids = set(terms_a) | set(terms_b)

    if not all_term_ids:
        return {"terms": [], "volcano": {}, "summary": {}}

    rows: list[dict] = []
    pvals_fisher: list[float] = []

    for tid in all_term_ids:
        a = terms_a.get(tid)
        b = terms_b.get(tid)

        p_a = a["p_value"] if a else 1.0
        p_b = b["p_value"] if b else 1.0
        name = (a or b)["name"]  # type: ignore[index]
        source = (a or b)["source"]  # type: ignore[index]

        # log2FC: positive = more enriched in A
        eps = 1e-300
        log2fc = math.log2((p_b + eps) / (p_a + eps))

        # Fisher's exact test on gene-term membership counts
        hits_a = a["intersection_size"] if a else 0
        miss_a = max(0, (a["query_size"] if a else n_a) - hits_a)
        hits_b = b["intersection_size"] if b else 0
        miss_b = max(0, (b["query_size"] if b else n_b) - hits_b)

        contingency = [[hits_a, miss_a], [hits_b, miss_b]]
        try:
            _, pval = fisher_exact(contingency, alternative="two-sided")
        except Exception:
            pval = 1.0

        enriched_in_a = bool(a and a["p_value"] < 0.05)
        enriched_in_b = bool(b and b["p_value"] < 0.05)

        if enriched_in_a and enriched_in_b:
            direction = "both"
        elif enriched_in_a:
            direction = "A_enriched"
        elif enriched_in_b:
            direction = "B_enriched"
        else:
            direction = "neither"

        rows.append({
            "term_id": tid,
            "term_name": name,
            "source": source,
            "enriched_in_a": enriched_in_a,
            "enriched_in_b": enriched_in_b,
            "p_val_a": p_a,
            "p_val_b": p_b,
            "log2fc": round(log2fc, 4),
            "fisher_p": round(pval, 6),
            "fisher_p_adjusted": 1.0,  # filled below
            "significant": False,       # filled below
            "direction": direction,
            "gene_count_a": hits_a,
            "gene_count_b": hits_b,
        })
        pvals_fisher.append(pval)

    # Benjamini–Hochberg FDR
    if pvals_fisher:
        p_arr = np.array(pvals_fisher)
        try:
            p_adj = false_discovery_control(p_arr, method="bh")
        except Exception:
            p_adj = p_arr
        for i, row in enumerate(rows):
            row["fisher_p_adjusted"] = round(float(p_adj[i]), 6)
            row["significant"] = bool(p_adj[i] < 0.05 and abs(row["log2fc"]) > 1)

    # Volcano data arrays
    volcano = {
        "x": [r["log2fc"] for r in rows],
        "y": [round(-math.log10(r["fisher_p_adjusted"] + 1e-300), 4) for r in rows],
        "labels": [r["term_name"] for r in rows],
        "sources": [r["source"] for r in rows],
        "gene_count_a": [r["gene_count_a"] for r in rows],
        "gene_count_b": [r["gene_count_b"] for r in rows],
        "colors": [
            "A_enriched" if r["significant"] and r["log2fc"] > 1
            else "B_enriched" if r["significant"] and r["log2fc"] < -1
            else "ns"
            for r in rows
        ],
        "significant_count_a": sum(1 for r in rows if r["significant"] and r["log2fc"] > 1),
        "significant_count_b": sum(1 for r in rows if r["significant"] and r["log2fc"] < -1),
    }

    # Sort rows by significance then magnitude for display
    rows.sort(key=lambda r: (-int(r["significant"]), -abs(r["log2fc"])))

    return {"terms": rows, "volcano": volcano}


# ── 3. PCA of pathway space ────────────────────────────────────────────────────

def compute_pathway_pca(gprofiler_a: Any, gprofiler_b: Any) -> dict:
    terms_a = _extract_terms(gprofiler_a)
    terms_b = _extract_terms(gprofiler_b)
    all_terms = sorted(set(terms_a) | set(terms_b))

    if len(all_terms) < 3:
        return {"available": False}

    vec_a = np.array([1.0 if t in terms_a else 0.0 for t in all_terms])
    vec_b = np.array([1.0 if t in terms_b else 0.0 for t in all_terms])
    matrix = np.vstack([vec_a, vec_b])

    if matrix.shape[1] < 2:
        return {"available": False}

    try:
        scaler = StandardScaler()
        mat_scaled = scaler.fit_transform(matrix)
        n_components = min(2, matrix.shape[0], matrix.shape[1])
        pca = PCA(n_components=n_components)
        coords = pca.fit_transform(mat_scaled)
        var_explained = [round(float(v), 4) for v in pca.explained_variance_ratio_]

        # Top contributing terms for each PC
        loadings = pca.components_
        top_pc1 = [all_terms[i] for i in np.argsort(np.abs(loadings[0]))[-5:][::-1]]
        top_pc2 = [all_terms[i] for i in np.argsort(np.abs(loadings[1]))[-5:][::-1]] if n_components > 1 else []

        # Resolve IDs to names
        id_to_name = {t: terms_a.get(t, terms_b.get(t, {})).get("name", t) for t in all_terms}
        top_pc1_names = [id_to_name[t] for t in top_pc1]
        top_pc2_names = [id_to_name[t] for t in top_pc2]

        return {
            "available": True,
            "set_a_coords": [round(float(coords[0, 0]), 4), round(float(coords[0, 1]), 4) if n_components > 1 else 0.0],
            "set_b_coords": [round(float(coords[1, 0]), 4), round(float(coords[1, 1]), 4) if n_components > 1 else 0.0],
            "variance_explained": var_explained,
            "top_features_pc1": top_pc1_names,
            "top_features_pc2": top_pc2_names,
        }
    except Exception:
        return {"available": False}


# ── 4. Therapeutic comparison ─────────────────────────────────────────────────

def compute_therapeutic_comparison(therapeutic_a: Any, therapeutic_b: Any) -> dict:
    ind_a: dict[str, dict] = {}
    ind_b: dict[str, dict] = {}

    if isinstance(therapeutic_a, dict):
        for ind in therapeutic_a.get("indications", []):
            name = ind.get("indication") or ind.get("label", "")
            if name:
                ind_a[name] = ind

    if isinstance(therapeutic_b, dict):
        for ind in therapeutic_b.get("indications", []):
            name = ind.get("indication") or ind.get("label", "")
            if name:
                ind_b[name] = ind

    all_indications = sorted(set(ind_a) | set(ind_b))
    comparison: list[dict] = []

    for name in all_indications:
        a = ind_a.get(name, {})
        b = ind_b.get(name, {})
        score_a = float(a.get("score", 0))
        score_b = float(b.get("score", 0))
        delta = round(score_a - score_b, 2)

        if delta > 5:
            direction = "A_higher"
            interp = f"Set A scores {abs(delta):.0f} points higher"
        elif delta < -5:
            direction = "B_higher"
            interp = f"Set B scores {abs(delta):.0f} points higher"
        else:
            direction = "similar"
            interp = "Both sets score similarly"

        comparison.append({
            "name": name,
            "label": a.get("label") or b.get("label") or name,
            "score_a": round(score_a, 1),
            "score_b": round(score_b, 1),
            "delta": delta,
            "direction": direction,
            "interpretation": interp,
            "confidence_a": a.get("confidence", "low"),
            "confidence_b": b.get("confidence", "low"),
        })

    comparison.sort(key=lambda x: -abs(x["delta"]))

    top_diff = [c["label"] for c in comparison[:3] if abs(c["delta"]) > 5]
    shared = [c["label"] for c in comparison if c["direction"] == "similar"]
    a_strengths = [c["label"] for c in comparison if c["direction"] == "A_higher" and c["score_a"] >= 40]
    b_strengths = [c["label"] for c in comparison if c["direction"] == "B_higher" and c["score_b"] >= 40]

    return {
        "indications": comparison,
        "top_differentiated": top_diff,
        "shared_strengths": shared[:5],
        "set_a_unique_strengths": a_strengths,
        "set_b_unique_strengths": b_strengths,
    }


# ── 5. Safety comparison ──────────────────────────────────────────────────────

def compute_safety_comparison(safety_a: Any, safety_b: Any) -> dict:
    def _get_dims(safety: Any) -> dict[str, dict]:
        if not isinstance(safety, dict):
            return {}
        return {k: v for k, v in safety.get("dimensions", {}).items() if isinstance(v, dict)}

    dims_a = _get_dims(safety_a)
    dims_b = _get_dims(safety_b)
    all_dims = sorted(set(dims_a) | set(dims_b))

    dimension_comparison: list[dict] = []
    for dim in all_dims:
        a = dims_a.get(dim, {})
        b = dims_b.get(dim, {})
        # flagged is a list of {gene, concern} dicts — extract gene names for comparison
        flags_a = {f["gene"] for f in (a.get("flagged") or []) if isinstance(f, dict) and "gene" in f}
        flags_b = {f["gene"] for f in (b.get("flagged") or []) if isinstance(f, dict) and "gene" in f}
        dimension_comparison.append({
            "dimension": dim,
            "label": a.get("label") or b.get("label") or dim,
            "score_a": a.get("score", 0),
            "score_b": b.get("score", 0),
            "risk_a": a.get("risk_level", "Unknown"),
            "risk_b": b.get("risk_level", "Unknown"),
            "unique_flags_a": sorted(flags_a - flags_b),
            "unique_flags_b": sorted(flags_b - flags_a),
            "shared_flags": sorted(flags_a & flags_b),
        })

    risk_a = safety_a.get("risk_level", "Unknown") if isinstance(safety_a, dict) else "Unknown"
    risk_b = safety_b.get("risk_level", "Unknown") if isinstance(safety_b, dict) else "Unknown"

    if risk_a == risk_b:
        safety_summary = f"Both sets have {risk_a} overall safety risk."
    else:
        safety_summary = f"Set A has {risk_a} risk; Set B has {risk_b} risk."

    # Radar chart data (numeric risk scores per dimension)
    _risk_score = {"Low": 1, "Moderate": 2, "High": 3, "Critical": 4, "Unknown": 0}
    radar_a = [_risk_score.get(dims_a.get(d, {}).get("risk_level", "Unknown"), 0) for d in all_dims]
    radar_b = [_risk_score.get(dims_b.get(d, {}).get("risk_level", "Unknown"), 0) for d in all_dims]

    return {
        "overall_risk_a": risk_a,
        "overall_risk_b": risk_b,
        "dimension_comparison": dimension_comparison,
        "safety_summary": safety_summary,
        "radar_axes": all_dims,
        "radar_a": radar_a,
        "radar_b": radar_b,
    }


# ── 6. HPA expression comparison ─────────────────────────────────────────────

def compute_expression_comparison(hpa_a: Any, hpa_b: Any, uniprot_a: Any, uniprot_b: Any) -> dict:
    # Build gene→expression-entry maps from HPA data
    def _parse_hpa(hpa: Any) -> dict[str, dict]:
        result: dict[str, dict] = {}
        if isinstance(hpa, list):
            for item in hpa:
                g = item.get("gene_name") or item.get("accession", "")
                if g:
                    result[g.upper()] = item
        elif isinstance(hpa, dict):
            for acc, item in hpa.items():
                if isinstance(item, dict):
                    g = item.get("gene_name", acc)
                    result[g.upper()] = item
        return result

    hpa_a_map = _parse_hpa(hpa_a)
    hpa_b_map = _parse_hpa(hpa_b)

    genes_a = set(hpa_a_map)
    genes_b = set(hpa_b_map)
    shared_genes = genes_a & genes_b

    shared_expression: list[dict] = []
    for gene in sorted(shared_genes)[:50]:
        a_entry = hpa_a_map[gene]
        b_entry = hpa_b_map[gene]
        conc_a = a_entry.get("blood_concentration_nm")
        conc_b = b_entry.get("blood_concentration_nm")
        if conc_a is not None and conc_b is not None and conc_a > 0 and conc_b > 0:
            ratio = conc_a / conc_b
            if ratio > 2:
                change = "Higher in A"
            elif ratio < 0.5:
                change = "Higher in B"
            else:
                change = "Similar"
        else:
            change = "No quantitative data"

        shared_expression.append({
            "gene_name": gene,
            "protein_name": a_entry.get("protein_name", ""),
            "conc_a_nm": conc_a,
            "conc_b_nm": conc_b,
            "expression_change": change,
        })

    return {
        "shared_protein_expression": shared_expression,
        "unique_a_gene_count": len(genes_a - genes_b),
        "unique_b_gene_count": len(genes_b - genes_a),
        "shared_gene_count": len(shared_genes),
    }


# ── Main entry point ──────────────────────────────────────────────────────────

def run_differential_analysis(
    job_id: str,
    set_a_label: str,
    set_b_label: str,
    uniprot_a: Any,
    uniprot_b: Any,
    gprofiler_a: Any,
    gprofiler_b: Any,
    therapeutic_a: Any,
    therapeutic_b: Any,
    safety_a: Any,
    safety_b: Any,
    hpa_a: Any,
    hpa_b: Any,
) -> dict:
    """Run all six differential analyses and return a combined result dict."""
    overlap = compute_protein_overlap(uniprot_a, uniprot_b)
    n_a = overlap["set_a_count"]
    n_b = overlap["set_b_count"]

    pathway = compute_pathway_comparison(gprofiler_a, gprofiler_b, n_a, n_b)
    pca_result = compute_pathway_pca(gprofiler_a, gprofiler_b)
    therapeutic = compute_therapeutic_comparison(therapeutic_a, therapeutic_b)
    safety = compute_safety_comparison(safety_a, safety_b)
    expression = compute_expression_comparison(hpa_a, hpa_b, uniprot_a, uniprot_b)

    return {
        "job_id": job_id,
        "set_a_label": set_a_label,
        "set_b_label": set_b_label,
        "overlap": overlap,
        "pathway": pathway,
        "pca": pca_result,
        "therapeutic": therapeutic,
        "safety": safety,
        "expression": expression,
    }
