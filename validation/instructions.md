# How to Run the Validation

This document gives step-by-step instructions for executing the SecretomeProfiler validation protocol prior to scientific publication.

---

## Before You Start

- Ensure the app is running: open **http://localhost** and confirm the home page loads
- Have `validation/protein_lists.md` open in a second window
- Have `validation/results_template.csv` open in Excel or Google Sheets
- Allow ~15 minutes per analysis case (modules run in parallel; LLM interpretation takes 30–60 seconds at the end)

---

## Step 1 — Run Each Validation Case

Repeat for Cases 1, 2, 3, 4A (M2), 4B (M1), 5, 6, and 7:

1. Click **New Analysis** on the home page
2. Open `protein_lists.md`, find the case, copy the protein list from the code block
3. Paste into the protein input field in the app
4. Set the analysis label (e.g., `Validation_1_BM-MSC`)
5. Click **Run Analysis**
6. Wait for the **Module Progress** page to show all modules as Completed
   - Reference Library and LLM Interpretation run last — wait for these
   - LLM Interpretation typically takes 30–60 seconds after all other modules finish
7. Click **View Results**

---

## Step 2 — Record Results for Each Case

On the Results page, visit each tab and record the following in `results_template.csv`:

### Therapeutic tab
- Note the **top indication name** (highest bar)
- Note the **score** (number shown on bar, 0–100)
- Note the **second indication** name and score
- Note the **safety level** shown in the safety summary card

### Summary tab
- Note the **SASP fraction** (% shown in the SASP card)
- Confirm the **safety level** matches what you recorded above

### Reference Library tab
- Note the **top match name** (first card, labelled "Closest Match")
- Note the **Jaccard similarity** score
- Note whether any expected proteins appear in "Key proteins matched"

### Pharmacokinetics tab
- Note all proteins listed under **BBB-crossing proteins**
- For Cases 2 (NSC): confirm BDNF, NGF, and/or IGF1 appear

### SignalP tab (Case 7 only)
- Note the **classical SP percentage** from the summary stats

---

## Step 3 — M1 vs M2 Contrast (Case 4)

Run M2 (Case 4A) first, then M1 (Case 4B).

After both are complete:
1. Open the Therapeutic tab for each job
2. Find the **Anti-inflammatory** or **Immunomodulation** indication score
3. Record both scores in `results_template.csv` row `4_CONTRAST`
4. Calculate: M2 score − M1 score
5. **Must be ≥ 15 points** to pass this criterion

---

## Step 4 — Screenshot Key Results

For each case save screenshots of:

1. **Therapeutic tab** — the indication scores chart (for figures in the paper)
2. **Summary tab** — the overview cards (shows SASP, safety, protein counts)
3. **Reference Library tab** — the top match card

Suggested naming: `case1_msc_therapeutic.png`, `case1_msc_summary.png`, etc.

---

## Step 5 — Assess Pass/Fail

For each row in `results_template.csv`:

1. Compare **Actual_Value** against **Expected_Value**
2. Set **Pass_Fail** to `PASS` or `FAIL`
3. Add any observations in **Notes**

Apply the criteria from `protocol.md`:
- Positive cases (1–6): top indication must match published biology
- Negative control (Case 7): ALL scores must be < 20
- M1/M2 contrast: difference must be ≥ 15 points

---

## Step 6 — Calculate Overall Result

In the SUMMARY rows at the bottom of `results_template.csv`:
- Count passes for Cases 1–6 (need ≥ 5)
- Check Case 7 (required pass)
- Check M1/M2 contrast (required pass)
- Set overall validation status

---

## Step 7 — If Failures Detected

For each FAIL result:

1. **Check the protein list** — ensure it was pasted correctly with no truncation
2. **Check module completion** — confirm Reference Library and LLM Interpretation completed (not just "pending")
3. **Classify the failure** using `protocol.md` criteria:
   - Algorithm issue → fix and re-run
   - Data limitation → document as limitation
   - Expected discrepancy → add to Future Work

---

## Step 8 — Finalise Manuscript Section

Once all 7 cases are recorded and pass/fail is determined:

1. Open `validation/manuscript_section.md`
2. Replace every `[RESULT]` placeholder with the actual value from `results_template.csv`
3. Replace every `[X]` with the actual count
4. The completed section is ready to paste into the manuscript

---

## Estimated Time

| Task | Time |
|---|---|
| Cases 1, 2, 3 (each) | ~15 min |
| Cases 4A + 4B (M1/M2 pair) | ~30 min total |
| Cases 5, 6 (each) | ~15 min |
| Case 7 negative control | ~10 min |
| Recording results | ~30 min |
| Screenshots | ~20 min |
| **Total** | **~3 hours** |
