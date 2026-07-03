"""SLM (Medical Scenario Generator) service — Level 4.

Uses the local LLM service for scenario/explain/converse with templated
fallback responses when the LLM is unavailable.
"""
from __future__ import annotations
import asyncio
import re
import time
from typing import Any

from ..core.logging import logger
from .llm_client import llm_client
from .safety_service import safety_service
from .model_registry import registry


SYSTEM_PROMPT = (
    "You are MediLingua, a specialized language tutor for medical professionals. "
    "You generate realistic medical scenarios, explain medical terminology clearly, "
    "and help non-native English-speaking clinicians improve patient communication. "
    "Always be clinically accurate, use plain language for explanations, and keep "
    "responses focused and structured."
)


# Fallback scenario templates per specialty
_SCENARIO_TEMPLATES = {
    "cardiology": (
        "You are a cardiologist seeing a 58-year-old male, Mr. J., who presents with "
        "intermittent chest tightness over the past 3 days, worsening on exertion. "
        "He has a 30-pack-year smoking history and a family history of coronary artery disease. "
        "Vital signs: BP 152/94 mmHg, HR 88 bpm, SpO2 96% on room air. "
        "An ECG shows non-specific ST-T changes. Your task: take a focused history, "
        "explain your differential diagnosis to the patient in plain language, and "
        "outline your next diagnostic steps."
    ),
    "neurology": (
        "You are a neurologist seeing a 42-year-old female, Ms. K., who reports "
        "a 2-week history of episodic throbbing headaches with photophobia and nausea. "
        "Each episode lasts 4-6 hours. She has no prior history but her mother had migraines. "
        "Neurologic exam is unremarkable. Your task: take a thorough headache history, "
        "discuss your diagnostic impression, and explain your management plan in plain language."
    ),
    "pediatrics": (
        "You are a pediatrician seeing a 4-year-old boy, Liam, brought by his mother "
        "for a 2-day history of fever (38.7°C), decreased appetite, and a sore throat. "
        "He is up to date on vaccinations. On exam, the tonsils are enlarged with exudates "
        "and tender cervical lymphadenopathy. Your task: explain your assessment to the mother, "
        "discuss the differential, and outline your treatment plan in family-friendly language."
    ),
    "emergency": (
        "You are an emergency physician receiving a 67-year-old female, Mrs. P., via "
        "ambulance. She is diaphoretic, pale, and complains of crushing substernal chest "
        "pain radiating to her left arm. BP 88/52, HR 122, SpO2 92%. An ECG shows ST-elevation "
        "in leads II, III, aVF. Your task: rapidly assess, communicate with the patient and her "
        "family, and explain the urgency of the situation in clear language."
    ),
    "general": (
        "You are a primary care physician seeing a 45-year-old patient for an annual physical. "
        "The patient mentions feeling 'tired all the time' for the past month despite adequate "
        "sleep. They have no significant past medical history and take no medications. "
        "Your task: take a focused history, discuss your initial work-up, and explain "
        "lifestyle modifications that may help."
    ),
}

_TERMINOLOGY_BANK = {
    "cardiology": [
        ("myocardial infarction", "Heart attack; death of heart muscle from blocked blood supply.",
         "An ST-elevation myocardial infarction requires immediate reperfusion."),
        ("angina pectoris", "Chest pain caused by reduced blood flow to the heart.",
         "Stable angina typically occurs with exertion and relieves with rest."),
        ("hypertension", "Persistently elevated blood pressure above 130/80 mmHg.",
         "Stage 2 hypertension requires both lifestyle and pharmacologic management."),
    ],
    "neurology": [
        ("migraine", "Recurrent moderate-to-severe headache, often with photophobia and nausea.",
         "Migraine with aura may precede the headache with visual disturbances."),
        ("photophobia", "Increased sensitivity to light.",
         "Photophobia is a common feature of migraine and meningitis."),
        ("aura", "Transient neurologic symptom that precedes a headache or seizure.",
         "Visual aura may present as scintillating scotomas."),
    ],
    "pediatrics": [
        ("tonsillitis", "Inflammation of the tonsils, often due to viral or bacterial infection.",
         "Group A strep tonsillitis is treated with a 10-day penicillin course."),
        ("exudate", "Fluid containing pus, proteins, and cells that leaks from vessels.",
         "Tonsillar exudates suggest bacterial infection."),
        ("fever", "Body temperature above 38°C (100.4°F).",
         "Fever in children under 3 months warrants urgent evaluation."),
    ],
    "emergency": [
        ("ST-elevation", "ECG finding suggesting acute myocardial infarction.",
         "ST-elevation in II, III, aVF indicates inferior wall involvement."),
        ("reperfusion", "Restoration of blood flow to ischemic tissue.",
         "Reperfusion therapy should be initiated within 90 minutes of arrival."),
        ("diaphoretic", "Excessively sweating.",
         "The diaphoretic patient with chest pain is presumed to be having an MI until proven otherwise."),
    ],
    "general": [
        ("fatigue", "Persistent tiredness not relieved by rest.",
         "Fatigue lasting over 6 months warrants evaluation for underlying causes."),
        ("anemia", "Reduced red blood cells or hemoglobin.",
         "Iron-deficiency anemia is the most common cause worldwide."),
        ("hypothyroidism", "Underactive thyroid gland producing too little hormone.",
         "Hypothyroidism often presents with fatigue, weight gain, and cold intolerance."),
    ],
}

_QUESTION_BANK = {
    "patient_consultation": [
        "What open-ended questions would you ask to take a focused history?",
        "How would you explain your differential diagnosis to the patient in plain language?",
        "What follow-up instructions would you give at the end of the visit?",
    ],
    "case_discussion": [
        "What are the key clinical findings that guide your diagnosis?",
        "Which differential diagnoses would you consider and why?",
        "What additional investigations would help confirm the diagnosis?",
    ],
    "emergency_response": [
        "What is your immediate stabilization plan?",
        "How would you prioritize your actions in the first 5 minutes?",
        "How would you communicate the urgency to the patient and family?",
    ],
    "differential_diagnosis": [
        "What is your leading differential and why?",
        "Which differentials must not be missed?",
        "What features would point toward each alternative diagnosis?",
    ],
}


# ----------------------- explain -----------------------
_TERM_EXPLANATIONS = {
    "hypertension": (
        "Hypertension is persistently elevated arterial blood pressure, defined as a systolic pressure of 130 mmHg "
        "or higher or a diastolic pressure of 80 mmHg or higher. It is a major risk factor for stroke, myocardial "
        "infarction, heart failure, and chronic kidney disease. Most cases are primary (essential), with no "
        "identifiable cause; secondary causes include renal artery stenosis and endocrine disorders.",
        ["Mr. R, 55, with BP 158/96 — started on lisinopril and lifestyle modifications.",
         "Ms. T, 32, with new severe hypertension — evaluated for secondary causes."],
        ["blood pressure", "antihypertensive", "essential hypertension", "hypertensive crisis"],
    ),
    "myocardial infarction": (
        "A myocardial infarction (heart attack) occurs when blood flow to part of the heart muscle is blocked long "
        "enough to cause tissue death. It is usually caused by rupture of an atherosclerotic plaque with thrombus "
        "formation in a coronary artery. ST-elevation MI (STEMI) requires emergent reperfusion via percutaneous "
        "coronary intervention or fibrinolysis.",
        ["An ST-elevation MI treated with primary PCI within 60 minutes of arrival.",
         "A non-ST-elevation MI managed with antiplatelets and anticoagulation before catheterization."],
        ["coronary artery disease", "ST-elevation", "reperfusion", "troponin"],
    ),
    "asthma": (
        "Asthma is a chronic inflammatory airway disease characterized by reversible bronchoconstriction, leading "
        "to episodes of wheezing, breathlessness, chest tightness, and cough. Triggers include allergens, "
        "respiratory infections, exercise, and cold air. Management combines inhaled corticosteroids and "
        "bronchodilators.",
        ["A 9-year-old with exercise-induced wheeze controlled with a short-acting beta-agonist.",
         "An adult with persistent symptoms started on a low-dose inhaled corticosteroid."],
        ["bronchoconstriction", "bronchodilator", "inhaled corticosteroid", "spirometry"],
    ),
}


# ----------------------- converse -----------------------
_CONVERSE_FALLBACK = (
    "Thank you for your message. As your language tutor, I recommend structuring your response using "
    "the SBAR framework — Situation, Background, Assessment, Recommendation. This keeps clinical "
    "communication clear and concise. Could you try rephrasing your statement with that structure?"
)


class SlmService:
    """Singleton SLM service — uses LLM client with templated fallbacks."""

    def __init__(self) -> None:
        self.model_name: str = "TinyLlama-1.1B-Q4"
        self.quantization: str = "Q4_0 GGUF"
        self.size_mb: int = 670
        self.avg_latency: float = 0.0
        self._call_count: int = 0
        self._latency_sum: float = 0.0

    def _track_latency(self, latency_ms: float) -> None:
        self._call_count += 1
        self._latency_sum += latency_ms
        self.avg_latency = self._latency_sum / self._call_count

    def status(self) -> dict:
        return {
            "model": self.model_name,
            "quantization": self.quantization,
            "size_mb": self.size_mb,
            "avg_latency_ms": round(self.avg_latency, 1),
            "calls": self._call_count,
            "status": "loaded" if llm_client.is_available() else "fallback_mode",
        }

    # ----------------------- scenario -----------------------
    def generate_scenario(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        specialty = payload.get("specialty", "general")
        difficulty = payload.get("difficulty", "intermediate")
        scenario_type = payload.get("scenario_type", "patient_consultation")

        # --- RAG grounding: retrieve relevant medical-communication
        # knowledge chunks and inject them into the LLM prompt. ---
        rag_context = ""
        rag_sources: list[dict] = []
        try:
            rag = registry.rag
            rag_sources = rag.retrieve(
                f"{specialty} {scenario_type.replace('_', ' ')}", top_k=3
            )
            if rag_sources:
                rag_context = "\n\n".join(
                    f"Knowledge [{i + 1}] ({s['category']}): {s['text']}"
                    for i, s in enumerate(rag_sources)
                )
        except Exception as e:
            logger.warning(f"SLM scenario RAG retrieval failed: {e}")

        # Try LLM
        scenario_text = ""
        terminology: list[dict] = []
        questions: list[str] = []

        try:
            prompt = (
                f"Generate a {difficulty} medical role-play scenario for a {specialty} specialist "
                f"in a {scenario_type.replace('_', ' ')} context.\n\n"
            )
            if rag_context:
                prompt += (
                    f"Use the following retrieved medical-communication knowledge "
                    f"to ground the scenario, terminology, and questions:\n"
                    f"{rag_context}\n\n"
                )
            prompt += (
                f"Respond EXACTLY in this format (one section per line, use the literal markers):\n"
                f"SCENARIO: <3-5 sentence patient presentation with age, complaint, key vitals/exam findings>\n"
                f"TERMS:\n"
                f"- TERM: <term> | DEF: <one-sentence definition> | EXAMPLE: <one example sentence>\n"
                f"- TERM: <term> | DEF: <one-sentence definition> | EXAMPLE: <one example sentence>\n"
                f"- TERM: <term> | DEF: <one-sentence definition> | EXAMPLE: <one example sentence>\n"
                f"QUESTIONS:\n"
                f"- <question 1>\n- <question 2>\n- <question 3>\n"
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=600))
            if llm_resp and len(llm_resp) > 80:
                scenario_text, terminology, questions = self._parse_scenario_llm(llm_resp, specialty)
        except Exception as e:
            logger.warning(f"SLM scenario LLM call failed: {e}")

        # Fallback to template
        if not scenario_text:
            scenario_text = _SCENARIO_TEMPLATES.get(specialty, _SCENARIO_TEMPLATES["general"])
            if difficulty == "advanced":
                scenario_text += " The patient also has multiple comorbidities that complicate management."
            elif difficulty == "beginner":
                scenario_text = scenario_text.replace("non-specific ST-T changes", "minor ECG changes")
        if not terminology:
            terms = _TERMINOLOGY_BANK.get(specialty, _TERMINOLOGY_BANK["general"])
            terminology = [{"term": t, "definition": d, "example": ex} for t, d, ex in terms]
        if not questions:
            questions = _QUESTION_BANK.get(scenario_type, _QUESTION_BANK["patient_consultation"])

        latency_ms = int((time.perf_counter() - t0) * 1000)
        self._track_latency(latency_ms)
        # Safety screening — screen the scenario text + terminology examples.
        screened = safety_service.screen(scenario_text, context="slm")
        scenario_text = screened["filtered_text"]
        # Also screen each terminology example (lightweight)
        for term_item in terminology:
            ex_screen = safety_service.screen(term_item.get("example", ""), context="slm")
            term_item["example"] = ex_screen["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "scenario": scenario_text.strip(),
            "terminology": terminology,
            "questions": questions,
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
            "rag_sources": rag_sources,
        }

    def _parse_scenario_llm(self, text: str, specialty: str) -> tuple[str, list[dict], list[str]]:
        """Best-effort parse of LLM response."""
        scenario = text
        terms: list[dict] = []
        questions: list[str] = []

        def _split_lines_items(block: str) -> list[str]:
            items: list[str] = []
            for line in re.split(r"[\n\r]+", block):
                line = line.strip().lstrip("-*•0123456789. ").strip()
                if line:
                    items.append(line)
            if len(items) <= 1:
                joined = " ".join(items) if items else block
                sub = re.split(r"(?:^|\s)\d+[)\.\)]\s+", joined)
                sub = [s.strip().rstrip(".") for s in sub if s.strip()]
                if len(sub) > 1:
                    items = sub
            return items

        # Split by section markers
        if "SCENARIO:" in text:
            parts = re.split(r"SCENARIO:|TERMS:|QUESTIONS:", text, flags=re.IGNORECASE)
            if len(parts) >= 2:
                scenario = parts[1].strip()
            if len(parts) >= 3:
                # Parse terms — support both "TERM: x | DEF: y | EXAMPLE: z" and "- term: def. example."
                for line in re.split(r"[\n\r]+", parts[2]):
                    line = line.strip().lstrip("-*•0123456789. ").strip()
                    if not line:
                        continue
                    # New pipe-delimited format
                    if "TERM:" in line and "|" in line:
                        seg = dict(re.findall(r"(TERM|DEF|EXAMPLE):\s*([^|]+)", line))
                        if seg.get("TERM"):
                            terms.append({
                                "term": seg["TERM"].strip(),
                                "definition": seg.get("DEF", "").strip(),
                                "example": seg.get("EXAMPLE", "").strip(),
                            })
                    # Legacy colon format
                    elif ":" in line:
                        t, rest = line.split(":", 1)
                        if "." in rest:
                            d, ex = rest.split(".", 1)
                        else:
                            d, ex = rest, ""
                        terms.append({
                            "term": t.strip(),
                            "definition": d.strip(),
                            "example": ex.strip(),
                        })
                    if len(terms) >= 5:
                        break
            if len(parts) >= 4:
                questions = _split_lines_items(parts[3])[:5]
        # If parsing yielded nothing usable, fall back
        if not terms:
            terms_bank = _TERMINOLOGY_BANK.get(specialty, _TERMINOLOGY_BANK["general"])
            terms = [{"term": t, "definition": d, "example": ex} for t, d, ex in terms_bank]
        if not questions:
            questions = _QUESTION_BANK.get("patient_consultation")
        return scenario, terms, questions

    # ----------------------- explain -----------------------
    def explain(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        term = (payload.get("term") or "").strip()
        specialty = payload.get("specialty", "general")

        explanation = ""
        examples: list[str] = []
        related: list[str] = []

        # Try LLM first
        try:
            prompt = (
                f"Explain the medical term '{term}' for a non-native English speaker studying {specialty}. "
                f"Provide: a clear 2-3 sentence explanation, 2 example sentences using the term in clinical "
                f"context, and 3 related terms. Format as: EXPLANATION: ...\\nEXAMPLES: ...\\nRELATED: ..."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=400))
            if llm_resp and len(llm_resp) > 50:
                explanation, examples, related = self._parse_explain_llm(llm_resp, term)
        except Exception as e:
            logger.warning(f"SLM explain LLM failed: {e}")

        # Fallback
        if not explanation:
            cached = _TERM_EXPLANATIONS.get(term.lower())
            if cached:
                explanation, examples, related = cached
            else:
                explanation = (
                    f"'{term}' is a medical term used in the field of {specialty}. While a detailed definition "
                    f"is not available in the offline cache, you can look it up in a medical dictionary or "
                    f"ask your instructor for a clinical example. Generally, mastering such terms improves "
                    f"both clinical communication and chart documentation accuracy."
                )
                examples = [
                    f"The patient was diagnosed with {term} and started on appropriate treatment.",
                    f"Documentation of {term} in the medical record ensures continuity of care.",
                ]
                related = ["clinical terminology", "patient assessment", "medical documentation"]

        latency_ms = int((time.perf_counter() - t0) * 1000)
        self._track_latency(latency_ms)
        # Safety screening — screen the explanation text
        screened = safety_service.screen(explanation, context="slm")
        explanation = screened["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "term": term,
            "explanation": explanation.strip(),
            "examples": examples,
            "related_terms": related,
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
        }

    def _parse_explain_llm(self, text: str, term: str) -> tuple[str, list[str], list[str]]:
        explanation = text
        examples: list[str] = []
        related: list[str] = []

        def _split_items(block: str, max_n: int, by_comma: bool = False) -> list[str]:
            items: list[str] = []
            for line in re.split(r"[\n\r]+", block):
                line = line.strip().lstrip("-*•0123456789. ").strip()
                if line:
                    items.append(line)
                if len(items) >= max_n:
                    break
            if len(items) <= 1:
                joined = " ".join(items) if items else block
                if by_comma:
                    sub = [s.strip().rstrip(".") for s in re.split(r"[,;]", joined) if s.strip()]
                else:
                    sub = re.split(r"(?:^|\s)\d+[)\.\)]\s+", joined)
                    sub = [s.strip().rstrip(".") for s in sub if s.strip()]
                if len(sub) > 1:
                    items = sub[:max_n]
            return items

        if "EXPLANATION:" in text:
            parts = re.split(r"EXPLANATION:|EXAMPLES:|RELATED:", text, flags=re.IGNORECASE)
            if len(parts) >= 2:
                explanation = parts[1].strip()
            if len(parts) >= 3:
                examples = _split_items(parts[2], 3, by_comma=False)
            if len(parts) >= 4:
                related = _split_items(parts[3], 4, by_comma=True)
        if not examples:
            examples = [f"The patient was diagnosed with {term} and treated appropriately."]
        if not related:
            related = [term]
        return explanation, examples, related

    # ----------------------- converse -----------------------
    def converse(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        message = (payload.get("message") or "").strip()
        context = (payload.get("context") or "").strip()
        specialty = payload.get("specialty", "general")

        response = ""
        try:
            prompt = (
                f"A {specialty} learner practicing English says: \"{message}\". "
                f"Context: {context or 'general practice conversation'}. "
                f"As their language tutor, respond conversationally, point out any grammar or word-choice "
                f"issues (max 3 corrections), and suggest 2 alternative phrasings. "
                f"Format as: RESPONSE: ...\\nCORRECTIONS: ...\\nSUGGESTIONS: ..."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=400))
            if llm_resp and len(llm_resp) > 30:
                response, corrections, suggestions = self._parse_converse_llm(llm_resp)
        except Exception as e:
            logger.warning(f"SLM converse LLM failed: {e}")

        if not response:
            response = _CONVERSE_FALLBACK
            corrections = []
            suggestions = [
                "Could you describe the patient's symptoms in your own words?",
                "What questions would you ask to clarify the situation?",
            ]

        latency_ms = int((time.perf_counter() - t0) * 1000)
        self._track_latency(latency_ms)
        # Safety screening — screen the conversational response
        screened = safety_service.screen(response, context="slm")
        response = screened["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "response": response.strip(),
            "corrections": corrections,
            "suggestions": suggestions,
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
        }

    def _parse_converse_llm(self, text: str) -> tuple[str, list[str], list[str]]:
        response = text
        corrections: list[str] = []
        suggestions: list[str] = []

        def _split_items(block: str, max_n: int) -> list[str]:
            items: list[str] = []
            for line in re.split(r"[\n\r]+", block):
                line = line.strip().lstrip("-*•0123456789. ").strip()
                if line:
                    items.append(line)
                if len(items) >= max_n:
                    break
            if len(items) <= 1:
                joined = " ".join(items) if items else block
                sub = re.split(r"(?:^|\s)\d+[)\.\)]\s+", joined)
                sub = [s.strip().rstrip(".") for s in sub if s.strip()]
                if len(sub) > 1:
                    items = sub[:max_n]
            return items

        if "RESPONSE:" in text:
            parts = re.split(r"RESPONSE:|CORRECTIONS:|SUGGESTIONS:", text, flags=re.IGNORECASE)
            if len(parts) >= 2:
                response = parts[1].strip()
            if len(parts) >= 3:
                corrections = _split_items(parts[2], 3)
            if len(parts) >= 4:
                suggestions = _split_items(parts[3], 3)
        if not corrections:
            corrections = ["None — your message is well-formed."]
        if not suggestions:
            suggestions = ["Try rephrasing using SBAR: Situation, Background, Assessment, Recommendation."]
        return response, corrections, suggestions
