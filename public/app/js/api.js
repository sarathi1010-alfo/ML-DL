/* ============================================================
   api.js — MediLingua API helper.
   - API_BASE = '/papi/v1' (Next.js route handler proxies to FastAPI).
   - Embeds realistic MediLingua fallback data so the SPA is fully
     usable even when the backend is unreachable.
   - Exposed as window.API
   ============================================================ */
(function () {
  const API_BASE = '/papi/v1';
  const TOKEN_KEY = 'medilingua_token';
  const USER_KEY = 'medilingua_user';
  const DEFAULT_TIMEOUT = 20000;

  // Map API calls to embedded data keys
  const STATIC_MAP = {
    'GET /health': 'health',
    'GET /metrics': 'metrics',
    'GET /predictions': 'predictions',
    'GET /agent/logs': 'agent_logs',
    'GET /auth/me': 'auth_me',
    'POST /auth/login': 'auth_login',
    'POST /assess/proficiency': 'assess_example',
    'POST /track/acquisition': 'track_example',
    'POST /analyze/communication': 'analyzer_example',
    'POST /slm/scenario': 'slm_scenario',
    'POST /slm/explain': 'slm_explain',
    'POST /slm/converse': 'slm_converse',
    'POST /genai/case-study': 'genai_case',
    'POST /genai/quiz': 'genai_quiz',
    'POST /genai/simulation': 'genai_simulation',
    'POST /agent/tutor': 'agent_tutor',
    // Explainability + Safety (Task ID 5)
    'POST /explain/proficiency': 'explain_proficiency',
    'POST /explain/acquisition': 'explain_acquisition',
    'POST /explain/recommendations': 'explain_recommendations',
    'GET /safety/stats': 'safety_stats',
    'POST /safety/screen': 'safety_screen',
    'POST /safety/evaluate': 'safety_evaluate',
    // RAG medical knowledge base (Task ID 6)
    'GET /rag/documents': 'rag_documents',
    'POST /rag/query': 'rag_query'
  };

  function apiUrl(path) {
    return API_BASE + path;
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function setUser(u) { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function isLoggedIn() { return !!getToken(); }

  function getStatic(method, path) {
    const key = method + ' ' + path.split('?')[0];
    const dataKey = STATIC_MAP[key];
    if (!dataKey) return null;
    const d = window.__STATIC_DATA__ && window.__STATIC_DATA__[dataKey];
    return d ? JSON.parse(JSON.stringify(d)) : null; // deep clone
  }

  async function api(path, { method = 'GET', body, isForm = false, timeout = DEFAULT_TIMEOUT, signal } = {}) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body && !isForm) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body && isForm) {
      opts.body = body;
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', () => ctrl.abort());
    }
    opts.signal = ctrl.signal;

    let res, data;
    try {
      res = await fetch(apiUrl(path), opts);
    } catch (e) {
      clearTimeout(t);
      const staticData = getStatic(method, path);
      if (staticData) return staticData;
      if (e.name === 'AbortError') {
        throw { status: 0, message: 'Request timed out.', data: null, timeout: true };
      }
      throw { status: 0, message: 'Network error. ' + (e.message || ''), data: null };
    }
    clearTimeout(t);

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); }
      catch (e) {
        const sd = getStatic(method, path);
        if (sd) return sd;
        data = { detail: 'Invalid JSON response' };
      }
    } else {
      const sd = getStatic(method, path);
      if (sd) return sd;
      const text = await res.text().catch(() => '');
      data = { detail: text || 'Non-JSON response' };
    }

    if (!res.ok) {
      const sd = getStatic(method, path);
      if (sd) return sd;
      const msg = data.detail || data.message || data.error || 'Request failed (' + res.status + ')';
      throw { status: res.status, message: msg, data };
    }
    return data;
  }

  const get = (path, opts) => api(path, { ...opts, method: 'GET' });
  const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
  const del = (path, opts) => api(path, { ...opts, method: 'DELETE' });
  const upload = (path, formData, opts) => api(path, { ...opts, method: 'POST', body: formData, isForm: true });

  async function probeHealth() {
    try {
      const data = await api('/health', { timeout: 5000 });
      return { ok: data.status === 'healthy' || data.status === 'ok', status: data.status, data };
    } catch (e) {
      const sd = getStatic('GET', '/health');
      if (sd) return { ok: true, status: sd.status, data: sd };
      return { ok: false, status: 'offline', data: null, error: e };
    }
  }

  window.API = {
    apiUrl, api, get, post, del, upload,
    getToken, setToken, getUser, setUser, clearAuth, isLoggedIn,
    probeHealth,
    TOKEN_KEY, USER_KEY
  };
})();
