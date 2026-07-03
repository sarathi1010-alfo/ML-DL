# Architecture Diagram Pack — MediLingua

**Personalized Language Learning for Medical Professionals** — Production AI System Architecture.

All diagrams are Mermaid — render in GitHub, VS Code, or [mermaid.live](https://mermaid.live).

---

## 1. System Architecture (C4 Level 2 — Container)

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["Browser SPA<br/>Pure HTML/CSS/JS<br/>10+ views"]
        Phone["Mobile Browser<br/>responsive"]
    end

    subgraph Edge["Edge / Gateway"]
        ALB["Public ALB<br/>aiplatform.space-z.ai"]
        Caddy["Caddy Gateway :81<br/>TLS + reverse proxy"]
    end

    subgraph NextJS["Next.js :3000<br/>(serves SPA + API proxy)"]
        NextStatic["Static SPA<br/>/app/*"]
        NextProxy["Route Handler<br/>/api/v1/* → FastAPI"]
    end

    subgraph Backend["FastAPI :8000 (Python 3.12)"]
        API["REST API /api/v1/*"]
        Auth["JWT Auth<br/>+ bcrypt"]
        Routers["9 Routers<br/>assess · track · analyze<br/>slm · genai · agent<br/>safety · explainability · metrics"]
        Safety["Safety Layer<br/>toxicity · diagnosis block<br/>hallucination score · disclaimers"]
        Explain["Explainability<br/>SHAP · attention · reasoning"]
        Registry["Model Registry<br/>lazy singletons + LRU cache"]
    end

    subgraph Models["ML Models (in-process)"]
        M1["Proficiency<br/>RF + XGBoost"]
        M2["Acquisition<br/>LightGBM + Attention"]
        M3["NLP<br/>rule-based + dictionary NER"]
    end

    subgraph LLM["LLM Service :3003 (Bun)"]
        ZAI["z-ai-web-dev-sdk<br/>GLM-4-Plus"]
        LLMProxy["/api/* proxy → FastAPI"]
    end

    subgraph Data["Data Layer"]
        DB[("SQLite<br/>platform.db")]
        Artifacts["Model Artifacts<br/>.pkl files"]
    end

    Browser --> ALB
    Phone --> ALB
    ALB --> Caddy
    Caddy --> NextStatic
    Caddy --> LLMProxy
    NextStatic --> Browser
    Browser -->|"API /papi/v1/*"| NextProxy
    NextProxy -->|"localhost:8000"| API
    API --> Auth
    API --> Routers
    Routers --> Safety
    Routers --> Explain
    Routers --> Registry
    Registry --> M1 & M2 & M3
    Routers -->|"LLM calls"| ZAI
    Safety -->|"screens"| ZAI
    API --> DB
    Registry --> Artifacts
```

---

## 2. AI/ML Pipeline

```mermaid
graph LR
    subgraph Input["Learner Input"]
        I1["Assessment scores<br/>(vocab/grammar/fluency/comprehension)"]
        I2["Score history<br/>(time series)"]
        I3["Clinical text<br/>(patient notes)"]
        I4["Specialty + difficulty"]
    end

    subgraph Preprocess["Preprocessing"]
        P1["Feature scaling<br/>StandardScaler"]
        P2["Lag features + rolling stats<br/>+ sin/cos seasonality"]
        P3["Tokenization + regex<br/>+ medical dictionary"]
    end

    subgraph Models["Model Layer"]
        ML["Proficiency Classifier<br/>RandomForest + XGBoost<br/>6 CEFR classes (A1–C2)"]
        DL["Acquisition Forecaster<br/>LightGBM + softmax attention<br/>over recent lags"]
        NLP["NLP Analyzer<br/>rule-based grammar +<br/>dictionary NER (ICD-10)"]
        SLM["SLM / GenAI<br/>LLM (GLM-4-Plus)<br/>structured medical prompts"]
    end

    subgraph Safety["Safety Screening"]
        S1["Toxicity filter<br/>40 patterns"]
        S2["Diagnosis restriction<br/>13 patterns"]
        S3["Hallucination confidence<br/>hedging + dictionary hit"]
        S4["Disclaimer injection"]
    end

    subgraph Output["Output"]
        O1["CEFR level + recommendations"]
        O2["Forecast + mastery prediction"]
        O3["Grammar errors + entities + score"]
        O4["Scenarios + quizzes + case studies"]
        O5["Safety verdict + confidence"]
    end

    I1 --> P1 --> ML --> O1
    I2 --> P2 --> DL --> O2
    I3 --> P3 --> NLP --> O3
    I4 --> SLM --> S1 & S2 & S3 & S4 --> O4 & O5
    ML -->|"explainability"| Explain["SHAP contributions"]
    DL -->|"explainability"| Explain2["Attention weights"]
```

---

## 3. RAG / Retrieval Flow (Medical Knowledge)

```mermaid
sequenceDiagram
    participant L as Learner
    participant API as FastAPI
    participant NLP as NLP Service
    participant KB as Medical Knowledge Base
    participant LLM as LLM :3003
    participant S as Safety Layer

    L->>API: POST /slm/explain {term: "myocardial infarction"}
    API->>KB: lookup term in medical dictionary
    KB-->>API: definition + related terms + examples
    API->>LLM: generate contextual explanation (structured prompt)
    LLM-->>API: explanation text
    API->>S: screen(text) — toxicity + diagnosis + hallucination
    S-->>API: {verdict: safe, confidence: 0.82, disclaimer}
    API->>API: inject disclaimer if missing
    API-->>L: {explanation, examples, related_terms, safety: {verdict, confidence}}
```

---

## 4. Database Schema (ER Diagram)

```mermaid
erDiagram
    users ||--o{ learning_sessions : "user_id"
    users ||--o{ agent_logs : "learner_id"

    users {
        int id PK
        string username UK
        string email UK
        string hashed_password
        string role
        string specialty
        datetime created_at
        bool is_active
    }
    learning_sessions {
        int id PK
        int user_id FK
        string type
        text input
        text output
        int latency_ms
        datetime created_at
    }
    agent_logs {
        int id PK
        string learner_id
        string task
        string current_level
        string target_level
        string specialty
        int steps_count
        string status
        int total_latency_ms
        text steps
        text final_answer
        datetime created_at
    }
    model_metrics {
        int id PK
        string model
        float accuracy
        float f1
        float rmse
        int latency_ms
        int calls
        float error_rate
        string status
        datetime updated_at
    }
```

---

## 5. Agentic AI Workflow (ReAct Tutor)

```mermaid
sequenceDiagram
    participant L as Learner
    participant API as FastAPI
    participant A as Agent Service
    participant LLM as LLM :3003
    participant T as Tools (5)
    participant S as Safety Layer
    participant DB as Database

    L->>API: POST /agent/tutor {learner_id, current_level, target_level, specialty}
    API->>A: run_agent(task, ctx)

    loop 5 guided steps (assess → recommend → generate → schedule → milestones)
        A->>LLM: generate thought for action
        LLM-->>A: thought sentence
        A->>T: execute tool(action_input)
        T-->>A: observation
        A->>A: append to history
    end

    A->>LLM: compose final learning-path summary
    LLM-->>A: final answer
    A->>S: screen(final_answer)
    S-->>A: {verdict, confidence, disclaimer}
    A->>DB: persist agent_log
    A-->>API: {learning_path, steps[], final_answer, safety, tools_used}
    API-->>L: 200 JSON
```

---

## 6. API Gateway / Request Flow

```mermaid
graph LR
    subgraph Browser
        SPA["SPA<br/>fetch('/papi/v1/assess/proficiency')"]
    end
    subgraph "Next.js :3000"
        RH["Route Handler<br/>/papi/v1/[...path]"]
    end
    subgraph "FastAPI :8000"
        MW["Middleware<br/>CORS · logging · rate-limit"]
        Auth["Auth Dep<br/>JWT verify"]
        Router["Router<br/>/assess/proficiency"]
        Service["Service<br/>proficiency_service"]
        Safety["Safety check<br/>(if LLM output)"]
    end
    subgraph "LLM :3003"
        LLM["z-ai SDK<br/>GLM-4-Plus"]
    end
    subgraph Data
        DB[("SQLite")]
    end

    SPA -->|"HTTP POST"| RH
    RH -->|"localhost:8000<br/>stream body"| MW
    MW --> Auth --> Router --> Service
    Service -->|"LLM call"| LLM
    LLM -->|"response"| Service
    Service --> Safety
    Service -->|"persist"| DB
    Service -->|"JSON"| Router --> MW --> RH --> SPA
```

---

## 7. AI Safety Pipeline (Medical-Grade Guardrails)

```mermaid
graph TB
    Input["LLM Response"] --> Check1{"Toxicity filter<br/>40 patterns?"}
    Check1 -->|"match"| Block["BLOCK<br/>replace with safe fallback"]
    Check1 -->|"clean"| Check2{"Diagnosis restriction?<br/>13 patterns"}
    Check2 -->|"diagnosis attempt"| Block
    Check2 -->|"educational"| Check3{"Hallucination<br/>confidence score"}
    Check3 -->|"score < 0.3"| Warn["WARNING<br/>flag low confidence"]
    Check3 -->|"score >= 0.3"| Safe["SAFE"]
    Warn --> Disclaimer["Inject medical disclaimer"]
    Safe --> Disclaimer
    Disclaimer --> Output["{verdict, confidence, reasons, disclaimer, filtered_text}"]
    Block --> Output
```

---

## 8. Explainability Architecture (Trust Layer)

```mermaid
graph TB
    subgraph "Proficiency Explainability"
        PI["Learner Input<br/>7 features"] --> PM["Trained RF/XGB<br/>feature_importances_"]
        PM --> SHAP["SHAP-style contributions<br/>importance × scaled_value × direction"]
        SHAP --> NL1["Natural language<br/>'comprehension score of 80<br/>strongly supports B2'"]
    end
    subgraph "Acquisition Explainability"
        HI["Score History"] --> AM["LightGBM + Attention"]
        AM --> ATT["Attention weights<br/>softmax over recent lags"]
        ATT --> NL2["'Days 8-10 most influenced<br/>the forecast (weight 0.34)'"]
    end
    subgraph "Recommendation Reasoning"
        RI["Input gaps + thresholds"] --> REC["Per-recommendation 'why'<br/>feature_importance % + gap vs threshold"]
        REC --> NL3["'Focus on grammar — 24% importance,<br/>13 pts below B2 threshold'"]
    end
    NL1 & NL2 & NL3 --> UI["Explainability Dashboard<br/>SHAP chart + attention chart<br/>+ reasoning list"]
```

---

## 9. Deployment Topology

```mermaid
graph TB
    subgraph "Single Host (Sandbox)"
        Caddy["Caddy :81<br/>TLS termination"] --> NextJS["Next.js :3000<br/>SPA + API proxy"]
        Caddy --> LLM["LLM :3003<br/>z-ai SDK"]
        NextJS -->|"localhost:8000"| FastAPI["FastAPI :8000<br/>ML + Safety + Explainability"]
        FastAPI --> LLM
        FastAPI --> DB[("SQLite")]
    end

    subgraph "Production (Target)"
        LB["Load Balancer<br/>+ TLS"] --> FE["Frontend nginx ×N<br/>serves SPA"]
        LB --> BE["FastAPI ×N<br/>stateless workers"]
        BE --> PG[("PostgreSQL")]
        BE --> Redis[("Redis cache")]
        BE -.-> LLMPool["LLM service pool"]
        BE -.-> S3["S3 (uploads)"]
        BE -.-> Prom["Prometheus + Grafana"]
    end
```

---

## 10. Component Interaction (C4 Level 3)

```mermaid
graph TB
    subgraph "MediLingua Backend Services"
        ProfSvc["proficiency_service"] --> Reg["model_registry"]
        AcqSvc["acquisition_service"] --> Reg
        NlpSvc["nlp_service"] --> Dict["medical dictionary"]
        SlmSvc["slm_service"] --> LLMC["llm_client"]
        GenSvc["genai_service"] --> LLMC
        AgentSvc["agent_service"] --> LLMC
        AgentSvc --> ProfSvc
        AgentSvc --> GenSvc
        SlmSvc --> Safety["safety_service"]
        GenSvc --> Safety
        AgentSvc --> Safety
        LLMC -->|"http://localhost:3003"| LLMSvc["LLM :3003"]
        ExplSvc["explainability_service"] --> Reg
        Metrics["metrics_service"] -.->|"records"| All["all routers"]
    end
```
