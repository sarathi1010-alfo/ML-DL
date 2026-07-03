# MediLingua

## Personalized Language Learning for Medical Professionals

A production-grade AI platform for personalized medical language education. MediLingua assesses medical communication proficiency, tracks language acquisition, analyzes clinical writing, generates adaptive learning content, and provides an autonomous AI tutor — all behind a medical-grade safety layer.

Built to satisfy Problem Statement 105 (Personalized Language Learning for Medical Professionals) across seven capability levels: Machine Learning, Deep Learning, Natural Language Processing, Small Language Models, Low-Level Design, Generative AI, and Agentic AI.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [AI Capability Levels](#ai-capability-levels)
6. [API Reference](#api-reference)
7. [AI Safety Layer](#ai-safety-layer)
8. [Explainability Layer](#explainability-layer)
9. [Getting Started](#getting-start)
10. [Docker Deployment](#docker-deployment)
11. [Testing and CI/CD](#testing-and-cicd)
12. [Documentation](#documentation)
13. [Default Credentials](#default-credentials)
14. [License](#license)

---

## Overview

MediLingua addresses a real challenge in medical education: professionals need domain-specific language skills — medical terminology, patient communication, clinical documentation — that general language learning platforms do not cover. The platform delivers a personalized learning experience that adapts to each learner's specialty (cardiology, neurology, pediatrics, emergency, general medicine), proficiency level (CEFR A1 through C2), and learning trajectory.

### Core Capabilities

- **Proficiency Assessment (ML):** Classifies learners into CEFR levels using RandomForest and XGBoost models trained on multi-dimensional language scores.
- **Learning Acquisition Tracking (DL):** Forecasts learning trajectories with a LightGBM model augmented by softmax attention over recent history, predicting days-to-mastery and recommending optimal interventions.
- **Communication Analysis (NLP):** Analyzes clinical text for grammar errors, medical named entities (with ICD-10 hints), sentiment, and readability using rule-based NLP and a medical dictionary.
- **Scenario Practice (SLM):** Generates medical role-play scenarios, explains terminology, and conducts conversational practice using a large language model with retrieval-augmented grounding.
- **Content Studio (GenAI):** Creates patient case studies, adaptive quizzes, and consultation simulations tailored to specialty and difficulty.
- **Medical Knowledge Base (RAG):** Retrieval-augmented generation over a curated knowledge base of 59 medical communication chunks, indexed in FAISS.
- **AI Tutor (Agentic AI):** An autonomous ReAct agent that assesses proficiency, designs personalized learning paths, generates exercises, schedules practice, and sets milestones.
- **AI Safety Layer:** Screens every LLM output for toxicity, diagnosis attempts, and hallucination risk before it reaches the learner.
- **Explainability Dashboard:** SHAP-style feature contributions, attention weight visualization, and per-recommendation reasoning.

---

## Architecture

MediLingua uses a three-service architecture behind a gateway:

```
Browser  -->  Caddy Gateway (:81)  -->  Next.js (:3000)
                                        |  serves SPA (pure HTML/CSS/JS)
                                        |  /papi/v1/* route handler proxies to FastAPI
                                        v
                                     FastAPI (:8000)
                                        |  9 routers, 30+ endpoints
                                        |  ML models (in-process, lazy singletons)
                                        |  Safety + Explainability layers
                                        v
                                     LLM Service (:3003)
                                        |  z-ai-web-dev-sdk (GLM-4-Plus)
                                        |  powers SLM, GenAI, Agent, RAG
                                        v
                                     SQLite (platform.db)
```

For the full architecture diagram pack (10 Mermaid diagrams including system architecture, AI pipeline, RAG flow, database schema, agentic workflow, API gateway flow, safety pipeline, and explainability architecture), see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (no frameworks, no CDNs) |
| Backend | Python 3.12, FastAPI, Pydantic v2, Uvicorn |
| Database | SQLAlchemy ORM, SQLite |
| Machine Learning | scikit-learn, XGBoost, LightGBM, NumPy, Pandas |
| Vector Search | FAISS (IndexFlatIP) |
| Image Processing | OpenCV, Pillow |
| LLM Service | Node.js (Bun runtime), z-ai-web-dev-sdk |
| Auth | JWT (python-jose), bcrypt password hashing |
| Gateway | Caddy (TLS, reverse proxy) |
| Containerization | Docker, docker-compose |
| CI/CD | GitHub Actions |

---

## Project Structure

```
medilingua/
|
|-- backend/                        FastAPI backend
|   |-- app/
|   |   |-- main.py                 App entry, router registration, startup
|   |   |-- config.py               Environment-driven settings
|   |   |-- database.py             SQLAlchemy engine and session
|   |   |-- deps.py                 Dependency injection (auth, DB)
|   |   |-- routers/                12 routers (assess, track, analyze, slm,
|   |   |                           genai, rag, agent, safety, explainability,
|   |   |                           metrics, auth, predictions)
|   |   |-- services/               14 services (proficiency, acquisition, nlp,
|   |   |                           slm, genai, rag, agent, safety,
|   |   |                           explainability, auth, metrics, llm_client,
|   |   |                           model_registry)
|   |   |-- schemas/                Pydantic request/response models
|   |   |-- models/                 SQLAlchemy ORM models
|   |   |-- core/                   Security, exceptions, logging
|   |   |-- middleware/             Request logger, rate limiter
|   |-- data/                       SQLite DB + trained model artifacts
|   |-- requirements.txt
|   |-- Dockerfile
|   |-- .env.example
|
|-- public/app/                     Frontend SPA (pure HTML/CSS/JS)
|   |-- index.html
|   |-- css/                        5 stylesheets (variables, base, components,
|   |                               layout, views)
|   |-- js/
|   |   |-- utils.js                DOM helpers, formatters, icons
|   |   |-- api.js                  API client with fallback
|   |   |-- data.js                 Embedded fallback data
|   |   |-- charts.js               Canvas charts (line, bar, donut, gauge, SHAP)
|   |   |-- components.js           Reusable UI components
|   |   |-- router.js               Hash-based router
|   |   |-- app.js                  Bootstrap (sidebar, topbar, theme)
|   |   |-- views/                  12 views (login, dashboard, proficiency,
|   |                               tracker, analyzer, scenario, studio,
|   |                               knowledge, tutor, explainability,
|   |                               safety, monitoring, settings)
|   |-- assets/
|       |-- logo.svg                Medical cross + speech bubble
|
|-- mini-services/
|   |-- llm-service/                LLM mini-service (Bun + z-ai-web-dev-sdk)
|       |-- index.ts                HTTP server on port 3003
|       |-- Dockerfile
|
|-- src/app/                        Next.js wrapper
|   |-- page.tsx                    Redirects / to /app/index.html
|   |-- papi/v1/[...path]/route.ts  API proxy to FastAPI
|
|-- frontend/                       Production nginx config
|   |-- Dockerfile
|   |-- nginx.conf
|
|-- .github/workflows/
|   |-- ci.yml                      CI/CD pipeline (backend, frontend, security, Docker)
|
|-- docs/                           Documentation (see below)
|
|-- docker-compose.yml              Backend + LLM + frontend orchestration
|-- Caddyfile                       Gateway configuration
|-- next.config.ts                  Next.js config (standalone output)
```

---

## AI Capability Levels

### Level 1: Machine Learning — Proficiency Assessment

Classifies medical language learners into CEFR proficiency levels (A1 through C2) based on vocabulary, grammar, fluency, comprehension scores, and study metrics.

- **Models:** RandomForest (accuracy 83%) and XGBoost, trained on 1,740 synthetic learner records across all six CEFR classes.
- **Features:** vocabulary_score, grammar_score, fluency_score, comprehension_score, exercises_completed, study_hours, days_active, specialty.
- **Output:** CEFR level, per-level probability distribution, confidence, actionable recommendations, feature importance rankings.
- **Endpoint:** `POST /api/v1/assess/proficiency`

### Level 2: Deep Learning — Learning Acquisition Tracking

Forecasts the learner's language acquisition trajectory and predicts time-to-mastery using sequence modeling with attention.

- **Model:** LightGBM regressor with lag features (1, 3, 7, 14 days), rolling statistics, and sin/cos seasonality, augmented by a softmax attention mechanism over recent history.
- **Output:** Multi-horizon forecast with confidence bands, mastery prediction (target level, days to mastery, probability), optimal intervention recommendation, evaluation metrics (MAE, RMSE, R-squared).
- **Endpoint:** `POST /api/v1/track/acquisition`

### Level 3: Natural Language Processing — Communication Analyzer

Analyzes clinical text (patient histories, medical reports, consultation notes) for grammar, medical entities, sentiment, and readability.

- **Grammar:** 20 rule-based patterns for subject-verb agreement, articles, tense, and medical-specific constructions.
- **Medical NER:** Dictionary-based entity recognition with 50+ medical terms mapped to ICD-10 codes.
- **Sentiment:** Lexicon-based with medical-domain negation handling.
- **Readability:** Flesch-Kincaid grade level.
- **Output:** Grammar errors with corrections, medical entities with ICD hints, sentiment, readability score, feedback, rewritten suggestions, communication score.
- **Endpoint:** `POST /api/v1/analyze/communication`

### Level 4: Small Language Model — Scenario Practice

Generates interactive medical language practice using a large language model with retrieval-augmented grounding.

- **Scenario Generator:** Creates patient consultation role-play scenarios by specialty and difficulty, grounded in RAG-retrieved knowledge.
- **Term Explorer:** Explains medical terminology with examples and related terms.
- **Conversation Practice:** Conducts conversational practice with real-time corrections and suggestions.
- **Endpoints:** `POST /api/v1/slm/scenario`, `POST /api/v1/slm/explain`, `POST /api/v1/slm/converse`

### Level 5: Low-Level Design — System Architecture

Comprehensive system design documentation covering architecture, component interactions, data flows, and technical specifications.

- **Deliverables:** Architecture diagrams (10 Mermaid diagrams), API contracts, database schemas, sequence diagrams, deployment topology.
- **Documents:** [LLD.md](./LLD.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [API_CONTRACT.md](./API_CONTRACT.md)

### Level 6: Generative AI — Content Studio and RAG

Creates novel medical language learning content and provides retrieval-augmented knowledge access.

- **Case Study Generator:** Generates patient case studies with questions and learning objectives.
- **Quiz Generator:** Creates adaptive multiple-choice quizzes with answers and explanations.
- **Consultation Simulation:** Generates interactive patient consultation prompts.
- **RAG Knowledge Base:** Retrieval-augmented generation over a curated FAISS-indexed knowledge base of 59 medical communication chunks.
- **Endpoints:** `POST /api/v1/genai/case-study`, `POST /api/v1/genai/quiz`, `POST /api/v1/genai/simulation`, `POST /api/v1/rag/query`, `POST /api/v1/rag/upload`, `GET /api/v1/rag/documents`

### Level 7: Agentic AI — Autonomous Tutor

An autonomous ReAct-based AI tutor that designs personalized learning paths.

- **Agent Architecture:** Guided ReAct loop with five tools: assess_proficiency, recommend_content, generate_exercise, schedule_practice, set_milestones.
- **Reasoning:** LLM-generated per-step thoughts and LLM-composed final summary with templated fallbacks.
- **Output:** Learning path (steps, estimated days, focus areas), execution timeline, final answer, tools used, safety screening.
- **Endpoints:** `POST /api/v1/agent/tutor`, `GET /api/v1/agent/logs`

---

## API Reference

All endpoints are prefixed with `/api/v1`. Authentication uses JWT Bearer tokens.

| Method | Path | Description |
|---|---|---|
| POST | /auth/login | Login, returns JWT |
| POST | /auth/register | Register, returns JWT |
| GET | /auth/me | Current user profile |
| POST | /assess/proficiency | ML proficiency assessment |
| POST | /track/acquisition | DL learning trajectory forecast |
| POST | /analyze/communication | NLP grammar and entity analysis |
| POST | /slm/scenario | Generate medical practice scenario |
| POST | /slm/explain | Explain a medical term |
| POST | /slm/converse | Conversational practice |
| POST | /genai/case-study | Generate patient case study |
| POST | /genai/quiz | Generate adaptive quiz |
| POST | /genai/simulation | Generate consultation simulation |
| POST | /rag/query | RAG knowledge base query |
| POST | /rag/upload | Upload knowledge document |
| GET | /rag/documents | List knowledge documents |
| DELETE | /rag/documents/{id} | Delete a document |
| POST | /agent/tutor | Run autonomous AI tutor |
| GET | /agent/logs | Agent execution logs |
| POST | /safety/screen | Screen text for safety |
| POST | /safety/evaluate | Run safety test battery |
| GET | /safety/stats | Safety screening statistics |
| POST | /explain/proficiency | Explain proficiency prediction |
| POST | /explain/acquisition | Explain forecast (attention weights) |
| POST | /explain/recommendations | Explain recommendations |
| GET | /health | System health check |
| GET | /metrics | Full monitoring metrics |
| GET | /metrics/models | Per-model metrics |
| GET | /predictions | Learning session history |

For exact request/response schemas, see [API_CONTRACT.md](./API_CONTRACT.md).

---

## AI Safety Layer

Because MediLingua operates in the medical domain, every LLM-generated output is screened by a deterministic safety layer before reaching the learner. The layer runs in under 5 milliseconds and does not call the LLM.

**Screening pipeline:**

1. **Toxicity filter** — 40 regex patterns across 13 categories (self-harm, violence, illegal drugs, dangerous medical advice, etc.).
2. **Diagnosis restriction** — 13 patterns detect and block direct medical diagnoses directed at the user ("you have", "I diagnose you with").
3. **Hallucination confidence** — A 0-to-1 heuristic combining hedging word ratio, absolutist claim ratio, disclaimer presence, and medical dictionary hit rate.
4. **Disclaimer injection** — Automatically appends a medical disclaimer to educational responses.

**Verdicts:** safe, warning, or blocked. Blocked responses are replaced with a safe fallback.

**Test battery:** 10 built-in test cases covering diagnosis attempts, dangerous advice, and safe educational queries. Current pass rate: 100%.

For full documentation, see [AI_SAFETY.md](./AI_SAFETY.md).

---

## Explainability Layer

MediLingua converts black-box AI predictions into transparent, auditable recommendations.

- **Proficiency explainability:** SHAP-style feature contribution chart showing how each input feature increases or decreases the predicted CEFR level, with natural-language explanations.
- **Acquisition explainability:** Attention weight visualization showing which historical data points most influenced the forecast.
- **Recommendation reasoning:** Per-recommendation natural-language "why" combining feature importance percentages, gap-to-threshold analysis, and study-habit benchmarks.

**Endpoints:** `POST /explain/proficiency`, `POST /explain/acquisition`, `POST /explain/recommendations`

---

## Getting Started

### Prerequisites

- Python 3.11 or later
- Node.js 18 or later (or Bun)
- The sandbox environment has all dependencies pre-installed.

### 1. Start the LLM service (port 3003)

```bash
cd mini-services/llm-service
bun install
bun run dev
```

### 2. Start the FastAPI backend (port 8000)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

On startup, the backend initializes the database, seeds the admin user, trains all ML models, and seeds the RAG knowledge base.

### 3. Start the frontend (port 3000)

```bash
bun run dev
```

The SPA is served at `/app/index.html`. The root path `/` redirects to it.

Open the preview panel and navigate to the dashboard. Use the credentials below to log in, or use demo mode (the API accepts requests without a token).

---

## Docker Deployment

```bash
docker compose up --build -d
```

This starts three services:

| Service | Port | Description |
|---|---|---|
| backend | 8000 | FastAPI with all ML models |
| llm | 3003 | LLM service (z-ai-web-dev-sdk) |
| frontend | 8080 | Nginx serving the SPA, proxying API to backend |

For production hardening, scaling, and GPU model swap instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Testing and CI/CD

The GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on every push and pull request:

- **Backend job:** ruff lint, import smoke test, live endpoint verification (health, proficiency, safety evaluation).
- **Frontend job:** JavaScript syntax check for all files, CDN dependency detection (must be zero), framework detection (must be zero).
- **Security job:** Committed secret scan, .env tracking check, pip-audit dependency vulnerability scan.
- **Docker job:** Build validation for all three Docker images.

---

## Documentation

| Document | Description |
|---|---|
| [API_CONTRACT.md](./API_CONTRACT.md) | Complete REST API contract with request/response schemas |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 10 architecture diagrams (Mermaid) |
| [LLD.md](./LLD.md) | Low-level design document |
| [AI_SAFETY.md](./AI_SAFETY.md) | AI safety layer documentation |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment guide and production hardening |
| [COMPLIANCE_MATRIX.md](./COMPLIANCE_MATRIX.md) | Requirement traceability matrix |
| [ALIGNMENT_REPORT.md](./ALIGNMENT_REPORT.md) | Full alignment validation report |

---

## Default Credentials

```
Username: admin
Password: admin123
```

JWTs expire in 24 hours. Change `SECRET_KEY` in production.

---

## License

MIT License. Built as a production-grade medical AI education platform.
