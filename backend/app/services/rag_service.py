"""RAG (Retrieval-Augmented Generation) Service — Medical Knowledge Base.

Implements the RAG pipeline required by the GenAI & Data Science Specialization
Framework (PDF Day 8: "RAG, Vector DBs & Prompt Engineering").

Pipeline:
  1. Knowledge Base — 60+ curated medical-communication knowledge chunks.
  2. Chunking       — uploaded text/JSON is split into ~3-sentence chunks
                       with a 1-sentence overlap.
  3. Embeddings     — sklearn TfidfVectorizer (max_features=5000,
                       ngram_range=(1,2)) + TruncatedSVD(64 dims) +
                       L2-normalize. NO sentence-transformers (not installed).
  4. Vector store   — FAISS IndexFlatIP (inner product == cosine on normalized
                       vectors).
  5. Retrieval      — retrieve(query, top_k) returns chunks with cosine scores.
  6. Synthesis      — query(query, top_k) retrieves top-k chunks, then calls
                       the LLM client with the retrieved context + the question.
                       Falls back to a templated answer when the LLM is offline.

Public API:
    svc.retrieve(query, top_k=3) -> list[dict]
    await svc.query(query, top_k=3) -> dict  # {answer, sources, retrieval_confidence, chunks_used, latency_ms}
    svc.add_document(filename, text) -> int  # returns chunk count
    svc.list_documents() -> list[dict]
    svc.delete_document(document_id) -> bool
"""
from __future__ import annotations
import asyncio
import json
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np

from ..core.logging import logger
from .llm_client import llm_client


# --------------------------------------------------------------------------- #
# Curated Knowledge Base — ~60 chunks across 10 categories.
# Each entry is a short (2-4 sentence) paragraph.
# --------------------------------------------------------------------------- #
_DEFAULT_KB: list[tuple[str, str]] = [
    # ---- Cardiology terminology ----
    ("cardiology", "Myocardial infarction, commonly called a heart attack, occurs when blood flow to part of the heart muscle is blocked long enough to cause tissue death. It is usually caused by rupture of an atherosclerotic plaque with thrombus formation in a coronary artery. ST-elevation MI requires emergent reperfusion via percutaneous coronary intervention or fibrinolysis."),
    ("cardiology", "Angina pectoris is chest pain or discomfort caused by reduced blood flow to the heart muscle, typically triggered by exertion and relieved by rest. Stable angina follows a predictable pattern, while unstable angina occurs at rest or worsens over time and is a medical emergency. Patients describe the discomfort as crushing pressure or squeezing rather than sharp pain."),
    ("cardiology", "Hypertension is persistently elevated arterial blood pressure, defined as a systolic pressure of 130 mmHg or higher or a diastolic pressure of 80 mmHg or higher. It is a major modifiable risk factor for stroke, myocardial infarction, heart failure, and chronic kidney disease. Most cases are primary (essential) with no identifiable cause; secondary causes include renal artery stenosis and endocrine disorders."),
    ("cardiology", "Atrial fibrillation is the most common sustained cardiac arrhythmia, characterized by disorganized electrical activity in the atria leading to an irregularly irregular ventricular response. It significantly increases the risk of thromboembolic stroke. Management includes rate control, rhythm control, and anticoagulation guided by the CHA2DS2-VASc score."),
    ("cardiology", "Heart failure is a clinical syndrome in which the heart cannot pump enough blood to meet the body's metabolic needs. It may be systolic (reduced ejection fraction) or diastolic (preserved ejection fraction with impaired relaxation). Common symptoms include dyspnea on exertion, orthopnea, paroxysmal nocturnal dyspnea, and peripheral edema."),
    ("cardiology", "Coronary artery disease is caused by atherosclerotic plaque buildup in the coronary arteries, reducing blood supply to the heart muscle. It typically presents as angina or myocardial infarction but may be asymptomatic until a critical event occurs. Risk factors include hypertension, hyperlipidemia, diabetes, smoking, and family history."),

    # ---- Neurology terminology ----
    ("neurology", "Migraine is a recurrent moderate-to-severe headache, often unilateral and pulsating, frequently accompanied by photophobia, phonophobia, nausea, and visual aura. Attacks last 4 to 72 hours and may be triggered by stress, sleep disturbance, hormonal changes, or specific foods. Acute treatment uses triptans and NSAIDs; prophylaxis includes beta-blockers, topiramate, or amitriptyline."),
    ("neurology", "Ischemic stroke occurs when a cerebral artery is occluded by thrombus or embolus, leading to focal neurologic deficits corresponding to the affected territory. Time is brain: reperfusion with intravenous thrombolytics within 4.5 hours of symptom onset, or mechanical thrombectomy for large-vessel occlusion, improves outcomes. The FAST acronym (Face, Arm, Speech, Time) helps the public recognize stroke."),
    ("neurology", "Epilepsy is a chronic neurologic disorder characterized by recurrent unprovoked seizures. Seizures are classified as focal or generalized based on their origin and spread. Treatment is primarily antiseizure medications tailored to seizure type and patient comorbidities; drug-resistant cases may benefit from epilepsy surgery or neuromodulation."),
    ("neurology", "Parkinson's disease is a progressive neurodegenerative disorder marked by loss of dopaminergic neurons in the substantia nigra. The classic motor tetrad is resting tremor, bradykinesia, rigidity, and postural instability. Treatment combines levodopa-based therapy, dopamine agonists, and physical therapy; deep brain stimulation is an option for advanced disease."),
    ("neurology", "Meningitis is inflammation of the meninges, usually due to infection but also from autoimmune or neoplastic causes. The classic triad is fever, neck stiffness, and altered mental status, though not all patients present with all three. Bacterial meningitis is a medical emergency requiring prompt empiric antibiotics after blood cultures are drawn."),

    # ---- Pediatrics terminology ----
    ("pediatrics", "Fever in infants under three months of age (rectal temperature 38°C or higher) warrants urgent evaluation regardless of how well the baby appears. A full sepsis workup including blood, urine, and cerebrospinal fluid cultures is often indicated. Empiric intravenous antibiotics are started while awaiting culture results."),
    ("pediatrics", "Group A streptococcal pharyngitis presents with sudden-onset sore throat, fever, tonsillar exudate, tender cervical lymphadenopathy, and absence of cough. The Centor criteria help estimate the probability of strep infection. A positive rapid antigen test or throat culture confirms the diagnosis; treatment is a 10-day course of penicillin or amoxicillin to prevent rheumatic fever."),
    ("pediatrics", "Childhood vaccination follows a schedule recommended by national health authorities to protect against preventable diseases such as measles, polio, diphtheria, and pertussis. Contraindications are rare and include severe allergic reaction to a previous dose or component. Mild side effects such as low-grade fever or local tenderness are common and self-limited."),
    ("pediatrics", "Asthma is the most common chronic disease of childhood, characterized by episodic wheezing, breathlessness, chest tightness, and cough. Triggers include viral infections, allergens, exercise, and cold air. Management combines inhaled corticosteroids for long-term control and short-acting bronchodilators for acute symptoms."),
    ("pediatrics", "Neonatal jaundice is yellowing of the skin and sclera in newborns due to elevated unconjugated bilirubin, usually appearing on the second or third day of life. Most cases are physiologic and resolve without intervention, but high levels require phototherapy to prevent kernicterus. Risk factors include prematurity, blood group incompatibility, and breastfeeding failure."),

    # ---- Emergency terminology ----
    ("emergency", "The ABCDE approach — Airway, Breathing, Circulation, Disability, Exposure — is a systematic method for the initial assessment and stabilization of critically ill or injured patients. It prioritizes life-threatening problems in order of immediate threat. The primary survey is followed by a secondary survey once the patient is stable."),
    ("emergency", "Acute coronary syndrome encompasses unstable angina, non-ST-elevation myocardial infarction, and ST-elevation myocardial infarction. Immediate management includes aspirin, nitroglycerin, oxygen if hypoxic, morphine for pain, and dual antiplatelet therapy. STEMI requires emergent reperfusion with primary PCI within 90 minutes of first medical contact."),
    ("emergency", "Sepsis is a life-threatening organ dysfunction caused by a dysregulated host response to infection. Early recognition and the Surviving Sepsis Campaign bundle — lactate measurement, blood cultures, broad-spectrum antibiotics, intravenous fluids, and vasopressors — improve survival. The SOFA score is used to quantify organ dysfunction."),
    ("emergency", "Anaphylaxis is a severe, rapid-onset systemic allergic reaction that can be fatal within minutes. Common triggers include foods, medications, insect stings, and latex. Immediate intramuscular epinephrine into the anterolateral thigh is the first-line treatment; antihistamines and corticosteroids are adjunctive only."),
    ("emergency", "Trauma triage uses physiological and anatomical criteria to identify patients who should be transported to a trauma center. The Glasgow Coma Scale quantifies level of consciousness based on eye, verbal, and motor responses. A score of 8 or less indicates coma and generally requires airway protection."),

    # ---- Patient communication best practices ----
    ("communication", "Active listening means giving the patient your full attention, using verbal and non-verbal cues to show engagement, and reflecting back what you heard before responding. It builds trust, surfaces concerns the patient may be hesitant to share, and reduces the chance of misunderstandings. Avoid interrupting: studies show physicians redirect patients within the first 11 to 18 seconds of a consultation."),
    ("communication", "Empathy in clinical communication is the ability to understand and acknowledge the patient's emotional state. Phrases such as 'That sounds really difficult' or 'I can see how worrying this must be' validate feelings without making promises about outcomes. Empathic communication is associated with better patient satisfaction, adherence, and clinical outcomes."),
    ("communication", "Plain-language explanations replace medical jargon with everyday words the patient can understand. Instead of 'myocardial infarction,' say 'heart attack'; instead of 'hypertension,' say 'high blood pressure.' Aim for a reading level around the 6th to 8th grade, and check comprehension using the teach-back method: ask the patient to explain the plan back to you in their own words."),
    ("communication", "The teach-back method is a communication technique in which the clinician asks the patient to repeat back, in their own words, what was just explained. It is not a test of the patient but a check of how well the clinician explained things. If the patient cannot teach it back accurately, the clinician explains again using different words."),
    ("communication", "Open-ended questions begin with 'what,' 'how,' 'tell me about,' or 'describe' and invite the patient to share information in their own words. They contrast with closed yes/no questions, which are useful for confirming specific details. Beginning the consultation with open-ended questions lets the patient tell their story without interruption."),
    ("communication", "Breaking bad news follows the SPIKES protocol: Setting, Perception, Invitation, Knowledge, Emotions, Strategy and Summary. The clinician prepares the environment, asks what the patient already knows, asks how much they want to know, shares the news in plain language, acknowledges emotions, and agrees on a plan. The goal is to inform while preserving hope and the therapeutic relationship."),
    ("communication", "Motivational interviewing is a counseling style that helps patients resolve ambivalence about behavior change. Core principles are expressing empathy, developing discrepancy, rolling with resistance, and supporting self-efficacy. Open-ended questions, affirmations, reflections, and summaries — the OARS skills — are its core toolkit."),
    ("communication", "Cultural humility in clinical communication means approaching each patient with curiosity about their beliefs, values, and practices rather than assuming knowledge of their culture. It involves self-reflection on the clinician's own biases, asking rather than assuming, and respecting the patient's explanatory model of illness. It is a lifelong process, not a checklist."),

    # ---- Clinical documentation guidelines ----
    ("documentation", "A SOAP note organizes a clinical encounter into four sections: Subjective (the patient's reported history), Objective (examination findings and test results), Assessment (the differential and working diagnosis), and Plan (treatment, investigations, and follow-up). SOAP notes provide a clear, structured record that supports continuity of care and medicolegal documentation."),
    ("documentation", "Discharge instructions should be written in plain language at a 6th to 8th grade reading level and reviewed verbally with the patient before they leave. Include the diagnosis in simple terms, medications with dose and schedule, warning signs that should prompt return, follow-up appointments, and a contact number. Use teach-back to confirm understanding."),
    ("documentation", "The SBAR framework — Situation, Background, Assessment, Recommendation — is a structured communication tool for clinical handovers and interprofessional consultations. Situation states what is happening now; Background gives relevant history; Assessment is the clinician's interpretation; Recommendation states what is needed. SBAR reduces communication errors during transitions of care."),
    ("documentation", "Clinical documentation should be timely, accurate, and complete. Document the history of present illness, pertinent positives and negatives, examination findings, assessment, and plan. Avoid copy-paste without updating, which can propagate errors. Every entry should be dated, timed, and signed; amendments should be made as addenda, not by deleting prior text."),
    ("documentation", "Medication reconciliation is the process of comparing the patient's current medications with the medications being prescribed at a transition of care — admission, transfer, or discharge. The goal is to prevent errors of omission, duplication, dosing mistakes, and drug interactions. The list should include prescription drugs, over-the-counter medications, supplements, and herbal remedies."),

    # ---- Cultural competence ----
    ("cultural", "Cultural competence in medical communication involves understanding how a patient's cultural background shapes their beliefs about health, illness, and treatment. Clinicians should ask about the patient's explanatory model: What do you call this problem? What do you think caused it? How does it affect you? What treatment do you think would help?"),
    ("cultural", "Limited English proficiency patients have a legal right to a qualified medical interpreter in many jurisdictions. Family members, especially children, should not be used as interpreters except in genuine emergencies. Speak directly to the patient, not the interpreter, and use short, simple sentences. Document the interpreter's name and ID in the chart."),
    ("cultural", "Health literacy is the degree to which a patient can obtain, process, and understand basic health information needed to make decisions. Low health literacy is common and is associated with worse outcomes. Use plain language, limit each encounter to three key messages, and provide written materials at an appropriate reading level."),
    ("cultural", "Religious and cultural beliefs may influence patients' decisions about blood products, end-of-life care, diet, and the role of family in decision-making. For example, Jehovah's Witnesses generally refuse blood transfusions, and some Muslim patients may prefer same-sex clinicians. Ask respectfully, document preferences, and involve chaplaincy or cultural brokers when needed."),
    ("cultural", "Implicit bias — unconscious attitudes that affect understanding and decisions — can contribute to disparities in pain treatment, diagnostic testing, and referrals. Strategies to mitigate bias include awareness training, standardized protocols, longer consultation times, and consciously individualizing each patient encounter."),

    # ---- Grammar patterns in medical English ----
    ("grammar", "Passive voice is common in medical writing because the actor (the clinician) is often less important than the procedure or finding. For example, 'The patient was administered 325 mg of aspirin' emphasizes the intervention rather than who gave it. Use passive voice for procedural descriptions and methods; use active voice for instructions and direct patient communication."),
    ("grammar", "Conditional tenses are used to discuss hypothetical or uncertain clinical scenarios. The second conditional — 'If the patient were hypotensive, we would administer fluids' — describes a hypothetical present situation. The third conditional — 'If the antibiotics had been started earlier, the outcome might have been different' — discusses a hypothetical past event."),
    ("grammar", "Hedging language softens claims and is common in academic and clinical writing. Words such as 'may,' 'might,' 'could,' 'appears to,' 'suggests,' 'is associated with,' and 'is likely to' signal uncertainty. Hedging is appropriate when evidence is limited, but excessive hedging can obscure the message. Balance precision with appropriate caution."),
    ("grammar", "Modal verbs — can, could, may, might, must, shall, should, will, would — express possibility, necessity, permission, or recommendation. In medical English, 'should' often indicates a recommendation, 'must' indicates an obligation, and 'may' indicates permission or possibility. 'The patient should be monitored closely' is a recommendation; 'The patient must be monitored continuously' is an obligation."),
    ("grammar", "Reported speech is used when summarizing what a patient said. Tense usually shifts back: 'I have chest pain' becomes 'He said he had chest pain.' Pronouns and time references also shift: 'I will see you tomorrow' becomes 'She said she would see me the next day.' Accurate reporting is essential for documentation and handovers."),
    ("grammar", "Latin and Greek abbreviations are common in medical English: 'bid' (bis in die, twice a day), 'qid' (quater in die, four times a day), 'po' (per os, by mouth), 'prn' (pro re nata, as needed), and 'stat' (statim, immediately). Misinterpretation of abbreviations is a known cause of medication errors; many institutions now restrict their use in orders."),

    # ---- CEFR level descriptors for medical English ----
    ("cefr", "At CEFR A1, a medical professional can understand very basic medical phrases and use simple greetings and introductions. They can recognize common medical signs and labels and ask simple personal questions. Communication requires significant support from interlocutors."),
    ("cefr", "At CEFR A2, a medical professional can handle short social exchanges and understand sentences about routine clinical matters. They can describe their work in simple terms and complete basic forms. Communication is limited to familiar, everyday situations."),
    ("cefr", "At CEFR B1, a medical professional can understand the main points of clear standard medical communication and deal with most situations likely to arise in routine practice. They can write simple connected text on familiar topics and describe experiences and events."),
    ("cefr", "At CEFR B2, a medical professional can interact with fluency and spontaneity that makes regular interaction with native speakers quite possible. They can understand complex medical texts, present detailed descriptions, and explain a viewpoint on a clinical issue giving advantages and disadvantages."),
    ("cefr", "At CEFR C1, a medical professional can express ideas fluently and spontaneously, use language flexibly for social and professional purposes, and produce clear, well-structured text on complex medical subjects. They can understand implicit meaning in clinical documents and discussions."),
    ("cefr", "At CEFR C2, a medical professional can understand with ease virtually everything heard or read in a medical context. They can summarize information from different sources, reconstruct arguments, and express themselves precisely in the most complex professional situations."),

    # ---- Specialty-specific communication tips ----
    ("specialty", "In cardiology consultations, focus on translating risk-factor modification into concrete, achievable behaviors. Rather than saying 'reduce your cardiovascular risk,' say 'walk for 30 minutes five days a week, take your statin every evening, and check your blood pressure twice a week.' Use a heart diagram to explain the location and mechanism of disease."),
    ("specialty", "In neurology, patients with cognitive impairment or stroke may have aphasia that affects comprehension and expression. Use short sentences, yes/no questions, and visual aids. Allow extra time, and confirm understanding with teach-back. Involve speech and language therapy for comprehensive communication assessment."),
    ("specialty", "In pediatrics, communication involves both the child and the parents. Address the child by name and at eye level, use age-appropriate language, and explain what you are about to do before doing it. Engage parents as partners in care and acknowledge their expertise on their own child."),
    ("specialty", "In emergency settings, communication must be rapid, clear, and structured. Use closed-loop communication: the leader gives an order, the receiver repeats it back, and the leader confirms. State medications, doses, and routes explicitly. Brief the team at the start and debrief at the end of each case."),
    ("specialty", "In oncology, communication often involves complex decisions about treatment options, prognosis, and goals of care. Use the SPIKES protocol for delivering bad news and ask-tell-ask cycles to share information. Discuss prognosis honestly while leaving room for hope, and offer palliative care involvement early in the trajectory."),
    ("specialty", "In geriatrics, address sensory impairments by reducing background noise, facing the patient, speaking clearly but not shouting, and ensuring hearing aids are in place. Allow extra time for the consultation and confirm understanding with teach-back. Involve caregivers while respecting the patient's autonomy."),
    ("specialty", "In psychiatry, establish a safe, non-judgmental environment and use open-ended questions to explore the patient's experience. Validate emotions before problem-solving, and avoid arguing with delusional beliefs. Assess risk for self-harm and harm to others directly and calmly, and document the assessment thoroughly."),
    ("specialty", "In surgery, informed consent requires explaining the proposed procedure, its alternatives, and its risks in language the patient understands. Use diagrams when helpful, and confirm understanding with teach-back. Document the discussion, including the specific risks discussed and the patient's decision."),
]


# --------------------------------------------------------------------------- #
# Sentence-based chunker for uploaded documents.
# --------------------------------------------------------------------------- #
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"\u201C])")


def _split_sentences(text: str) -> list[str]:
    """Best-effort sentence splitter."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    sents = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    return sents


def chunk_text(text: str, target_sentences: int = 3, overlap: int = 1) -> list[str]:
    """Split text into ~3-sentence chunks with a 1-sentence overlap.

    Falls back to a single chunk for short texts.
    """
    sents = _split_sentences(text)
    if not sents:
        return []
    if len(sents) <= target_sentences:
        return [" ".join(sents)]
    chunks: list[str] = []
    step = max(1, target_sentences - overlap)
    i = 0
    while i < len(sents):
        chunk = " ".join(sents[i:i + target_sentences])
        if chunk.strip():
            chunks.append(chunk)
        if i + target_sentences >= len(sents):
            break
        i += step
    return chunks


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #
class RagService:
    """Retrieval-augmented generation service over a medical knowledge base.

    Singleton — holds the in-memory chunk store, embeddings, and FAISS index.
    """

    # Embedding hyper-parameters
    TFIDF_MAX_FEATURES = 5000
    TFIDF_NGRAM_RANGE = (1, 2)
    SVD_COMPONENTS = 64

    def __init__(self) -> None:
        self._lock = threading.RLock()
        # Chunk store: list of dicts {chunk_id, text, category, document_id, document_filename}
        self._chunks: list[dict] = []
        # Document store: dict[document_id] -> {id, filename, chunks, uploaded_at, source}
        self._documents: dict[str, dict] = {}
        # Embedding artifacts
        self._vectorizer = None
        self._svd = None
        self._index = None                        # faiss.IndexFlatIP
        self._embeddings: np.ndarray | None = None  # (N, 64) L2-normalized
        # Stats
        self._call_count: int = 0
        self._latency_sum: float = 0.0
        self._last_query_latency_ms: float = 0.0
        self._seeded: bool = False

    # ------------------------------------------------------------------ #
    # Seed
    # ------------------------------------------------------------------ #
    def seed(self) -> int:
        """Seed the default knowledge base. Returns the chunk count added."""
        with self._lock:
            if self._seeded:
                return 0
            # Add the seed KB as a single "document"
            doc_id = "seed_kb"
            self._documents[doc_id] = {
                "id": doc_id,
                "filename": "MediLingua Seed Knowledge Base",
                "chunks": 0,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "source": "seed",
            }
            for category, text in _DEFAULT_KB:
                chunk = {
                    "chunk_id": len(self._chunks),
                    "text": text,
                    "category": category,
                    "document_id": doc_id,
                    "document_filename": "MediLingua Seed Knowledge Base",
                }
                self._chunks.append(chunk)
                self._documents[doc_id]["chunks"] += 1
            self._seeded = True
            self._rebuild_index()
            logger.info(
                f"RAG seed complete: {len(self._chunks)} chunks across "
                f"{len(self._documents)} document(s)."
            )
            return len(self._chunks)

    # ------------------------------------------------------------------ #
    # Embedding pipeline
    # ------------------------------------------------------------------ #
    def _rebuild_index(self) -> None:
        """Refit the TF-IDF + SVD pipeline and rebuild the FAISS index."""
        with self._lock:
            if not self._chunks:
                self._vectorizer = None
                self._svd = None
                self._index = None
                self._embeddings = None
                return
            try:
                import faiss
                from sklearn.feature_extraction.text import TfidfVectorizer
                from sklearn.decomposition import TruncatedSVD
            except Exception as e:
                logger.error(f"RAG: failed to import faiss/sklearn: {e}")
                return

            texts = [c["text"] for c in self._chunks]
            # Cap SVD components to (min(n_chunks, n_features) - 1)
            n_comp = min(self.SVD_COMPONENTS, max(2, len(texts) - 1))
            try:
                self._vectorizer = TfidfVectorizer(
                    max_features=self.TFIDF_MAX_FEATURES,
                    ngram_range=self.TFIDF_NGRAM_RANGE,
                    stop_words="english",
                    sublinear_tf=True,
                )
                tfidf = self._vectorizer.fit_transform(texts)
                self._svd = TruncatedSVD(
                    n_components=n_comp,
                    random_state=42,
                    algorithm="randomized",
                )
                reduced = self._svd.fit_transform(tfidf).astype(np.float32)
            except Exception as e:
                logger.error(f"RAG: TF-IDF/SVD fit failed: {e}")
                return

            # L2 normalize — makes inner product == cosine similarity
            norms = np.linalg.norm(reduced, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            reduced = reduced / norms

            self._embeddings = reduced
            dim = reduced.shape[1]
            self._index = faiss.IndexFlatIP(dim)
            self._index.add(reduced)

    def _embed_query(self, query: str) -> np.ndarray | None:
        if self._vectorizer is None or self._svd is None:
            return None
        try:
            tfidf = self._vectorizer.transform([query])
            vec = self._svd.transform(tfidf).astype(np.float32)
            norm = np.linalg.norm(vec)
            if norm == 0:
                return None
            return vec / norm
        except Exception as e:
            logger.warning(f"RAG: query embedding failed: {e}")
            return None

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def retrieve(self, query: str, top_k: int = 3) -> list[dict]:
        """Retrieve the top-k most relevant knowledge chunks for a query.

        Returns a list of dicts (most relevant first):
            {chunk_id, text, score, rank, document_id, document_filename, category}
        """
        if not query or not query.strip():
            return []
        with self._lock:
            if not self._chunks or self._index is None:
                # Best-effort: rebuild if somehow not built
                if self._chunks and self._index is None:
                    self._rebuild_index()
                if self._index is None:
                    return []
            qvec = self._embed_query(query)
            if qvec is None:
                return []
            k = min(top_k, len(self._chunks))
            scores, indices = self._index.search(qvec, k)
        out: list[dict] = []
        for rank, (idx, score) in enumerate(zip(indices[0].tolist(), scores[0].tolist())):
            if idx < 0 or idx >= len(self._chunks):
                continue
            chunk = self._chunks[idx]
            # Cosine similarity via inner product of normalized vectors;
            # clamp to [0, 1] for display.
            s = float(score)
            if s < 0.0:
                s = 0.0
            elif s > 1.0:
                s = 1.0
            out.append({
                "chunk_id": chunk["chunk_id"],
                "text": chunk["text"],
                "score": round(s, 4),
                "rank": rank + 1,
                "document_id": chunk["document_id"],
                "document_filename": chunk["document_filename"],
                "category": chunk.get("category", "general"),
            })
        return out

    async def query(self, query: str, top_k: int = 3) -> dict:
        """End-to-end RAG: retrieve relevant chunks, then synthesize an answer
        via the LLM client. Falls back to a templated answer if the LLM is
        unavailable.

        Returns:
            {answer, sources, retrieval_confidence, chunks_used, latency_ms,
             model, llm_used}
        """
        t0 = time.perf_counter()
        self._call_count += 1
        # --- Step 1: retrieve ---
        sources = self.retrieve(query, top_k=top_k)
        chunks_used = len(sources)
        if chunks_used > 0:
            scores = [s["score"] for s in sources]
            retrieval_confidence = round(sum(scores) / len(scores), 4)
        else:
            retrieval_confidence = 0.0

        # --- Step 2: synthesize ---
        context_text = "\n\n".join(
            f"[{i + 1}] (score={s['score']:.3f}, category={s['category']}) {s['text']}"
            for i, s in enumerate(sources)
        )
        llm_used = False
        answer = ""
        try:
            if llm_client.is_available() and sources:
                prompt = (
                    "You are MediLingua's medical knowledge assistant. Use ONLY the "
                    "retrieved context below to answer the learner's question. If the "
                    "context does not contain the answer, say you don't have enough "
                    "information and suggest what to look up. Always append the medical "
                    "disclaimer if you give clinical information.\n\n"
                    f"Retrieved context:\n{context_text}\n\n"
                    f"Learner question: {query}\n\n"
                    "Answer in 2-4 sentences, in plain language suitable for a non-native "
                    "English-speaking medical professional. Cite sources by their bracket "
                    "numbers [1], [2], etc. when relevant."
                )
                system = (
                    "You are MediLingua, a specialized tutor for medical professionals "
                    "learning English. You answer using only the retrieved context. You "
                    "are clinically accurate and use plain language. Always remind the "
                    "user that content is for educational purposes only."
                )
                llm_resp = await llm_client.chat(prompt, system=system, max_tokens=400)
                if llm_resp and len(llm_resp) > 30:
                    answer = llm_resp.strip()
                    llm_used = True
        except Exception as e:
            logger.warning(f"RAG query LLM call failed: {e}")
            answer = ""

        # --- Step 3: fallback answer ---
        if not answer:
            if sources:
                top = sources[0]
                answer = (
                    f"Based on the medical communication knowledge base "
                    f"({top['category']}): {top['text']} "
                    "This content is for educational purposes only. Always consult a "
                    "licensed medical professional for clinical decisions."
                )
            else:
                answer = (
                    "I don't have enough information in the medical communication "
                    "knowledge base to answer that question. Please try rephrasing "
                    "your query or upload additional knowledge via the Documents panel."
                )

        latency_ms = int((time.perf_counter() - t0) * 1000)
        self._latency_sum += latency_ms
        self._last_query_latency_ms = latency_ms
        return {
            "answer": answer,
            "sources": sources,
            "retrieval_confidence": retrieval_confidence,
            "chunks_used": chunks_used,
            "latency_ms": latency_ms,
            "model": "TF-IDF + SVD(64) + FAISS IndexFlatIP",
            "llm_used": llm_used,
        }

    # ------------------------------------------------------------------ #
    # Document management
    # ------------------------------------------------------------------ #
    def add_document(self, filename: str, text: str, category: str = "user_upload") -> int:
        """Add a new document (text or JSON) to the KB.

        Splits the text into ~3-sentence chunks with 1-sentence overlap, then
        rebuilds the embedding index. Returns the number of chunks added.
        """
        if not filename or not filename.strip():
            filename = f"upload_{int(time.time())}.txt"
        # If the text looks like JSON, extract any text fields
        text = text or ""
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                # Concatenate common text-bearing fields
                parts = []
                for k in ("text", "content", "body", "abstract", "description", "title"):
                    v = parsed.get(k)
                    if isinstance(v, str) and v.strip():
                        parts.append(v)
                # Also join any nested string values
                if not parts:
                    for v in parsed.values():
                        if isinstance(v, str) and v.strip():
                            parts.append(v)
                if parts:
                    text = "\n\n".join(parts)
            elif isinstance(parsed, list):
                parts = []
                for item in parsed:
                    if isinstance(item, str):
                        parts.append(item)
                    elif isinstance(item, dict):
                        for k in ("text", "content", "body", "abstract", "description"):
                            v = item.get(k)
                            if isinstance(v, str) and v.strip():
                                parts.append(v)
                if parts:
                    text = "\n\n".join(parts)
        except Exception:
            # Not JSON — treat as plain text
            pass

        chunks = chunk_text(text, target_sentences=3, overlap=1)
        if not chunks:
            return 0

        with self._lock:
            doc_id = f"doc_{uuid.uuid4().hex[:10]}"
            self._documents[doc_id] = {
                "id": doc_id,
                "filename": filename,
                "chunks": len(chunks),
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "source": "user",
            }
            for chunk_text_str in chunks:
                self._chunks.append({
                    "chunk_id": len(self._chunks),
                    "text": chunk_text_str,
                    "category": category,
                    "document_id": doc_id,
                    "document_filename": filename,
                })
            self._rebuild_index()
            logger.info(
                f"RAG: added document '{filename}' (id={doc_id}, "
                f"{len(chunks)} chunks). Total chunks: {len(self._chunks)}."
            )
            return len(chunks)

    def list_documents(self) -> list[dict]:
        """Return document metadata, sorted by upload time (newest first)."""
        with self._lock:
            docs = list(self._documents.values())
        docs.sort(key=lambda d: d.get("uploaded_at", ""), reverse=True)
        return docs

    def delete_document(self, document_id: str) -> bool:
        """Delete a document (and all its chunks) by id. Returns True if found.

        The seed KB (`id=seed_kb`) cannot be deleted — it is the curated
        baseline. The router raises a 403 in that case.
        """
        with self._lock:
            if document_id == "seed_kb":
                return False
            if document_id not in self._documents:
                return False
            # Remove chunks belonging to this document
            before = len(self._chunks)
            self._chunks = [c for c in self._chunks if c["document_id"] != document_id]
            # Re-number chunk_ids sequentially
            for i, c in enumerate(self._chunks):
                c["chunk_id"] = i
            del self._documents[document_id]
            self._rebuild_index()
            logger.info(
                f"RAG: deleted document id={document_id}. "
                f"Removed {before - len(self._chunks)} chunks."
            )
            return True

    # ------------------------------------------------------------------ #
    # Stats
    # ------------------------------------------------------------------ #
    def stats(self) -> dict:
        return {
            "total_chunks": len(self._chunks),
            "total_documents": len(self._documents),
            "call_count": self._call_count,
            "avg_latency_ms": round(self._latency_sum / self._call_count, 1) if self._call_count else 0.0,
            "last_query_latency_ms": self._last_query_latency_ms,
            "embedding_dim": self.SVD_COMPONENTS,
            "vector_store": "FAISS IndexFlatIP",
            "seeded": self._seeded,
        }


# --------------------------------------------------------------------------- #
# Singleton
# --------------------------------------------------------------------------- #
rag_service = RagService()
