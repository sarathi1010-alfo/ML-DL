"""Singleton lazy model loader + GPU detection + prediction cache.

Each model is wrapped in a singleton service object trained on synthetic data on
first access (or warmed up at startup). A small LRU dict caches predictions by
hashed input to make repeated calls fast in the demo.
"""
from __future__ import annotations
import hashlib
import threading
import pickle
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

from ..config import DATA_DIR
from ..core.logging import logger


def _gpu_available() -> bool:
    """Best-effort GPU detection (we don't have torch — always False in sandbox)."""
    try:
        import numpy as np  # noqa: F401
    except Exception:
        pass
    try:
        import faiss
        if hasattr(faiss, "get_num_gpus"):
            return faiss.get_num_gpus() > 0
    except Exception:
        pass
    return False


GPU_AVAILABLE = _gpu_available()


class _LRUCache:
    def __init__(self, capacity: int = 256) -> None:
        self.capacity = capacity
        self._store: OrderedDict[str, Any] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = value
            self._store.move_to_end(key)
            while len(self._store) > self.capacity:
                self._store.popitem(last=False)

    def __len__(self) -> int:
        return len(self._store)


def hash_input(payload: Any) -> str:
    """Stable hash for caching arbitrary JSON-serializable payloads."""
    try:
        import json
        s = json.dumps(payload, sort_keys=True, default=str)
    except Exception:
        s = str(payload)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def save_artifact(name: str, obj: Any) -> None:
    path = DATA_DIR / f"{name}.pkl"
    try:
        with open(path, "wb") as f:
            pickle.dump(obj, f)
    except Exception as e:
        logger.warning(f"Could not save artifact {name}: {e}")


def load_artifact(name: str) -> Any | None:
    path = DATA_DIR / f"{name}.pkl"
    if not path.exists():
        return None
    try:
        with open(path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        logger.warning(f"Could not load artifact {name}: {e}")
        return None


class ModelRegistry:
    """Holds singleton service instances + a shared prediction cache."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache = _LRUCache(256)
        self._churn = None
        self._premium = None
        self._damage = None
        self._forecast = None
        self._bert = None
        self._rag = None
        self._slm = None
        self._loaded: dict[str, str] = {}

    # ---- cache helpers ----
    def cache_get(self, key: str) -> Any | None:
        return self._cache.get(key)

    def cache_put(self, key: str, value: Any) -> None:
        self._cache.put(key, value)

    # ---- lazy accessors ----
    @property
    def churn(self):
        if self._churn is None:
            with self._lock:
                if self._churn is None:
                    from .churn_service import ChurnService
                    logger.info("Training churn model...")
                    t0 = time.perf_counter()
                    self._churn = ChurnService()
                    self._loaded["churn"] = "loaded"
                    logger.info(f"Churn model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._churn

    @property
    def premium(self):
        if self._premium is None:
            with self._lock:
                if self._premium is None:
                    from .premium_service import PremiumService
                    logger.info("Training premium model...")
                    t0 = time.perf_counter()
                    self._premium = PremiumService()
                    self._loaded["premium"] = "loaded"
                    logger.info(f"Premium model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._premium

    @property
    def damage(self):
        if self._damage is None:
            with self._lock:
                if self._damage is None:
                    from .damage_service import DamageService
                    logger.info("Training damage model...")
                    t0 = time.perf_counter()
                    self._damage = DamageService()
                    self._loaded["damage"] = "loaded"
                    logger.info(f"Damage model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._damage

    @property
    def forecast(self):
        if self._forecast is None:
            with self._lock:
                if self._forecast is None:
                    from .forecast_service import ForecastService
                    logger.info("Training forecast model...")
                    t0 = time.perf_counter()
                    self._forecast = ForecastService()
                    self._loaded["forecast"] = "loaded"
                    logger.info(f"Forecast model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._forecast

    @property
    def bert(self):
        if self._bert is None:
            with self._lock:
                if self._bert is None:
                    from .bert_service import BertService
                    logger.info("Training bert (TF-IDF + LogReg) model...")
                    t0 = time.perf_counter()
                    self._bert = BertService()
                    self._loaded["bert"] = "loaded"
                    logger.info(f"Bert proxy ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._bert

    @property
    def rag(self):
        if self._rag is None:
            with self._lock:
                if self._rag is None:
                    from .rag_service import RagService
                    logger.info("Initializing RAG service...")
                    t0 = time.perf_counter()
                    self._rag = RagService()
                    self._rag.seed_default_knowledge_base()
                    self._loaded["rag"] = "ready"
                    logger.info(f"RAG ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._rag

    @property
    def slm(self):
        if self._slm is None:
            with self._lock:
                if self._slm is None:
                    from .slm_service import SlmService
                    self._slm = SlmService()
                    self._loaded["slm"] = "loaded"
        return self._slm

    def warm_up(self) -> None:
        """Pre-train the core models (churn, premium, bert, forecast, damage)."""
        try:
            _ = self.churn
        except Exception as e:
            logger.error(f"churn warm-up failed: {e}")
        try:
            _ = self.premium
        except Exception as e:
            logger.error(f"premium warm-up failed: {e}")
        try:
            _ = self.bert
        except Exception as e:
            logger.error(f"bert warm-up failed: {e}")
        try:
            _ = self.forecast
        except Exception as e:
            logger.error(f"forecast warm-up failed: {e}")
        try:
            _ = self.damage
        except Exception as e:
            logger.error(f"damage warm-up failed: {e}")

    def status_map(self) -> dict[str, str]:
        out = {
            "churn": self._loaded.get("churn", "not_loaded"),
            "premium": self._loaded.get("premium", "not_loaded"),
            "damage": self._loaded.get("damage", "not_loaded"),
            "forecast": self._loaded.get("forecast", "not_loaded"),
            "bert": self._loaded.get("bert", "not_loaded"),
            "rag": self._loaded.get("rag", "not_ready"),
            "slm": self._loaded.get("slm", "not_loaded"),
        }
        return out


registry = ModelRegistry()
