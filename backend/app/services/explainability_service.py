"""Explainability Service — model-agnostic explanations for MediLingua ML/DL.

Provides:
  1. Proficiency explainability — SHAP-style feature contributions:
     feature_importances_ × input value, with a direction (↑/↓ level) and
     human-readable explanation. Returns top-5 contributing features.
  2. Acquisition explainability — attention-weight time-series over the
     most recent historical data points that most influenced the forecast.
  3. Recommendation reasoning — natural-language "why" for each proficiency
     recommendation, based on input gaps + feature importance.

This module is deterministic and does NOT call the LLM. It uses the trained
proficiency model's feature_importances_ when available, and gracefully
degrades to a sensible default (uniform importance) if the model isn't loaded.
"""
from __future__ import annotations
import time
from typing import Any

import numpy as np

from .model_registry import registry


# --------------------------------------------------------------------------- #
# Constants — mirror proficiency_service for direction inference
# --------------------------------------------------------------------------- #
CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
CEFR_THRESHOLDS = {  # numeric score thresholds (lower bound) for each level
    "A1": 0, "A2": 25, "B1": 40, "B2": 55, "C1": 75, "C2": 90,
}
CEFR_LOWER_BOUND = {  # for "below threshold" reasoning
    "A1": 0, "A2": 25, "B1": 40, "B2": 55, "C1": 75, "C2": 90,
}

# Friendly human-readable names for each input feature
FEATURE_LABELS = {
    "vocabulary_score": "vocabulary score",
    "grammar_score": "grammar score",
    "fluency_score": "fluency score",
    "comprehension_score": "comprehension score",
    "exercises_completed": "exercises completed",
    "study_hours": "study hours",
    "days_active": "days active",
}

# Threshold guidance for "study habits" features
STUDY_THRESHOLDS = {
    "exercises_completed": {"good": 50, "great": 100},
    "study_hours": {"good": 60, "great": 120},
    "days_active": {"good": 30, "great": 90},
}

# Score-feature thresholds for CEFR level mapping
SCORE_FEATURES = ["vocabulary_score", "grammar_score", "fluency_score", "comprehension_score"]


class ExplainabilityService:
    """Singleton explainability service."""

    # ------------------------------------------------------------------ #
    # Proficiency explainability
    # ------------------------------------------------------------------ #
    def explain_proficiency(self, input: dict, prediction: dict) -> dict:
        """SHAP-style feature contributions for the proficiency assessment.

        Args:
            input: the raw proficiency input dict (vocabulary_score, etc.)
            prediction: the model's prediction dict, containing at least:
                - level: str (e.g., "B2")
                - level_numeric: int (1..6)
                - feature_importance: list[{feature, importance}]
                  (optional — falls back to model.feature_importances_)

        Returns:
            {
              "level": str,
              "level_numeric": int,
              "top_contributions": [
                {
                  "feature": str,
                  "label": str,
                  "importance": float,         # raw importance (0..1)
                  "value": float,              # input value
                  "direction": "increases"|"decreases"|"neutral",
                  "contribution": float,        # signed contribution (imp * direction * scaled_value)
                  "explanation": str,           # human-readable
                }, ...top 5
              ],
              "summary": str,
              "latency_ms": int,
            }
        """
        t0 = time.perf_counter()
        level = prediction.get("level", "B2")
        level_n = int(prediction.get("level_numeric", 4))

        # Get feature importances — from prediction, or model, or uniform
        fi_map = self._get_feature_importances(prediction)

        # Get scaled input values (use the trained scaler if available)
        scaled_input = self._scaled_input(input)

        # Determine direction (↑ or ↓ level) for each feature
        contributions: list[dict] = []
        for feature, importance in fi_map.items():
            raw_value = float(input.get(feature, 0))
            scaled_value = float(scaled_input.get(feature, 0.0))
            direction, direction_label, dir_explanation = self._direction_for(
                feature, raw_value, scaled_value, level_n
            )
            # Signed contribution: positive scaled value pushes UP the predicted class
            contribution = float(importance) * direction * abs(scaled_value)
            contributions.append({
                "feature": feature,
                "label": FEATURE_LABELS.get(feature, feature.replace("_", " ")),
                "importance": round(float(importance), 4),
                "value": raw_value,
                "scaled_value": round(scaled_value, 4),
                "direction": direction_label,
                "contribution": round(contribution, 4),
                "explanation": dir_explanation,
            })

        # Sort by absolute contribution descending, take top 5
        contributions.sort(key=lambda c: abs(c["contribution"]), reverse=True)
        top = contributions[:5]

        # Compose a 1-2 sentence summary
        summary = self._compose_summary(level, top, input)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "level": level,
            "level_numeric": level_n,
            "top_contributions": top,
            "all_contributions": contributions,
            "summary": summary,
            "latency_ms": latency_ms,
        }

    # ------------------------------------------------------------------ #
    # Acquisition explainability — attention weights over history
    # ------------------------------------------------------------------ #
    def explain_acquisition(self, history: list, forecast: dict) -> dict:
        """Explain WHICH historical data points most influenced the forecast.

        Args:
            history: list of historical daily scores (numbers)
            forecast: the forecast dict from the acquisition service, which
                      contains a list of forecast points {day, score, lower, upper}

        Returns:
            {
              "attention_weights": [
                {"index": int, "score": float, "weight": float,
                 "day_offset": int, "explanation": str}, ...
              ],
              "top_influencers": [...top 3 by weight],
              "summary": str,
              "latency_ms": int,
            }
        """
        t0 = time.perf_counter()
        try:
            hist = [float(x) for x in (history or [])]
        except Exception:
            hist = []
        # `forecast` may be a dict (full AcquisitionResponse) or a bare list of points.
        if isinstance(forecast, dict):
            forecast_points = forecast.get("forecast", [])
        elif isinstance(forecast, list):
            forecast_points = forecast
        else:
            forecast_points = []

        # Use the same softmax attention as the acquisition service — over the
        # last N points (N = min(len(hist), 14))
        n_attn = min(len(hist), 14)
        if n_attn == 0:
            attention = []
            top_influencers = []
            summary = "Insufficient history to compute attention weights."
        else:
            recent = np.array(hist[-n_attn:], dtype=np.float64)
            weights = self._softmax_attention(recent)
            attention = []
            for i, (val, w) in enumerate(zip(recent, weights)):
                day_offset = -(n_attn - i)  # negative (e.g., -14 .. -1)
                # Rank within window
                rank = int(np.argsort(-weights)[i]) + 1
                if rank == 1:
                    explanation = (
                        f"Most influential historical point: a score of {val:.1f} "
                        f"{abs(day_offset)} day(s) ago received the highest attention "
                        f"weight ({w:.3f}). The forecast leans most heavily on this point."
                    )
                elif rank <= 3:
                    explanation = (
                        f"Strong influence: a score of {val:.1f} "
                        f"{abs(day_offset)} day(s) ago received attention weight {w:.3f} "
                        f"(rank {rank} of {n_attn})."
                    )
                else:
                    explanation = (
                        f"Modest influence: a score of {val:.1f} "
                        f"{abs(day_offset)} day(s) ago received attention weight {w:.3f} "
                        f"(rank {rank} of {n_attn})."
                    )
                attention.append({
                    "index": len(hist) - n_attn + i,
                    "score": round(float(val), 2),
                    "weight": round(float(w), 4),
                    "day_offset": day_offset,
                    "rank": rank,
                    "explanation": explanation,
                })
            top_influencers = sorted(attention, key=lambda a: a["weight"], reverse=True)[:3]
            summary = self._compose_acquisition_summary(hist, forecast_points, top_influencers)

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "attention_weights": attention,
            "top_influencers": top_influencers,
            "n_history_points": len(hist),
            "n_attention_points": n_attn,
            "summary": summary,
            "latency_ms": latency_ms,
        }

    # ------------------------------------------------------------------ #
    # Recommendation reasoning
    # ------------------------------------------------------------------ #
    def explain_recommendations(self, input: dict, prediction: dict) -> list[dict]:
        """Generate a natural-language "why" for each recommendation.

        Args:
            input: raw proficiency input dict
            prediction: prediction dict with `recommendations` list (each has
                        area, priority, action) and `feature_importance` (optional)

        Returns:
            list of {
              "area": str,
              "priority": str,
              "action": str,
              "why": str,
              "feature_importance_pct": float | None,
              "gap_vs_threshold": float | None,
            }
        """
        t0 = time.perf_counter()
        recs = prediction.get("recommendations", [])
        fi_map = self._get_feature_importances(prediction)
        level = prediction.get("level", "B2")

        out: list[dict] = []
        for rec in recs:
            area = rec.get("area", "")
            area_lower = area.lower()
            action = rec.get("action", "")
            priority = rec.get("priority", "Medium")

            # Try to find the matching feature
            feature_key = None
            for key in fi_map:
                if area_lower in key or key.startswith(area_lower.split()[0]):
                    feature_key = key
                    break
                if area_lower.replace(" ", "_") in key:
                    feature_key = key
                    break
            # Special-case "Study Habits" — uses exercises_completed / study_hours / days_active
            if area_lower == "study habits":
                feature_key = "exercises_completed"

            importance_pct = None
            gap = None
            why_parts: list[str] = []

            if feature_key and feature_key in fi_map:
                importance_pct = round(fi_map[feature_key] * 100, 1)
                why_parts.append(
                    f"this area has {importance_pct}% feature importance in the proficiency model"
                )

            # Compute gap vs. next-level threshold (for score features)
            if feature_key in SCORE_FEATURES:
                user_val = float(input.get(feature_key, 0))
                # Find threshold for the level ABOVE the predicted level
                idx = CEFR_LEVELS.index(level) if level in CEFR_LEVELS else 3
                if idx + 1 < len(CEFR_LEVELS):
                    next_level = CEFR_LEVELS[idx + 1]
                    threshold = CEFR_LOWER_BOUND.get(next_level, 75)
                    gap = round(threshold - user_val, 1)
                    if gap > 0:
                        why_parts.append(
                            f"your {FEATURE_LABELS.get(feature_key, feature_key)} ({user_val:.0f}) "
                            f"is {gap} points below the {next_level} threshold ({threshold})"
                        )
                    else:
                        why_parts.append(
                            f"your {FEATURE_LABELS.get(feature_key, feature_key)} ({user_val:.0f}) "
                            f"already exceeds the {next_level} threshold ({threshold})"
                        )
            elif feature_key in STUDY_THRESHOLDS:
                user_val = float(input.get(feature_key, 0))
                thr = STUDY_THRESHOLDS[feature_key]
                good = thr["good"]
                if user_val < good:
                    gap = round(good - user_val, 1)
                    why_parts.append(
                        f"your {FEATURE_LABELS.get(feature_key, feature_key)} ({user_val:.0f}) "
                        f"is {gap} below the recommended minimum ({good})"
                    )
                else:
                    why_parts.append(
                        f"your {FEATURE_LABELS.get(feature_key, feature_key)} ({user_val:.0f}) "
                        f"meets the recommended minimum ({good})"
                    )

            # Compose the "why"
            if why_parts:
                why = f"Recommendation: {action} — because " + ", and ".join(why_parts) + "."
            else:
                why = f"Recommendation: {action} — identified as a priority area for level {level} improvement."

            out.append({
                "area": area,
                "priority": priority,
                "action": action,
                "why": why,
                "feature_importance_pct": importance_pct,
                "gap_vs_threshold": gap,
                "latency_ms": int((time.perf_counter() - t0) * 1000),
            })
        return out

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #
    def _get_feature_importances(self, prediction: dict) -> dict[str, float]:
        """Pull a {feature: importance} map from the prediction OR the model.

        Falls back to a uniform distribution if neither is available.
        """
        fi_list = prediction.get("feature_importance") or []
        if fi_list:
            out = {}
            for item in fi_list:
                feat = item.get("feature")
                imp = float(item.get("importance", 0))
                if feat:
                    out[feat] = imp
            if out:
                # Re-normalize to sum to 1
                total = sum(out.values()) or 1.0
                return {k: v / total for k, v in out.items()}

        # Fall back to the trained model's feature_importances_
        try:
            prof = registry._proficiency
            if prof is not None and prof.feature_importances_ is not None:
                from .proficiency_service import FEATURE_NAMES
                return {name: float(fi) for name, fi in zip(FEATURE_NAMES, prof.feature_importances_)}
        except Exception:
            pass

        # Last resort: uniform
        from .proficiency_service import FEATURE_NAMES
        n = len(FEATURE_NAMES)
        return {name: 1.0 / n for name in FEATURE_NAMES}

    def _scaled_input(self, input: dict) -> dict[str, float]:
        """Run the trained scaler on the user input to get z-scored values.

        The sign of the z-score tells us direction (above/below training mean).
        Returns {feature: scaled_value}.
        """
        try:
            prof = registry._proficiency
            if prof is not None and prof.scaler is not None:
                from .proficiency_service import FEATURE_NAMES
                row = np.array([[float(input.get(f, 0)) for f in FEATURE_NAMES]])
                scaled = prof.scaler.transform(row)[0]
                return {f: float(s) for f, s in zip(FEATURE_NAMES, scaled)}
        except Exception:
            pass
        # Fallback: zero-center using simple mean=60 heuristic for score features
        out = {}
        for f in ["vocabulary_score", "grammar_score", "fluency_score", "comprehension_score"]:
            out[f] = (float(input.get(f, 60)) - 60.0) / 18.0
        for f in ["exercises_completed"]:
            out[f] = (float(input.get(f, 30)) - 50.0) / 50.0
        for f in ["study_hours"]:
            out[f] = (float(input.get(f, 60)) - 100.0) / 60.0
        for f in ["days_active"]:
            out[f] = (float(input.get(f, 30)) - 90.0) / 90.0
        return out

    def _direction_for(
        self, feature: str, raw_value: float, scaled_value: float, level_n: int
    ) -> tuple[float, str, str]:
        """Determine whether the feature value INCREASES, DECREASES, or is NEUTRAL
        toward the predicted CEFR level.

        Returns (sign, label, explanation).
        sign: +1 (increases), -1 (decreases), 0 (neutral)
        label: "increases" | "decreases" | "neutral"
        explanation: human-readable sentence
        """
        # Direction is determined by sign of scaled value (above training mean = ↑)
        # For study-habits features we use a friendlier threshold-based framing.
        label = FEATURE_LABELS.get(feature, feature.replace("_", " "))

        if feature in SCORE_FEATURES:
            if scaled_value > 0.3:
                sign = 1.0
                direction = "increases"
                # Friendly framing based on raw value
                if raw_value >= 85:
                    explanation = (
                        f"Your {label} of {raw_value:.0f} strongly supports a "
                        f"{CEFR_LEVELS[max(0, level_n - 1)]} level (above average)."
                    )
                else:
                    explanation = (
                        f"Your {label} of {raw_value:.0f} is above the training-set "
                        f"average, supporting the {CEFR_LEVELS[max(0, level_n - 1)]} prediction."
                    )
            elif scaled_value < -0.3:
                sign = -1.0
                direction = "decreases"
                explanation = (
                    f"Your {label} of {raw_value:.0f} is below the training-set "
                    f"average, pulling the predicted level downward."
                )
            else:
                sign = 0.0
                direction = "neutral"
                explanation = (
                    f"Your {label} of {raw_value:.0f} is close to the training-set "
                    f"average — neutral influence on the predicted level."
                )
            return sign, direction, explanation

        # Study-habits features
        if feature in STUDY_THRESHOLDS:
            thr = STUDY_THRESHOLDS[feature]
            good = thr["good"]
            great = thr["great"]
            if raw_value >= great:
                sign = 1.0
                direction = "increases"
                explanation = (
                    f"Your {label} of {raw_value:.0f} exceeds the recommended 'great' "
                    f"benchmark ({great}) — strong support for a higher CEFR level."
                )
            elif raw_value >= good:
                sign = 0.5
                direction = "increases"
                explanation = (
                    f"Your {label} of {raw_value:.0f} meets the recommended 'good' "
                    f"benchmark ({good}) — modest support for the predicted level."
                )
            else:
                sign = -1.0
                direction = "decreases"
                explanation = (
                    f"Your {label} of {raw_value:.0f} is below the recommended 'good' "
                    f"benchmark ({good}) — pulling the predicted level downward."
                )
            return sign, direction, explanation

        # Default
        if scaled_value > 0:
            sign = 1.0
            direction = "increases"
        elif scaled_value < 0:
            sign = -1.0
            direction = "decreases"
        else:
            sign = 0.0
            direction = "neutral"
        return sign, direction, f"Your {label} of {raw_value:.0f} has a {direction} effect."

    def _compose_summary(self, level: str, top: list[dict], input: dict) -> str:
        if not top:
            return f"The model predicted CEFR level {level}."
        top_feat = top[0]
        parts = [
            f"The model assigned CEFR level {level}, driven primarily by "
            f"{top_feat['label']} (importance {top_feat['importance']*100:.1f}%, "
            f"value {top_feat['value']:.0f}, direction: {top_feat['direction']})."
        ]
        if len(top) > 1:
            second = top[1]
            parts.append(
                f"Secondary contributor: {second['label']} "
                f"(importance {second['importance']*100:.1f}%)."
            )
        return " ".join(parts)

    def _compose_acquisition_summary(
        self, hist: list[float], forecast: list[dict], top_influencers: list[dict]
    ) -> str:
        if not hist or not forecast or not top_influencers:
            return "Insufficient data for a meaningful forecast explanation."
        top = top_influencers[0]
        first_score = forecast[0].get("score", 0) if forecast else 0
        last_score = forecast[-1].get("score", 0) if forecast else 0
        delta = last_score - first_score
        direction_word = "improves" if delta >= 0 else "declines"
        return (
            f"The forecast {direction_word} from {first_score:.1f} to {last_score:.1f} "
            f"over {len(forecast)} days. The most influential historical data point "
            f"is a score of {top['score']:.1f} from {abs(top['day_offset'])} day(s) ago, "
            f"which received attention weight {top['weight']:.3f}. "
            f"The softmax attention concentrates on the highest recent scores — "
            f"these anchor the model's near-term trajectory."
        )

    def _softmax_attention(self, lags: np.ndarray) -> np.ndarray:
        """Softmax over recent lag values — mirrors acquisition_service."""
        if len(lags) == 0:
            return np.array([])
        if len(lags) == 1:
            return np.array([1.0])
        scaled = (lags - lags.mean()) / (lags.std() + 1e-9)
        e = np.exp(scaled - scaled.max())
        return e / e.sum()


# --------------------------------------------------------------------------- #
# Singleton
# --------------------------------------------------------------------------- #
explainability_service = ExplainabilityService()
