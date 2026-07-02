# API Contract — AI Engineering Platform

**Single source of truth** for backend (FastAPI) and frontend (HTML/CSS/JS).

## Base URL & Gateway
- Frontend calls FastAPI via the Caddy gateway using a relative path + query param:
  `fetch('/api/v1/<path>?XTransformPort=8000', ...)`
- NEVER use `http://localhost:8000` in frontend code. ALWAYS use relative path + `?XTransformPort=8000`.
- A frontend helper `api(path)` should build `/api/v1${path}?XTransformPort=8000` automatically.
- FastAPI is mounted with prefix `/api/v1`. So a request to `/api/v1/health?XTransformPort=8000`
  is forwarded by Caddy to `localhost:8000/api/v1/health`.

## Auth
- `POST /api/v1/auth/login` — body `{username, password}` → `{access_token, token_type:"bearer", user:{id,username,email,role}}`
- `POST /api/v1/auth/register` — body `{username, email, password}` → same as login
- `GET /api/v1/auth/me` — Bearer token → `{id,username,email,role}`
- Default demo credentials (seeded on startup): `admin` / `admin123`
- Auth uses JWT (python-jose). Bearer token in `Authorization` header.
- For the live demo, endpoints should still work; if no token, treat as anonymous demo user (do NOT hard-block the UI).
  Implementation: a `get_optional_user` dependency returns demo user when no token; protected writes still log to DB.

## Prediction Modules
### 1. Churn — `POST /api/v1/predict/churn`
Request JSON:
```json
{"gender":"Male|Female","age":34,"contract":"Month-to-month|One year|Two year","tenure":12,"monthly_charges":75.5}
```
Response:
```json
{
  "churn_probability": 0.73,
  "prediction": "Churn Risk",
  "risk_level": "High",
  "confidence": 0.91,
  "feature_contributions": [
    {"feature":"Contract","contribution":0.21,"direction":"increases churn"},
    {"feature":"Tenure","contribution":-0.15,"direction":"decreases churn"},
    {"feature":"MonthlyCharges","contribution":0.18,"direction":"increases churn"}
  ],
  "model":"XGBoost",
  "latency_ms": 12
}
```

### 2. Healthcare Premium — `POST /api/v1/predict/premium`
Request: `{"age":45,"bmi":28.5,"smoker":true,"region":2}`
Response:
```json
{
  "predicted_premium": 1245.5,
  "currency":"USD",
  "confidence_interval":[1180.2, 1310.8],
  "risk_factors":[
    {"factor":"Smoking","impact":500,"level":"High"},
    {"factor":"Age","impact":450,"level":"Medium"},
    {"factor":"BMI","impact":142.5,"level":"Low"}
  ],
  "model":"XGBoost Regressor",
  "latency_ms": 9
}
```

### 3. CNN Auto Damage — `POST /api/v1/predict/damage`
Request: `multipart/form-data` field `file` (image jpg/png).
Response:
```json
{
  "class":"Damaged",
  "confidence":0.86,
  "severity":"Moderate",
  "damage_types":["scratch","dent"],
  "estimated_repair_cost_usd": 1850,
  "damage_regions":[{"x":0.2,"y":0.3,"w":0.25,"h":0.2,"type":"scratch"}],
  "model":"ResNet50 (CV feature pipeline)",
  "latency_ms": 41
}
```

### 4. Demand Forecast — `POST /api/v1/predict/forecast`
Request: `{"horizon":30}` (optionally `{"history":[...]}`)
Response:
```json
{
  "forecast":[{"day":1,"value":122.4,"lower":115.1,"upper":129.7}, ...],
  "metrics":{"mae":4.2,"rmse":5.1,"r2":0.94},
  "model":"Attention-LSTM (lag features + LightGBM)",
  "latency_ms": 18
}
```

### 5. BERT Complaint Classification — `POST /api/v1/predict/bert`
Request: `{"text":"My internet is not working and I am frustrated"}`
Response:
```json
{
  "category":"Technical",
  "confidence":0.92,
  "categories":[
    {"label":"Technical","score":0.92},
    {"label":"Billing","score":0.05},
    {"label":"General","score":0.03}
  ],
  "sentiment":{"label":"Negative","score":0.88},
  "urgency":"High",
  "entities":[{"text":"internet","type":"ISSUE"}],
  "model":"BERT (TF-IDF + LogReg deployment proxy)",
  "latency_ms": 7
}
```

## RAG
### `POST /api/v1/rag/upload` — multipart `file` (pdf/txt)
Response: `{"document_id":"doc_abc","filename":"policy.pdf","chunks":18,"message":"Indexed successfully","status":"ok"}`
### `POST /api/v1/rag/query`
Request: `{"query":"What is the termination notice?","top_k":3}`
Response:
```json
{
  "answer":"Based on the knowledge base, the standard termination notice is 30 days...",
  "sources":[{"document":"policy.pdf","chunk_index":4,"text":"Standard termination requires 30-day notice.","score":0.81}],
  "retrieval_confidence":0.81,
  "chunks_used":3,
  "latency_ms": 320
}
```
### `GET /api/v1/rag/documents` → `{documents:[{id,filename,chunks,uploaded_at,size_kb}]}`
### `DELETE /api/v1/rag/documents/{id}` → `{status:"deleted"}`

## Agentic HR
### `POST /api/v1/agent/hr`
Request: `{"task":"Onboard new employee","employee_name":"John Doe","role":"Software Engineer","department":"Engineering"}`
Response:
```json
{
  "status":"completed",
  "final_answer":"Onboarding for John Doe complete. Access provisioned, welcome email sent, knowledge base queried.",
  "steps":[
    {"step":1,"thought":"Need to check onboarding policy","action":"query_knowledge_base","action_input":"onboarding policy","observation":"Standard onboarding requires...","latency_ms":120},
    {"step":2,"thought":"Create employee record","action":"create_employee","action_input":{"name":"John Doe","role":"Software Engineer"},"observation":"Employee EMP-1024 created","latency_ms":45},
    {"step":3,"thought":"Provision access","action":"generate_access","action_input":{"name":"John Doe","role":"Software Engineer"},"observation":"SSO, Git, Jira access provisioned","latency_ms":38},
    {"step":4,"thought":"Send welcome email","action":"send_email","action_input":{"to":"john.doe@company.com","subject":"Welcome"},"observation":"Email queued (ID MAIL-8821)","latency_ms":22}
  ],
  "tools_used":["query_knowledge_base","create_employee","generate_access","send_email"],
  "total_latency_ms": 225
}
```
### `GET /api/v1/agent/logs` → `{logs:[{id,task,employee,steps_count,status,created_at,total_latency_ms}]}`

## SLM Edge
### `GET /api/v1/slm/status` → `{model:"TinyLlama-1.1B-Q4",quantization:"Q4_0 GGUF",size_mb:670,avg_latency_ms:1840,devices:["edge-cpu-01"],memory_mb:740,status:"loaded"}`
### `POST /api/v1/slm/infer` — `{"prompt":"Summarize..."}` → `{"response":"...","latency_ms":1820,"tokens":48,"tokens_per_sec":26.4}`

## Monitoring
### `GET /api/v1/health` → `{"status":"healthy","version":"1.0.0","uptime_seconds":1234,"models":{"churn":"loaded","premium":"loaded","damage":"loaded","forecast":"loaded","bert":"loaded","rag":"ready","slm":"loaded"},"database":"connected","llm_service":"connected"}`
### `GET /api/v1/metrics` →
```json
{
  "api_usage":{"total_requests":1245,"requests_per_min":18,"success_rate":0.992},
  "latency":{"p50_ms":12,"p95_ms":85,"p99_ms":320},
  "error_rate":0.008,
  "model_metrics":[
    {"model":"Churn XGBoost","accuracy":0.82,"f1":0.74,"latency_ms":12,"calls":342,"status":"healthy"},
    ...
  ],
  "system":{"cpu_percent":24,"memory_percent":41,"disk_percent":18},
  "endpoints":[
    {"path":"/api/v1/predict/churn","calls":342,"avg_latency_ms":12,"error_rate":0.0},
    ...
  ],
  "time_series":[
    {"timestamp":"...","requests":18,"latency_ms":12,"errors":0}, ...
  ]
}
```
### `GET /api/v1/metrics/models` → array of model metric objects (detailed).

## Predictions History
### `GET /api/v1/predictions?type=churn&limit=20` → `{predictions:[{id,type,input,output,created_at,latency_ms}]}`
All prediction endpoints should persist a row to the `predictions` table.

## Users
### `GET /api/v1/users/me` (alias of auth/me)
### `GET /api/v1/users/stats` → `{total_predictions, by_type:{churn:..,...}, last_active}`

## Error Format (consistent)
```json
{"detail":"Human message","error_code":"VALIDATION_ERROR","status_code":422}
```

## CORS
FastAPI must allow all origins (demo). Add CORSMiddleware allow_origins=["*"].

## Notes for Frontend
- All POST bodies are JSON unless stated (multipart for file uploads).
- Always send `Content-Type: application/json` for JSON endpoints.
- Store JWT in localStorage key `aiplatform_token`. Send as `Authorization: Bearer <token>`.
- If a 401 occurs, the UI should not crash; keep working in demo mode.
