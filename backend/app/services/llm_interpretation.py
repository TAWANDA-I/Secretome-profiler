"""
LLM-powered scientific interpretation of secretome analysis results.

Uses the Claude API to generate structured, publication-ready interpretation
of the secretome composition, therapeutic potential, and key findings.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def build_analysis_context(
    proteins: list[str],
    uniprot_data: dict[str, Any],
    therapeutic_data: dict[str, Any] | None = None,
    pk_data: dict[str, Any] | None = None,
    concentration_data: dict[str, Any] | None = None,
    reference_library_data: dict[str, Any] | None = None,
) -> str:
    """
    Assemble a concise text context from all analysis modules
    to feed into the LLM prompt.
    """
    lines: list[str] = []

    # Basic secretome stats
    n_proteins = len(proteins)
    lines.append(f"SECRETOME SUMMARY")
    lines.append(f"Total proteins: {n_proteins}")

    # UniProt summary
    if uniprot_data:
        secreted_count = sum(
            1 for v in uniprot_data.values()
            if isinstance(v, dict) and v.get("subcellular_location") and
            any("secret" in loc.lower() for loc in (v.get("subcellular_location") or []))
        )
        gene_names = [
            v.get("gene_name", "") for v in uniprot_data.values()
            if isinstance(v, dict) and v.get("gene_name")
        ]
        lines.append(f"Confirmed secreted proteins: {secreted_count}")
        if gene_names:
            lines.append(f"Key proteins: {', '.join(gene_names[:20])}" +
                         (f" ... (+{len(gene_names)-20} more)" if len(gene_names) > 20 else ""))

    # Therapeutic scoring
    if therapeutic_data:
        top = therapeutic_data.get("top_indication", "Unknown")
        confidence = therapeutic_data.get("overall_confidence", "Low")
        lines.append(f"\nTHERAPEUTIC POTENTIAL")
        lines.append(f"Top indication: {top} (confidence: {confidence})")
        indications = therapeutic_data.get("indications", [])
        top5 = [
            f"{i['label']} (score {i['score']:.1f}, {i['positive_hit_count']} hits)"
            for i in indications[:5] if i.get("score", 0) > 0
        ]
        if top5:
            lines.append("Top 5 indications: " + "; ".join(top5))
        # Supporting proteins for top indication
        if indications:
            hits = indications[0].get("supporting_proteins", [])
            if hits:
                lines.append(f"Key drivers for {top}: {', '.join(hits[:10])}")
            limiting = indications[0].get("limiting_factors", [])
            if limiting:
                lines.append(f"Limiting factors: {', '.join(limiting)}")

    # Pharmacokinetics
    if pk_data:
        summary = pk_data.get("pk_summary", {})
        lines.append(f"\nPHARMACOKINETICS")
        lines.append(
            f"BBB-crossing proteins: {summary.get('bbb_crossing_count', 0)}"
        )
        lines.append(
            f"Mean molecular weight: {summary.get('mean_molecular_weight_kda', 0):.1f} kDa"
        )
        # Short-lived proteins
        short_lived = [
            p["gene_name"] for p in pk_data.get("proteins", [])
            if p.get("half_life_category") in ("Short (<6h)", "Very short (<1h)")
        ]
        if short_lived:
            lines.append(f"Short-lived proteins (<6h): {', '.join(short_lived[:8])}")

    # Concentration analysis
    if concentration_data:
        summary = concentration_data.get("summary", {})
        lines.append(f"\nCONCENTRATION ANALYSIS")
        lines.append(
            f"Quantified: {concentration_data.get('total_quantified', 0)} proteins"
        )
        lines.append(
            f"Within therapeutic window: {summary.get('within_therapeutic_window_count', 0)}"
        )
        lines.append(
            f"Supra-physiological: {summary.get('supra_physiological_count', 0)}"
        )
        caution = summary.get("caution_proteins", [])
        if caution:
            lines.append(f"Caution proteins: {', '.join(caution[:6])}")
        assessment = concentration_data.get("therapeutic_assessment", "")
        if assessment:
            lines.append(f"Assessment: {assessment}")

    # Reference library comparison
    if reference_library_data:
        comparisons = reference_library_data.get("comparisons", [])
        lines.append(f"\nREFERENCE SECRETOME COMPARISON")
        if comparisons:
            top_matches = comparisons[:3]
            for m in top_matches:
                lines.append(
                    f"  {m['reference_name']}: {m['similarity_pct']:.0f}% similarity "
                    f"(Jaccard {m['jaccard']:.2f}, F1 {m['f1']:.2f})"
                )
            shared_with_top = comparisons[0].get("shared_proteins", []) if comparisons else []
            if shared_with_top:
                lines.append(f"  Shared with top match: {', '.join(shared_with_top[:10])}")

    return "\n".join(lines)


def generate_interpretation(
    context: str,
    settings: Any,
) -> dict[str, Any]:
    """
    Call the Claude API to generate scientific interpretation.

    Returns:
        {
          "enabled": bool,
          "model": str,
          "summary": str,          # 3-5 sentence executive summary
          "mechanisms": str,       # mechanistic insight paragraph
          "clinical_relevance": str, # clinical/translational relevance
          "limitations": str,      # caveats and limitations
          "full_text": str,        # full formatted interpretation
        }
    """
    if not settings.llm_enabled or not settings.anthropic_api_key:
        return {
            "enabled": False,
            "model": settings.llm_model,
            "summary": "",
            "mechanisms": "",
            "clinical_relevance": "",
            "limitations": "",
            "full_text": "",
            "error": None,
        }

    try:
        import anthropic  # noqa: PLC0415

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        system_prompt = (
            "You are an expert in cell biology, proteomics, and translational medicine. "
            "You analyse secretome datasets from the perspective of a senior researcher "
            "preparing a manuscript. Your interpretations are scientifically rigorous, "
            "concise, and evidence-based. You cite mechanistic pathways and relevant "
            "literature concepts without hallucinating specific references. "
            "Use precise scientific language appropriate for a high-impact journal."
        )

        user_prompt = (
            f"Below is a computational analysis of a secretome dataset. "
            f"Please provide a structured scientific interpretation with four sections:\n\n"
            f"1. EXECUTIVE SUMMARY (3-5 sentences): Summarise the key characteristics "
            f"of this secretome and its primary therapeutic potential.\n\n"
            f"2. MECHANISTIC INSIGHTS (1-2 paragraphs): Describe the dominant signalling "
            f"pathways, receptor-ligand interactions, and molecular mechanisms represented "
            f"by this secretome composition.\n\n"
            f"3. CLINICAL RELEVANCE (1 paragraph): Discuss the translational and clinical "
            f"implications, including any concentration-related safety considerations.\n\n"
            f"4. LIMITATIONS & CAVEATS (3-5 bullet points): Identify key limitations of "
            f"this analysis (e.g., in vitro conditions, missing proteins, concentration "
            f"uncertainties).\n\n"
            f"--- ANALYSIS DATA ---\n{context}\n--- END DATA ---"
        )

        message = client.messages.create(
            model=settings.llm_model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        full_text = message.content[0].text if message.content else ""

        # Parse sections from the response
        sections = _parse_sections(full_text)

        return {
            "enabled": True,
            "model": settings.llm_model,
            "summary": sections.get("executive_summary", ""),
            "mechanisms": sections.get("mechanistic_insights", ""),
            "clinical_relevance": sections.get("clinical_relevance", ""),
            "limitations": sections.get("limitations_caveats", ""),
            "full_text": full_text,
            "error": None,
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        }

    except Exception as exc:
        logger.error("LLM interpretation failed: %s", exc)
        return {
            "enabled": True,
            "model": settings.llm_model,
            "summary": "",
            "mechanisms": "",
            "clinical_relevance": "",
            "limitations": "",
            "full_text": "",
            "error": str(exc),
        }


def _parse_sections(text: str) -> dict[str, str]:
    """Parse numbered sections from the LLM response."""
    import re

    section_patterns = {
        "executive_summary": r"(?:1\.|EXECUTIVE SUMMARY)[:\s]+(.*?)(?=\n\s*(?:2\.|MECHANISTIC)|$)",
        "mechanistic_insights": r"(?:2\.|MECHANISTIC INSIGHTS)[:\s]+(.*?)(?=\n\s*(?:3\.|CLINICAL)|$)",
        "clinical_relevance": r"(?:3\.|CLINICAL RELEVANCE)[:\s]+(.*?)(?=\n\s*(?:4\.|LIMITATIONS)|$)",
        "limitations_caveats": r"(?:4\.|LIMITATIONS)[^\n]*[:\s]+(.*?)$",
    }

    sections: dict[str, str] = {}
    for key, pattern in section_patterns.items():
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if match:
            sections[key] = match.group(1).strip()

    return sections
