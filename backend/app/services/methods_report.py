"""
Automatic Methods Section Generator.

Produces a publication-ready methods text and BibTeX citations from the
results of a completed Secretome Profiler job.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


# ── BibTeX entries ────────────────────────────────────────────────────────────

BIBTEX = """\
@article{uniprot2023,
  author  = {{UniProt Consortium}},
  title   = {{UniProt: the Universal Protein Knowledgebase in 2023}},
  journal = {Nucleic Acids Research},
  year    = {2023},
  volume  = {51},
  number  = {D1},
  pages   = {D523--D531},
  doi     = {10.1093/nar/gkac1052}
}

@article{string2023,
  author  = {Szklarczyk, Damian and others},
  title   = {{The STRING database in 2023: protein–protein association networks
              and functional enrichment analyses for any sequenced genome of interest}},
  journal = {Nucleic Acids Research},
  year    = {2023},
  volume  = {51},
  number  = {D1},
  pages   = {D638--D646},
  doi     = {10.1093/nar/gkac1000}
}

@article{gprofiler2023,
  author  = {Kolberg, Liis and others},
  title   = {{g:Profiler -- interoperable web service for functional enrichment
              analysis and gene identifier mapping}},
  journal = {Nucleic Acids Research},
  year    = {2023},
  volume  = {51},
  number  = {W1},
  pages   = {W207--W212},
  doi     = {10.1093/nar/gkad347}
}

@article{hpa2023,
  author  = {Uhlen, Mathias and others},
  title   = {{The Human Proteome Atlas as a resource for disease research}},
  journal = {Science},
  year    = {2023},
  volume  = {380},
  number  = {6648},
  pages   = {eadf2727},
  doi     = {10.1126/science.adf2727}
}

@article{signalp6,
  author  = {Teufel, Felix and others},
  title   = {{SignalP 6.0 predicts all five types of signal peptides using protein language models}},
  journal = {Nature Biotechnology},
  year    = {2022},
  volume  = {40},
  pages   = {1023--1025},
  doi     = {10.1038/s41587-021-01156-3}
}

@article{csgene2023,
  author  = {Coppe, Jean-Philippe and others},
  title   = {{The senescence-associated secretory phenotype: the dark side of tumor suppression}},
  journal = {Annual Review of Pathology},
  year    = {2010},
  volume  = {5},
  pages   = {99--118},
  doi     = {10.1146/annurev-pathol-121808-102144}
}
"""


# ── Main function ─────────────────────────────────────────────────────────────

def generate_report(
    job_id: str,
    proteins: list[str],
    module_data: dict[str, Any],
) -> dict[str, Any]:
    """
    Build a full methods-section text from aggregated module data.

    Parameters
    ----------
    job_id:
        UUID string of the job.
    proteins:
        List of input UniProt accession IDs.
    module_data:
        Mapping from module_name → parsed JSON payload (may be empty dict
        if the module was not run or had no results).

    Returns
    -------
    dict with keys:
        text         : full methods section as a string
        bibtex       : BibTeX citation block
        generated_at : ISO timestamp string
    """
    uniprot   = module_data.get("uniprot")   or {}
    string    = module_data.get("string")    or {}
    gprofiler = module_data.get("gprofiler") or {}
    hpa       = module_data.get("hpa")       or {}
    signalp   = module_data.get("signalp")   or {}
    sasp      = module_data.get("sasp")      or {}
    therapeutic = module_data.get("therapeutic") or {}
    safety    = module_data.get("safety")    or {}
    disease   = module_data.get("disease_context") or {}

    sections: list[str] = []

    # ── §1  Overview ──────────────────────────────────────────────────────────
    n_input = len(proteins)
    uniprot_entries: list[dict] = uniprot.get("results", [])
    n_resolved  = len(uniprot_entries)
    n_reviewed  = sum(1 for e in uniprot_entries if e.get("reviewed"))
    n_unresolved = n_input - n_resolved

    sections.append(
        "METHODS\n\n"
        "1. Overview and Input Dataset\n\n"
        f"A total of {n_input} UniProt accession identifiers were submitted to the "
        "Secretome Profiler pipeline (v1.0). "
        f"Accessions were mapped to UniProtKB via the UniProt REST API (2024-01 release) "
        f"[1]; {n_resolved} of {n_input} accessions were successfully resolved "
        f"({n_reviewed} Swiss-Prot reviewed, {n_resolved - n_reviewed} TrEMBL unreviewed). "
        f"{n_unresolved} accession(s) could not be resolved and were excluded from "
        "downstream analysis."
    )

    # ── §2  Signal peptide classification ─────────────────────────────────────
    signalp_entries: list[dict] = signalp.get("results", [])
    n_sp      = sum(1 for e in signalp_entries if e.get("prediction") == "SP")
    n_tat     = sum(1 for e in signalp_entries if e.get("prediction") == "TAT")
    n_lipo    = sum(1 for e in signalp_entries if e.get("prediction") == "LIPO")
    n_other   = len(signalp_entries) - n_sp - n_tat - n_lipo

    sections.append(
        "2. Signal Peptide Prediction\n\n"
        "The presence of N-terminal signal peptides was predicted using SignalP 6.0 [5], "
        "a deep neural network that distinguishes five signal-peptide types. "
        f"Of the {len(signalp_entries)} proteins analysed, "
        f"{n_sp} carried a canonical secretory signal peptide (SP), "
        f"{n_tat} a twin-arginine translocation signal (TAT), "
        f"{n_lipo} a lipoprotein signal peptide (LIPO), "
        f"and {n_other} showed no predicted signal sequence. "
        "A SignalP probability threshold of ≥ 0.5 was applied."
    )

    # ── §3  Plasma / tissue concentrations ───────────────────────────────────
    hpa_entries: list[dict] = hpa.get("results", [])
    n_hpa_detected = sum(
        1 for e in hpa_entries
        if e.get("blood_concentration_nm") is not None
        or e.get("blood_detected") is True
    )

    sections.append(
        "3. Protein Abundance Data\n\n"
        f"Blood/plasma concentration data for {len(hpa_entries)} proteins were retrieved "
        "from the Human Protein Atlas (HPA, v23.0) via the public API [4]. "
        f"{n_hpa_detected} proteins had quantitative or semi-quantitative "
        "abundance evidence in blood. Concentrations are reported in nanomolar (nM) "
        "where available."
    )

    # ── §4  Protein–protein interaction network ───────────────────────────────
    interactions: list[dict] = string.get("interactions", [])
    nodes: list     = string.get("nodes", [])
    n_edges   = len(interactions)
    n_nodes   = len(nodes)
    # Network density: 2E / N(N-1)
    if n_nodes > 1:
        density = round(2 * n_edges / (n_nodes * (n_nodes - 1)), 4)
    else:
        density = 0.0

    high_conf = [e for e in interactions if e.get("score", 0) >= 700]
    n_high   = len(high_conf)

    sections.append(
        "4. Protein–Protein Interaction Network Analysis\n\n"
        f"Protein–protein interactions (PPIs) among the {n_nodes} resolved proteins "
        "were retrieved from the STRING database (v12.0) using a minimum combined "
        "interaction score of 400 (medium confidence) [2]. "
        f"The resulting network comprised {n_edges} edges "
        f"(network density {density:.4f}), of which {n_high} interactions "
        "met the high-confidence threshold (score ≥ 700). "
        "Hub proteins were defined as the top-decile nodes by degree centrality. "
        "Connected components were computed using a Union-Find algorithm and used "
        "to assign cluster membership for visualisation."
    )

    # ── §5  Functional enrichment ──────────────────────────────────────────────
    gprofiler_results: list[dict] = gprofiler.get("results", [])
    n_terms   = len(gprofiler_results)
    sources: dict[str, int] = {}
    for r in gprofiler_results:
        src = r.get("source", "OTHER")
        sources[src] = sources.get(src, 0) + 1

    top5 = sorted(gprofiler_results, key=lambda x: x.get("p_value", 1.0))[:5]
    top5_names = [f"{t.get('name', '?')} (p={t.get('p_value', 1.0):.2e})" for t in top5]
    top5_str = "; ".join(top5_names) if top5_names else "no significant terms"

    sources_str = ", ".join(
        f"{src}: {cnt}" for src, cnt in sorted(sources.items(), key=lambda x: -x[1])
    ) if sources else "none"

    sections.append(
        "5. Functional Enrichment Analysis\n\n"
        "Over-representation analysis was performed using g:Profiler (version e111_eg58_p18) [3] "
        "against Gene Ontology (GO) Biological Process, Molecular Function, and Cellular "
        "Component databases, as well as KEGG Pathways and Reactome. Only terms with "
        "Benjamini–Hochberg-adjusted p-value < 0.05 were retained. "
        f"A total of {n_terms} significantly enriched terms were identified "
        f"({sources_str}). "
        f"The five most significant terms were: {top5_str}."
    )

    # ── §6  SASP annotation ───────────────────────────────────────────────────
    sasp_entries: list[dict] = sasp.get("results", [])
    n_sasp = sum(1 for e in sasp_entries if e.get("is_sasp"))

    sections.append(
        "6. Senescence-Associated Secretory Phenotype (SASP) Annotation\n\n"
        "Proteins were annotated as SASP factors by cross-referencing against a "
        "curated list of secreted factors documented in the senescence literature [6]. "
        f"Of the input proteins, {n_sasp} were identified as canonical SASP components. "
        "SASP status was determined by gene-name exact matching against the reference list."
    )

    # ── §7  Therapeutic scoring ───────────────────────────────────────────────
    ther_results: list[dict] = therapeutic.get("results", [])
    n_indications = len(ther_results)

    if ther_results:
        top_ind = max(ther_results, key=lambda x: x.get("score", 0))
        top_name  = top_ind.get("indication", "unknown")
        top_score = top_ind.get("score", 0)
        top_conf  = top_ind.get("confidence", "low")
        ther_str = (
            f"The highest-scoring indication was {top_name} "
            f"(score {top_score:.2f}, confidence: {top_conf})."
        )
    else:
        ther_str = "No therapeutic scoring results were available."

    sections.append(
        "7. Therapeutic Indication Scoring\n\n"
        f"Secretome proteins were scored against {n_indications} therapeutic "
        "indications using a gene-name-based weighted scoring algorithm. "
        "Each indication is defined by a positive gene set (weight +1.0 per hit) "
        "and a negative gene set (penalty −0.5 per hit). Scores were normalised to "
        "the maximum achievable score per indication. Confidence tiers (high / medium / low) "
        "were assigned based on normalised score thresholds (≥ 0.6 / ≥ 0.3 / < 0.3). "
        + ther_str
    )

    # ── §8  Safety profiling ──────────────────────────────────────────────────
    safety_results: list[dict] = safety.get("results", [])
    n_safety = len(safety_results)
    flagged = [r for r in safety_results if r.get("flag")]
    n_flagged = len(flagged)
    flagged_genes = ", ".join(r.get("gene_name", r.get("accession", "?")) for r in flagged[:10])
    if len(flagged) > 10:
        flagged_genes += f", and {len(flagged) - 10} others"

    sections.append(
        "8. Safety Profiling\n\n"
        f"The {n_safety} secretome proteins were evaluated for potential safety liabilities "
        "using an internal curated database of literature-reported adverse effect markers, "
        "immunogenicity flags, and off-target interaction risks. "
        f"{n_flagged} protein(s) were flagged for potential safety concerns"
        + (f": {flagged_genes}." if flagged_genes else ".")
        + " Safety annotations are provided for informational purposes only and "
        "should be interpreted in the context of the specific therapeutic modality "
        "and disease indication."
    )

    # ── §9  Statistical methods & software ────────────────────────────────────
    sections.append(
        "9. Statistical Methods and Software\n\n"
        "All analyses were performed using the Secretome Profiler web application "
        f"(job ID: {job_id}). "
        "The analysis pipeline is implemented in Python 3.11 with FastAPI, "
        "Celery for task orchestration, PostgreSQL for result persistence, "
        "and MinIO for JSON payload storage. "
        "Network visualisation was rendered with Cytoscape.js (v3.29) using the "
        "fCoSE force-directed layout. "
        "Functional enrichment charts were rendered with Apache ECharts (v5.5). "
        f"The analysis was completed on {datetime.now(timezone.utc).strftime('%Y-%m-%d')}."
    )

    full_text = "\n\n".join(sections)
    refs = (
        "\nReferences\n\n"
        "[1] UniProt Consortium, Nucleic Acids Res. 2023;51(D1):D523–D531.\n"
        "[2] Szklarczyk et al., Nucleic Acids Res. 2023;51(D1):D638–D646.\n"
        "[3] Kolberg et al., Nucleic Acids Res. 2023;51(W1):W207–W212.\n"
        "[4] Uhlen et al., Science 2023;380(6648):eadf2727.\n"
        "[5] Teufel et al., Nat Biotechnol. 2022;40:1023–1025.\n"
        "[6] Coppe et al., Annu Rev Pathol. 2010;5:99–118.\n"
    )
    full_text += refs

    return {
        "text": full_text,
        "bibtex": BIBTEX,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
