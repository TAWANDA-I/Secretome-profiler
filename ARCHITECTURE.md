# Secretome Profiler — Architecture & Developer Guide

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Request Lifecycle](#2-request-lifecycle)
3. [Analysis Pipeline](#3-analysis-pipeline)
4. [Service Catalogue](#4-service-catalogue)
5. [Data Layer](#5-data-layer)
6. [API Reference](#6-api-reference)
7. [Frontend Architecture](#7-frontend-architecture)
8. [AI & LLM Integration](#8-ai--llm-integration)
9. [Reference Data](#9-reference-data)
10. [Adding a New Module](#10-adding-a-new-module)
11. [Database Schema](#11-database-schema)
12. [Configuration Reference](#12-configuration-reference)

---

## 1. System Overview

Secretome Profiler is a seven-service Docker Compose application. The frontend never communicates directly with the database — all persistence goes through the FastAPI backend.

```
Browser
  │
  └─ nginx:80
       ├─ /api/*  ──────────► backend:8000 (FastAPI / uvicorn)
       │                           │
       │                           ├── PostgreSQL  (job + result metadata)
       │                           ├── MinIO       (module output JSON)
       │                           ├── Redis       (Celery broker/results)
       │                           └── Anthropic   (LLM API)
       │
       ├─ /ws/*   ──────────► backend:8000 (WebSocket — real-time progress)
       │
       └─ /*      ──────────► frontend:3000 (React + Vite dev server)
                                   │
                     Celery worker ◄── Redis ◄── backend task dispatch
                           │
                           └── MinIO (uploads module results)
                           └── PostgreSQL (updates progress/status)
```

### Service Summary

| Service | Image | Role |
|---|---|---|
| `postgres` | postgres:15-alpine | Relational store for job metadata and result records |
| `redis` | redis:7-alpine | Celery message broker and result backend |
| `minio` | minio/minio:latest | S3-compatible object store for large module outputs |
| `backend` | custom Python 3.11 | FastAPI REST API + WebSocket endpoints |
| `worker` | same as backend | Celery worker executing analysis tasks |
| `frontend` | custom Node 20 | React application (Vite dev server) |
| `nginx` | nginx:alpine | Reverse proxy, routes traffic to backend/frontend |

---

## 2. Request Lifecycle

### Job submission

```
POST /api/v1/jobs/
  │
  ├─ Validate JobCreate schema (Pydantic)
  ├─ Insert Job row (status=pending) → PostgreSQL
  ├─ Dispatch Celery task: run_analysis_pipeline.delay(job_id)
  │    └─ Returns immediately — task runs asynchronously
  └─ Return 201 with JobRead (id, status=pending, ...)
```

### Real-time progress

```
GET /api/v1/ws/jobs/{job_id}    (WebSocket)
  │
  └─ Polls PostgreSQL job.progress JSONB every 1 second
       └─ Pushes {module: {status, percent}} JSON to client
```

The `progress` column is updated atomically using a PostgreSQL JSONB merge:

```sql
UPDATE jobs
SET progress = COALESCE(progress::jsonb, '{}') || (:patch)::jsonb
WHERE id = :job_id
```

This avoids read-modify-write races across concurrent module tasks.

### Result retrieval

```
GET /api/v1/results/job/{job_id}
  └─ Returns list of Result rows (module_name, minio_key, summary)

GET /api/v1/results/job/{job_id}/{module_name}/data
  └─ Downloads full JSON payload from MinIO → streams to client
```

---

## 3. Analysis Pipeline

### Single-job pipeline phases

```
Phase 0: Protein normalisation
  └─ Resolve aliases, synonyms → canonical UniProt accessions

Phase 1 (sequential): UniProt annotations
  └─ Fetches protein metadata used by all downstream modules

Phase 1 (parallel):
  ├─ STRING   — protein interaction network
  ├─ g:Profiler — pathway enrichment
  ├─ HPA      — tissue expression
  ├─ SignalP  — secretion signal classification
  └─ SASP     — senescence gene annotation

Phase 2a: Pharmacokinetics (PK)
  └─ Depends on UniProt only; runs before therapeutic scoring

Phase 2b (parallel):
  ├─ Therapeutic   — indication scoring (uses UniProt + PK)
  ├─ Receptor-Ligand — ligand-receptor matching
  ├─ Safety       — safety flag profiling
  └─ Disease Context — disease-protein associations

Phase 3: Concentrations (optional)
  └─ Only runs if protein_concentrations provided in job

Phase 4: Reference Library
  └─ Jaccard/F1 comparison against 12 curated secretomes

Phase 5: LLM Interpretation
  └─ Aggregates all prior results → Claude API → scientific report
```

### Comparison pipeline

Two protein sets (A and B) are processed in parallel through Phases 1–2b, then a Differential module computes:
- Jaccard overlap between sets
- Per-set pathway enrichment comparison
- Per-set therapeutic and safety differences

Module names are suffixed: `uniprot_A`, `uniprot_B`, `gprofiler_A`, etc.

### Module progress states

Each module transitions: `pending → running → completed | failed`

Progress is keyed per module in `job.progress`:
```json
{
  "uniprot": {"status": "completed", "percent": 100, "message": ""},
  "string":  {"status": "running",   "percent": 0,   "message": ""},
  "gprofiler":{"status": "pending",  "percent": 0,   "message": ""}
}
```

---

## 4. Service Catalogue

### External data services

| Service | Source | Key function |
|---|---|---|
| `uniprot.py` | UniProt REST API | `fetch_annotations(proteins)` → `{accession: {...}}` |
| `string_db.py` | STRING API v12 | `fetch_interactions(proteins)` → `{interactions, proteins}` |
| `gprofiler.py` | g:Profiler REST | `run_enrichment(proteins)` → `{results: [...terms]}` |
| `hpa.py` | HPA XML/API | `fetch_concentrations(proteins, gene_names, uniprot)` |
| `signalp.py` | UniProt feature data | `classify_signal_peptides(proteins, uniprot)` |
| `pharos.py` | PHAROS GraphQL | `fetch_target_info(proteins)` |
| `sasp.py` | Curated SASP list | `flag_sasp(proteins, uniprot)` → `{sasp_proteins, sasp_count}` |

### Analysis engines

| Service | Depends on | Key output |
|---|---|---|
| `therapeutic.py` | UniProt, PK | `indications[]`, `top_indication`, `overall_confidence` |
| `receptor_ligand.py` | CellChat DB, UniProt | `pairs_matched`, `target_cell_types` |
| `safety.py` | UniProt | `dimensions[]`, `overall_safety_score`, `risk_level` |
| `disease_context.py` | OpenTargets API | `ranked_diseases[]`, `top_disease` |
| `pk_analysis.py` | Protein PK DB | `proteins[]` with BBB/half-life/MW per protein |
| `concentration_analysis.py` | Plasma reference DB | `concentration_profiles[]`, `summary` |
| `reference_library.py` | Reference secretomes JSON | `comparisons[]`, `top_match`, `similarity_pct` |
| `differential.py` | Two uniprot/gprofiler/therapeutic sets | Overlap stats, pathway volcano |

### Auxiliary services

| Service | Purpose |
|---|---|
| `minio_client.py` | Upload/download JSON, presigned URLs |
| `conversation.py` | Build context, generate Q&A suggestions, call Claude API |
| `llm_interpretation.py` | Build analysis context, call Claude for 4-section report |
| `report_generator.py` | Generate multi-section PDF with reportlab |
| `methods_report.py` | Generate publication-ready methods text + BibTeX |

---

## 5. Data Layer

### PostgreSQL tables

**`jobs`**

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | auto-generated |
| status | enum | pending / running / completed / failed |
| job_type | varchar | single / comparison |
| proteins | JSONB | list of accession IDs |
| modules | JSONB | list of module names to run |
| progress | JSONB | {module: {status, percent, message}} |
| error_message | text | nullable |
| label | varchar | user-supplied name |
| proteins_a / proteins_b | JSONB | comparison mode sets |
| set_a_label / set_b_label | varchar | comparison set names |
| protein_concentrations | JSONB | {gene_name: pg_mL} |
| created_at / updated_at | timestamp | auto-managed |

**`results`**

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | auto-generated |
| job_id | UUID (FK) | cascade delete |
| module_name | varchar | indexed |
| minio_key | varchar | nullable — path in MinIO |
| summary | JSONB | small stats dict for quick display |
| created_at | timestamp | auto-managed |

### MinIO storage layout

```
secretome-results/
  └─ jobs/
       └─ {job_id}/
            ├─ uniprot.json
            ├─ signalp.json
            ├─ sasp.json
            ├─ string.json
            ├─ gprofiler.json
            ├─ hpa.json
            ├─ pk.json
            ├─ therapeutic.json
            ├─ receptor_ligand.json
            ├─ safety.json
            ├─ disease_context.json
            ├─ concentrations.json       (optional)
            ├─ reference_library.json
            └─ llm_interpretation.json
```

Each file is a raw JSON object; typical sizes range from 5 KB (SASP) to 500 KB (STRING network).

### Static reference datasets

| File | Size | Contents |
|---|---|---|
| `data/reference_secretomes.json` | 13 KB | 12 curated secretomes with gene lists and metadata |
| `data/plasma_reference_concentrations.json` | 41 KB | Normal plasma pg/mL ranges per protein |
| `data/protein_pk_properties.json` | 32 KB | BBB penetration, half-life, MW per gene |
| `data/cellchat_lr_pairs.json` | 71 KB | Ligand-receptor pairs from CellChat DB |

---

## 6. API Reference

Base URL: `http://localhost/api/v1`
Interactive docs: `http://localhost/api/v1/docs`

### Jobs

| Method | Path | Description |
|---|---|---|
| POST | `/jobs/` | Create single or comparison job |
| GET | `/jobs/` | List jobs (paginated: skip, limit) |
| GET | `/jobs/{job_id}` | Get job details + progress |
| DELETE | `/jobs/{job_id}` | Delete job and all stored data |

**POST /jobs/ body (single mode)**
```json
{
  "job_type": "single",
  "proteins": ["P01375", "P05107"],
  "modules": ["uniprot", "string", "gprofiler", "..."],
  "label": "My MSC secretome",
  "protein_concentrations": {"BDNF": 1250.5, "VEGFA": 340.0}
}
```

**POST /jobs/ body (comparison mode)**
```json
{
  "job_type": "comparison",
  "set_a_proteins": ["P01375", "P05107"],
  "set_a_label": "Normoxia",
  "set_b_proteins": ["P01375", "P60709"],
  "set_b_label": "Hypoxia"
}
```

### Results

| Method | Path | Description |
|---|---|---|
| GET | `/results/job/{job_id}` | List all result records for a job |
| GET | `/results/job/{job_id}/{module}/data` | Full module JSON from MinIO |
| GET | `/results/job/{job_id}/report.pdf` | Download PDF report |
| GET | `/results/job/{job_id}/methods_report` | Methods section + BibTeX |
| GET | `/results/{result_id}` | Single result record |
| GET | `/results/{result_id}/download` | Presigned MinIO download URL |

### Conversations (Q&A)

| Method | Path | Description |
|---|---|---|
| POST | `/conversations/{job_id}` | Send message; returns Claude response |
| GET | `/conversations/{job_id}/suggestions` | Get context-specific suggested questions |

**POST /conversations/{job_id} body**
```json
{
  "message": "Which proteins drive the neuroregeneration score?",
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

### WebSocket

| Path | Description |
|---|---|
| `ws://localhost/ws/jobs/{job_id}` | Real-time module progress stream |

Messages are JSON: `{"module": "uniprot", "status": "completed", "percent": 100}`

---

## 7. Frontend Architecture

### Page routing (React Router v6)

| Route | Component | Description |
|---|---|---|
| `/` | `Home.tsx` | Job submission form |
| `/jobs` | `Jobs.tsx` | Job history |
| `/jobs/:jobId` | `JobStatus.tsx` | Real-time progress |
| `/results/:jobId` | `Results.tsx` | Tabbed results dashboard |
| `/comparison/:jobId` | `ComparisonResults.tsx` | Comparison results |

### Results page tab system

Tabs are generated dynamically from completed module results:

```typescript
const PHASE2_MODULES = new Set(["therapeutic", "receptor_ligand", "safety", "disease_context"]);
const PHASE3_MODULES = new Set(["pk", "concentrations", "reference_library", "llm_interpretation"]);

// Phase 2 modules are grouped into a single "Therapeutic" composite tab
const hasPhase2 = results.some(r => PHASE2_MODULES.has(r.module_name));

// Phase 3 modules each get their own tab, only if the result exists
const hasPK = results.some(r => r.module_name === "pk");
const hasReferenceLibrary = results.some(r => r.module_name === "reference_library");
// etc.
```

A tab only appears if the corresponding Result record exists in the database. This means a job must have run the module for its tab to appear.

### State management

- **TanStack Query** — server state (jobs, results fetching, caching, polling)
- **Zustand** — client state (job list, active job)
- **useState / useEffect** — component-local state (active tab, modals)

### API layer pattern

```typescript
// src/api/results.ts
const resultsApi = {
  forJob: (jobId: string) =>
    api.get<Result[]>(`/results/job/${jobId}`).then(r => r.data),

  getModuleData: (jobId: string, moduleName: string) =>
    api.get(`/results/job/${jobId}/${moduleName}/data`).then(r => r.data),
};
```

All API calls go through the Axios instance in `src/api/index.ts` which:
- Sets `baseURL: /api/v1`
- Sets `timeout: 30000`
- Extracts `error.response.data.detail` from FastAPI error responses

---

## 8. AI & LLM Integration

### Claude API usage

Three distinct use cases, all using the same Anthropic SDK client:

| Feature | Function | Model | Max tokens | Trigger |
|---|---|---|---|---|
| Scientific interpretation | `generate_interpretation()` | `LLM_MODEL` (configurable) | 2000 | Pipeline Phase 5 |
| Q&A chat | `chat_with_results()` | `LLM_MODEL` | 1200 | User message |
| Suggestions | `generate_suggestions()` | — (rule-based) | — | Chat panel open |

### Interpretation context

`build_analysis_context()` in `llm_interpretation.py` assembles a compressed summary:

```
SECRETOME SUMMARY
Total proteins: 15
Confirmed secreted proteins: 13
Key proteins: BDNF, VEGFA, HGF, ...

THERAPEUTIC POTENTIAL
Top indication: Neuroregeneration (confidence: High)
Top 5 indications: Neuroregeneration (score 3.0, 4 hits); ...

PHARMACOKINETICS
BBB-crossing proteins: 3
...

CONCENTRATION ANALYSIS
...

REFERENCE SECRETOME COMPARISON
  Cardiac Progenitor: 40% similarity (Jaccard 0.25, F1 0.40)
  ...
```

### Q&A context

`build_context()` in `conversation.py` assembles a longer (~25k token budget) context from all module outputs, with per-section headers. The same context is used for every turn in the conversation — it is not stored server-side.

### Graceful degradation

When `LLM_ENABLED=false` or `ANTHROPIC_API_KEY` is empty:
- `generate_interpretation()` returns `{"enabled": false, ...}` — the AI Interpretation tab shows a configuration notice
- `chat_with_results()` returns an error message — the chat panel shows the message
- All other modules run normally

### Token budgeting

| Use case | Typical input tokens | Typical output tokens |
|---|---|---|
| Interpretation (15 proteins) | 600–900 | 800–1200 |
| Q&A chat turn | 1500–4000 | 200–600 |

---

## 9. Reference Data

### Reference secretomes (`data/reference_secretomes.json`)

Schema per entry:
```json
{
  "id": "msc_bone_marrow",
  "name": "Bone Marrow MSC Secretome",
  "cell_type": "Mesenchymal Stem Cell",
  "source_tissue": "Bone Marrow",
  "species": "Human",
  "condition": "Normoxia, serum-free 48h",
  "n_proteins": 61,
  "top_functions": ["Tissue repair", "Immunomodulation", "Angiogenesis"],
  "pmids": ["36889742"],
  "proteins": ["FN1", "VIM", "TGFB1", ...]
}
```

Proteins are stored as HGNC gene symbols (uppercase). The comparison service resolves user input (UniProt accessions or gene names) to gene symbols using the UniProt annotation data before computing set metrics.

### Similarity metrics

For query gene set Q and reference gene set R:

```
shared = Q ∩ R
union  = Q ∪ R

jaccard   = |shared| / |union|
precision = |shared| / |Q|
recall    = |shared| / |R|
f1        = 2 × precision × recall / (precision + recall)

similarity_pct = f1 × 100
```

### Plasma concentrations (`data/plasma_reference_concentrations.json`)

Schema:
```json
{
  "BDNF": {
    "healthy_plasma_median_pg_ml": 8500,
    "healthy_plasma_low_pg_ml": 3000,
    "healthy_plasma_high_pg_ml": 25000,
    "source": "Multiplex immunoassay meta-analysis"
  }
}
```

Classification thresholds:
- `within_physiological`: fold_over_healthy ≤ 2×
- `elevated`: 2–10×
- `supra_physiological`: > 10×

### PK properties (`data/protein_pk_properties.json`)

Schema:
```json
{
  "BDNF": {
    "plasma_half_life_hours": 0.5,
    "half_life_category": "Very short (<1h)",
    "molecular_weight_kda": 27.8,
    "bbb_penetration_class": "Established BBB crossing",
    "bbb_mechanism": "TrkB receptor-mediated transcytosis",
    "bbb_evidence_level": "High"
  }
}
```

---

## 10. Adding a New Module

### Backend steps

**1. Create the service** (`backend/app/services/my_module.py`):

```python
from typing import Any

def run_my_module(proteins: list[str], uniprot_data: dict[str, Any]) -> dict[str, Any]:
    """Returns serialisable dict — will be stored in MinIO as JSON."""
    ...
    return {"result_key": ..., "summary_stat": ...}
```

**2. Add to `ALL_MODULES`** (`backend/app/schemas/job.py`):

```python
ALL_MODULES: list[str] = [
    ...,
    "my_module",   # add here
]
```

**3. Add task runner** (`backend/app/workers/tasks.py`):

```python
from app.services.my_module import run_my_module

async def _run_my_module(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "my_module", "running", 0)
    try:
        data = run_my_module(proteins, uniprot_data)
        await _save_result(job_id, "my_module", data, {"summary_stat": data["summary_stat"]})
        await _set_module_progress(job_id, "my_module", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "my_module", "failed", 0, str(e))
```

**4. Call from pipeline** in `_execute_pipeline()`:

```python
if "my_module" in modules:
    parallel.append(_run_my_module(job_id, proteins, uniprot_data))
```

### Frontend steps

**5. Create the tab component** (`frontend/src/components/results/MyModuleTab.tsx`):

```typescript
interface MyModuleData { result_key: string; summary_stat: number; }
interface Props { data: MyModuleData; }

export default function MyModuleTab({ data }: Props) {
  return <div>...</div>;
}
```

**6. Register in Results.tsx**:

```typescript
// Add import
import MyModuleTab from "@/components/results/MyModuleTab";

// Add to TAB_LABELS
my_module: "My Module",

// Add detection
const hasMyModule = results.some(r => r.module_name === "my_module");

// Add to tabs array
...(hasMyModule ? ["my_module"] : []),

// Add to render
) : activeTab === "my_module" ? (
  <MyModuleTabLoader jobId={jobId!} />
```

**7. Add loader** (below in Results.tsx):

```typescript
function MyModuleTabLoader({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["module_data", jobId, "my_module"],
    queryFn: () => resultsApi.getModuleData(jobId, "my_module"),
  });
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!data) return <div className="text-center py-8 text-gray-400 text-sm">No data.</div>;
  return <MyModuleTab data={data as Parameters<typeof MyModuleTab>[0]["data"]} />;
}
```

**8. Rebuild frontend:**
```bash
docker compose up --build frontend -d
```

---

## 11. Database Schema

### Migrations

Located in `backend/alembic/versions/`:

| Migration | Description |
|---|---|
| `0001_create_jobs_and_results.py` | Initial `jobs` and `results` tables |
| `0002_add_comparison_fields.py` | `proteins_a/b`, `set_a/b_label`, `job_type` columns |
| `0003_add_protein_concentrations.py` | `protein_concentrations` JSONB column |

### Running migrations

```bash
# Apply all pending migrations
docker compose exec backend alembic upgrade head

# Create a new migration
docker compose exec backend alembic revision --autogenerate -m "add_my_column"

# Check current version
docker compose exec backend alembic current
```

---

## 12. Configuration Reference

All settings are in `backend/app/config.py` as a `pydantic_settings.BaseSettings` subclass. Values are loaded from environment variables (case-insensitive) or `backend/.env`.

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_root_user: str = "minioadmin"
    minio_root_password: str = "minioadmin123"
    minio_bucket: str = "secretome-results"
    minio_secure: bool = False

    # App
    secret_key: str
    debug: bool = False
    allowed_origins: str = "http://localhost:80"

    # External APIs
    http_timeout: int = 30
    http_max_retries: int = 3
    opentargets_api_url: str
    disgenet_api_url: str

    # LLM
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-5"
    llm_enabled: bool = False
```

The `@lru_cache` decorator on `get_settings()` means settings are read once per process. To apply `.env` changes, restart the affected container:

```bash
docker compose restart backend worker
```
