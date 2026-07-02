# Deployment Guide — AI Engineering Platform

This guide covers local development, Docker deployment, and production hardening
(including swapping the sandbox ML substitutes for real GPU models).

---

## 1. Local Development

### 1.1 LLM service (port 3003)
```bash
cd mini-services/llm-service
bun install
bun run dev          # http://localhost:3003
```
Health check: `curl http://localhost:3003/health` → `{"status":"ok",...}`

### 1.2 FastAPI backend (port 8000)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Startup does: DB create → seed `admin/admin123` → train all ML models → seed RAG KB.
Health check: `curl http://localhost:8000/api/v1/health`

### 1.3 Frontend (port 3000)
The SPA lives in `public/app/` and is served here by the Next.js dev server:
```bash
bun run dev          # http://localhost:3000 → /app/index.html
```
For a pure-static dev server (no Next.js):
```bash
cd public/app && python3 -m http.server 3000
```

### 1.4 Gateway
The included **Caddy** gateway (port 81) routes:
- default → `localhost:3000` (frontend)
- `?XTransformPort=8000` → `localhost:8000` (backend)
- `?XTransformPort=3003` → `localhost:3003` (llm)

The frontend always calls APIs as relative paths with `?XTransformPort=8000`, so it works
behind the gateway with no CORS issues.

---

## 2. Docker Deployment

```bash
docker compose up --build -d
```

| Service  | Port | URL                          |
|----------|------|------------------------------|
| backend  | 8000 | http://localhost:8000        |
| llm      | 3003 | http://localhost:3003        |
| frontend | 8080 | http://localhost:8080        |

The frontend nginx container proxies `/api/*` → `backend:8000`, so in Docker the SPA
calls `/api/v1/...` directly (no `XTransformPort` needed). The `api.js` helper detects the
environment — but to keep a single code path it always appends `XTransformPort=8000`,
which nginx ignores. (If you prefer, configure nginx to strip it.)

### Environment variables (`.env` at project root for compose)
```
SECRET_KEY=change-me-to-a-long-random-string
```
Set the LLM service credentials according to your z-ai-web-dev-sdk setup.

---

## 3. Production Hardening Checklist

- [ ] **SECRET_KEY** — set a 32+ char random string.
- [ ] **JWT expiry** — reduce `ACCESS_TOKEN_EXPIRE_MINUTES` if needed.
- [ ] **CORS** — set `CORS_ORIGINS` to your exact frontend origin(s) instead of `*`.
- [ ] **Database** — switch `PLATFORM_DATABASE_URL` to PostgreSQL for scale:
      `postgresql+psycopg://user:pass@host:5432/aiep`. (SQLAlchemy supports it; add
      `psycopg[binary]` to requirements.)
- [ ] **Rate limiting** — tune `middleware/rate_limit.py` or put a real limiter
      (e.g. slowapi / nginx) in front.
- [ ] **HTTPS** — terminate TLS at Caddy/nginx with a real cert.
- [ ] **Secrets** — use Docker secrets / a vault, not plain env files.
- [ ] **Backups** — schedule SQLite/Postgres backups of `predictions`, `agent_logs`, etc.

---

## 4. Swapping in Real GPU Models

The sandbox ships **deployable substitutes** (see README "ML Model Substitution Notes").
To run the full portfolio models on a GPU host:

1. Uncomment the heavy deps in `backend/requirements.txt`:
   ```text
   torch==2.4.0
   transformers==4.44.0
   sentence-transformers==3.0.0
   tensorflow==2.17.0
   ```
2. **Damage** (`services/damage_service.py`) — load a real ResNet50 (`keras.applications`)
   trained on your damage dataset; replace the OpenCV feature path. Keep the response schema.
3. **BERT** (`services/bert_service.py`) — load a fine-tuned `BertForSequenceClassification`
   via `transformers.pipeline`; replace the TF-IDF + LogReg path. Keep the response schema.
4. **RAG** (`services/rag_service.py`) — swap `TfidfVectorizer+SVD` for
   `sentence-transformers/all-MiniLM-L6-v2` embeddings fed into the same FAISS index.
5. **SLM** (`services/slm_service.py`) — point at a local **Ollama** runtime running
   `specialized-slm` (GGUF) instead of the LLM service; or keep the LLM service.

Because every module returns the same JSON contract, **the frontend needs no changes**.

---

## 5. Scaling Notes

- The FastAPI app is async and stateless (SQLite aside); run multiple replicas behind a
  load balancer and move the DB to Postgres + shared object storage for uploads.
- ML models are loaded once per process (singleton in `model_registry.py`). For high
  throughput, run a dedicated inference sidecar (Triton / TorchServe) and call it from the
  services.
- The LLM service is a thin stateless wrapper — scale horizontally; the z-ai SDK handles
  connection pooling internally.
- Prediction caching (`model_registry.py`) is in-process LRU; for multi-replica caching
  move to Redis.

---

## 6. Verification (smoke tests)

```bash
# Health
curl http://localhost:8000/api/v1/health
# Churn
curl -X POST http://localhost:8000/api/v1/predict/churn \
  -H "Content-Type: application/json" \
  -d '{"gender":"Male","age":34,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5}'
# RAG
curl -X POST http://localhost:8000/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the termination notice period?","top_k":3}'
# Agent
curl -X POST http://localhost:8000/api/v1/agent/hr \
  -H "Content-Type: application/json" \
  -d '{"task":"Onboard new employee","employee_name":"Jane Roe","role":"Engineer","department":"Eng"}'
```

Open the frontend in your browser and exercise: Dashboard, each prediction module, the RAG
chat, the Agentic workflow, Model Monitoring, and Settings.
