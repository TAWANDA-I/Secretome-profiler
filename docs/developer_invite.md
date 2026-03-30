# Developer Preview Access — SecretomeProfiler

You are invited to test SecretomeProfiler, an AI-powered bioinformatics platform for therapeutic secretome analysis built by Leverage Bio.

---

## Access details

**URL:** https://app.leverage.bio
**Invite code:** [SHARE PRIVATELY — do not include in this file]

---

## Setup (5 minutes)

1. Go to **https://app.leverage.bio**
2. Click **Create account**
3. Enter your email, a password, and the invite code
4. You will be taken to **Settings** automatically
5. Get a free Anthropic API key at **https://console.anthropic.com**
   — $5 of credits covers extensive testing
6. Paste your API key in Settings → **Save**

You are ready to run analyses.

---

## Running an analysis

1. Click **New Analysis** on the home page
2. Paste a list of human protein gene symbols or UniProt accession IDs (one per line or comma-separated)
3. Click **Analyze**
4. All 14 modules run automatically (~2–5 minutes for 100+ proteins)
5. Explore results across all tabs
6. Try the **AI Q&A assistant** (floating button, bottom right)
7. Download the **PDF report** from the Summary tab

---

## Test protein list

Copy and paste this to try the app immediately:

```
BDNF
NGF
GDNF
VEGFA
HGF
IGF1
FGF2
TGFB1
MMP2
TIMP1
CXCL12
ANGPT1
IL10
GDF15
POSTN
SPARC
SEMA3A
APOE
```

---

## What to test

| Area | What to check |
|---|---|
| Analysis pipeline | All 14 modules complete without error |
| Therapeutic tab | Indication scores are biologically plausible |
| STRING network | Interactive graph renders correctly |
| Reference Library tab | Shows comparison against 12 reference secretomes |
| AI Interpretation tab | Claude generates a coherent scientific report |
| Q&A assistant | Answers are grounded in the specific analysis results |
| PDF report | Downloads and renders correctly |
| Comparison mode | Two secretomes can be compared side-by-side |

---

## Feedback

Please report:
- Any errors or crashes (screenshot + protein list used)
- Biologically incorrect outputs
- UI issues or confusing flows
- Features you wish existed
- Performance issues (slow modules, timeouts)

**Email:** michal@leverage.bio
**GitHub:** https://github.com/TAWANDA-I/Secretome-profiler/issues

Thank you for testing SecretomeProfiler.
