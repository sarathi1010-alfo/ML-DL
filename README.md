# AI Engineering Platform

A production-grade **AI & ML Engineering dashboard** integrating eight real AI/ML pipelines —
Churn Prediction, Healthcare Premium Estimation, CNN Auto-Damage Classification, Demand
Forecasting, BERT Complaint Classification, RAG Knowledge Assistant, Agentic HR Workflow,
and an SLM Edge-Inference dashboard.

Built with a strict separation of concerns:

| Layer        | Technology                                                |
|--------------|-----------------------------------------------------------|
| **Frontend** | Pure **HTML5 + CSS3 + Vanilla JavaScript** (no framework) |
| **Backend**  | **Python FastAPI** (async, modular, service-based)        |
| **LLM**      | **Node + z-ai-web-dev-sdk** mini-service                  |
| **Database** | **SQLAlchemy + SQLite**                                   |
| **ML**       | XGBoost, LightGBM, scikit-learn, FAISS, OpenCV            |

> No React, no Tailwind, no Bootstrap, no Vue — exactly as specified.

---

## ✨ Features

### AI / ML Modules (all real, trained on synthetic data at startup)
1. **Churn Prediction** — XGBoost classifier with SMOTE-style class weighting, feature contributions.
2. **Healthcare Premium** — XGBoost regressor with risk-factor breakdown & confidence interval.
3. **CNN Auto-Damage** — OpenCV feature pipeline (HSV histograms, Canny edges, Hough lines, Sobel gradients) + GradientBoosting classifier → damage class, severity, types, repair-cost estimate, region boxes.
4. **Demand Forecasting** — Lag features + rolling stats + sin/cos seasonality + LightGBM, with a softmax **attention** weighting over recent lags. Multi-horizon forecast with confidence bands.
5. **BERT Complaint Classification** — TF-IDF (word + char n-grams) + LogisticRegression (BERT deployment proxy), with sentiment, urgency, and entity extraction.
6. **RAG Knowledge Assistant** — PDF/TXT upload → sentence chunking → TF-IDF + TruncatedSVD embeddings → **FAISS** IndexFlatIP → semantic retrieval → **LLM answer synthesis** with source citations & confidence.
7. **Agentic HR Workflow** — **ReAct** loop with four tools (`query_knowledge_base`, `create_employee`, `generate_access`, `send_email`), LLM-generated per-step thoughts, LLM-composed final summary, full execution timeline + logs.
8. **SLM Edge Inference** — TinyLlama-1.1B-Q4 GGUF simulator with live LLM inference, latency & tokens/sec metrics.

### Platform
- 🔐 **JWT auth** (python-jose + bcrypt), seeded demo user `admin / admin123`.
- 🗄️ **SQLAlchemy ORM** with 6 tables: `users`, `predictions`, `uploaded_documents`, `agent_logs`, `rag_queries`, `model_metrics`.
- 📊 **Model monitoring** — latency p50/p95/p99, error rate, per-model metrics, endpoint usage, system health (CPU/mem/disk), 24-bucket time series.
- 🛡️ **Production hardening** — structured logging, global exception handlers, request-validation, CORS, rate limiting, health checks, lazy singleton model loading, prediction caching.
- 🎨 **Frontend** — dark/light theme, glassmorphism, custom canvas charts (no chart libraries), drag-and-drop upload, toasts, skeletons, fully responsive, custom scrollbars.

---

## 🏗️ Architecture

```
┌───────────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│  Frontend (HTML/CSS/JS)│        │  FastAPI Backend :8000 │        │  LLM Service :3003     │
│  served by Next.js :3000│◀──────│  routers + services    │◀──────│  z-ai-web-dev-sdk      │
│  (static SPA in /app)   │  REST  │  ML models (XGBoost,   │  HTTP  │  (RAG synthesis +      │
│                         │  via   │  LightGBM, FAISS, …)   │        │   agent reasoning)     │
└───────────────────────┘ gateway └───────────────────────┘        └───────────────────────┘
         │                              │
         │   /api/v1/*?XTransformPort=8000   SQLite (platform.db)
         └──────────────────────────────┘
```

- The **Caddy gateway** (port 81) routes `?XTransformPort=8000` → `localhost:8000` and default → `localhost:3000`.
- The frontend calls every API as a **relative path** with `?XTransformPort=8000`.
- The FastAPI backend calls the LLM service directly via `http://localhost:3003` (same machine).

---

## 📁 Project Structure

```
my-project/
├── backend/                      # FastAPI backend (Python)
│   ├── app/
│   │   ├── main.py               # app, middleware, router includes, startup
│   │   ├── config.py             # env-driven settings
│   │   ├── database.py           # SQLAlchemy engine + session
│   │   ├── deps.py               # DI: get_db, get_current_user, get_optional_user
│   │   ├── routers/              # auth, churn, premium, damage, forecast, bert,
│   │   │                         #   rag, agent, slm, metrics, predictions
│   │   ├── services/             # auth, model_registry, churn, premium, damage,
│   │   │                         #   forecast, bert, rag, agent, slm, llm_client, metrics
│   │   ├── models/               # SQLAlchemy ORM (6 tables)
│   │   ├── schemas/              # Pydantic request/response schemas
│   │   ├── core/                 # security, exceptions, logging
│   │   └── middleware/           # request_logger, rate_limit
│   ├── data/                     # SQLite db + trained model artifacts (runtime)
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   ├── daemon_start.py           # double-fork daemon launcher
│   └── run.sh
│
├── public/app/                   # Frontend (pure HTML/CSS/JS SPA)
│   ├── index.html
│   ├── css/                      # variables, base, components, layout, views
│   ├── js/                       # app, api, router, components, charts, utils
│   │   └── views/                # login, dashboard, churn, healthcare, damage,
│   │                             #   nlp, rag, agent, monitoring, slm, settings
│   └── assets/logo.svg
│
├── mini-services/llm-service/    # LLM mini-service (Node + z-ai-web-dev-sdk)
│   ├── index.ts                  # Bun.serve on port 3003
│   ├── package.json
│   ├── daemon_start.py
│   └── Dockerfile
│
├── src/app/page.tsx              # Next.js root → redirects to /app/index.html
├── docker-compose.yml            # backend + llm-service + frontend(nginx)
├── frontend/                     # nginx Dockerfile + config for the SPA
├── API_CONTRACT.md               # single source of truth for all endpoints
├── DEPLOYMENT.md                 # deployment guide
└── README.md
```

---

## 🚀 Quick Start (Local Dev)

### Prerequisites
- Python 3.11+
- Node.js 18+ / Bun
- (The sandbox already has everything installed.)

### 1. Start the LLM service (port 3003)
```bash
cd mini-services/llm-service
bun install            # first time only (uses parent node_modules z-ai-web-dev-sdk)
bun run dev            # bun --hot index.ts  →  http://localhost:3003
```

### 2. Start the FastAPI backend (port 8000)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
On startup it: creates the SQLite DB, seeds `admin/admin123`, trains all ML models,
and seeds the default RAG knowledge base.

### 3. Start the frontend
The SPA is served as static files. In this project it's served by the Next.js dev server:
```bash
bun run dev           # http://localhost:3000  →  /app/index.html
```
(For a pure-static deployment, serve `public/app/` with any static host / nginx.)

Open the app → it auto-routes to the **Dashboard**. Use **Settings → Clear local data**
to force the login screen, or log in with `admin / admin123`.

---

## 🔌 API Reference (v1)

All endpoints are prefixed `/api/v1`. Auth uses `Authorization: Bearer <JWT>`.

| Method | Path                       | Description                              |
|--------|----------------------------|------------------------------------------|
| POST   | `/auth/login`              | Login → JWT                              |
| POST   | `/auth/register`           | Register → JWT                           |
| GET    | `/auth/me`                 | Current user                             |
| POST   | `/predict/churn`           | XGBoost churn prediction                 |
| POST   | `/predict/premium`         | Healthcare premium regression            |
| POST   | `/predict/damage`          | CNN damage classification (image upload) |
| POST   | `/predict/forecast`        | Attention-LSTM demand forecast           |
| POST   | `/predict/bert`            | Complaint classification + sentiment     |
| POST   | `/rag/upload`              | Upload PDF/TXT → index in FAISS          |
| POST   | `/rag/query`               | RAG query → LLM answer + sources         |
| GET    | `/rag/documents`           | List indexed documents                   |
| DELETE | `/rag/documents/{id}`      | Delete a document                        |
| POST   | `/agent/hr`                | ReAct HR onboarding agent                |
| GET    | `/agent/logs`              | Agent execution logs                     |
| GET    | `/slm/status`              | SLM edge model status                    |
| POST   | `/slm/infer`               | SLM inference                            |
| GET    | `/health`                  | Service + model + DB + LLM health        |
| GET    | `/metrics`                 | Full monitoring metrics                  |
| GET    | `/metrics/models`          | Per-model metrics                        |
| GET    | `/predictions`             | Prediction history                       |
| GET    | `/users/stats`             | User activity stats                      |

See **`API_CONTRACT.md`** for exact request/response shapes and sample responses.

### Sample response — `POST /predict/churn`
```json
{
  "churn_probability": 0.73,
  "prediction": "Churn Risk",
  "risk_level": "High",
  "confidence": 0.91,
  "feature_contributions": [
    {"feature":"Contract","contribution":0.21,"direction":"increases churn"},
    {"feature":"Tenure","contribution":-0.15,"direction":"decreases churn"}
  ],
  "model": "XGBoost",
  "latency_ms": 12
}
```

---

## 🐳 Docker

```bash
docker compose up --build
# backend   →  http://localhost:8000
# llm       →  http://localhost:3003
# frontend  →  http://localhost:8080  (nginx serving the SPA, proxying /api → backend)
```

See **`DEPLOYMENT.md`** for the full deployment guide (env vars, scaling, production notes,
swapping in real BERT/ResNet50/TinyLlama on a GPU host).

---

## 🔐 Default Credentials
```
username: admin
password: admin123
```
JWTs expire in 24h. Change `SECRET_KEY` in production.

---

## 🧠 ML Model Substitution Notes

The sandbox has no GPU and the heavy deep-learning runtimes (torch / transformers /
tensorflow) are intentionally not installed to keep startup fast. The backend therefore
ships **deployable substitutes** that preserve the full API contract and produce real
predictions:

| Module      | Production target        | Sandbox deployment (this repo)                         |
|-------------|--------------------------|--------------------------------------------------------|
| Churn       | XGBoost                  | **XGBoost** (real)                                     |
| Premium     | XGBoost / LightGBM       | **XGBoost Regressor** (real)                           |
| Damage      | ResNet50 (transfer)      | **OpenCV features + GradientBoosting** (real CV)      |
| Forecast    | Attention-LSTM           | **Lag features + LightGBM + softmax attention** (real)|
| BERT NLP    | BERT fine-tuned          | **TF-IDF + LogisticRegression** (real, BERT proxy)    |
| RAG         | FAISS + MiniLM embeddings| **FAISS + TF-IDF/SVD embeddings** (real) + LLM         |
| SLM Edge    | TinyLlama GGUF / Ollama  | **LLM service simulation** + real generation           |
| Agent       | ReAct + LLM              | **Guided ReAct + LLM** (real tool execution + LLM)     |

`backend/requirements.txt` lists the heavy deps as comments — uncomment for GPU deployment.

---

## 📜 License
MIT — built as a production-grade AI engineering portfolio platform.
