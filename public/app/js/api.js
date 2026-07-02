/* ============================================================
   api.js — API helper.
   Builds /api/v1<path>?XTransformPort=3003
   Attaches Bearer token from localStorage.
   JSON handling, error normalization, timeout (20s).
   Exposed as window.API
   ============================================================ */
(function () {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'aiplatform_token';
  const USER_KEY = 'aiplatform_user';
  const DEFAULT_TIMEOUT = 20000; // 20s — never spin forever

  // Route API calls through Next.js (port 3000) — the public gateway can reach
  // port 3000 but NOT port 8000 directly. Next.js's /api/v1/[...path] route
  // handler streams the request to FastAPI at 127.0.0.1:8000.
  function apiUrl(path) {
    const sep = path.includes('?') ? '&' : '?';
    return API_BASE + path + sep + 'XTransformPort=3003';
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

  /**
   * api(path, { method, body, isForm, timeout, signal })
   * Returns parsed JSON.
   * Throws { status, message, data } on error.
   */
  async function api(path, { method = 'GET', body, isForm = false, timeout = DEFAULT_TIMEOUT, signal } = {}) {
    const opts = { method, headers: {} };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    if (body && !isForm) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body && isForm) {
      opts.body = body; // FormData — browser sets content-type
    }

    // Timeout via AbortController
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
      if (e.name === 'AbortError') {
        throw { status: 0, message: 'Request timed out. The backend may be starting up — please retry in a moment.', data: null, timeout: true };
      }
      throw { status: 0, message: 'Network error — cannot reach the API. ' + (e.message || ''), data: null };
    }
    clearTimeout(t);

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); }
      catch (e) { data = { detail: 'Invalid JSON response' }; }
    } else {
      const text = await res.text().catch(() => '');
      data = { detail: text || 'Non-JSON response' };
    }

    if (!res.ok) {
      const msg = data.detail || data.message || data.error || `Request failed (${res.status})`;
      // 401 → clear token silently so demo mode keeps working without crashing
      if (res.status === 401) {
        // do not auto-clear — the API contract allows demo without token
      }
      throw { status: res.status, message: msg, data };
    }
    return data;
  }

  // Convenience verbs
  const get = (path, opts) => api(path, { ...opts, method: 'GET' });
  const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
  const del = (path, opts) => api(path, { ...opts, method: 'DELETE' });
  const upload = (path, formData, opts) => api(path, { ...opts, method: 'POST', body: formData, isForm: true });

  // Probe backend health. Returns { ok, status, data } — never throws.
  async function probeHealth() {
    try {
      const data = await api('/health', { timeout: 5000 });
      return { ok: data.status === 'healthy' || data.status === 'ok' || data.status === 'degraded', status: data.status, data };
    } catch (e) {
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
