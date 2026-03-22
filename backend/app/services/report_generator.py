"""
Full PDF report generator for Secretome Profiler results.

Generates a publication-quality multi-section PDF using reportlab,
combining data from all completed analysis modules.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


def _format_date(dt: datetime | None = None) -> str:
    d = dt or datetime.utcnow()
    return d.strftime("%d %B %Y")


def generate_pdf_report(
    job_id: str,
    proteins: list[str],
    module_data: dict[str, Any],
    job_label: str | None = None,
) -> bytes:
    """
    Generate a full PDF report from all analysis module results.

    Returns raw PDF bytes.
    """
    try:
        from reportlab.lib import colors  # noqa: PLC0415
        from reportlab.lib.enums import TA_CENTER, TA_LEFT  # noqa: PLC0415
        from reportlab.lib.pagesizes import A4  # noqa: PLC0415
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: PLC0415
        from reportlab.lib.units import cm  # noqa: PLC0415
        from reportlab.platypus import (  # noqa: PLC0415
            HRFlowable,
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError:
        logger.error("reportlab not installed — cannot generate PDF")
        raise RuntimeError("reportlab is required for PDF generation. Install it with: pip install reportlab")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
        title=f"Secretome Profiler Report — {job_id[:8]}",
    )

    styles = getSampleStyleSheet()
    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        fontSize=20,
        spaceAfter=6,
        textColor=colors.HexColor("#1e40af"),
    )
    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontSize=14,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=16,
        spaceAfter=6,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=colors.HexColor("#374151"),
        spaceBefore=10,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1f2937"),
    )
    caption_style = ParagraphStyle(
        "Caption",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6b7280"),
        alignment=TA_CENTER,
    )
    bold_style = ParagraphStyle(
        "Bold",
        parent=body_style,
        fontName="Helvetica-Bold",
    )

    story = []
    hr = HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb"))

    # ── Cover page ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1.5 * cm))
    story.append(Paragraph("Secretome Profiler", title_style))
    story.append(Paragraph("Comprehensive Analysis Report", ParagraphStyle(
        "Subtitle", parent=styles["Normal"], fontSize=13,
        textColor=colors.HexColor("#6b7280"), spaceAfter=4,
    )))
    story.append(hr)
    story.append(Spacer(1, 0.4 * cm))

    meta_data = [
        ["Job ID", job_id],
        ["Label", job_label or "—"],
        ["Date", _format_date()],
        ["Proteins analysed", str(len(proteins))],
        ["Modules completed", str(len(module_data))],
    ]
    meta_table = Table(meta_data, colWidths=[4 * cm, 12 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#1f2937")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(PageBreak())

    # ── 1. Protein List ───────────────────────────────────────────────────────
    story.append(Paragraph("1. Input Protein List", h1_style))
    uniprot_data = module_data.get("uniprot", {})
    if uniprot_data:
        rows = [["Accession", "Gene Name", "Protein Name", "Reviewed"]]
        for acc, info in list(uniprot_data.items())[:100]:
            if isinstance(info, dict):
                rows.append([
                    acc,
                    info.get("gene_name", ""),
                    (info.get("protein_name") or "")[:55],
                    "Yes" if info.get("reviewed") else "No",
                ])
        col_widths = [3 * cm, 2.5 * cm, 9.5 * cm, 1.5 * cm]
        t = Table(rows, colWidths=col_widths, repeatRows=1)
        t.setStyle(_default_table_style(colors))
        story.append(t)
        if len(uniprot_data) > 100:
            story.append(Paragraph(f"... and {len(uniprot_data) - 100} more proteins", caption_style))
    else:
        story.append(Paragraph(f"Proteins submitted: {', '.join(proteins[:30])}", body_style))

    # ── 2. Therapeutic Potential ──────────────────────────────────────────────
    therapeutic = module_data.get("therapeutic", {})
    if therapeutic:
        story.append(Paragraph("2. Therapeutic Potential", h1_style))
        story.append(Paragraph(
            f"<b>Top indication:</b> {therapeutic.get('top_indication', '—')} "
            f"(confidence: {therapeutic.get('overall_confidence', '—')})",
            body_style,
        ))
        story.append(Spacer(1, 0.3 * cm))
        indications = therapeutic.get("indications", [])[:12]
        if indications:
            rows = [["Indication", "Score", "Confidence", "Hit Count", "Supporting Proteins"]]
            for ind in indications:
                hits = ", ".join((ind.get("supporting_proteins") or [])[:6])
                if len(ind.get("supporting_proteins", [])) > 6:
                    hits += "…"
                rows.append([
                    ind.get("label", ""),
                    f"{ind.get('score', 0):.2f}",
                    ind.get("confidence", ""),
                    str(ind.get("positive_hit_count", 0)),
                    hits,
                ])
            col_widths = [4.5 * cm, 1.5 * cm, 2.5 * cm, 1.5 * cm, 7 * cm]
            t = Table(rows, colWidths=col_widths, repeatRows=1)
            t.setStyle(_default_table_style(colors))
            story.append(t)

    # ── 3. Pharmacokinetics ───────────────────────────────────────────────────
    pk = module_data.get("pk", {})
    if pk:
        story.append(Paragraph("3. Pharmacokinetics", h1_style))
        pk_summary = pk.get("pk_summary", {})
        story.append(Paragraph(
            f"<b>BBB-crossing proteins:</b> {pk_summary.get('bbb_crossing_count', '—')}  "
            f"<b>Mean MW:</b> {pk_summary.get('mean_molecular_weight_kda', 0):.1f} kDa",
            body_style,
        ))
        story.append(Spacer(1, 0.3 * cm))
        pk_proteins = pk.get("proteins", [])[:50]
        if pk_proteins:
            rows = [["Gene", "Half-life", "BBB Penetration", "Evidence", "MW (kDa)"]]
            for p in pk_proteins:
                rows.append([
                    p.get("gene_name", ""),
                    p.get("half_life_category", "—"),
                    p.get("bbb_penetration_class", "—"),
                    p.get("bbb_evidence_level", "—"),
                    f"{p.get('molecular_weight_kda', 0):.1f}" if p.get("molecular_weight_kda") else "—",
                ])
            col_widths = [2.5 * cm, 3.5 * cm, 4 * cm, 3 * cm, 2 * cm]
            t = Table(rows, colWidths=col_widths, repeatRows=1)
            t.setStyle(_default_table_style(colors))
            story.append(t)

    # ── 4. Concentration Analysis ─────────────────────────────────────────────
    conc = module_data.get("concentrations", {})
    if conc:
        story.append(Paragraph("4. Concentration Analysis", h1_style))
        summary = conc.get("summary", {})
        story.append(Paragraph(
            f"<b>Quantified proteins:</b> {conc.get('total_quantified', 0)}  "
            f"<b>Within therapeutic window:</b> {summary.get('within_therapeutic_window_count', 0)}  "
            f"<b>Supra-physiological:</b> {summary.get('supra_physiological_count', 0)}",
            body_style,
        ))
        assessment = conc.get("therapeutic_assessment", "")
        if assessment:
            story.append(Spacer(1, 0.2 * cm))
            story.append(Paragraph(assessment, body_style))
        profiles = conc.get("concentration_profiles", [])[:40]
        if profiles:
            story.append(Spacer(1, 0.3 * cm))
            rows = [["Gene", "Concentration (pg/mL)", "Status", "Fold over healthy", "Caution"]]
            for p in profiles:
                rows.append([
                    p.get("gene_name", ""),
                    f"{p.get('user_concentration_pg_ml', 0):.1f}",
                    p.get("status", "").replace("_", " ").title(),
                    f"{p.get('fold_over_healthy', 0):.2f}×" if p.get("fold_over_healthy") is not None else "—",
                    "⚠" if p.get("caution_flag") else "",
                ])
            col_widths = [2.5 * cm, 4 * cm, 4 * cm, 3.5 * cm, 1.5 * cm]
            t = Table(rows, colWidths=col_widths, repeatRows=1)
            t.setStyle(_default_table_style(colors))
            story.append(t)

    # ── 5. Reference Library Comparison ──────────────────────────────────────
    ref_lib = module_data.get("reference_library", {})
    if ref_lib:
        story.append(Paragraph("5. Reference Secretome Comparison", h1_style))
        story.append(Paragraph(ref_lib.get("summary_text", ""), body_style))
        story.append(Spacer(1, 0.3 * cm))
        comparisons = ref_lib.get("comparisons", [])[:12]
        if comparisons:
            rows = [["Reference Secretome", "Cell Type", "Similarity %", "Jaccard", "Shared", "F1"]]
            for c in comparisons:
                rows.append([
                    c.get("reference_name", "")[:35],
                    c.get("cell_type", "")[:20],
                    f"{c.get('similarity_pct', 0):.1f}%",
                    f"{c.get('jaccard', 0):.3f}",
                    str(c.get("shared_count", 0)),
                    f"{c.get('f1', 0):.3f}",
                ])
            col_widths = [5 * cm, 3.5 * cm, 2.5 * cm, 2 * cm, 1.5 * cm, 2 * cm]
            t = Table(rows, colWidths=col_widths, repeatRows=1)
            t.setStyle(_default_table_style(colors))
            story.append(t)

    # ── 6. LLM Scientific Interpretation ─────────────────────────────────────
    llm = module_data.get("llm_interpretation", {})
    if llm and llm.get("enabled") and llm.get("full_text"):
        story.append(PageBreak())
        story.append(Paragraph("6. AI Scientific Interpretation", h1_style))
        story.append(Paragraph(
            f"<i>Generated by {llm.get('model', 'Claude')} — review before publication</i>",
            caption_style,
        ))
        story.append(Spacer(1, 0.3 * cm))

        sections = [
            ("Executive Summary", llm.get("summary", "")),
            ("Mechanistic Insights", llm.get("mechanisms", "")),
            ("Clinical Relevance", llm.get("clinical_relevance", "")),
            ("Limitations & Caveats", llm.get("limitations", "")),
        ]
        for section_title, section_text in sections:
            if section_text:
                story.append(Paragraph(section_title, h2_style))
                story.append(Paragraph(section_text.replace("\n", "<br/>"), body_style))
                story.append(Spacer(1, 0.2 * cm))

    # ── Footer / Disclaimer ───────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Disclaimer", h1_style))
    story.append(Paragraph(
        "This report was generated by Secretome Profiler for research purposes only. "
        "All analyses are computational predictions based on curated databases and "
        "literature-derived gene sets. Results should be validated experimentally before "
        "clinical or therapeutic application. AI-generated interpretations (Section 6) "
        "are provided as a starting point for scientific discussion and must be reviewed "
        "by qualified researchers before use in publications.",
        body_style,
    ))

    doc.build(story)
    return buffer.getvalue()


def _default_table_style(colors: Any) -> TableStyle:
    from reportlab.platypus import TableStyle  # noqa: PLC0415
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ])
