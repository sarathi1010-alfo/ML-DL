"""Singleton lazy model loader + GPU detection + prediction cache.

Holds the MediLingua service instances (proficiency, acquisition, nlp, slm,
genai, agent) and a shared LRU prediction cache.
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
        self._proficiency = None
        self._acquisition = None
        self._nlp = None
        self._slm = None
        self._genai = None
        self._agent = None
        self._rag = None
        self._loaded: dict[str, str] = {}

    # ---- cache helpers ----
    def cache_get(self, key: str) -> Any | None:
        return self._cache.get(key)

    def cache_put(self, key: str, value: Any) -> None:
        self._cache.put(key, value)

    # ---- lazy accessors ----
    @property
    def proficiency(self):
        if self._proficiency is None:
            with self._lock:
                if self._proficiency is None:
                    from .proficiency_service import ProficiencyService
                    logger.info("Training proficiency model...")
                    t0 = time.perf_counter()
                    self._proficiency = ProficiencyService()
                    self._loaded["proficiency"] = "loaded"
                    logger.info(f"Proficiency model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._proficiency

    @property
    def acquisition(self):
        if self._acquisition is None:
            with self._lock:
                if self._acquisition is None:
                    from .acquisition_service import AcquisitionService
                    logger.info("Training acquisition model...")
                    t0 = time.perf_counter()
                    self._acquisition = AcquisitionService()
                    self._loaded["acquisition"] = "loaded"
                    logger.info(f"Acquisition model ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._acquisition

    @property
    def nlp(self):
        if self._nlp is None:
            with self._lock:
                if self._nlp is None:
                    from .nlp_service import NlpService
                    logger.info("Initializing NLP analyzer...")
                    t0 = time.perf_counter()
                    self._nlp = NlpService()
                    self._loaded["nlp"] = "loaded"
                    logger.info(f"NLP analyzer ready ({(time.perf_counter()-t0)*1000:.0f}ms)")
        return self._nlp

    @property
    def slm(self):
        if self._slm is None:
            with self._lock:
                if self._slm is None:
                    from .slm_service import SlmService
                    self._slm = SlmService()
                    self._loaded["slm"] = "loaded"
        return self._slm

    @property
    def genai(self):
        if self._genai is None:
            with self._lock:
                if self._genai is None:
                    from .genai_service import GenaiService
                    self._genai = GenaiService()
                    self._loaded["genai"] = "loaded"
        return self._genai

    @property
    def agent(self):
        if self._agent is None:
            with self._lock:
                if self._agent is None:
                    from .agent_service import TutorAgentService
                    # Pass proficiency service to avoid re-training
                    self._agent = TutorAgentService(proficiency=self.proficiency)
                    self._loaded["agent"] = "ready"
        return self._agent

    @property
    def rag(self):
        if self._rag is None:
            with self._lock:
                if self._rag is None:
                    from .rag_service import rag_service as _rag_service
                    logger.info("Seeding RAG knowledge base...")
                    t0 = time.perf_counter()
                    n = _rag_service.seed()
                    self._rag = _rag_service
                    self._loaded["rag"] = "ready"
                    logger.info(
                        f"RAG ready ({(time.perf_counter()-t0)*1000:.0f}ms, "
                        f"{n} chunks seeded)"
                    )
        return self._rag

    def warm_up(self) -> None:
        """Pre-train the core ML models (proficiency, acquisition, nlp)."""
        try:
            _ = self.proficiency
        except Exception as e:
            logger.error(f"proficiency warm-up failed: {e}")
        try:
            _ = self.acquisition
        except Exception as e:
            logger.error(f"acquisition warm-up failed: {e}")
        try:
            _ = self.nlp
        except Exception as e:
            logger.error(f"nlp warm-up failed: {e}")
        # Lightweight services — init lazily
        try:
            _ = self.slm
        except Exception as e:
            logger.error(f"slm warm-up failed: {e}")
        try:
            _ = self.genai
        except Exception as e:
            logger.error(f"genai warm-up failed: {e}")
        try:
            _ = self.agent
        except Exception as e:
            logger.error(f"agent warm-up failed: {e}")
        # Pre-run the safety test suite so the live pass-rate is available
        # via /metrics/models immediately at startup.
        try:
            from .safety_service import safety_service
            report = safety_service.evaluate()
            logger.info(
                f"Safety layer warmed up: {report['passed']}/{report['total']} "
                f"test cases passed (pass_rate={report['pass_rate']:.2%})"
            )
        except Exception as e:
            logger.error(f"safety warm-up failed: {e}")
        # Pre-init explainability service (lazy loads feature importances)
        try:
            from .explainability_service import explainability_service
            _ = explainability_service
        except Exception as e:
            logger.error(f"explainability warm-up failed: {e}")
        # Pre-seed the RAG knowledge base (TF-IDF + SVD + FAISS index)
        try:
            _ = self.rag
        except Exception as e:
            logger.error(f"rag warm-up failed: {e}")

    def status_map(self) -> dict[str, str]:
        return {
            "proficiency": self._loaded.get("proficiency", "not_loaded"),
            "acquisition": self._loaded.get("acquisition", "not_loaded"),
            "nlp": self._loaded.get("nlp", "not_loaded"),
            "slm": self._loaded.get("slm", "not_loaded"),
            "genai": self._loaded.get("genai", "not_loaded"),
            "agent": self._loaded.get("agent", "not_ready"),
            "rag": self._loaded.get("rag", "not_loaded"),
        }


registry = ModelRegistry()
