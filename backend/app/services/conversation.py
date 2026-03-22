"""
Conversation service for SecretomeProfiler Q&A.
Allows researchers to ask questions about their
specific secretome analysis results using Claude.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert biomedical scientist and research assistant specializing in:
- Secretome biology and cell-secreted proteomics
- Cell therapy and regenerative medicine
- Protein pharmacokinetics and pharmacodynamics
- Translational medicine and clinical translation
- Cytokine biology and signaling networks

You are analyzing SPECIFIC secretome profiling results for a researcher. \
Answer questions about THIS dataset only.

STRICT RULES:
1. Only discuss data present in the results below. Never invent results.
2. Always name specific proteins as: "BDNF (Brain-derived neurotrophic factor)" on first mention.
3. Distinguish clearly:
   - Established biology: "is known to", "published studies show"
   - This analysis: "this analysis indicates", "the data shows"
   - Limitations: "this cannot be determined from the current data"
4. Cite exact numbers when making claims: scores, protein counts, concentrations, fold changes.
5. Be scientifically precise but clear.
6. Suggest specific follow-up experiments when appropriate.
7. Keep responses focused: 150–400 words unless more detail is needed.
8. Never start with "I" — start with scientific content directly.

SECRETOME ANALYSIS DATA:
{context}
"""


# ── Safe coercion helpers ──────────────────────────────────────────────────────

def safe_list(value: Any, default: list | None = None) -> list:
    """Safely convert any value to a list.

    Handles None, dicts (keyed by numeric strings or arbitrary keys),
    JSON strings, and anything else iterable.
    """
    if default is None:
        default = []
    if value is None:
        return default
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        # Numeric-keyed dict → ordered list of values
        try:
            max_key = max(int(k) for k in value.keys() if str(k).isdigit())
            return [
                value.get(str(i), value.get(i))
                for i in range(max_key + 1)
                if value.get(str(i)) is not None or value.get(i) is not None
            ]
        except (ValueError, AttributeError):
            return list(value.values())
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return safe_list(parsed, default)
        except Exception:
            return [value] if value else default
    try:
        return list(value)
    except Exception:
        return default


def safe_dict(value: Any, default: dict | None = None) -> dict:
    """Safely return a dict, coercing None / non-dicts to default."""
    if default is None:
        default = {}
    if isinstance(value, dict):
        return value
    return default


def safe_str(value: Any, default: str = "?") -> str:
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return str(value)[:100]
    return str(value)


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


# ── Context builder ────────────────────────────────────────────────────────────

def build_context(all_results: dict[str, Any]) -> str:
    """
    Build a compressed text context from all analysis module results.
    Stays under ~25,000 tokens.
    """
    lines: list[str] = []

    # ── UniProt / protein overview ─────────────────────────────────────────
    uniprot = all_results.get("uniprot", {})
    lines.append("=== PROTEIN OVERVIEW ===")
    if isinstance(uniprot, dict):
        # Keyed by accession
        gene_names = []
        for acc, info in uniprot.items():
            if not isinstance(info, dict):
                continue
            gn = info.get("gene_name", "")
            pn = info.get("protein_name", "")
            rev = "SP" if info.get("reviewed") else "TR"
            loc = info.get("subcellular_location", "")
            if isinstance(loc, list):
                loc = ", ".join(loc[:2])
            if gn:
                gene_names.append(gn)
            lines.append(
                f"  {acc} | {gn} | {pn[:50]} | {rev} | {str(loc)[:60]}"
            )
        lines.insert(
            1,
            f"Total proteins: {len(uniprot)} | "
            f"Genes: {', '.join(gene_names[:30])}"
            + (f" (+{len(gene_names)-30} more)" if len(gene_names) > 30 else ""),
        )

    # ── SignalP / secretion classification ────────────────────────────────
    signalp = all_results.get("signalp", {})
    if signalp:
        lines.append("\n=== SECRETION CLASSIFICATION ===")
        classical, unconventional, gpi, other = [], [], [], []
        for acc, info in signalp.items():
            if not isinstance(info, dict):
                continue
            cls = info.get("secretion_type") or info.get("type") or ""
            gene = info.get("gene_name") or acc
            if "Sec/SPI" in cls or "classical" in cls.lower():
                classical.append(gene)
            elif "GPI" in cls:
                gpi.append(gene)
            elif "Unconventional" in cls or "unconventional" in cls.lower():
                unconventional.append(gene)
            else:
                other.append(gene)
        lines.append(f"Classical SP ({len(classical)}): {', '.join(classical[:30])}")
        lines.append(f"Unconventional ({len(unconventional)}): {', '.join(unconventional[:20])}")
        lines.append(f"GPI-anchored ({len(gpi)}): {', '.join(gpi[:20])}")
        lines.append(f"Other/No SP ({len(other)}): {', '.join(other[:20])}")

    # ── SASP ──────────────────────────────────────────────────────────────
    sasp = all_results.get("sasp", {})
    if sasp:
        lines.append("\n=== SASP ASSESSMENT ===")
        sasp_proteins = safe_list(sasp.get("sasp_proteins"))
        sasp_count = safe_int(sasp.get("sasp_count", len(sasp_proteins)))
        total = safe_int(sasp.get("total", 1)) or 1
        fraction = sasp_count / total
        lines.append(
            f"SASP proteins ({sasp_count}/{total}, {fraction:.1%}): "
            f"{', '.join(str(p) for p in sasp_proteins[:30])}"
        )

    # ── STRING network ─────────────────────────────────────────────────────
    string_data = all_results.get("string", {})
    if string_data:
        lines.append("\n=== PROTEIN INTERACTION NETWORK ===")
        interactions = safe_list(string_data.get("interactions"))
        nodes = safe_list(string_data.get("proteins"))
        lines.append(f"Nodes: {len(nodes)} | Edges: {len(interactions)}")
        degree: dict[str, int] = {}
        for edge in interactions:
            if not isinstance(edge, dict):
                continue
            for k in ("protein1", "protein2", "gene1", "gene2"):
                v = edge.get(k)
                if v:
                    degree[str(v)] = degree.get(str(v), 0) + 1
        hubs = sorted(degree.items(), key=lambda x: x[1], reverse=True)[:15]
        if hubs:
            lines.append(
                "Hubs: " + ", ".join(f"{g}({d})" for g, d in hubs)
            )

    # ── g:Profiler enrichment ──────────────────────────────────────────────
    gprofiler = all_results.get("gprofiler", {})
    if gprofiler:
        lines.append("\n=== ENRICHED PATHWAYS (top 40) ===")
        results_list = safe_list(gprofiler.get("results"))
        for t in results_list[:40]:
            if not isinstance(t, dict):
                continue
            genes = safe_list(t.get("intersections") or t.get("genes"))
            genes_str = ", ".join(str(g) for g in genes[:8])
            pval = t.get("p_value") or t.get("adjusted_p_value") or 1
            lines.append(
                f"  [{t.get('source','?')}] {t.get('name', t.get('term_name','?'))} | "
                f"p={pval:.2e} | n={t.get('intersection_size',0)} | {genes_str}"
            )

    # ── Therapeutic scores ─────────────────────────────────────────────────
    therapeutic = all_results.get("therapeutic", {})
    if therapeutic:
        lines.append("\n=== THERAPEUTIC INDICATION SCORES ===")
        lines.append(
            f"Top: {therapeutic.get('top_indication','?')} | "
            f"Confidence: {therapeutic.get('overall_confidence','?')}"
        )
        for ind in safe_list(therapeutic.get("indications"))[:12]:
            if not isinstance(ind, dict):
                continue
            sup = ", ".join(str(p) for p in safe_list(ind.get("supporting_proteins"))[:6])
            lim = ", ".join(str(p) for p in safe_list(ind.get("limiting_factors"))[:3])
            lines.append(
                f"  {ind.get('label', ind.get('name','?'))}: "
                f"score={safe_float(ind.get('score')):.2f} ({ind.get('confidence','?')}) | "
                f"hits={ind.get('positive_hit_count',0)} | "
                f"supporting: {sup} | limiting: {lim}"
            )

    # ── Safety ────────────────────────────────────────────────────────────
    safety = all_results.get("safety", {})
    if safety:
        lines.append("\n=== SAFETY PROFILE ===")
        lines.append(
            f"Risk: {safety.get('risk_level','?')} | "
            f"Score: {safe_float(safety.get('overall_safety_score')):.0f}/100 | "
            f"Flagged: {safety.get('total_flagged',0)}"
        )
        for dim in safe_list(safety.get("dimensions"))[:8]:
            if not isinstance(dim, dict):
                continue
            flagged = ", ".join(str(p) for p in safe_list(dim.get("flagged_proteins"))[:5])
            lines.append(
                f"  {dim.get('name','?')}: {dim.get('risk_level','?')} | {flagged}"
            )

    # ── Pharmacokinetics ──────────────────────────────────────────────────
    pk = all_results.get("pk", {})
    if pk:
        lines.append("\n=== PHARMACOKINETIC PROPERTIES ===")
        pk_summary = safe_dict(pk.get("pk_summary"))
        lines.append(
            f"BBB-crossing: {pk_summary.get('bbb_crossing_count',0)} | "
            f"Short t½: {pk_summary.get('short_half_life_count',0)} | "
            f"Mean MW: {safe_float(pk_summary.get('mean_molecular_weight_kda')):.1f} kDa"
        )
        for p in safe_list(pk.get("proteins"))[:60]:
            if not isinstance(p, dict):
                continue
            gene = p.get("gene_name") or p.get("input_id", "?")
            mw = p.get("molecular_weight_kda", "?")
            hl = p.get("plasma_half_life_hours", "?")
            bbb = p.get("bbb_penetration_class", "?")
            mech = p.get("bbb_mechanism") or ""
            lines.append(
                f"  {gene}: MW={mw}kDa | t½={hl}h | BBB={bbb}"
                + (f" [{mech[:50]}]" if mech else "")
            )

    # ── Concentrations ────────────────────────────────────────────────────
    concentrations = all_results.get("concentrations", {})
    if concentrations:
        lines.append("\n=== CONCENTRATION ANALYSIS ===")
        conc_summary = safe_dict(concentrations.get("summary"))
        caution_proteins = ", ".join(
            str(x) for x in safe_list(conc_summary.get("caution_proteins"))[:6]
        )
        lines.append(
            f"Quantified: {concentrations.get('total_quantified',0)} | "
            f"Physiological: {conc_summary.get('physiological_count',0)} | "
            f"Supra: {conc_summary.get('supra_physiological_count',0)} | "
            f"Caution: {caution_proteins}"
        )
        for p in safe_list(concentrations.get("concentration_profiles"))[:40]:
            if not isinstance(p, dict):
                continue
            fold = p.get("fold_over_healthy")
            fold_str = f"{fold:.1f}x" if isinstance(fold, (int, float)) else "?"
            lines.append(
                f"  {p.get('gene_name','?')}: "
                f"{p.get('user_concentration_pg_ml','?')} pg/mL | "
                f"healthy_median={p.get('healthy_plasma_median_pg_ml','N/A')} | "
                f"fold={fold_str} | {p.get('status','?')}"
            )

    # ── Reference library ─────────────────────────────────────────────────
    reference = all_results.get("reference_library", {})
    if reference:
        lines.append("\n=== REFERENCE SECRETOME COMPARISON ===")
        lines.append(reference.get("summary_text", ""))
        for comp in safe_list(reference.get("comparisons"))[:6]:
            if not isinstance(comp, dict):
                continue
            lines.append(
                f"  {comp.get('reference_name','?')}: "
                f"similarity={safe_float(comp.get('similarity_pct')):.1f}% | "
                f"Jaccard={safe_float(comp.get('jaccard')):.3f} | "
                f"shared={comp.get('shared_count',0)} | "
                f"F1={safe_float(comp.get('f1')):.3f}"
            )
        top = safe_dict(reference.get("top_match"))
        shared = safe_list(top.get("shared_proteins"))
        if shared:
            lines.append(f"  Shared with top: {', '.join(str(p) for p in shared[:20])}")

    return "\n".join(lines)


# ── Suggestions ────────────────────────────────────────────────────────────────

def generate_suggestions(all_results: dict[str, Any]) -> list[str]:
    """Generate context-specific suggested questions from analysis findings."""
    suggestions: list[str] = []

    therapeutic = all_results.get("therapeutic", {})
    raw_indications = safe_list(therapeutic.get("indications"))
    # Filter to dicts only before sorting
    dict_indications = [x for x in raw_indications if isinstance(x, dict)]
    indications = sorted(
        dict_indications,
        key=lambda x: safe_float(x.get("score")),
        reverse=True,
    )
    top_ind = indications[0] if indications else None
    second_ind = indications[1] if len(indications) > 1 else None

    safety = all_results.get("safety", {})
    risk_level = safe_str(safety.get("risk_level"), "Low")
    flagged: list[str] = []
    for dim in safe_list(safety.get("dimensions")):
        if isinstance(dim, dict):
            flagged.extend(str(p) for p in safe_list(dim.get("flagged_proteins")))
    flagged = list(dict.fromkeys(flagged))[:5]

    sasp = all_results.get("sasp", {})
    sasp_proteins = safe_list(sasp.get("sasp_proteins"))
    sasp_proteins = [str(p) for p in sasp_proteins]
    sasp_count = safe_int(sasp.get("sasp_count", len(sasp_proteins)))
    total = safe_int(sasp.get("total", 1)) or 1
    sasp_fraction = sasp_count / total

    pk = all_results.get("pk", {})
    bbb_list = [
        str(p.get("gene_name", "?"))
        for p in safe_list(pk.get("proteins"))
        if isinstance(p, dict)
        and safe_str(p.get("bbb_penetration_class", "")).startswith("Established")
    ]
    short_hl = [
        str(p.get("gene_name", "?"))
        for p in safe_list(pk.get("proteins"))
        if isinstance(p, dict)
        and isinstance(p.get("plasma_half_life_hours"), (int, float))
        and p["plasma_half_life_hours"] < 2
    ]

    reference = all_results.get("reference_library", {})
    top_match = safe_dict(reference.get("top_match"))

    concentrations = all_results.get("concentrations", {})
    conc_summary = safe_dict(concentrations.get("summary"))
    most_elevated = safe_str(conc_summary.get("most_elevated"), "")
    supra_count = safe_int(conc_summary.get("supra_physiological_count"))

    if top_ind:
        label = top_ind.get("label") or top_ind.get("name", "")
        score = safe_float(top_ind.get("score"))
        suggestions.append(
            f"Why does this secretome score {score:.1f} for {label}? "
            f"Which proteins are the primary drivers?"
        )
        suggestions.append(
            f"What in vivo model would best validate the {label} potential?"
        )

    if second_ind and top_ind:
        label2 = second_ind.get("label") or second_ind.get("name", "")
        label1 = top_ind.get("label") or top_ind.get("name", "")
        suggestions.append(
            f"Can this secretome address both {label1} and {label2} simultaneously, "
            f"or do the protein requirements conflict?"
        )

    if sasp_proteins and sasp_fraction > 0.03:
        sp_str = ", ".join(sasp_proteins[:3])
        suggestions.append(
            f"The SASP proteins {sp_str} are present ({sasp_fraction:.1%}). "
            f"Is this a therapeutic concern and how should it be addressed?"
        )

    if bbb_list:
        bbb_str = ", ".join(bbb_list[:3])
        suggestions.append(
            f"{bbb_str} can cross the blood-brain barrier. "
            f"What CNS therapeutic effects would these drive?"
        )

    if short_hl:
        hl_str = ", ".join(short_hl[:3])
        suggestions.append(
            f"{hl_str} have very short plasma half-lives (<2h). "
            f"What delivery strategy would maintain therapeutic levels?"
        )

    if risk_level in ("Moderate", "High") and flagged:
        flag_str = ", ".join(flagged[:3])
        suggestions.append(
            f"Safety flags exist for {flag_str}. "
            f"Are these real concerns for clinical use, or context-dependent?"
        )

    if top_match.get("reference_name"):
        ref_name = top_match["reference_name"]
        sim = safe_float(top_match.get("similarity_pct"))
        suggestions.append(
            f"This secretome is {sim:.0f}% similar to the {ref_name}. "
            f"What does the similarity (and the differences) mean therapeutically?"
        )

    if supra_count > 0 and most_elevated:
        suggestions.append(
            f"{most_elevated} is at supra-physiological levels. "
            f"Is this concentration safe and therapeutically relevant?"
        )

    suggestions.extend([
        "Which 5 proteins are the most important for the therapeutic effect and why?",
        "What are the 5 most important experiments to validate this secretome?",
        "What route of administration makes most sense based on the PK data?",
        "What patient population would benefit most from this secretome?",
        "What are the main limitations of this computational analysis?",
        "Which proteins could be removed to improve safety without losing efficacy?",
        "How does the network connectivity reflect secretome coherence vs independent effects?",
    ])

    seen: set[str] = set()
    unique: list[str] = []
    for s in suggestions:
        key = s[:50]
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique[:10]


# ── Chat ───────────────────────────────────────────────────────────────────────

async def chat_with_results(
    all_results: dict[str, Any],
    history: list[dict],
    user_message: str,
) -> dict[str, Any]:
    """
    Send a user message in context of secretome results.
    Returns {response, tokens_used, model, error, error_type}.
    """
    settings = get_settings()

    if not settings.anthropic_api_key:
        return {
            "response": (
                "AI Q&A is not configured. "
                "Please add ANTHROPIC_API_KEY to backend/.env and restart."
            ),
            "tokens_used": 0,
            "error": True,
            "error_type": "no_api_key",
        }

    try:
        import anthropic as _anthropic  # noqa: PLC0415

        client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)
        context = build_context(all_results)
        system = SYSTEM_PROMPT.format(context=context)

        messages: list[dict] = []
        for msg in history[-18:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})

        resp = client.messages.create(
            model=settings.llm_model or "claude-opus-4-5",
            max_tokens=1200,
            system=system,
            messages=messages,
        )

        return {
            "response": resp.content[0].text,
            "tokens_used": resp.usage.input_tokens + resp.usage.output_tokens,
            "model": resp.model,
            "error": False,
            "error_type": None,
        }

    except Exception as exc:
        import anthropic as _a  # noqa: PLC0415

        if isinstance(exc, _a.AuthenticationError):
            return {
                "response": "Invalid API key. Please check ANTHROPIC_API_KEY in .env.",
                "tokens_used": 0,
                "error": True,
                "error_type": "auth_error",
            }
        if isinstance(exc, _a.RateLimitError):
            return {
                "response": "Rate limit reached. Please wait 30 seconds and try again.",
                "tokens_used": 0,
                "error": True,
                "error_type": "rate_limit",
            }
        logger.error("Chat error: %s: %s", type(exc).__name__, exc)
        return {
            "response": f"An error occurred: {exc}. Please try again.",
            "tokens_used": 0,
            "error": True,
            "error_type": "unknown",
        }
