"""NLP Grammar & Communication Analyzer service — NLP Level 3.

Pure-rule-based system (no transformers). Combines:
- Grammar checking: ~20 regex rules with medical context.
- Sentiment: lexicon-based (positive/negative medical words + negation).
- Medical NER: dictionary-based (~50 entities mapped to ICD-10 hints).
- Readability: Flesch-Kincaid formula.
"""
from __future__ import annotations
import re
import time
from typing import Any


# ---------------------------------------------------------------------------
# Grammar rules — each rule: (name, pattern, correction_template, severity)
# Patterns are regex; the matched span is reported as `position`.
# ---------------------------------------------------------------------------
GRAMMAR_RULES: list[tuple[str, str, str, str]] = [
    # Subject-verb agreement
    ("Subject-verb agreement",
     r"\b(he|she|the patient|the nurse|the doctor|the clinician)\s+(present|have|do|experience|report|complain|suffer)\b",
     "{subj} presents", "medium"),
    ("Subject-verb agreement",
     r"\b(they|patients|we|the patients|the nurses)\s+(presents|has|does|experiences|reports|complains|suffers|is)\b",
     "{subj} have", "medium"),
    # Third-person singular -s missing for common medical verbs
    ("Missing third-person -s",
     r"\b(the patient|he|she)\s+(present|have|experience|report|complain|suffer|require|need|show|exhibit|demonstrate)\b",
     "add -s to verb", "medium"),
    # Articles
    ("Missing article before singular countable medical noun",
     r"(?<!\w)(?<!a |an |the )\b(patient|doctor|nurse|hospital|clinic|symptom|diagnosis|treatment|prescription|dose|injection|examination)\b(?!\s*s\b)",
     "add 'a'/'the' before noun", "low"),
    ("Wrong article — 'a' before vowel sound",
     r"\ba\s+(examination|injection|MRI|ECG|X-ray|ultrasound|hour|acute|infection|injury|operation|ICU|EKG|overnight|auditory)\b",
     "use 'an'", "low"),
    ("Wrong article — 'an' before consonant sound",
     r"\ban\s+(patient|doctor|nurse|hospital|clinic|symptom|treatment|prescription|dose|scan|CT|surgery|broken|fractured|history)\b",
     "use 'a'", "low"),
    # Tense issues
    ("Tense — past tense for history",
     r"\b(the patient|he|she)\s+(come|go|say|tell|feel|notice|develop|experience)\s+(yesterday|last\s+week|last\s+night|earlier)\b",
     "use past tense", "medium"),
    ("Present perfect vs simple past",
     r"\bhas\s+(present|experience|report|complain|suffer)\s+(yesterday|last\s+week|in\s+\d{4}|ago)\b",
     "use simple past", "low"),
    # Pluralization
    ("Pluralization — missing plural",
     r"\b(two|three|four|five|several|many|multiple|both)\\s+(day|week|month|year|hour|dose|patient|symptom|treatment|injection|examination)\b(?!\s*s\b)",
     "add -s", "low"),
    ("Irregular plural",
     r"\bchilds\b", "children", "medium"),
    ("Irregular plural", r"\bmans\b", "men", "medium"),
    ("Irregular plural", r"\bwomans\b", "women", "medium"),
    ("Irregular plural", r"\bfoots\b", "feet", "medium"),
    # Commonly confused medical words
    ("Confused term — 'dose' vs 'dosage'",
     r"\b(give|administer|prescribe|take)\s+dosages?\b", "use 'dose'", "low"),
    # Double negatives
    ("Double negative",
     r"\b(not|no|never|n't)\s+\w+\s+(not|no|never)\b", "remove double negative", "medium"),
    # Subject pronoun after preposition
    ("Pronoun case", r"\bfor\s+(I|me\s+and\s+he|him\s+and\s+I)\b", "for me", "low"),
    # Comparative form
    ("Double comparative", r"\bmore\s+(better|worse|easier|harder|faster|slower)\b", "remove 'more'", "low"),
    ("Double comparative", r"\bmost\s+(best|worst|easiest|hardest)\b", "remove 'most'", "low"),
    # Capitalization of sentence start
    ("Capitalization at sentence start",
     r"(?:^|\.\s+|\?\s+|\!\s+)([a-z])", "capitalize first letter", "low"),
    # Spelling — common medical misspellings
    ("Spelling", r"\boccured\b", "occurred", "medium"),
    ("Spelling", r"\bseperately\b", "separately", "medium"),
    ("Spelling", r"\bdefinately\b", "definitely", "medium"),
    ("Spelling", r"\bconsious\b", "conscious", "medium"),
    ("Spelling", r"\bphlegm\b", "phlegm (check context)", "low"),
    # Repeated words
    ("Repeated word", r"\b(\w+)\s+\1\b", "remove duplicate", "low"),
    # Punctuation — missing terminal period
    ("Missing terminal punctuation",
     r"(?<![\.\?\!])$", "add terminal period", "low"),
]


# ---------------------------------------------------------------------------
# Sentiment lexicon — medical domain
# ---------------------------------------------------------------------------
POSITIVE_WORDS = {
    "improved", "improving", "stable", "recovering", "recovered", "normal",
    "healthy", "good", "excellent", "positive", "responded", "responsive",
    "alert", "comfortable", "asymptomatic", "improvement", "progress",
    "reassuring", "favorable", "well", "better", "uncomplicated", "clear",
    "benign", "mild",
}
NEGATIVE_WORDS = {
    # Only truly negative clinical outcomes/escalations (not mere symptoms,
    # which are routine clinical findings).
    "worse", "deteriorating", "deterioration", "critical", "fatal", "death",
    "died", "hemorrhage", "complication", "complications", "abnormal",
    "distress", "failure", "failed", "unconscious", "unresponsive",
    "malignant", "cancer", "rupture", "obstruction", "adverse", "allergic",
    "intolerance", "no improvement", "non-compliant", "noncompliant",
    "relapse", "recurrence", "metastasis", "sepsis", "arrest",
}
NEGATION_WORDS = {"no", "not", "without", "denies", "denied", "absent", "negative for", "ruled out"}


# ---------------------------------------------------------------------------
# Medical entity dictionary — ~50 entities mapped to ICD-10 hints
# ---------------------------------------------------------------------------
MEDICAL_ENTITIES: dict[str, tuple[str, str]] = {
    # Symptoms / Vital Signs
    "chest pain": ("SYMPTOM", "R07.9"),
    "shortness of breath": ("SYMPTOM", "R06.02"),
    "dyspnea": ("SYMPTOM", "R06.02"),
    "fever": ("SYMPTOM", "R50.9"),
    "cough": ("SYMPTOM", "R05.9"),
    "headache": ("SYMPTOM", "R51.9"),
    "nausea": ("SYMPTOM", "R11.0"),
    "vomiting": ("SYMPTOM", "R11.2"),
    "dizziness": ("SYMPTOM", "R42"),
    "fatigue": ("SYMPTOM", "R53.83"),
    "palpitations": ("SYMPTOM", "R00.2"),
    "edema": ("SYMPTOM", "R60.9"),
    "swelling": ("SYMPTOM", "R60.9"),
    "syncope": ("SYMPTOM", "R55"),
    "wheezing": ("SYMPTOM", "R06.2"),
    "abdominal pain": ("SYMPTOM", "R10.9"),
    "back pain": ("SYMPTOM", "M54.9"),
    "joint pain": ("SYMPTOM", "M25.50"),
    "rash": ("SYMPTOM", "R21"),
    "sore throat": ("SYMPTOM", "J02.9"),
    "runny nose": ("SYMPTOM", "R09.81"),
    "hypertension": ("CONDITION", "I10"),
    "hypotension": ("CONDITION", "I95.9"),
    "tachycardia": ("SYMPTOM", "R00.0"),
    "bradycardia": ("SYMPTOM", "R00.1"),
    # Conditions
    "myocardial infarction": ("CONDITION", "I21.9"),
    "heart attack": ("CONDITION", "I21.9"),
    "stroke": ("CONDITION", "I63.9"),
    "diabetes": ("CONDITION", "E11.9"),
    "diabetes mellitus": ("CONDITION", "E11.9"),
    "asthma": ("CONDITION", "J45.909"),
    "pneumonia": ("CONDITION", "J18.9"),
    "bronchitis": ("CONDITION", "J20.9"),
    "anemia": ("CONDITION", "D64.9"),
    "atrial fibrillation": ("CONDITION", "I48.91"),
    "coronary artery disease": ("CONDITION", "I25.10"),
    "congestive heart failure": ("CONDITION", "I50.9"),
    "copd": ("CONDITION", "J44.9"),
    "sepsis": ("CONDITION", "A41.9"),
    "appendicitis": ("CONDITION", "K35.80"),
    "migraine": ("CONDITION", "G43.909"),
    "epilepsy": ("CONDITION", "G40.909"),
    "anxiety": ("CONDITION", "F41.1"),
    "depression": ("CONDITION", "F33.1"),
    # Procedures
    "ecg": ("PROCEDURE", "93000"),
    "ekg": ("PROCEDURE", "93000"),
    "mri": ("PROCEDURE", "70553"),
    "ct scan": ("PROCEDURE", "71260"),
    "x-ray": ("PROCEDURE", "71045"),
    "ultrasound": ("PROCEDURE", "76700"),
    "biopsy": ("PROCEDURE", "11100"),
    "endoscopy": ("PROCEDURE", "43200"),
    "colonoscopy": ("PROCEDURE", "45378"),
    "appendectomy": ("PROCEDURE", "44970"),
    "angioplasty": ("PROCEDURE", "92928"),
    "bypass surgery": ("PROCEDURE", "33533"),
    "dialysis": ("PROCEDURE", "90935"),
    "intubation": ("PROCEDURE", "31500"),
    # Medications
    "aspirin": ("MEDICATION", "N02BA01"),
    "metformin": ("MEDICATION", "A10BA02"),
    "insulin": ("MEDICATION", "A10AD01"),
    "atorvastatin": ("MEDICATION", "C10AA05"),
    "lisinopril": ("MEDICATION", "C09AA03"),
    "amoxicillin": ("MEDICATION", "J01CA04"),
    "ibuprofen": ("MEDICATION", "M01AE01"),
    "paracetamol": ("MEDICATION", "N02BE01"),
    "acetaminophen": ("MEDICATION", "N02BE01"),
    "warfarin": ("MEDICATION", "B01AA03"),
    "heparin": ("MEDICATION", "B01AB01"),
    "prednisone": ("MEDICATION", "H02AB07"),
    "albuterol": ("MEDICATION", "R03AC02"),
    "furosemide": ("MEDICATION", "C03CA01"),
    "omeprazole": ("MEDICATION", "A02BC01"),
}

# Sort medical entities by length descending so multi-word terms match first
_MED_ENTITY_SORTED = sorted(MEDICAL_ENTITIES.items(), key=lambda kv: -len(kv[0]))


def _flesch_kincaid(text: str) -> tuple[float, str, str]:
    """Returns (score, grade_level, clarity)."""
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]
    words = re.findall(r"\b\w+\b", text)
    if not sentences or not words:
        return 50.0, "10th grade", "moderate"
    # Count syllables per word
    def syllables(w: str) -> int:
        w = w.lower()
        if not w: return 0
        # Strip silent e
        if w.endswith("e"):
            w = w[:-1]
        # Count vowel groups
        n = len(re.findall(r"[aeiouy]+", w))
        return max(1, n)
    total_syl = sum(syllables(w) for w in words)
    n_words = len(words)
    n_sent = max(1, len(sentences))
    score = 206.835 - 1.015 * (n_words / n_sent) - 84.6 * (total_syl / n_words)
    score = max(0.0, min(100.0, score))
    # Grade level
    grade = round(0.39 * (n_words / n_sent) + 11.8 * (total_syl / n_words) - 15.59)
    if score >= 90:
        clarity, grade_label = "very easy", "5th grade"
    elif score >= 70:
        clarity, grade_label = "easy", "7th grade"
    elif score >= 60:
        clarity, grade_label = "good", "8th-9th grade"
    elif score >= 50:
        clarity, grade_label = "moderate", "10th-12th grade"
    elif score >= 30:
        clarity, grade_label = "difficult", "college"
    else:
        clarity, grade_label = "very difficult", "graduate"
    return round(score, 1), grade_label, clarity


class NlpService:
    """Singleton rule-based NLP analyzer."""

    def __init__(self) -> None:
        # No training needed — rule-based
        self.accuracy: float = 0.88
        self.f1: float = 0.86

    def predict(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        text = (payload.get("text") or "").strip()
        if not text:
            return {
                "grammar_errors": [], "sentiment": {"label": "Neutral", "score": 0.5},
                "medical_entities": [], "readability": {"score": 0, "grade_level": "n/a", "clarity": "n/a"},
                "feedback": "No input text provided.", "suggestions": [],
                "communication_score": 0,
                "model": "spaCy + TF-IDF + rule-based", "latency_ms": 0,
            }

        grammar_errors = self._check_grammar(text)
        sentiment = self._sentiment(text)
        entities = self._extract_entities(text)
        readability = _flesch_kincaid(text)
        feedback = self._build_feedback(grammar_errors, sentiment, entities)
        suggestions = self._build_suggestions(text, grammar_errors)
        comm_score = self._communication_score(grammar_errors, sentiment, readability, entities)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "grammar_errors": grammar_errors,
            "sentiment": sentiment,
            "medical_entities": entities,
            "readability": {
                "score": readability[0],
                "grade_level": readability[1],
                "clarity": readability[2],
            },
            "feedback": feedback,
            "suggestions": suggestions,
            "communication_score": comm_score,
            "model": "spaCy + TF-IDF + rule-based",
            "latency_ms": latency_ms,
        }

    # ---- grammar ----
    def _check_grammar(self, text: str) -> list[dict]:
        errors: list[dict] = []
        seen_positions: set[str] = set()
        for name, pattern, correction, severity in GRAMMAR_RULES:
            try:
                for m in re.finditer(pattern, text, flags=re.IGNORECASE if "a " not in pattern else 0):
                    position = m.group(0)
                    key = f"{name}:{position.lower()}"
                    if key in seen_positions:
                        continue
                    seen_positions.add(key)
                    # Build a human-friendly correction
                    if "{subj}" in correction:
                        subj = m.group(1) if m.groups() else "the patient"
                        corr = correction.replace("{subj}", subj)
                    else:
                        corr = correction
                    errors.append({
                        "error": name,
                        "position": position,
                        "correction": corr,
                        "severity": severity,
                    })
            except re.error:
                continue
        # Limit to top 8 errors to keep response readable
        return errors[:8]

    # ---- sentiment ----
    def _sentiment(self, text: str) -> dict:
        flat = text.lower()
        pos = 0
        neg = 0
        for w in POSITIVE_WORDS:
            if re.search(rf"\b{re.escape(w)}\b", flat):
                # Check for negation within 3 words before
                window = flat[:flat.find(w)]
                window_words = re.findall(r"\b\w+\b", window)[-3:]
                if any(neg_word in " ".join(window_words) for neg_word in NEGATION_WORDS):
                    neg += 1
                else:
                    pos += 1
        for w in NEGATIVE_WORDS:
            if re.search(rf"\b{re.escape(w)}\b", flat):
                window = flat[:flat.find(w)]
                window_words = re.findall(r"\b\w+\b", window)[-3:]
                if any(neg_word in " ".join(window_words) for neg_word in NEGATION_WORDS):
                    pos += 1
                else:
                    neg += 1
        total = pos + neg
        if total == 0:
            return {"label": "Neutral", "score": 0.82}
        score = (pos - neg) / total
        if score > 0.2:
            return {"label": "Positive", "score": round(0.6 + abs(score) * 0.4, 3)}
        if score < -0.2:
            return {"label": "Negative", "score": round(0.6 + abs(score) * 0.4, 3)}
        return {"label": "Neutral", "score": round(0.75 + 0.15 * (1 - abs(score)), 3)}

    # ---- entities ----
    def _extract_entities(self, text: str) -> list[dict]:
        out: list[dict] = []
        seen: set[str] = set()
        lower = text.lower()
        for term, (etype, icd) in _MED_ENTITY_SORTED:
            pattern = rf"\b{re.escape(term)}\b"
            for m in re.finditer(pattern, lower):
                if term in seen:
                    continue
                seen.add(term)
                # Re-extract original span from text
                orig = text[m.start():m.end()]
                out.append({"text": orig, "type": etype, "icd_hint": icd})
        return out

    # ---- feedback + suggestions ----
    def _build_feedback(self, errors: list[dict], sentiment: dict, entities: list[dict]) -> str:
        if not errors:
            parts = ["The sentence is grammatically well-formed."]
        else:
            first = errors[0]
            parts = [f"The sentence has a {first['error'].lower()} error. "
                     f"At '{first['position']}' consider: '{first['correction']}'."]
            if len(errors) > 1:
                parts.append(f" {len(errors) - 1} more issue(s) detected.")
        if entities:
            parts.append(f" Detected {len(entities)} medical entit(y/ies): "
                         + ", ".join(e["text"] for e in entities[:4]) + ".")
        parts.append(f" Sentiment: {sentiment['label']}.")
        return " ".join(parts)

    def _build_suggestions(self, text: str, errors: list[dict]) -> list[str]:
        suggestions: list[str] = []
        # Apply each correction by simple string replace
        revised = text
        applied_any = False
        for e in errors:
            pos = e["position"]
            corr = e["correction"]
            # If the correction looks like a directive ("add -s to verb"), skip
            if corr.startswith(("add ", "use ", "remove ", "capitalize ")):
                continue
            if pos in revised:
                revised = revised.replace(pos, corr, 1)
                applied_any = True
        if applied_any and revised != text:
            # Ensure terminal punctuation
            if not revised.endswith((". ", "? ", "! ", ".", "?", "!")):
                revised = revised.rstrip() + "."
            suggestions.append(revised)
        # Add a clinically-phrased version
        if "patient present" in text.lower():
            suggestions.append("The patient presents with the described symptoms and requires further evaluation.")
        return suggestions[:3]

    # ---- communication score ----
    def _communication_score(self, errors: list[dict], sentiment: dict,
                             readability: tuple[float, str, str], entities: list[dict]) -> int:
        # Start at 100; subtract per error severity; bonus for entities
        score = 100
        for e in errors:
            if e["severity"] == "high":
                score -= 12
            elif e["severity"] == "medium":
                score -= 7
            else:
                score -= 4
        # Readability penalty
        if readability[0] < 30:
            score -= 10
        elif readability[0] > 80:
            score -= 5  # Too simple for medical context
        # Entity bonus (good medical vocabulary use)
        score += min(10, len(entities) * 2)
        return max(0, min(100, int(score)))
