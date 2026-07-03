/* ============================================================
   data.js — Embedded MediLingua fallback data.
   Assigned to window.__STATIC_DATA__ BEFORE api.js loads so the
   SPA is fully usable when the FastAPI backend is unreachable.
   All shapes match API_CONTRACT.md exactly.
   ============================================================ */
(function () {
  const now = new Date();
  function ts(minAgo) { return new Date(now.getTime() - minAgo * 60000).toISOString(); }

  window.__STATIC_DATA__ = {

    /* ---------- /health ---------- */
    health: {
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: 28540,
      models: {
        proficiency: 'loaded',
        tracker: 'loaded',
        analyzer: 'ready',
        slm: 'loaded',
        genai: 'ready',
        agent: 'ready'
      },
      database: 'connected',
      llm_service: 'connected'
    },

    /* ---------- /metrics ---------- */
    metrics: {
      api_usage: {
        total_requests: 1284,
        requests_per_min: 3.42,
        success_rate: 0.9982
      },
      latency: { p50_ms: 14.5, p95_ms: 38.2, p99_ms: 812.6 },
      error_rate: 0.0018,
      model_metrics: [
        { model: 'Proficiency RF + XGB', accuracy: 0.892, f1: 0.871, rmse: 0.0, latency_ms: 12, calls: 86, error_rate: 0.0, status: 'healthy' },
        { model: 'Tracker Attention-LSTM', accuracy: 0.0, f1: 0.0, rmse: 4.1, latency_ms: 18, calls: 64, error_rate: 0.0, status: 'healthy' },
        { model: 'Analyzer spaCy + TF-IDF', accuracy: 0.918, f1: 0.904, rmse: 0.0, latency_ms: 15, calls: 142, error_rate: 0.0, status: 'healthy' },
        { model: 'SLM TinyLlama-1.1B-Q4', accuracy: 0.0, f1: 0.0, rmse: 0.0, latency_ms: 1820, calls: 98, error_rate: 0.0, status: 'healthy' },
        { model: 'GenAI GPT-4o-mini', accuracy: 0.0, f1: 0.0, rmse: 0.0, latency_ms: 2210, calls: 76, error_rate: 0.0, status: 'healthy' },
        { model: 'Agentic ReAct Tutor', accuracy: 0.0, f1: 0.0, rmse: 0.0, latency_ms: 1042, calls: 41, error_rate: 0.0, status: 'healthy' }
      ],
      system: { cpu_percent: 18.4, memory_percent: 41.2, disk_percent: 23.7 },
      endpoints: [
        { path: '/api/v1/health', calls: 312, avg_latency_ms: 11.2, error_rate: 0.0 },
        { path: '/api/v1/metrics', calls: 88, avg_latency_ms: 5.4, error_rate: 0.0 },
        { path: '/api/v1/predictions', calls: 92, avg_latency_ms: 7.8, error_rate: 0.0 },
        { path: '/api/v1/assess/proficiency', calls: 86, avg_latency_ms: 12.4, error_rate: 0.0 },
        { path: '/api/v1/track/acquisition', calls: 64, avg_latency_ms: 18.6, error_rate: 0.0 },
        { path: '/api/v1/analyze/communication', calls: 142, avg_latency_ms: 14.9, error_rate: 0.0 },
        { path: '/api/v1/slm/scenario', calls: 36, avg_latency_ms: 1860, error_rate: 0.0 },
        { path: '/api/v1/slm/explain', calls: 32, avg_latency_ms: 1640, error_rate: 0.0 },
        { path: '/api/v1/slm/converse', calls: 30, avg_latency_ms: 2010, error_rate: 0.0 },
        { path: '/api/v1/genai/case-study', calls: 28, avg_latency_ms: 2180, error_rate: 0.0 },
        { path: '/api/v1/genai/quiz', calls: 24, avg_latency_ms: 2240, error_rate: 0.0 },
        { path: '/api/v1/genai/simulation', calls: 24, avg_latency_ms: 2210, error_rate: 0.0 },
        { path: '/api/v1/agent/tutor', calls: 41, avg_latency_ms: 1042, error_rate: 0.0 },
        { path: '/api/v1/agent/logs', calls: 39, avg_latency_ms: 6.1, error_rate: 0.0 }
      ],
      time_series: Array.from({ length: 24 }, (_, i) => ({
        timestamp: ts((23 - i) * 60),
        requests: 8 + Math.round(Math.sin(i / 3) * 5 + Math.random() * 12),
        latency_ms: 12 + Math.sin(i / 2) * 4 + Math.random() * 18,
        errors: Math.random() < 0.08 ? 1 : 0
      })).reverse()
    },

    /* ---------- /predictions ---------- */
    predictions: {
      predictions: [
        { id: 'p_1042', type: 'assessment', input: { vocabulary: 78, grammar: 65, fluency: 72, specialty: 'cardiology' }, output: 'level=B2 confidence=0.89', latency_ms: 12, created_at: ts(3) },
        { id: 'p_1041', type: 'tracking', input: { horizon: 30, history_length: 14 }, output: 'forecast=30d, days_to_C1=45', latency_ms: 18, created_at: ts(8) },
        { id: 'p_1040', type: 'nlp', input: 'Patient presents with chest pain...', output: 'score=72, 2 grammar errors', latency_ms: 15, created_at: ts(14) },
        { id: 'p_1039', type: 'slm', input: { specialty: 'emergency', type: 'patient_consultation' }, output: 'scenario generated, 4 terms', latency_ms: 1820, created_at: ts(22) },
        { id: 'p_1038', type: 'genai', input: { specialty: 'pediatrics', topic: 'vaccination' }, output: '5 quiz questions', latency_ms: 2240, created_at: ts(31) },
        { id: 'p_1037', type: 'agent', input: { task: 'Design learning path', level: 'B1→C1' }, output: '5 steps, 30 days', latency_ms: 1042, created_at: ts(48) },
        { id: 'p_1036', type: 'assessment', input: { vocabulary: 85, grammar: 80, fluency: 76, specialty: 'neurology' }, output: 'level=C1 confidence=0.82', latency_ms: 11, created_at: ts(67) },
        { id: 'p_1035', type: 'nlp', input: 'The patient was discharged with antibiotics.', output: 'score=88, 0 grammar errors', latency_ms: 14, created_at: ts(92) }
      ]
    },

    /* ---------- /agent/logs ---------- */
    agent_logs: {
      logs: [
        { id: 'al_014', learner_id: 'L001', task: 'Design learning path', current_level: 'B1', target_level: 'C1', specialty: 'cardiology', steps_count: 5, status: 'completed', total_latency_ms: 1042, created_at: ts(48) },
        { id: 'al_013', learner_id: 'L004', task: 'Review weak areas', current_level: 'A2', target_level: 'B1', specialty: 'emergency', steps_count: 4, status: 'completed', total_latency_ms: 856, created_at: ts(180) },
        { id: 'al_012', learner_id: 'L002', task: 'Design learning path', current_level: 'B2', target_level: 'C1', specialty: 'pediatrics', steps_count: 5, status: 'completed', total_latency_ms: 920, created_at: ts(320) },
        { id: 'al_011', learner_id: 'L007', task: 'Plan fluency drills', current_level: 'B1', target_level: 'B2', specialty: 'neurology', steps_count: 3, status: 'completed', total_latency_ms: 612, created_at: ts(540) },
        { id: 'al_010', learner_id: 'L001', task: 'Refresh medical vocabulary', current_level: 'B1', target_level: 'B2', specialty: 'cardiology', steps_count: 4, status: 'completed', total_latency_ms: 768, created_at: ts(1240) }
      ]
    },

    /* ---------- /auth/me ---------- */
    auth_me: {
      id: 1,
      username: 'admin',
      email: 'admin@medilingua.local',
      role: 'admin',
      specialty: 'cardiology'
    },

    /* ---------- POST /auth/login ---------- */
    auth_login: {
      access_token: 'medilingua.demo.token.admin',
      token_type: 'bearer',
      user: { id: 1, username: 'admin', email: 'admin@medilingua.local', role: 'admin', specialty: 'cardiology' }
    },

    /* ---------- POST /assess/proficiency ---------- */
    assess_example: {
      level: 'B2',
      level_numeric: 4,
      cefr_scale: { A1: 0.02, A2: 0.05, B1: 0.15, B2: 0.45, C1: 0.28, C2: 0.05 },
      confidence: 0.89,
      recommendations: [
        { area: 'Grammar', priority: 'High', action: 'Focus on medical conditional tenses and passive voice in case reports.' },
        { area: 'Vocabulary', priority: 'Medium', action: 'Expand cardiology terminology — ischemic, arrhythmia, anticoagulation.' },
        { area: 'Fluency', priority: 'Medium', action: 'Practice patient consultation role-plays with simulated dialogue.' }
      ],
      feature_importance: [
        { feature: 'comprehension_score', importance: 0.28 },
        { feature: 'vocabulary_score', importance: 0.24 },
        { feature: 'fluency_score', importance: 0.19 },
        { feature: 'grammar_score', importance: 0.14 },
        { feature: 'exercises_completed', importance: 0.09 },
        { feature: 'study_hours', importance: 0.04 },
        { feature: 'days_active', importance: 0.02 }
      ],
      model: 'RandomForest + XGBoost',
      latency_ms: 12
    },

    /* ---------- POST /track/acquisition ---------- */
    track_example: {
      forecast: Array.from({ length: 30 }, (_, i) => {
        const base = 81 + i * 0.45;
        const noise = (i % 3 === 0 ? -1.2 : 0.6);
        return { day: i + 1, score: Math.round((base + noise) * 10) / 10, lower: Math.round((base - 5) * 10) / 10, upper: Math.round((base + 5) * 10) / 10 };
      }),
      mastery_prediction: { target_level: 'C1', days_to_mastery: 45, probability: 0.72 },
      optimal_intervention: { type: 'intensive_practice', focus_area: 'grammar', expected_boost: 8.5 },
      metrics: { mae: 3.2, rmse: 4.1, r2: 0.88 },
      model: 'Attention-LSTM (lag features + LightGBM)',
      latency_ms: 18
    },

    /* ---------- POST /analyze/communication ---------- */
    analyzer_example: {
      grammar_errors: [
        { error: 'Subject-verb agreement', position: 'present', correction: 'presents', severity: 'medium' },
        { error: 'Missing article', position: 'with chest pain', correction: 'with a history of chest pain', severity: 'low' }
      ],
      sentiment: { label: 'Neutral', score: 0.82 },
      medical_entities: [
        { text: 'chest pain', type: 'SYMPTOM', icd_hint: 'R07.9' },
        { text: 'shortness of breath', type: 'SYMPTOM', icd_hint: 'R06.02' }
      ],
      readability: { score: 62.5, grade_level: '10th grade', clarity: 'good' },
      feedback: "The sentence has a subject-verb agreement error. 'Patient' is singular, so use 'presents'. Consider adding context for the symptom onset.",
      suggestions: [
        'The patient presents with chest pain and shortness of breath.',
        'The patient presents with a two-day history of chest pain and shortness of breath.'
      ],
      communication_score: 72,
      model: 'spaCy + TF-IDF + rule-based',
      latency_ms: 15
    },

    /* ---------- POST /slm/scenario ---------- */
    slm_scenario: {
      scenario: "You are a cardiologist seeing a 58-year-old male patient who presents with chest pain that started 2 hours ago, radiating to the left arm, associated with diaphoresis and shortness of breath. His vital signs are: BP 156/94, HR 102, RR 22, SpO2 95% on room air. The patient has a history of hypertension and a 30-pack-year smoking history.",
      terminology: [
        { term: 'myocardial infarction', definition: 'Death of cardiac muscle cells due to prolonged ischemia.', example: 'ST-elevation myocardial infarction (STEMI) requires immediate reperfusion.' },
        { term: 'diaphoresis', definition: 'Excessive sweating, often a sign of sympathetic activation in acute coronary syndromes.', example: 'The patient was pale and diaphoretic on arrival.' },
        { term: 'reperfusion therapy', definition: 'Restoration of blood flow to ischemic tissue, typically via PCI or thrombolysis.', example: 'Door-to-balloon time for reperfusion should be under 90 minutes.' }
      ],
      questions: [
        'What initial investigations would you order?',
        'How would you explain the diagnosis to the patient in plain language?',
        'What are the time-critical interventions for a suspected STEMI?'
      ],
      model: 'TinyLlama-1.1B-Q4',
      latency_ms: 1820
    },

    /* ---------- POST /slm/explain ---------- */
    slm_explain: {
      term: 'myocardial infarction',
      explanation: 'Myocardial infarction (MI), commonly known as a heart attack, occurs when blood flow to a portion of the heart muscle is severely reduced or stopped, resulting in necrosis of cardiac tissue. It is most often caused by rupture of an atherosclerotic plaque with subsequent thrombus formation in a coronary artery.',
      examples: [
        'The patient was admitted with an acute ST-elevation myocardial infarction.',
        'Early reperfusion reduced the size of the myocardial infarction.',
        'Troponin I elevation confirmed the diagnosis of myocardial infarction.'
      ],
      related_terms: ['ischemia', 'reperfusion', 'STEMI', 'NSTEMI', 'coronary artery disease', 'troponin'],
      model: 'TinyLlama-1.1B-Q4',
      latency_ms: 1640
    },

    /* ---------- POST /slm/converse ---------- */
    slm_converse: {
      response: "That's a great question. In the case of a suspected myocardial infarction, the first step is to obtain a 12-lead ECG within 10 minutes of arrival. You would also order cardiac troponins, complete blood count, and basic metabolic panel. While waiting for results, administer aspirin 325 mg chewed, oxygen if SpO2 < 90%, nitroglycerin for pain if blood pressure allows, and consider morphine for refractory pain.",
      corrections: [
        { original: 'ecg', correction: 'ECG (12-lead)', note: 'Always specify the type of ECG.' }
      ],
      suggestions: [
        'Ask about: "What if the ECG shows ST elevation?"',
        'Ask about: "How do I differentiate STEMI from NSTEMI?"',
        'Ask about: "What are the contraindications for thrombolysis?"'
      ],
      model: 'TinyLlama-1.1B-Q4',
      latency_ms: 2010
    },

    /* ---------- POST /genai/case-study ---------- */
    genai_case: {
      case_study: "A 67-year-old woman presents to the emergency department with sudden onset of severe, tearing chest pain radiating to her back. On examination, her blood pressure is 180/110 mmHg in the right arm and 140/85 mmHg in the left arm. There is a diastolic murmur at the right sternal border. Chest X-ray shows a widened mediastinum. CT angiography confirms a Stanford Type A aortic dissection.\n\nThe patient's past medical history is significant for hypertension and Marfan syndrome. She is currently on lisinopril and metoprolol. She is alert and oriented but in significant distress.",
      questions: [
        'What is the definitive treatment for a Stanford Type A dissection?',
        'Which historical eponym describes the blood pressure discrepancy seen here?',
        'What is the role of heart rate control in the acute management?',
        'How does Marfan syndrome predispose to aortic dissection?'
      ],
      learning_objectives: [
        'Recognize the clinical presentation of acute aortic dissection',
        'Differentiate Stanford Type A from Type B dissections',
        'Understand the urgency of surgical intervention in Type A dissection',
        'Identify the genetic conditions that predispose to aortic pathology'
      ],
      model: 'GPT-4o-mini',
      latency_ms: 2180
    },

    /* ---------- POST /genai/quiz ---------- */
    genai_quiz: {
      questions: [
        {
          question: 'Which vaccine is routinely recommended at the 12-month well-child visit?',
          options: ['MMR (measles, mumps, rubella)', 'HPV', 'Tdap', 'Shingles'],
          answer: 0,
          explanation: 'The MMR vaccine is given at 12-15 months with a second dose at 4-6 years. HPV starts at age 11-12, Tdap at 11-12, and Shingles at 50.'
        },
        {
          question: 'A 6-month-old presents with fever 38.5°C and irritability but no focal source. What is the most appropriate initial workup?',
          options: ['Observation only', 'CBC, urinalysis, blood culture', 'Lumbar puncture immediately', 'Discharge with antipyretics'],
          answer: 1,
          explanation: 'In infants under 90 days, a full sepsis workup is indicated. For a 6-month-old with fever without source, CBC, urinalysis, and blood culture are reasonable first-line tests.'
        },
        {
          question: 'Which congenital heart defect causes cyanosis in the first days of life?',
          options: ['Atrial septal defect', 'Ventricular septal defect', 'Transposition of the great arteries', 'Patent ductus arteriosus'],
          answer: 2,
          explanation: 'Transposition of the great arteries (TGA) is a cyanotic congenital heart defect presenting with cyanosis in the first hours to days of life as the ductus arteriosus closes.'
        },
        {
          question: 'What is the recommended first-line treatment for mild persistent asthma in children aged 5-11?',
          options: ['Oral corticosteroids daily', 'Low-dose inhaled corticosteroid', 'Long-acting beta-agonist alone', 'Leukotriene receptor antagonist alone'],
          answer: 1,
          explanation: 'Per GINA guidelines, mild persistent asthma in children is treated with daily low-dose inhaled corticosteroid plus a reliever as needed.'
        },
        {
          question: 'At what age is the first dose of the rotavirus vaccine given?',
          options: ['At birth', 'At 2 months', 'At 6 months', 'At 12 months'],
          answer: 1,
          explanation: 'The rotavirus vaccine series begins at 2 months of age. The first dose must be given by 14 weeks 6 days and the series completed by 8 months.'
        }
      ],
      model: 'GPT-4o-mini',
      latency_ms: 2240
    },

    /* ---------- POST /genai/simulation ---------- */
    genai_simulation: {
      simulation: "You are now in role as a 58-year-old patient named Mr. Robert Chen, a retired schoolteacher with a 30-year smoking history. You woke up at 3 AM with crushing substernal chest pain radiating to your left arm. You are anxious, diaphoretic, and short of breath. You have never had chest pain before. Your father died of a heart attack at age 60.\n\nRespond to the doctor's questions in character. Express concern about whether you are having a heart attack. Mention that you took antacids but they did not help. You are worried about missing your daughter's wedding next month. Wait for the doctor to ask you a question before responding.",
      model: 'GPT-4o-mini',
      latency_ms: 2210
    },

    /* ---------- POST /agent/tutor ---------- */
    agent_tutor: {
      status: 'completed',
      learning_path: {
        total_steps: 5,
        estimated_days: 30,
        focus_areas: ['grammar', 'vocabulary', 'fluency']
      },
      steps: [
        { step: 1, thought: "I need to first assess the learner's current proficiency to understand their strengths and weaknesses before designing a learning path.", action: 'assess_proficiency', action_input: { learner_id: 'L001', specialty: 'cardiology' }, observation: "Current level B1 confirmed. Weakest area: grammar (55/100). Vocabulary score 78, fluency 72, comprehension 80.", latency_ms: 120 },
        { step: 2, thought: "Given the weak grammar score, I should recommend targeted content on medical grammar patterns including passive voice and conditional tenses used in case reports.", action: 'recommend_content', action_input: { level: 'B1', focus: 'grammar', specialty: 'cardiology' }, observation: "Recommended 3 grammar modules: Passive Voice in Case Reports, Medical Conditionals, Subject-Verb Agreement in Clinical Notes. Estimated 8 hours total.", latency_ms: 45 },
        { step: 3, thought: "Now I need to generate a custom exercise set that combines grammar with cardiology vocabulary for context-relevant practice.", action: 'generate_exercise', action_input: { topic: 'cardiology_grammar', count: 10, difficulty: 'intermediate' }, observation: "Generated 10 fill-in-the-blank and rewrite exercises using authentic cardiology case contexts. Includes answer key and explanations.", latency_ms: 800 },
        { step: 4, thought: "I should schedule a sustainable practice plan that fits 30 minutes daily, alternating grammar, vocabulary, and conversation practice.", action: 'schedule_practice', action_input: { total_days: 30, daily_minutes: 30, focus_areas: ['grammar', 'vocabulary', 'fluency'] }, observation: "Schedule created: Mon/Wed/Fri grammar, Tue/Thu vocabulary, Sat conversation, Sun review. 4 milestone checkpoints at days 7, 14, 21, 30.", latency_ms: 38 },
        { step: 5, thought: "Finally, I'll set measurable milestones so the learner can track progress toward their C1 target.", action: 'set_milestones', action_input: { target_level: 'C1', days: [7, 14, 21, 30] }, observation: "Milestones set: Day 7 - Grammar score 70; Day 14 - 50 new medical terms; Day 21 - 3 simulated consultations; Day 30 - Re-assessment target B2.", latency_ms: 22 }
      ],
      final_answer: "Personalized learning path designed for B1→C1 in cardiology over 30 days. Focus areas: grammar (primary), vocabulary, and fluency. The plan includes 3 grammar modules, 10 custom cardiology-based exercises, a daily 30-minute practice schedule (alternating skills), and 4 measurable milestones with re-assessment at day 30 targeting B2. Estimated time investment: 15 hours total. Success probability: 72% based on current trajectory and intervention intensity.",
      tools_used: ['assess_proficiency', 'recommend_content', 'generate_exercise', 'schedule_practice', 'set_milestones'],
      total_latency_ms: 1025
    }

  };
})();
