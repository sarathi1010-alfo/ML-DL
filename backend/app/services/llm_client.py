"""Async LLM client for the local LLM mini-service at port 3003."""
from __future__ import annotations
import httpx
from ..config import settings


class LLMClient:
    def __init__(self, base_url: str | None = None, timeout: float = 15.0) -> None:
        self.base_url = (base_url or settings.llm_service_url).rstrip("/")
        self.timeout = timeout
        self._available: bool | None = None
        self._last_check: float = 0.0

    async def chat(self, prompt: str, system: str | None = None, max_tokens: int = 400) -> str:
        """Call LLM service. Returns empty string on any failure."""
        try:
            payload = {"prompt": prompt, "max_tokens": max_tokens}
            if system:
                payload["system"] = system
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}/llm/chat", json=payload)
                if resp.status_code != 200:
                    return ""
                data = resp.json()
                # Accept several shapes
                if isinstance(data, dict):
                    for k in ("response", "text", "output", "content", "answer"):
                        v = data.get(k)
                        if isinstance(v, str) and v.strip():
                            return v
                    # Maybe nested
                    for k in ("choices", "messages"):
                        v = data.get(k)
                        if isinstance(v, list) and v:
                            first = v[0]
                            if isinstance(first, dict):
                                for kk in ("text", "content", "message"):
                                    vv = first.get(kk)
                                    if isinstance(vv, dict):
                                        for kkk in ("content", "text"):
                                            if isinstance(vv.get(kkk), str):
                                                return vv[kkk]
                                    if isinstance(vv, str):
                                        return vv
                if isinstance(data, str):
                    return data
                return str(data)
        except Exception:
            return ""

    def is_available(self) -> bool:
        """Synchronous availability probe (short timeout)."""
        import time
        now = time.time()
        if self._available is not None and (now - self._last_check) < 10:
            return self._available
        try:
            with httpx.Client(timeout=2.0) as client:
                resp = client.get(f"{self.base_url}/")
                ok = resp.status_code < 500
                self._available = ok
        except Exception:
            self._available = False
        self._last_check = now
        return self._available


llm_client = LLMClient()
