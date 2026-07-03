# API Contract — MediLingua: Personalized Language Learning for Medical Professionals

**Problem Statement 105** — A platform for personalized language learning for medical
professionals, covering medical terminology and patient communication skills across
7 levels: ML, DL, NLP, SLM, LLD, GenAI, Agentic AI.

## Base URL & Gateway
- Frontend calls FastAPI via `fetch('/papi/v1<path>')` (Next.js route handler proxies to FastAPI on localhost:8000).
- All endpoints prefixed `/api/v1`.

## Auth (same as before)
- `POST /api/v1/auth/login` → `{access_token, token_type, user}`
- `POST /api/v1/auth/register` → same
- `GET /api/v1/auth/me` → `{id, username, email, role}`
- Demo: `admin` / `admin123`

## 1. ML — Proficiency Assessment
### `POST /api/v1/assess/proficiency`
Request:
```json
{"vocabulary_score":78, "grammar_score":65, "fluency_score":72, "comprehension_score":80,
 "exercises_completed":45, "study_hours":120, "days_active":30, "specialty":"cardiology"}
```
Response:
```json
{
  "level": "B2",
  "level_numeric": 4,
  "cefr_scale": {"A1":0.02,"A2":0.05,"B1":0.15,"B2":0.45,"C1":0.28,"C2":0.05},
  "confidence": 0.89,
  "recommendations": [
    {"area":"Grammar","priority":"High","action":"Focus on medical conditional tenses"},
    {"area":"Vocabulary","priority":"Medium","action":"Expand cardiology terminology"},
    {"area":"Fluency","priority":"Medium","action":"Practice patient consultation role-plays"}
  ],
  "feature_importance": [
    {"feature":"comprehension_score","importance":0.28},
    {"feature":"vocabulary_score","importance":0.24}
  ],
  "model": "RandomForest + XGBoost",
  "latency_ms": 12
}
```

## 2. DL — Learning Acquisition Tracker
### `POST /api/v1/track/acquisition`
Request: `{"history":[65,67,68,70,72,73,75,76,78,80], "horizon":30}`
Response:
```json
{
  "forecast": [{"day":1,"score":81,"lower":76,"upper":86}, ...],
  "mastery_prediction": {"target_level":"C1","days_to_mastery":45,"probability":0.72},
  "optimal_intervention": {"type":"intensive_practice","focus_area":"grammar","expected_boost":8.5},
  "metrics": {"mae":3.2,"rmse":4.1,"r2":0.88},
  "model": "Attention-LSTM (lag features + LightGBM)",
  "latency_ms": 18
}
```

## 3. NLP — Grammar & Communication Analyzer
### `POST /api/v1/analyze/communication`
Request: `{"text":"The patient present with chest pain and shortness of breath.","context":"patient_history"}`
Response:
```json
{
  "grammar_errors": [
    {"error":"Subject-verb agreement","position":"present","correction":"presents","severity":"medium"},
    {"error":"Missing article","position":"with chest pain","correction":"with a history of chest pain","severity":"low"}
  ],
  "sentiment": {"label":"Neutral","score":0.82},
  "medical_entities": [
    {"text":"chest pain","type":"SYMPTOM","icd_hint":"R07.9"},
    {"text":"shortness of breath","type":"SYMPTOM","icd_hint":"R06.02"}
  ],
  "readability": {"score":62.5,"grade_level":"10th grade","clarity":"good"},
  "feedback": "The sentence has a subject-verb agreement error. 'Patient' is singular, so use 'presents'.",
  "suggestions": ["The patient presents with chest pain and shortness of breath."],
  "communication_score": 72,
  "model": "spaCy + TF-IDF + rule-based",
  "latency_ms": 15
}
```

## 4. SLM — Medical Scenario Generator
### `POST /api/v1/slm/scenario`
Request: `{"specialty":"cardiology","difficulty":"intermediate","scenario_type":"patient_consultation"}`
Response:
```json
{
  "scenario": "You are a cardiologist seeing a 58-year-old patient...",
  "terminology": [{"term":"myocardial infarction","definition":"...","example":"..."}],
  "questions": ["What questions would you ask the patient?","How would you explain the diagnosis?"],
  "model": "TinyLlama-1.1B-Q4",
  "latency_ms": 1820
}
```
### `POST /api/v1/slm/explain` — `{term}` → `{explanation, examples, related_terms}`
### `POST /api/v1/slm/converse` — `{message, context}` → `{response, corrections, suggestions}`

## 5. GenAI — Content Generator
### `POST /api/v1/genai/case-study`
Request: `{"specialty":"emergency","difficulty":"advanced"}`
Response: `{case_study, questions, learning_objectives, model, latency_ms}`
### `POST /api/v1/genai/quiz`
Request: `{"specialty":"pediatrics","topic":"vaccination","num_questions":5,"difficulty":"intermediate"}`
Response: `{questions:[{question, options, answer, explanation}], model, latency_ms}`
### `POST /api/v1/genai/simulation`
Request: `{"specialty":"neurology","role":"patient"}`
Response: `{simulation, model, latency_ms}`

## 6. Agentic AI — Tutor
### `POST /api/v1/agent/tutor`
Request: `{"learner_id":"L001","task":"Design learning path","current_level":"B1","target_level":"C1","specialty":"cardiology"}`
Response:
```json
{
  "status":"completed",
  "learning_path": {"total_steps":5,"estimated_days":30,"focus_areas":["grammar","vocabulary","fluency"]},
  "steps": [
    {"step":1,"thought":"...","action":"assess_proficiency","action_input":{...},"observation":"...","latency_ms":120},
    {"step":2,"thought":"...","action":"recommend_content","action_input":{...},"observation":"...","latency_ms":45},
    {"step":3,"thought":"...","action":"generate_exercise","action_input":{...},"observation":"...","latency_ms":800},
    {"step":4,"thought":"...","action":"schedule_practice","action_input":{...},"observation":"...","latency_ms":38},
    {"step":5,"thought":"...","action":"set_milestones","action_input":{...},"observation":"...","latency_ms":22}
  ],
  "final_answer": "Personalized learning path designed for B1→C1 in cardiology...",
  "tools_used": ["assess_proficiency","recommend_content","generate_exercise","schedule_practice","set_milestones"],
  "total_latency_ms": 1025
}
```
### `GET /api/v1/agent/logs` → `{logs:[...]}`

## 7. Monitoring
### `GET /api/v1/health` → `{status, models, database, llm_service}`
### `GET /api/v1/metrics` → `{api_usage, latency, error_rate, model_metrics, system, endpoints, time_series}`
### `GET /api/v1/predictions` → `{predictions:[{id, type, input, output, latency_ms, created_at}]}`

## 8. RAG — Medical Knowledge Base
Retrieval-augmented generation pipeline over a curated knowledge base of ~60
medical-communication chunks (terminology, patient communication, documentation
guidelines, cultural competence, grammar patterns, CEFR descriptors, specialty tips).
Embeddings: TF-IDF (max_features=5000, ngram_range=(1,2)) → TruncatedSVD (64 dims)
→ L2-normalize. Vector store: FAISS `IndexFlatIP` (inner product == cosine on
normalized vectors). Answer synthesis calls the LLM service with the retrieved
context; falls back to a templated answer when the LLM is offline.

### `POST /api/v1/rag/query`
Request:
```json
{"query":"How should I explain a diagnosis to a patient?","top_k":3}
```
Response:
```json
{
  "answer": "When explaining a diagnosis to a patient, use plain language instead of medical jargon [1]. For example, say \"heart attack\" instead of \"myocardial infarction.\" Aim for a 6th-to-8th grade reading level and confirm understanding using the teach-back method [1, 2].",
  "sources": [
    {
      "chunk_id": 23,
      "text": "Plain-language explanations replace medical jargon with everyday words the patient can understand...",
      "score": 0.4321,
      "rank": 1,
      "document_id": "seed_kb",
      "document_filename": "MediLingua Seed Knowledge Base",
      "category": "communication"
    }
  ],
  "retrieval_confidence": 0.421,
  "chunks_used": 3,
  "latency_ms": 2913,
  "model": "TF-IDF + SVD(64) + FAISS IndexFlatIP",
  "llm_used": true
}
```

### `POST /api/v1/rag/upload`
Multipart file upload (`.txt`, `.json`, `.md`, max 500 KB). The file is split
into ~3-sentence chunks with 1-sentence overlap, then added to the FAISS index
(index is rebuilt).
Response:
```json
{"document_id":"doc_da1ade4598","filename":"resp.txt","chunks":2,"message":"Added 2 chunks from 'resp.txt' to the knowledge base."}
```

### `GET /api/v1/rag/documents`
Response:
```json
{
  "documents": [
    {"id":"seed_kb","filename":"MediLingua Seed Knowledge Base","chunks":59,"uploaded_at":"2026-07-03T03:14:08.960750+00:00","source":"seed"},
    {"id":"doc_da1ade4598","filename":"resp.txt","chunks":2,"uploaded_at":"2026-07-03T03:14:35.154216+00:00","source":"user"}
  ],
  "total_documents": 2,
  "total_chunks": 61
}
```

### `DELETE /api/v1/rag/documents/{document_id}`
Response:
```json
{"status":"deleted","id":"doc_da1ade4598","chunks_removed":2}
```
The seed KB (`id=seed_kb`) cannot be deleted.

## Database Tables
- `users` (id, username, email, hashed_password, role, specialty, created_at)
- `learning_sessions` (id, user_id, type, input, output, latency_ms, created_at)
- `agent_logs` (id, learner_id, task, current_level, target_level, specialty, steps_count, status, total_latency_ms, steps, created_at)
- `model_metrics` (id, model, accuracy, f1, rmse, latency_ms, calls, error_rate, status, updated_at)

## Error Format
`{"detail":"...","error_code":"...","status_code":422}`
