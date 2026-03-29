# SecretomeProfiler Validation Protocol
# Version 1.0

---

## Purpose

This protocol defines the procedure for validating SecretomeProfiler outputs against published biological evidence prior to scientific publication in Bioinformatics or Briefings in Bioinformatics.

---

## Validation Cases

| Case | Cell/Secretome Type | Key Biological Expectation |
|---|---|---|
| 1 | Bone Marrow MSC | Immunomodulation + Tissue repair as top indications |
| 2 | Neural Stem Cell | Neuroregeneration as top indication; BBB-crossing proteins identified |
| 3 | Cardiac Progenitor (hypoxia) | Cardioprotection + Angiogenesis as top indications |
| 4A | M2 Macrophage | Anti-inflammatory score > 65; SASP < 5% |
| 4B | M1 Macrophage (contrast) | Anti-inflammatory score < M2 by > 15 points; SASP > 10% |
| 5 | Platelet-Rich Plasma | Wound healing as top indication; coagulation flag present |
| 6 | Young Plasma | Anti-senescence as top indication; GDF11 identified as driver |
| 7 | Negative control (nuclear proteins) | All scores < 20; SignalP < 5% classical SP |

---

## Pass/Fail Criteria

### Per-case criteria

Outputs are considered **PASS** if ALL of the following are met:

1. **Top indication match** — The highest-scoring therapeutic indication matches the published biological context of that cell/secretome type
2. **SASP fraction** — Within the expected range stated for that case in `protein_lists.md`
3. **Safety level** — Matches the expected level (Low / Moderate / High) for that case
4. **Reference library** — Top matching reference secretome is biologically appropriate (e.g., BM-MSC secretome matches BM-MSC reference)
5. **Hub proteins** — At least 3 of 5 expected key proteins appear in top STRING hub proteins OR top therapeutic drivers

Outputs are considered **FAIL** if ANY of the following occur:

- Top indication is biologically incorrect (e.g., Neuroregeneration scores #1 for PRP)
- SASP fraction is > 3× the expected value
- Safety level is higher than expected without clear biological justification
- Negative control (Case 7) scores > 25 for any indication

### M1 vs M2 specificity criterion

M2 anti-inflammatory score **minus** M1 anti-inflammatory score must be **≥ 15 points**.

If the difference is < 15 points, the scoring algorithm cannot distinguish anti-inflammatory from pro-inflammatory secretomes — this is a critical failure requiring algorithm review before publication.

---

## Overall Pass Criteria

The tool is considered **validated for publication** if:

- Cases 1–6: at least **5 of 6** PASS
- Case 7 (negative control): **PASS required** (no exceptions)
- M1/M2 contrast: M2 must score ≥ 15 points higher for anti-inflammatory

---

## Recording Template

For each validation case, record results in the following format:

| Module | Expected | Actual | Pass/Fail | Notes |
|---|---|---|---|---|
| Top indication | Immunomodulation | | | |
| Top indication score | > 60 | | | |
| Safety level | Low | | | |
| SASP fraction | < 5% | | | |
| Reference top match | BM-MSC reference | | | |
| Reference Jaccard | > 0.25 | | | |

(Full recording template in `results_template.csv`)

---

## Failure Response Protocol

If a validation case fails:

1. **Document** the failure with exact values (actual vs expected)
2. **Classify** the failure:
   - **Algorithm issue** — scoring weights, gene set coverage, or logic error → requires code fix before publication
   - **Data limitation** — reference protein list does not cover the relevant biology → acknowledge as limitation in paper
   - **Expected discrepancy** — biological nuance not captured by the current module → add to Future Work section
3. **Fix or acknowledge** — either correct the algorithm and re-run, OR document as a known limitation
4. **Re-run after fix** — if algorithm changed, re-run all 7 cases to confirm no regressions

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-03-29 | Initial protocol |
