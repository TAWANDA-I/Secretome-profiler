# AI Components — Technical Reference

Prepared for Hebrew University AI Developers Course 2025 final submission.

---

## Summary

SecretomeProfiler uses AI at three layers:

| Component | File | Type | Agentic? |
|---|---|---|---|
| Q&A Research Assistant | `conversation.py` | Multi-turn conversational agent | Yes |
| Scientific Report Generator | `llm_interpretation.py` | Single structured LLM call | No |
| Analysis Orchestrator | `tasks.py` | Workflow orchestrator | Partial |

---

## Component 1 — Q&A Research Agent

**File:** `backend/app/services/conversation.py`
**Model:** `claude-sonnet-4-5`
**Agentic:** Yes — multi-turn, grounded, context-aware

### Why it qualifies as an agent

1. **State maintenance** — Conversation history is preserved across turns (18-message sliding window); each response builds on prior exchanges.
2. **Structured data access** — Has access to all 14 module outputs for the specific job: UniProt annotations, STRING network hubs, pathway enrichment, therapeutic scores, safety flags, PK properties, concentrations, reference library comparisons.
3. **Context-aware question generation** — `generate_suggestions()` reads actual analysis findings and produces job-specific questions (not generic templates).
4. **Grounded reasoning** — System prompt explicitly constrains the agent to only discuss data present in the analysis results, preventing hallucination of proteins or scores that were not found.
5. **Multi-turn reasoning** — Follow-up questions naturally build on prior answers within the same conversation session.

### Context construction

`build_context(all_results)` in `conversation.py` compresses all 14 module outputs into a structured prompt context (~15,000–25,000 tokens):

```
SECRETOME SUMMARY
Total proteins: N | Confirmed secreted: N
Key proteins: BDNF, VEGFA, HGF, ...

THERAPEUTIC POTENTIAL
Top indication: Neuroregeneration (confidence: High)
Indication scores: Neuroregeneration (3.0/4, 4 hits); ...

PHARMACOKINETICS
BBB-crossing proteins: 3 (BDNF, NGF, IGF1)
Very short half-life (<1h): BDNF (0.5h), NGF (0.3h)

SAFETY PROFILE
Overall risk: Low | Cytokine storm risk: None flagged

REFERENCE SECRETOME COMPARISON
Neural Stem Cell: Jaccard 0.32, F1 0.41
BM-MSC: Jaccard 0.18, F1 0.26
...
```

### Suggested questions generation

`generate_suggestions(all_results)` derives questions from real findings — not from a fixed template:

| Finding | Generated question example |
|---|---|
| BDNF + NGF present | "Which proteins in this secretome can cross the blood-brain barrier, and by what mechanisms?" |
| SASP fraction > 3% | "What fraction of proteins are SASP-associated, and what are the safety implications?" |
| Top reference match found | "How does this secretome compare to the Bone Marrow MSC reference? What key factors are shared?" |
| Short half-life proteins present | "Which proteins have very short plasma half-lives that would limit therapeutic durability?" |
| High therapeutic score | "What proteins are driving the neuroregeneration indication score?" |

### System prompt principles

```
Role: Expert biomedical scientist specialising in secretome biology,
      cell therapy, and protein therapeutics

Constraints:
  - Only discuss data present in SECRETOME ANALYSIS DATA section
  - Do not add general knowledge not supported by the results
  - Use "suggests" for computational predictions vs "is known to" for established biology

Format rules:
  - Name proteins as GENE_SYMBOL (Full Name) on first mention
  - 150–400 words per response
  - Use numbered lists for multi-part answers
```

### Token budget

| Turn | Approximate input tokens | Output tokens |
|---|---|---|
| First turn (full context) | 15,000–25,000 | 200–800 |
| Subsequent turns (+ history) | 17,000–30,000 | 200–800 |

---

## Component 2 — Scientific Report Generator

**File:** `backend/app/services/llm_interpretation.py`
**Model:** `claude-sonnet-4-5` (configurable via `LLM_MODEL` env var)
**Agentic:** No — single structured LLM call (pipeline step)

### What it generates

A 10-section scientific report produced in a single prompt–response cycle:

1. Executive Summary
2. Secretome Composition Analysis
3. Protein Interaction Network Analysis
4. Functional Enrichment Themes
5. Therapeutic Indication Assessment
6. Primary Target Cell Populations
7. Safety Profile Interpretation
8. Pharmacokinetic Analysis
9. Key Limitations
10. Recommended Next Steps

### Why it is NOT classified as an agent

- Single prompt → single response, no iteration
- No decision loop, no tool use, no branching
- Deterministic trigger: runs once per job after all 13 other modules complete
- No state is maintained; the report is generated fresh each time from the same fixed context

This is intentional. A well-engineered single-shot structured prompt produces equivalent quality to a multi-agent pipeline for structured scientific reporting, at significantly lower latency (~40–80s vs ~3–5min) and cost.

### Prompt engineering decisions

| Decision | Implementation | Rationale |
|---|---|---|
| Section headers | `"Use ## for section headers"` | Enables reliable section parsing by splitting on `##` markers |
| Gene symbol format | `"Name proteins as GENE (Full Name) on first mention"` | Frontend regex highlights gene symbols correctly |
| Hedging language | `"Use 'suggests' for predictions, 'is known to' for established biology"` | Prevents overconfident claims in scientific context |
| Length control | `max_tokens=2000–3500` | Constrains cost; sufficient for all 10 sections |
| Disclaimer injection | Added programmatically after generation | Ensures AI-generated caveat is always present regardless of model output |

### Context fed to the report generator

`build_analysis_context()` in `llm_interpretation.py` assembles a compressed (~2,000–8,000 token) context including:
- Protein count and confirmed secreted fraction
- Top 5 therapeutic indications with scores and driver proteins
- BBB-crossing proteins with mechanisms
- Safety risk level and flagged dimensions
- Top 10 enriched pathways
- Reference secretome top match

---

## Component 3 — Celery Orchestration Layer

**File:** `backend/app/workers/tasks.py`
**Type:** Workflow orchestrator
**Agentic:** Partial

### Agent-like behaviors

| Behavior | Implementation |
|---|---|
| Autonomous failure isolation | `try/except` per module; one module failing does not halt others |
| Result routing | Passes `uniprot_data` dict to all dependent modules automatically |
| Conditional triggering | LLM interpretation only runs after all 13 other modules complete |
| Real-time progress reporting | Pushes `{module: {status, percent}}` to PostgreSQL JSONB; WebSocket streams to browser |
| Phase-aware scheduling | Modules run in dependency order without explicit DAG definition |

### Pipeline phases

```
Phase 0  Protein normalisation (alias resolution → UniProt accessions)
Phase 1  UniProt annotations — blocking; all downstream modules depend on output
Phase 2  6 modules in parallel: STRING, g:Profiler, HPA, SignalP, SASP, PK
Phase 3  4 modules sequential: Therapeutic, Receptor-Ligand, Safety, Disease Context
Phase 4  Reference Library comparison (uses UniProt gene symbols)
Phase 5  LLM Interpretation — final; aggregates all prior module outputs
```

### Why not fully agentic

The orchestrator does not make dynamic decisions about which modules to run based on intermediate results. The phase structure is fixed. A fully agentic orchestrator would, for example, skip LLM interpretation if no therapeutic targets are found, or run additional modules based on safety flags. This is planned for v2.

---

## Design Decisions

### Why not RAG?

The Q&A agent does not use vector retrieval. The entire relevant context — one job's 14 module outputs — fits comfortably in a single context window (~25,000 tokens, well within the 200,000-token limit of Claude). RAG would add:
- Embedding generation latency (~200ms)
- Chunking complexity for structured JSON
- Retrieval noise (wrong chunks selected)

With no benefit when all data is bounded, structured, and available. This is a deliberate simplicity choice justified by the bounded domain.

### Why not a multi-agent report pipeline?

A critique-agent architecture was considered (generator → scientific critic → synthesizer). Rejected for v1:
- 3× latency increase (120–240s vs 40–80s)
- 3× cost increase
- Marginal quality gain for structured scientific output with explicit format constraints
- Adds complexity without measurable user benefit

Planned for v2: a safety-critic agent that adversarially checks biological claims in the generated report against the raw module data before delivering the final output.

### Why Claude over other models?

Three evaluation criteria for this specific use case:
1. **Long-context instruction following** at 15,000–25,000 token inputs with structured JSON/text data — critical for Q&A grounding
2. **Scientific reasoning quality** for grounded biological interpretation — evaluated superior for domain-specific protein biology
3. **Format compliance** — consistent `## Header` and `GENE (Full Name)` adherence across hundreds of test outputs

### Per-user API key architecture

Rather than a single server-level Anthropic API key, each registered user supplies their own key:

```
User registers → saves key via POST /api/auth/api-key
  → AES-256 (Fernet) encrypted → stored in PostgreSQL users table

User submits job → key decrypted in memory
  → stored in Redis: key=f"job_api_key:{job_id}", TTL=7200s

Celery worker starts LLM task
  → retrieves key from Redis
  → creates Anthropic client with user's key
  → key exists in memory only during active LLM call
  → never written to logs, never persisted post-job
```

This architecture:
- Eliminates shared API cost problem (each user pays for their own usage)
- Enables per-user usage tracking at Anthropic's platform level
- Reduces server operator liability (no pooled key to protect)
- Keys are encrypted at rest with AES-256 derived from `SECRET_KEY`

See `backend/app/services/auth.py` for implementation.

---

## Testing AI Components

### Q&A agent test

```bash
# Get suggestions for a completed job
curl http://localhost/api/v1/conversations/{job_id}/suggestions

# Send a message
curl -X POST http://localhost/api/v1/conversations/{job_id} \
  -H "Content-Type: application/json" \
  -d '{"message": "Which proteins drive the therapeutic score?", "history": []}'
```

### Report generator test

The report is generated automatically as Phase 5 of every new analysis job. Check `llm_interpretation` module in the job progress, then view the AI Interpretation tab in Results.

### Graceful degradation test

```bash
# Disable LLM in .env
LLM_ENABLED=false

# Restart backend and worker
docker compose restart backend worker

# Submit a job — all 13 non-LLM modules should complete normally
# AI Interpretation tab shows configuration notice
# Q&A chat shows "LLM not enabled" message
```
