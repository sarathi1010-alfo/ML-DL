# Low-Level Design — MediLingua

## Personalized Language Learning for Medical Professionals

Production-grade system design for a medical language learning platform integrating
seven AI capability levels: Machine Learning, Deep Learning, Natural Language
Processing, Small Language Models, Low-Level Design, Generative AI, and Agentic AI.

Companion documents: [API_CONTRACT.md](./API_CONTRACT.md),
[ARCHITECTURE.md](./ARCHITECTURE.md), [AI_SAFETY.md](./AI_SAFETY.md),
[DEPLOYMENT.md](./DEPLOYMENT.md).

---

## 1. Overview

### 1.1 Problem
Medical professionals need domain-specific language skills — medical terminology,
patient communication, clinical documentation — that general language platforms do
not address. MediLingua delivers a personalized learning experience that adapts to
each learner's specialty, CEFR proficiency level, and learning trajectory.

### 1.2 Goals
- Assess medical language proficiency across six CEFR levels (A1-C2).
- Track learning acquisition over time and predict mastery.
- Analyze clinical writing for grammar, medical entities, and readability.
- Generate adaptive learning content (scenarios, case studies, quizzes).
- Provide an autonomous AI tutor that designs personalized learning paths.
- Ensure every AI output is safe, explainable, and grounded in medical knowledge.

### 1.3 Stakeholders
| Role | Use |
|---|---|
| Medical Professional | Assess proficiency, practice communication, track progress |
| Medical Educator | Create content, monitor learner progress, review agent decisions |
| Administrator | Monitor system health, manage knowledge base, review safety logs |

---

## 2. High-Level Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram pack (10 Mermaid
diagrams). Summary:

```
Browser -> Caddy (:81) -> Next.js (:3000) -> FastAPI (:8000) -> LLM (:3003)
                           serves SPA         12 routers        z-ai SDK
                           /papi proxy        14 services        GLM-4-Plus
                                              ML models           SQLite
                                              Safety + Explain
```

### 2.1 Service Responsibilities

| Service | Port | Responsibility |
|---|---|---|
| Frontend (Next.js) | 3000 | Serves the pure HTML/CSS/JS SPA, proxies API requests to FastAPI |
| Backend (FastAPI) | 8000 | REST API, ML inference, safety screening, explainability, database |
| LLM Service (Bun) | 3003 | LLM completions for SLM, GenAI, Agent, RAG answer synthesis |
| Gateway (Caddy) | 81 | TLS termination, reverse proxy |

---

## 3. Backend Component Design

### 3.1 Layered Architecture

| Layer | Path | Responsibility |
|---|---|---|
| Routers | `app/routers/` | HTTP endpoints, request validation, response shaping |
| Services | `app/services/` | Business logic, model orchestration, LLM calls, safety screening |
| Schemas | `app/schemas/` | Pydantic request/response models |
| ORM Models | `app/models/` | SQLAlchemy table definitions |
| Core | `app/core/` | Security (JWT, bcrypt), exceptions, logging |
| Middleware | `app/middleware/` | Request logging, rate limiting |
| Config | `app/config.py` | Environment-driven settings |

### 3.2 Services

| Service | Algorithm | Endpoint |
|---|---|---|
| `proficiency_service` | RandomForest + XGBoost classifier | POST /assess/proficiency |
| `acquisition_service` | LightGBM + softmax attention | POST /track/acquisition |
| `nlp_service` | Rule-based grammar + dictionary NER + lexicon sentiment | POST /analyze/communication |
| `slm_service` | LLM (GLM-4-Plus) with RAG grounding | POST /slm/scenario, /slm/explain, /slm/converse |
| `genai_service` | LLM with structured medical prompts | POST /genai/case-study, /genai/quiz, /genai/simulation |
| `rag_service` | TF-IDF+SVD embeddings + FAISS IndexFlatIP | POST /rag/query, /rag/upload, GET /rag/documents |
| `agent_service` | Guided ReAct loop, 5 tools, LLM reasoning | POST /agent/tutor, GET /agent/logs |
| `safety_service` | Deterministic rule-based guard (40 toxicity + 13 diagnosis patterns) | POST /safety/screen, /safety/evaluate, GET /safety/stats |
| `explainability_service` | SHAP-style contributions + attention weights | POST /explain/proficiency, /explain/acquisition, /explain/recommendations |
| `auth_service` | JWT (HS256) + bcrypt | POST /auth/login, /auth/register, GET /auth/me |
| `metrics_service` | In-memory request/latency/error tracking | GET /health, /metrics, /metrics/models |

### 3.3 Model Registry

The model registry (`model_registry.py`) provides lazy singleton loading with
prediction caching:

- Models are created on first access and held as singletons.
- Core models (proficiency, acquisition, NLP) are warmed up at startup.
- Prediction cache: in-process LRU (256 entries) keyed by hashed input.
- GPU detection via FAISS (`faiss.get_num_gpus()`) when available.

---

## 4. Data Model

### 4.1 Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `users` | Authentication | id, username, email, hashed_password, role, specialty |
| `learning_sessions` | Audit log of every API call | user_id, type, input, output, latency_ms |
| `agent_logs` | Agent execution traces | learner_id, task, current_level, target_level, specialty, steps, final_answer |
| `model_metrics` | Per-model health | model, accuracy, f1, rmse, latency_ms, calls, error_rate |

See [ARCHITECTURE.md](./ARCHITECTURE.md) diagram 4 for the ER diagram.

---

## 5. API Contract

All endpoints are prefixed `/api/v1`. See [API_CONTRACT.md](./API_CONTRACT.md)
for the complete contract with request/response schemas and sample responses.

### 5.1 Endpoint Groups

- **Auth:** /auth/login, /auth/register, /auth/me
- **Assessment:** /assess/proficiency
- **Tracking:** /track/acquisition
- **Analysis:** /analyze/communication
- **SLM:** /slm/scenario, /slm/explain, /slm/converse
- **GenAI:** /genai/case-study, /genai/quiz, /genai/simulation
- **RAG:** /rag/query, /rag/upload, /rag/documents
- **Agent:** /agent/tutor, /agent/logs
- **Safety:** /safety/screen, /safety/evaluate, /safety/stats
- **Explainability:** /explain/proficiency, /explain/acquisition, /explain/recommendations
- **Monitoring:** /health, /metrics, /metrics/models, /predictions

### 5.2 Error Envelope

All errors return a uniform JSON structure:
```json
{"detail": "Human-readable message", "error_code": "VALIDATION_ERROR", "status_code": 422}
```

---

## 6. Sequence Diagrams

See [ARCHITECTURE.md](./ARCHITECTURE.md) for sequence diagrams covering:
- Prediction flow (assessment request)
- RAG query flow (retrieval + LLM synthesis)
- Agentic tutor flow (ReAct loop with 5 tools)
- Safety screening flow (toxicity + diagnosis + hallucination)

---

## 7. AI Safety Pipeline

Every LLM-generated output passes through a deterministic safety layer:

1. **Toxicity filter** (40 patterns, 13 categories) — blocks harmful content.
2. **Diagnosis restriction** (13 patterns) — blocks direct medical diagnoses.
3. **Hallucination confidence** (0-1 heuristic) — flags low-confidence claims.
4. **Disclaimer injection** — appends medical disclaimer to educational responses.

Verdicts: safe, warning, blocked. See [AI_SAFETY.md](./AI_SAFETY.md) for full documentation.

---

## 8. Non-Functional Requirements

| Requirement | Implementation | Target |
|---|---|---|
| Performance | LRU cache, lazy loading, singleton models | P50 < 50ms, P95 < 500ms |
| Scalability | Stateless workers, SQLite to Postgres swap | Horizontal scale behind LB |
| Availability | Health checks, per-model status | Graceful degradation |
| Security | JWT, bcrypt, CORS, rate limiting, input validation | OWASP-aligned |
| Observability | Structured logging, /metrics endpoint | Prometheus-ready |
| AI Safety | Toxicity filter, diagnosis restriction, hallucination scoring | 100% test pass rate |
| Explainability | SHAP contributions, attention weights, recommendation reasoning | Full transparency |
| Portability | Docker + docker-compose | One-command deploy |

---

## 9. Design Decisions

| Decision | Rationale | Trade-off |
|---|---|---|
| RandomForest + XGBoost for proficiency | Interpretable, handles non-linear patterns, fast inference | Less expressive than deep nets |
| LightGBM + attention for acquisition | Captures temporal dependencies, attention provides explainability | Proxy for full LSTM |
| Rule-based NLP (no BERT) | No torch dependency in sandbox, deterministic, fast | Less nuanced than transformer NLP |
| FAISS + TF-IDF+SVD for RAG | No sentence-transformers needed, fast, deterministic | Less semantic than MiniLM embeddings |
| Guided ReAct (vs free-form) | Guarantees all 5 tools run, deterministic | Less autonomous than free-form planning |
| Deterministic safety layer (no ML) | Fast (<5ms), auditable, no false negatives from model bias | May miss nuanced unsafe content |
