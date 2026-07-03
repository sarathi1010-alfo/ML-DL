"""GenAI content generator service — Level 5.

Uses the local LLM service for case-study, quiz, and simulation generation
with structured medical-domain system prompts and templated fallbacks.
"""
from __future__ import annotations
import asyncio
import json
import re
import time
from typing import Any

from ..core.logging import logger
from .llm_client import llm_client
from .safety_service import safety_service


SYSTEM_PROMPT = (
    "You are MediLingua-GenAI, an AI that creates educational medical content "
    "for non-native English-speaking healthcare professionals. Your content must be "
    "clinically accurate, pedagogically sound, and culturally sensitive. Always structure "
    "your response exactly as requested using the provided format markers."
)


# ----------------------- case study fallbacks -----------------------
_CASE_STUDIES = {
    "cardiology": {
        "beginner": ("A 60-year-old male presents with substernal chest pain that started 30 minutes ago while "
                     "watching television. He describes it as a 'pressure' that radiates to his left arm. He has "
                     "hypertension and smokes 1 pack/day. BP 150/92, HR 96, SpO2 97%. ECG shows ST-elevation in "
                     "leads V2-V4."),
        "intermediate": ("A 68-year-old female with diabetes and hyperlipidemia presents with atypical chest "
                         "discomfort described as 'heartburn' that began after dinner. She is diaphoretic. "
                         "BP 100/60, HR 110. Initial troponin is mildly elevated. ECG shows non-specific changes. "
                         "She is currently on metformin, atorvastatin, and lisinopril."),
        "advanced": ("A 72-year-old male with prior CABG at age 60 presents with recurrent angina and progressive "
                     "dyspnea on exertion. Echo shows reduced LVEF (35%) and severe mitral regurgitation. He also "
                     "has CKD stage 3 (eGFR 45). You must decide between medical management, repeat revascularization, "
                     "or surgical valve repair."),
    },
    "neurology": {
        "intermediate": ("A 35-year-old female presents with a 3-month history of episodic visual disturbances "
                         "followed by unilateral throbbing headache, photophobia, and nausea. Episodes occur "
                         "2-3 times per month and last 6-12 hours. Neurologic exam is normal. She has a family "
                         "history of migraines."),
        "advanced": ("A 55-year-old male presents with acute onset of left-sided weakness and slurred speech "
                     "noted 45 minutes ago. BP 190/110, glucose 220. CT head shows no hemorrhage. He is on "
                     "warfarin for atrial fibrillation with INR 2.4."),
    },
    "pediatrics": {
        "intermediate": ("A 5-year-old presents with a 3-day history of fever, sore throat, and abdominal pain. "
                         "Exam reveals tonsillar exudates and tender anterior cervical adenopathy. No cough, no "
                         "rhinorrhea. The child is fully vaccinated."),
        "advanced": ("A 3-month-old infant presents with a 1-day history of fever (39°C), irritability, and "
                     "decreased oral intake. Anterior fontanelle is bulging. The parents report a seizure at home."),
    },
    "emergency": {
        "intermediate": ("A 45-year-old unrestrained driver is brought in after a high-speed MVC. He is "
                         "tachycardic (HR 124), hypotensive (BP 86/52), and has a rigid, tender abdomen. "
                         "FAST exam is positive."),
        "advanced": ("A 70-year-old female arrives by EMS with sudden onset severe tearing chest pain radiating "
                     "to her back. BP 80/40 in left arm, 160/90 in right arm. CT angiogram pending."),
    },
    "general": {
        "intermediate": ("A 50-year-old presents with fatigue and unintentional 10-kg weight loss over 3 months. "
                         "He reports early satiety and occasional black stools. He has never had a colonoscopy."),
    },
}

_CASE_QUESTIONS = {
    "cardiology": [
        "What is your leading diagnosis and what features support it?",
        "What are the next diagnostic and therapeutic steps?",
        "How would you communicate the diagnosis and plan to the patient in plain language?",
    ],
    "neurology": [
        "What is your differential diagnosis for this presentation?",
        "What red flags would warrant urgent imaging?",
        "How would you explain the management plan to the patient?",
    ],
    "pediatrics": [
        "How would you differentiate between viral and bacterial etiologies?",
        "What are your treatment options and how would you explain them to the parents?",
        "What follow-up and return-precautions would you provide?",
    ],
    "emergency": [
        "What is your immediate stabilization plan?",
        "Which consultations do you need and how would you prioritize them?",
        "How would you communicate with the family during resuscitation?",
    ],
    "general": [
        "What is your differential diagnosis for this presentation?",
        "What initial work-up would you order and why?",
        "How would you communicate concerns about serious etiologies without alarming the patient?",
    ],
}

_CASE_OBJECTIVES = {
    "cardiology": [
        "Identify key features of acute coronary syndrome.",
        "Apply evidence-based protocols for STEMI/NSTEMI management.",
        "Communicate diagnostic and treatment plans using clear, patient-centered language.",
    ],
    "neurology": [
        "Differentiate between primary and secondary headache disorders.",
        "Recognize red flags requiring urgent neuroimaging.",
        "Communicate diagnostic uncertainty and management plans effectively.",
    ],
    "pediatrics": [
        "Apply clinical decision rules for pediatric febrile illness.",
        "Communicate effectively with parents using family-friendly language.",
        "Provide appropriate return-precautions and follow-up planning.",
    ],
    "emergency": [
        "Apply ATLS principles for the unstable trauma patient.",
        "Prioritize interventions using a systematic approach.",
        "Communicate clearly with the trauma team and family during resuscitation.",
    ],
    "general": [
        "Construct a focused differential diagnosis for unexplained weight loss.",
        "Order appropriate initial investigations in a cost-conscious manner.",
        "Communicate diagnostic uncertainty and serious-illness concerns sensitively.",
    ],
}


# ----------------------- quiz fallbacks -----------------------
def _fallback_quiz(specialty: str, topic: str, num: int, difficulty: str) -> list[dict]:
    base_quiz = [
        {
            "question": f"Which symptom is most commonly associated with acute myocardial infarction?",
            "options": ["Substernal chest pressure radiating to the left arm",
                        "Sharp pain worse with deep inspiration",
                        "Epigastric burning relieved by antacids",
                        "Right-sided chest pain worse with coughing"],
            "answer": 0,
            "explanation": "Classic MI presents as substernal pressure radiating to the left arm, often with diaphoresis and dyspnea.",
        },
        {
            "question": "Which vital sign abnormality is most concerning in a pediatric patient with fever?",
            "options": ["HR 110 in a 5-year-old", "BP 100/60 in an 8-year-old",
                        "RR 50 in a 3-month-old", "SpO2 96% on room air in a 6-year-old"],
            "answer": 2,
            "explanation": "RR 50 in a 3-month-old is tachypneic and warrants urgent evaluation for sepsis or respiratory infection.",
        },
        {
            "question": "What is the first-line treatment for mild-to-moderate dehydration in a pediatric patient?",
            "options": ["IV bolus of normal saline", "Oral rehydration solution",
                        "IV maintenance fluids", "Antiemetics alone"],
            "answer": 1,
            "explanation": "Oral rehydration solution is preferred for mild-to-moderate dehydration when oral intake is tolerated.",
        },
        {
            "question": "Which feature suggests bacterial rather than viral pharyngitis?",
            "options": ["Cough and rhinorrhea", "Tonsillar exudates with tender cervical adenopathy and fever",
                        "Hoarseness", "Conjunctivitis"],
            "answer": 1,
            "explanation": "Centor criteria (exudates, tender adenopathy, fever, absence of cough) suggest bacterial (strep) pharyngitis.",
        },
        {
            "question": "What is the recommended window for fibrinolysis in acute ischemic stroke?",
            "options": ["Within 1 hour of symptom onset", "Within 3 hours (up to 4.5 hours in selected patients)",
                        "Within 12 hours", "Within 24 hours"],
            "answer": 1,
            "explanation": "IV thrombolysis is indicated within 3-4.5 hours of symptom onset in eligible patients with acute ischemic stroke.",
        },
        {
            "question": "Which medication class is first-line for essential hypertension in a 55-year-old non-diabetic?",
            "options": ["Beta blockers", "Thiazide diuretic or ACE inhibitor",
                        "Calcium channel blocker only", "Alpha blocker"],
            "answer": 1,
            "explanation": "Per current guidelines, thiazide diuretics, ACE inhibitors, or ARBs are first-line for essential hypertension.",
        },
        {
            "question": "Which finding is most specific for acute appendicitis?",
            "options": ["Diffuse abdominal pain", "Localized RLQ tenderness with rebound",
                        "Pain on urination", "Left upper quadrant pain"],
            "answer": 1,
            "explanation": "Localized right-lower-quadrant tenderness with rebound tenderness is the hallmark of acute appendicitis.",
        },
    ]
    return base_quiz[:num]


# ----------------------- simulation fallbacks -----------------------
def _fallback_simulation(specialty: str, role: str) -> str:
    role_lower = role.lower()
    if role_lower == "patient":
        return (
            f"You will role-play as a {specialty} patient in a 10-minute clinical encounter. "
            f"You are Mr./Ms. R, a 52-year-old with a 3-day history of worsening symptoms relevant to "
            f"the {specialty} specialty. Stay in character: answer the clinician's questions in a "
            f"naturalistic way, express concerns in lay language, and ask for explanations when you "
            f"do not understand medical jargon. The clinician should practice both history-taking and "
            f"plain-language communication. After the encounter, you will provide brief feedback on the "
            f"clinician's clarity, empathy, and use of jargon."
        )
    if role_lower == "nurse":
        return (
            f"You will role-play as a {specialty} nurse in a handover scenario. Use the SBAR "
            f"(Situation, Background, Assessment, Recommendation) framework to convey critical "
            f"information about a recently admitted patient to the oncoming clinician. Practice "
            f"concise, structured, jargon-aware communication."
        )
    if role_lower == "specialist":
        return (
            f"You will role-play as a {specialty} specialist receiving a consultation request. "
            f"A primary care physician will present a complex case. Practice asking focused questions, "
            f"summarizing the clinical picture, and providing a clear recommendation in plain language."
        )
    # clinician (default)
    return (
        f"You will role-play as a {specialty} clinician conducting a 10-minute patient consultation. "
        f"Focus on: opening the encounter with an open-ended question, taking a focused history using "
        f"plain language, summarizing the patient's concerns, explaining your assessment without jargon, "
        f"and closing with clear next steps. The simulated patient will provide realistic responses."
    )


class GenaiService:
    """Singleton GenAI content generator."""

    def __init__(self) -> None:
        self.model_name: str = "MediLingua-LLM"

    # ----------------------- case study -----------------------
    def generate_case_study(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        specialty = payload.get("specialty", "general")
        difficulty = payload.get("difficulty", "intermediate")

        case_text = ""
        questions: list[str] = []
        objectives: list[str] = []

        try:
            prompt = (
                f"Generate a {difficulty} clinical case study for {specialty} suitable for non-native "
                f"English-speaking medical professionals. Include: a 4-6 sentence patient presentation "
                f"with relevant history, vitals, and exam findings; 3 case discussion questions; and 3 "
                f"learning objectives focused on both clinical reasoning and communication skills. "
                f"Format as: CASE: ...\\nQUESTIONS: ...\\nOBJECTIVES: ..."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=600))
            if llm_resp and len(llm_resp) > 100:
                case_text, questions, objectives = self._parse_case_llm(llm_resp, specialty)
        except Exception as e:
            logger.warning(f"GenAI case-study LLM failed: {e}")

        if not case_text:
            store = _CASE_STUDIES.get(specialty, _CASE_STUDIES["general"])
            case_text = store.get(difficulty, list(store.values())[0])
        if not questions:
            questions = _CASE_QUESTIONS.get(specialty, _CASE_QUESTIONS["general"])
        if not objectives:
            objectives = _CASE_OBJECTIVES.get(specialty, _CASE_OBJECTIVES["general"])

        latency_ms = int((time.perf_counter() - t0) * 1000)
        # Safety screening — screen the case study text.
        screened = safety_service.screen(case_text, context="genai")
        case_text = screened["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "case_study": case_text.strip(),
            "questions": questions,
            "learning_objectives": objectives,
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
        }

    def _parse_case_llm(self, text: str, specialty: str) -> tuple[str, list[str], list[str]]:
        case = text
        questions: list[str] = []
        objectives: list[str] = []

        def _split_items(block: str) -> list[str]:
            """Split a block into individual items, handling newlines + '1)', '-', '*' bullets."""
            items: list[str] = []
            # First split by newlines
            for line in re.split(r"[\n\r]+", block):
                line = line.strip().lstrip("-*•0123456789. ").strip()
                if line:
                    items.append(line)
            # If only one item was found but the block contains numbered items like
            # "1) ... 2) ... 3) ...", split further
            if len(items) <= 1:
                joined = " ".join(items) if items else block
                # Split on "N)" or "N." patterns (where N is 1-9)
                sub = re.split(r"(?:^|\s)\d+[)\.\)]\s+", joined)
                sub = [s.strip().rstrip(".") for s in sub if s.strip()]
                if len(sub) > 1:
                    items = sub
            return items

        if "CASE:" in text:
            parts = re.split(r"CASE:|QUESTIONS:|OBJECTIVES:", text, flags=re.IGNORECASE)
            if len(parts) >= 2:
                case = parts[1].strip()
            if len(parts) >= 3:
                questions = _split_items(parts[2])[:4]
            if len(parts) >= 4:
                objectives = _split_items(parts[3])[:4]
        if not questions:
            questions = _CASE_QUESTIONS.get(specialty, _CASE_QUESTIONS["general"])
        if not objectives:
            objectives = _CASE_OBJECTIVES.get(specialty, _CASE_OBJECTIVES["general"])
        return case, questions, objectives

    # ----------------------- quiz -----------------------
    def generate_quiz(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        specialty = payload.get("specialty", "general")
        topic = payload.get("topic", "general medicine")
        num = int(payload.get("num_questions", 5))
        difficulty = payload.get("difficulty", "intermediate")

        questions: list[dict] = []

        try:
            prompt = (
                f"Generate {num} multiple-choice questions on the topic '{topic}' in the {specialty} "
                f"specialty at {difficulty} level, suitable for non-native English-speaking clinicians. "
                f"Each question must have exactly 4 options and one correct answer. For each, include a "
                f"brief 1-2 sentence explanation. Output as strict JSON: "
                f'[{{"question":"...","options":["a","b","c","d"],"answer":0,"explanation":"..."}}, ...]. '
                f"Return only the JSON array, no other text."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=900))
            if llm_resp and len(llm_resp) > 80:
                questions = self._parse_quiz_json(llm_resp, num)
        except Exception as e:
            logger.warning(f"GenAI quiz LLM failed: {e}")

        if not questions:
            questions = _fallback_quiz(specialty, topic, num, difficulty)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        # Safety screening — screen each quiz question's explanation.
        for q in questions:
            ex_screen = safety_service.screen(q.get("explanation", ""), context="genai")
            q["explanation"] = ex_screen["filtered_text"].strip()
        # Use the first question's verdict as a representative safety verdict
        overall_text = " ".join(q.get("question", "") + " " + q.get("explanation", "") for q in questions)
        screened = safety_service.screen(overall_text, context="genai")
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "questions": questions,
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
        }

    def _parse_quiz_json(self, text: str, num: int) -> list[dict]:
        # Try strict JSON parse first
        candidates = []
        # Strip code fences
        text = re.sub(r"```(?:json)?", "", text).strip()
        try:
            data = json.loads(text)
            if isinstance(data, list):
                candidates = data
        except Exception:
            # Try to extract first JSON array
            m = re.search(r"\[\s*\{.*\}\s*\]", text, flags=re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(0))
                    if isinstance(data, list):
                        candidates = data
                except Exception:
                    pass

        out: list[dict] = []
        for q in candidates:
            if not isinstance(q, dict):
                continue
            question = q.get("question", "").strip()
            options = q.get("options", [])
            answer = q.get("answer", 0)
            explanation = q.get("explanation", "").strip()
            if not question or not isinstance(options, list) or len(options) < 2:
                continue
            try:
                answer = int(answer)
                if answer < 0 or answer >= len(options):
                    answer = 0
            except Exception:
                answer = 0
            options = [str(o) for o in options]
            out.append({
                "question": question,
                "options": options,
                "answer": answer,
                "explanation": explanation or "No explanation provided.",
            })
            if len(out) >= num:
                break
        return out

    # ----------------------- simulation -----------------------
    def generate_simulation(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        specialty = payload.get("specialty", "general")
        role = payload.get("role", "patient")

        sim_text = ""

        try:
            prompt = (
                f"Design a 10-minute interactive consultation simulation for {specialty}. The learner will "
                f"role-play as the {role}. Provide: a scenario setup paragraph, 2-3 brief patient/persona "
                f"characteristics to inform their portrayal, and 2 communication objectives for the learner "
                f"to demonstrate. Format as: SETUP: ...\\nPERSONA: ...\\nOBJECTIVES: ..."
            )
            llm_resp = asyncio.run(llm_client.chat(prompt, system=SYSTEM_PROMPT, max_tokens=500))
            if llm_resp and len(llm_resp) > 80:
                sim_text = self._parse_simulation_llm(llm_resp)
        except Exception as e:
            logger.warning(f"GenAI simulation LLM failed: {e}")

        if not sim_text:
            sim_text = _fallback_simulation(specialty, role)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        # Safety screening — screen the simulation text.
        screened = safety_service.screen(sim_text, context="genai")
        sim_text = screened["filtered_text"]
        safety_info = {
            "verdict": screened["verdict"],
            "confidence": screened["confidence"],
            "reasons": screened["reasons"],
            "disclaimers": screened["disclaimers"],
            "latency_ms": screened["latency_ms"],
        }
        return {
            "simulation": sim_text.strip(),
            "model": self.model_name,
            "latency_ms": latency_ms,
            "safety": safety_info,
        }

    def _parse_simulation_llm(self, text: str) -> str:
        if "SETUP:" not in text:
            return text.strip()
        # Combine all parts into a single coherent paragraph
        parts = re.split(r"SETUP:|PERSONA:|OBJECTIVES:", text, flags=re.IGNORECASE)
        out_parts = []
        for i, p in enumerate(parts[1:], 1):
            p = p.strip()
            if not p:
                continue
            if i == 1:
                out_parts.append(p)
            elif i == 2:
                out_parts.append("Persona: " + p)
            elif i == 3:
                out_parts.append("Objectives: " + p)
        return " ".join(out_parts) if out_parts else text.strip()
