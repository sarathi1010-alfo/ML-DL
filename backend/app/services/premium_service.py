"""Healthcare premium service: XGBRegressor on synthetic insurance data."""
from __future__ import annotations
import time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import xgboost as xgb

from ..core.logging import logger
from .model_registry import save_artifact, load_artifact


class PremiumService:
    MODEL_NAME = "XGBoost Regressor"

    def __init__(self) -> None:
        cached = load_artifact("premium_model")
        if cached and all(k in cached for k in ("model", "residual_std", "metrics")):
            self.model = cached["model"]
            self.residual_std = cached["residual_std"]
            self.metrics = cached["metrics"]
            logger.info("Loaded premium model from disk cache.")
            return
        self._train()
        save_artifact("premium_model", {
            "model": self.model,
            "residual_std": self.residual_std,
            "metrics": self.metrics,
        })

    def _generate_data(self, n: int = 2000, seed: int = 7) -> pd.DataFrame:
        rng = np.random.default_rng(seed)
        age = rng.integers(18, 66, size=n)
        bmi = rng.normal(27, 5, size=n).clip(15, 45)
        smoker = rng.integers(0, 2, size=n)
        region = rng.integers(0, 4, size=n)
        premium = (
            age * 10
            + bmi * 5
            + smoker * 500
            + region * 30
            + rng.normal(0, 80, size=n)
        )
        premium = premium.clip(50, 8000)
        return pd.DataFrame({"age": age, "bmi": bmi, "smoker": smoker, "region": region, "premium": premium})

    def _train(self) -> None:
        df = self._generate_data()
        X = df[["age", "bmi", "smoker", "region"]].values
        y = df["premium"].values
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        self.model = xgb.XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,
            random_state=42,
            n_jobs=1,
            verbosity=0,
        )
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        mae = float(mean_absolute_error(y_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
        r2 = float(r2_score(y_test, preds))
        self.residual_std = float(np.std(y_test - preds))
        self.metrics = {"mae": mae, "rmse": rmse, "r2": r2}
        logger.info(f"Premium trained: mae={mae:.2f}, rmse={rmse:.2f}, r2={r2:.3f}")

    def _level(self, impact: float) -> str:
        if impact > 300:
            return "High"
        if impact > 100:
            return "Medium"
        return "Low"

    def predict(self, age: int, bmi: float, smoker: bool, region: int) -> dict:
        t0 = time.perf_counter()
        X = np.array([[age, bmi, int(smoker), region]], dtype=float)
        pred = float(self.model.predict(X)[0])
        # Confidence interval ±~5%
        margin = pred * 0.05
        ci = [round(pred - margin, 2), round(pred + margin, 2)]
        # Risk factors breakdown (approximate from training coefficients)
        age_impact = float(age) * 10.0
        bmi_impact = float(bmi) * 5.0
        smoker_impact = 500.0 if smoker else 0.0
        risk_factors = [
            {"factor": "Smoking", "impact": round(smoker_impact, 2), "level": self._level(smoker_impact)},
            {"factor": "Age", "impact": round(age_impact, 2), "level": self._level(age_impact)},
            {"factor": "BMI", "impact": round(bmi_impact, 2), "level": self._level(bmi_impact)},
        ]
        if region > 0:
            risk_factors.append({"factor": "Region", "impact": round(float(region) * 30.0, 2), "level": self._level(region * 30.0)})
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "predicted_premium": round(pred, 2),
            "currency": "USD",
            "confidence_interval": ci,
            "risk_factors": risk_factors,
            "model": self.MODEL_NAME,
            "latency_ms": max(1, latency_ms),
        }
