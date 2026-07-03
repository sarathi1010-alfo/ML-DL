"""Proficiency Assessment service — ML Level 1.

Trains RandomForestClassifier + XGBClassifier on synthetic learner data and uses
the better-performing one at inference time. Returns CEFR level, per-level
probabilities, confidence, recommendations, and feature importances.
"""
from __future__ import annotations
import time
import numpy as np
import pandas as pd
from typing import Any

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
try:
    from xgboost import XGBClassifier
    _HAS_XGB = True
except Exception:
    _HAS_XGB = False

from ..core.logging import logger
from .model_registry import save_artifact, load_artifact


CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
SPECIALTIES = ["cardiology", "neurology", "pediatrics", "emergency", "general"]

FEATURE_NAMES = [
    "vocabulary_score", "grammar_score", "fluency_score", "comprehension_score",
    "exercises_completed", "study_hours", "days_active",
]

# Weights for the synthetic CEFR label formula
WEIGHTS = np.array([0.25, 0.25, 0.20, 0.30, 0.0, 0.0, 0.0])  # only the 4 scores feed the label

RECOMMENDATIONS = {
    "vocabulary": [
        ("Expand {spec} terminology (50 new terms/week)", "Medium"),
        ("Review medical root words and affixes", "Medium"),
        ("Build flashcards for high-frequency clinical terms", "Low"),
    ],
    "grammar": [
        ("Focus on medical conditional tenses", "High"),
        ("Practice subject-verb agreement in case reports", "High"),
        ("Review article usage with medical nouns", "Medium"),
    ],
    "fluency": [
        ("Practice patient consultation role-plays", "Medium"),
        ("Record yourself explaining diagnoses; review pacing", "Medium"),
        ("Shadow medical podcasts to improve prosody", "Low"),
    ],
    "comprehension": [
        ("Read 2 clinical case studies per week", "Medium"),
        ("Summarize journal abstracts in your own words", "Medium"),
        ("Practice listening to patient history audios", "Low"),
    ],
    "study_habits": [
        ("Increase study consistency — target 5+ days/week", "High"),
        ("Complete 30+ graded exercises per week", "Medium"),
        ("Maintain a spaced-repetition schedule", "Low"),
    ],
}


def _weighted_score(row: np.ndarray) -> float:
    return float(np.dot(row[:4], WEIGHTS[:4]))


def _cefr_from_score(score: float) -> int:
    """Map weighted score (0-100) to CEFR level (1-6)."""
    if score < 25:
        return 1  # A1
    if score < 40:
        return 2  # A2
    if score < 55:
        return 3  # B1
    if score < 75:
        return 4  # B2
    if score < 90:
        return 5  # C1
    return 6      # C2


def _generate_synthetic(n: int = 1500, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    vocab = rng.normal(60, 18, n).clip(0, 100)
    gram = rng.normal(60, 18, n).clip(0, 100)
    flue = rng.normal(60, 18, n).clip(0, 100)
    comp = rng.normal(60, 18, n).clip(0, 100)
    exercises = rng.integers(0, 200, n).astype(float)
    study_hours = rng.normal(120, 80, n).clip(0, 500)
    days_active = rng.integers(1, 365, n).astype(float)
    spec = rng.choice(SPECIALTIES, n)

    rows = np.stack([vocab, gram, flue, comp, exercises, study_hours, days_active], axis=1)
    labels = np.array([_cefr_from_score(_weighted_score(r) + rng.normal(0, 3.5)) for r in rows])
    labels = np.clip(labels, 1, 6).astype(int)

    # Ensure all 6 classes are present — inject at least 30 samples per class
    # by resampling scores around target CEFR ranges.
    inject_rows: list[list[float]] = []
    inject_labels: list[int] = []
    target_scores = [15, 32, 47, 65, 82, 95]  # mid-range for A1..C2
    for cls_idx, ts in enumerate(target_scores, start=1):
        for _ in range(40):
            row = np.array([ts + rng.normal(0, 4) for _ in range(4)]
                           + [rng.integers(0, 200), rng.normal(120, 50), rng.integers(1, 365)]).astype(float)
            row[:4] = row[:4].clip(0, 100)
            inject_rows.append(row.tolist())
            inject_labels.append(cls_idx)
    if inject_rows:
        rows = np.vstack([rows, np.array(inject_rows, dtype=float)])
        labels = np.concatenate([labels, np.array(inject_labels, dtype=int)])

    df = pd.DataFrame(rows, columns=FEATURE_NAMES)
    df["specialty"] = np.concatenate([spec, rng.choice(SPECIALTIES, len(inject_rows))])
    df["label"] = labels.astype(int)
    return df


class ProficiencyService:
    """Singleton service — trained once on synthetic data."""

    def __init__(self) -> None:
        self.model: Any = None
        self.model_name: str = "RandomForestClassifier"
        self.scaler: StandardScaler | None = None
        self.accuracy: float = 0.0
        self.f1: float = 0.0
        self.feature_importances_: np.ndarray | None = None
        self._load_or_train()

    # ---- training ----
    def _load_or_train(self) -> None:
        cached = load_artifact("proficiency_model")
        if cached and isinstance(cached, dict) and "model" in cached:
            try:
                self.model = cached["model"]
                self.scaler = cached["scaler"]
                self.model_name = cached.get("model_name", "RandomForestClassifier")
                self.accuracy = cached.get("accuracy", 0.0)
                self.f1 = cached.get("f1", 0.0)
                self.feature_importances_ = cached.get("feature_importances_")
                logger.info(f"Proficiency model loaded from cache ({self.model_name}, acc={self.accuracy:.3f})")
                return
            except Exception as e:
                logger.warning(f"Failed to load proficiency cache: {e}")
        self._train()

    def _train(self) -> None:
        df = _generate_synthetic(1500)
        X = df[FEATURE_NAMES].values.astype(float)
        # Labels are 1-6; XGB needs 0-based
        y = df["label"].values.astype(int)
        y_xgb = y - 1

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        self.scaler = StandardScaler().fit(X_train)
        X_train_s = self.scaler.transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        rf = RandomForestClassifier(
            n_estimators=200, max_depth=10, random_state=42, class_weight="balanced",
        )
        rf.fit(X_train_s, y_train)
        rf_pred = rf.predict(X_test_s)
        rf_acc = accuracy_score(y_test, rf_pred)
        rf_f1 = f1_score(y_test, rf_pred, average="weighted")

        best_model = rf
        best_name = "RandomForestClassifier"
        best_acc = rf_acc
        best_f1 = rf_f1
        best_pred = rf_pred

        if _HAS_XGB:
            try:
                # XGBoost needs 0-based labels
                y_train_xgb = (y_train - 1).astype(int)
                xgb = XGBClassifier(
                    n_estimators=200, max_depth=5, learning_rate=0.1,
                    objective="multi:softprob",
                    eval_metric="mlogloss", random_state=42,
                    tree_method="hist",
                )
                xgb.fit(X_train_s, y_train_xgb)
                xgb_pred = xgb.predict(X_test_s).astype(int) + 1
                xgb_acc = accuracy_score(y_test, xgb_pred)
                xgb_f1 = f1_score(y_test, xgb_pred, average="weighted")
                if xgb_acc > rf_acc:
                    best_model = xgb
                    best_name = "XGBClassifier"
                    best_acc = xgb_acc
                    best_f1 = xgb_f1
                    best_pred = xgb_pred
            except Exception as e:
                logger.warning(f"XGB training failed: {e}")

        # feature importances (normalize to sum=1)
        try:
            fi = getattr(best_model, "feature_importances_", None)
            if fi is None:
                # RF fallback: permutation-ish via tree importance (already has feature_importances_)
                fi = np.full(len(FEATURE_NAMES), 1.0 / len(FEATURE_NAMES))
            total = fi.sum()
            if total > 0:
                fi = fi / total
            self.feature_importances_ = fi
        except Exception:
            self.feature_importances_ = np.full(len(FEATURE_NAMES), 1.0 / len(FEATURE_NAMES))

        self.model = best_model
        self.model_name = best_name
        self.accuracy = float(best_acc)
        self.f1 = float(best_f1)

        save_artifact("proficiency_model", {
            "model": self.model,
            "scaler": self.scaler,
            "model_name": self.model_name,
            "accuracy": self.accuracy,
            "f1": self.f1,
            "feature_importances_": self.feature_importances_,
            "feature_names": FEATURE_NAMES,
        })
        logger.info(
            f"Proficiency model trained: {best_name} acc={best_acc:.3f} f1={best_f1:.3f}"
        )

    # ---- inference ----
    def predict(self, payload: dict) -> dict:
        t0 = time.perf_counter()
        features = np.array([[float(payload.get(f, 0)) for f in FEATURE_NAMES]])
        if self.scaler is not None:
            features_s = self.scaler.transform(features)
        else:
            features_s = features

        # Predict class
        pred = int(self.model.predict(features_s)[0])
        if self.model_name == "XGBClassifier":
            pred += 1  # convert back from 0-based

        # Probabilities
        try:
            probs = self.model.predict_proba(features_s)[0]
            if self.model_name == "XGBClassifier":
                classes = [i + 1 for i in self.model.classes_]
            else:
                classes = list(self.model.classes_)
            raw_map = {c: float(p) for c, p in zip(classes, probs)}
            # Build in canonical A1..C2 order, filling zeros for missing levels
            prob_map = {lvl: raw_map.get(i + 1, 0.0) for i, lvl in enumerate(CEFR_LEVELS)}
        except Exception:
            prob_map = {lvl: (1.0 if i + 1 == pred else 0.0) for i, lvl in enumerate(CEFR_LEVELS)}

        confidence = float(max(prob_map.values())) if prob_map else 0.5

        # Recommendations: find weakest areas
        recommendations = self._recommendations(payload, pred)

        # Feature importance
        fi_list = []
        if self.feature_importances_ is not None:
            for name, imp in zip(FEATURE_NAMES, self.feature_importances_):
                fi_list.append({"feature": name, "importance": round(float(imp), 4)})
        fi_list.sort(key=lambda x: x["importance"], reverse=True)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "level": CEFR_LEVELS[pred - 1],
            "level_numeric": pred,
            "cefr_scale": prob_map,
            "confidence": round(confidence, 4),
            "recommendations": recommendations,
            "feature_importance": fi_list,
            "model": "RandomForest + XGBoost",
            "latency_ms": latency_ms,
        }

    # ---- recommendations ----
    def _recommendations(self, payload: dict, level: int) -> list[dict]:
        spec = payload.get("specialty", "general")
        scores = {
            "vocabulary": float(payload.get("vocabulary_score", 0)),
            "grammar": float(payload.get("grammar_score", 0)),
            "fluency": float(payload.get("fluency_score", 0)),
            "comprehension": float(payload.get("comprehension_score", 0)),
        }
        # Sort areas by score (ascending) — weakest first
        sorted_areas = sorted(scores.items(), key=lambda x: x[1])

        out: list[dict] = []
        # Top 2 weakest skill areas + 1 study-habits recommendation
        for area, score in sorted_areas[:2]:
            pool = RECOMMENDATIONS.get(area, RECOMMENDATIONS["vocabulary"])
            action_template, priority = pool[0]
            action = action_template.format(spec=spec)
            out.append({"area": area.capitalize(), "priority": priority, "action": action})

        # Study-habits rec if exercises/study/days are low
        if (float(payload.get("exercises_completed", 0)) < 50
                or float(payload.get("days_active", 0)) < 30):
            action_template, priority = RECOMMENDATIONS["study_habits"][0]
            out.append({"area": "Study Habits", "priority": priority, "action": action_template})
        else:
            # Otherwise suggest a stretch goal in the strongest area
            strongest_area, _ = sorted_areas[-1]
            pool = RECOMMENDATIONS.get(strongest_area, RECOMMENDATIONS["comprehension"])
            action_template, priority = pool[-1]
            out.append({"area": strongest_area.capitalize(), "priority": priority, "action": action_template})

        return out
