# Deployment Guide — MediLingua

## Personalized Language Learning for Medical Professionals

This guide covers local development, Docker deployment, and production hardening.

---

## 1. Local Development

### 1.1 LLM Service (port 3003)

```bash
cd mini-services/llm-service
bun install
bun run dev
```

Health check: `curl http://localhost:3003/health`

### 1.2 FastAPI Backend (port 8000)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Startup sequence: database initialization, admin user seeding (admin/admin123),
ML model training (proficiency, acquisition, NLP), RAG knowledge base seeding.

Health check: `curl http://localhost:8000/api/v1/health`

### 1.3 Frontend (port 3000)

```bash
bun run dev
```

The SPA is served at `/app/index.html`. The root path `/` redirects to it.
API calls are proxied via the Next.js route handler at `/papi/v1/*` to FastAPI.

### 1.4 Gateway

The Caddy gateway (port 81) routes:
- Default traffic to the Next.js frontend (port 3000)
- `?XTransformPort=PORT` to the specified local port

---

## 2. Docker Deployment

```bash
docker compose up --build -d
```

| Service | Port | URL |
|---|---|---|
| backend | 8000 | http://localhost:8000 |
| llm | 3003 | http://localhost:3003 |
| frontend | 8080 | http://localhost:8080 |

The frontend nginx container proxies `/api/*` to the backend container, so the
SPA calls `/api/v1/...` directly in Docker.

### Environment Variables

Set in `.env` at the project root for docker-compose:
```
SECRET_KEY=<32+ char random string>
```

---

## 3. Smoke Tests

```bash
# Health
curl http://localhost:8000/api/v1/health

# Proficiency Assessment
curl -X POST http://localhost:8000/api/v1/assess/proficiency \
  -H "Content-Type: application/json" \
  -d '{"vocabulary_score":78,"grammar_score":65,"fluency_score":72,"comprehension_score":80,"exercises_completed":45,"study_hours":120,"days_active":30,"specialty":"cardiology"}'

# Learning Acquisition Tracker
curl -X POST http://localhost:8000/api/v1/track/acquisition \
  -H "Content-Type: application/json" \
  -d '{"history":[65,67,68,70,72,73,75,76,78,80],"horizon":14}'

# Communication Analyzer
curl -X POST http://localhost:8000/api/v1/analyze/communication \
  -H "Content-Type: application/json" \
  -d '{"text":"The patient present with chest pain and shortness of breath.","context":"patient_history"}'

# RAG Knowledge Query
curl -X POST http://localhost:8000/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How should I explain a diagnosis to a patient?","top_k":3}'

# AI Tutor
curl -X POST http://localhost:8000/api/v1/agent/tutor \
  -H "Content-Type: application/json" \
  -d '{"learner_id":"L001","task":"Design learning path","current_level":"B1","target_level":"C1","specialty":"cardiology"}'

# Safety Evaluation
curl -X POST http://localhost:8000/api/v1/safety/evaluate \
  -H "Content-Type: application/json" -d '{}'

# Metrics
curl http://localhost:8000/api/v1/metrics
```

---

## 4. Production Hardening

- **SECRET_KEY:** Set a 32+ character random string.
- **JWT expiry:** Reduce `ACCESS_TOKEN_EXPIRE_MINUTES` if needed.
- **CORS:** Set `CORS_ORIGINS` to your exact frontend origin(s).
- **Database:** Switch `PLATFORM_DATABASE_URL` to PostgreSQL:
  `postgresql+psycopg://user:pass@host:5432/medilingua`. Add `psycopg[binary]` to requirements.
- **Rate limiting:** Tune `middleware/rate_limit.py` or add a real limiter (slowapi, nginx).
- **HTTPS:** Terminate TLS at Caddy/nginx with a real certificate.
- **Secrets:** Use Docker secrets or a vault, not plain env files.
- **Backups:** Schedule SQLite/PostgreSQL backups for `learning_sessions` and `agent_logs`.

---

## 5. Swapping in Real GPU Models

The sandbox uses deployable substitutes (no torch/transformers). To run full
deep-learning models on a GPU host:

1. Uncomment the heavy dependencies in `backend/requirements.txt`:
   ```
   torch==2.4.0
   transformers==4.44.0
   sentence-transformers==3.0.0
   ```

2. **NLP:** Replace the rule-based grammar checker in `nlp_service.py` with a
   fine-tuned BERT model (`transformers.BertForSequenceClassification`).
   Keep the response schema unchanged.

3. **Acquisition:** Replace the LightGBM proxy in `acquisition_service.py` with
   a real LSTM model (`tf.keras.layers.LSTM`). Keep the response schema.

4. **RAG:** Replace the TF-IDF+SVD embedder in `rag_service.py` with
   `sentence-transformers/all-MiniLM-L6-v2`. Keep the FAISS index interface.

5. **SLM:** Point `slm_service.py` at a local Ollama runtime running a
   quantized TinyLlama GGUF model instead of the LLM service proxy.

Because every module returns the same JSON contract, the frontend needs no changes.

---

## 6. Scaling Notes

- The FastAPI app is async and stateless (SQLite aside). Run multiple replicas
  behind a load balancer and move the database to PostgreSQL for scale.
- ML models are loaded once per process (singleton in `model_registry.py`).
  For high throughput, use a dedicated inference sidecar (Triton, TorchServe).
- The LLM service is a thin stateless wrapper. Scale horizontally; the z-ai SDK
  handles connection pooling internally.
- Prediction caching is in-process LRU. For multi-replica caching, move to Redis.
