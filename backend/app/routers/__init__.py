from .auth import router as auth_router
from .churn import router as churn_router
from .premium import router as premium_router
from .damage import router as damage_router
from .forecast import router as forecast_router
from .bert import router as bert_router
from .rag import router as rag_router
from .agent import router as agent_router
from .slm import router as slm_router
from .metrics import router as metrics_router
from .predictions import router as predictions_router

__all__ = [
    "auth_router", "churn_router", "premium_router", "damage_router",
    "forecast_router", "bert_router", "rag_router", "agent_router",
    "slm_router", "metrics_router", "predictions_router",
]
