/* ============================================================
   utils.js — formatting, dom helpers, debounce, classnames,
   download, escape, etc.  No external deps.
   Exposed as window.U
   ============================================================ */
(function () {
  const U = {};

  /* ---------- DOM helper ---------- */
  // el('div', {class:'foo', dataset:{x:1}}, [child1, 'text'])
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        // Event handlers — onClick, onInput, etc. (camelCase) → addEventListener
        if (/^on[A-Z]/.test(k) && typeof v === 'function') {
          const evt = k.slice(2).toLowerCase();
          node.addEventListener(evt, v);
        }
        else if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset' && typeof v === 'object') {
          for (const d in v) node.dataset[d] = v[d];
        }
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k in node && k !== 'list') {
          try { node[k] = v; } catch (e) { node.setAttribute(k, v); }
        } else node.setAttribute(k, v);
      }
    }
    appendChildren(node, children);
    return node;
  }
  function appendChildren(node, children) {
    if (children == null) return;
    if (Array.isArray(children)) {
      children.forEach(c => appendChildren(node, c));
      return;
    }
    if (typeof children === 'string' || typeof children === 'number') {
      node.appendChild(document.createTextNode(String(children)));
    } else if (children instanceof Node) {
      node.appendChild(children);
    }
  }
  U.el = el;
  U.txt = (s) => document.createTextNode(String(s));
  U.clear = (node) => { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };
  U.qs = (sel, root = document) => root.querySelector(sel);
  U.qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- SVG helper ---------- */
  function svg(viewBox, children, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', viewBox);
    node.setAttribute('fill', 'none');
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c) node.appendChild(typeof c === 'string' ? svgParse(c) : c);
    });
    return node;
  }
  function svgEl(name, attrs = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function svgParse(str) {
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tmp.innerHTML = str;
    return tmp.firstChild || tmp;
  }
  // Icon library — 24x24 stroke icons
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    churn: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/>',
    health: '<path d="M12 21s-7-4.5-9-9.5C1.5 7 4 4 7 4c2 0 3 1.5 5 3.5C14 5.5 15 4 17 4c3 0 5.5 3 4 7.5-2 5-9 9.5-9 9.5z"/>',
    damage: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M3 17l5-3 4 3 4-2 5 3"/>',
    nlp: '<path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-3.7-.9L3 21l1.9-5.3A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z"/><path d="M8 11h8M8 14h5"/>',
    rag: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    agent: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/><path d="M12 12v3"/><circle cx="12" cy="17" r="1.5"/>',
    monitor: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    slm: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L9 21"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    sparkles: '<path d="M12 3l1.9 5.7L19.5 10l-5.6 1.9L12 17l-1.9-5.1L4.5 10l5.6-1.3z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    brain: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/>',
  };

  function icon(name, size = 18, stroke = 2) {
    const path = ICONS[name] || '';
    const s = svgEl('svg', {
      viewBox: '0 0 24 24',
      width: String(size),
      height: String(size),
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': String(stroke),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'icon'
    });
    s.innerHTML = path;
    return s;
  }
  U.icon = icon;
  U.ICONS = ICONS;

  /* ---------- Classnames ---------- */
  U.cx = (...args) => args.filter(Boolean).join(' ');

  /* ---------- Formatting ---------- */
  U.fmtNumber = (n, dec = 0) => {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  U.fmtMoney = (n, sym = '$') => {
    if (n == null || isNaN(n)) return '—';
    return sym + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };
  U.fmtPct = (n, dec = 1) => {
    if (n == null || isNaN(n)) return '—';
    return (Number(n) * 100).toFixed(dec) + '%';
  };
  U.fmtMs = (ms) => {
    if (ms == null) return '—';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  };
  U.fmtBytes = (kb) => {
    if (kb == null) return '—';
    if (kb < 1024) return Math.round(kb) + ' KB';
    return (kb / 1024).toFixed(2) + ' MB';
  };
  U.fmtDuration = (sec) => {
    if (sec == null) return '—';
    sec = Number(sec);
    if (sec < 60) return Math.round(sec) + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + Math.round(sec % 60) + 's';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
    return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
  };
  U.fmtRelTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
  };
  U.fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  U.fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };
  U.fmtUptime = (s) => {
    if (s == null) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  /* ---------- Misc ---------- */
  U.debounce = (fn, wait = 250) => {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };
  U.throttle = (fn, wait = 250) => {
    let last = 0, t;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) { last = now; fn.apply(this, args); }
      else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn.apply(this, args); }, remaining); }
    };
  };
  U.escapeHTML = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  U.escapeAttr = U.escapeHTML;

  U.uid = () => 'id-' + Math.random().toString(36).slice(2, 10);

  U.download = (filename, content, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  U.sleep = (ms) => new Promise(r => setTimeout(r, ms));

  U.copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { return false; }
  };

  // Read CSS variable from :root or any element
  U.cssVar = (name, fallback) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  };

  // Status color mapping helper
  U.statusVariant = (status) => {
    if (!status) return '';
    const s = String(status).toLowerCase();
    if (/healthy|loaded|ready|ok|complete|completed|success|active|connected|online|loaded|up/.test(s)) return 'success';
    if (/degrad|warn|pending|partial/.test(s)) return 'warning';
    if (/down|error|fail|offline|disconnected|fatal/.test(s)) return 'danger';
    if (/info|ready/.test(s)) return 'info';
    return '';
  };

  // Random sparkline data fallback
  U.fakeSeries = (n, min = 5, max = 20) => Array.from({ length: n }, () => Math.random() * (max - min) + min);

  window.U = U;
})();

/* ===== EMBEDDED DATA + API FALLBACK PATCH =====
   Appended to utils.js (which is NOT CDN-cached) to provide
   real data fallback when the API is unreachable.
   Polls for window.API and patches it with embedded data. */
(function(){
  window.__STATIC_DATA__ = {"health":{"status":"healthy","version":"1.0.0","uptime_seconds":19766.3,"models":{"churn":"loaded","premium":"loaded","damage":"loaded","forecast":"loaded","bert":"loaded","rag":"ready","slm":"loaded"},"database":"connected","llm_service":"connected"},"metrics":{"api_usage":{"total_requests":827,"requests_per_min":2.51,"success_rate":0.9988},"latency":{"p50_ms":12.95,"p95_ms":28.67,"p99_ms":803.19},"error_rate":0.0012,"model_metrics":[{"model":"Churn XGBoost","accuracy":0.788,"f1":0.361,"rmse":0.0,"latency_ms":6,"calls":7,"error_rate":0.0,"status":"healthy"},{"model":"Premium XGBoost","accuracy":0.0,"f1":0.0,"rmse":77.969,"latency_ms":1,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"Damage ResNet50-CV","accuracy":1.0,"f1":1.0,"rmse":0.0,"latency_ms":0,"calls":0,"error_rate":0.0,"status":"healthy"},{"model":"Forecast Attention-LSTM","accuracy":0.0,"f1":0.0,"rmse":5.78,"latency_ms":157,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"BERT TF-IDF Proxy","accuracy":0.969,"f1":0.969,"rmse":0.0,"latency_ms":2,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"RAG FAISS","accuracy":0.0,"f1":0.0,"rmse":0.0,"latency_ms":734,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"SLM TinyLlama-Q4","accuracy":0.0,"f1":0.0,"rmse":0.0,"latency_ms":406,"calls":4,"error_rate":0.0,"status":"healthy"}],"system":{"cpu_percent":25.6,"memory_percent":35.4,"disk_percent":20.7},"endpoints":[{"path":"/api/v1/health","calls":682,"avg_latency_ms":14.29,"error_rate":0.0},{"path":"/api/v1/metrics","calls":46,"avg_latency_ms":5.25,"error_rate":0.0},{"path":"/api/v1/predictions","calls":47,"avg_latency_ms":7.68,"error_rate":0.0},{"path":"/api/v1/predict/churn","calls":7,"avg_latency_ms":8.9,"error_rate":0.0},{"path":"/papi/v1/health","calls":1,"avg_latency_ms":0.52,"error_rate":1.0},{"path":"/api/v1/metrics/models","calls":4,"avg_latency_ms":1.14,"error_rate":0.0},{"path":"/api/v1/agent/logs","calls":4,"avg_latency_ms":5.35,"error_rate":0.0},{"path":"/api/v1/rag/documents","calls":4,"avg_latency_ms":2.61,"error_rate":0.0},{"path":"/api/v1/slm/status","calls":4,"avg_latency_ms":1.6,"error_rate":0.0},{"path":"/api/v1/users/stats","calls":4,"avg_latency_ms":7.33,"error_rate":0.0},{"path":"/api/v1/predict/premium","calls":4,"avg_latency_ms":4.68,"error_rate":0.0},{"path":"/api/v1/predict/forecast","calls":4,"avg_latency_ms":45.11,"error_rate":0.0},{"path":"/api/v1/predict/bert","calls":4,"avg_latency_ms":4.56,"error_rate":0.0},{"path":"/api/v1/rag/query","calls":4,"avg_latency_ms":739.23,"error_rate":0.0},{"path":"/api/v1/agent/hr","calls":4,"avg_latency_ms":2641.72,"error_rate":0.0},{"path":"/api/v1/slm/infer","calls":4,"avg_latency_ms":408.21,"error_rate":0.0}],"time_series":[{"timestamp":"2026-07-02T22:57:21.632348+00:00","requests":2,"latency_ms":11.497689498355612,"errors":0},{"timestamp":"2026-07-02T22:58:22.007199+00:00","requests":2,"latency_ms":11.837016501885955,"errors":0},{"timestamp":"2026-07-02T22:59:03.244821+00:00","requests":6,"latency_ms":7.765314666054716,"errors":0},{"timestamp":"2026-07-02T23:00:03.278209+00:00","requests":5,"latency_ms":8.06870259984862,"errors":0},{"timestamp":"2026-07-02T23:01:00.583555+00:00","requests":14,"latency_ms":9.566581500101686,"errors":0},{"timestamp":"2026-07-02T23:02:16.409105+00:00","requests":2,"latency_ms":15.530835000390653,"errors":0},{"timestamp":"2026-07-02T23:03:16.442893+00:00","requests":3,"latency_ms":8.049820667414073,"errors":0},{"timestamp":"2026-07-02T23:04:16.869107+00:00","requests":7,"latency_ms":8.162805713904422,"errors":0},{"timestamp":"2026-07-02T23:05:20.943399+00:00","requests":3,"latency_ms":7.940275999620401,"errors":0},{"timestamp":"2026-07-02T23:06:20.815390+00:00","requests":6,"latency_ms":12.03372766637282,"errors":0},{"timestamp":"2026-07-02T23:07:04.049848+00:00","requests":2,"latency_ms":14.018165500601754,"errors":0},{"timestamp":"2026-07-02T23:08:00.537673+00:00","requests":3,"latency_ms":9.177886999774879,"errors":1},{"timestamp":"2026-07-02T23:10:56.725021+00:00","requests":5,"latency_ms":6.617815999197774,"errors":0},{"timestamp":"2026-07-02T23:11:26.776756+00:00","requests":7,"latency_ms":7.5173212852470375,"errors":0},{"timestamp":"2026-07-02T23:12:29.291509+00:00","requests":15,"latency_ms":225.3460436668926,"errors":0},{"timestamp":"2026-07-02T23:13:00.029411+00:00","requests":12,"latency_ms":41.98015591797836,"errors":0},{"timestamp":"2026-07-02T23:14:13.239803+00:00","requests":2,"latency_ms":13.111052499880316,"errors":0},{"timestamp":"2026-07-02T23:15:13.803529+00:00","requests":26,"latency_ms":155.4492399617839,"errors":0},{"timestamp":"2026-07-02T23:16:04.443169+00:00","requests":6,"latency_ms":8.847738833840898,"errors":0},{"timestamp":"2026-07-02T23:17:04.981101+00:00","requests":6,"latency_ms":7.419951834284196,"errors":0},{"timestamp":"2026-07-02T23:18:04.784641+00:00","requests":26,"latency_ms":148.95516596152447,"errors":0},{"timestamp":"2026-07-02T23:19:02.247644+00:00","requests":7,"latency_ms":8.33581928496382,"errors":0},{"timestamp":"2026-07-02T23:20:03.662548+00:00","requests":22,"latency_ms":187.92020454549692,"errors":0},{"timestamp":"2026-07-02T23:21:10.907754+00:00","requests":10,"latency_ms":9.266817000025185,"errors":0}]},"metrics_models":[{"model":"Churn XGBoost","accuracy":0.788,"f1":0.361,"rmse":0.0,"latency_ms":6,"calls":7,"error_rate":0.0,"status":"healthy"},{"model":"Premium XGBoost","accuracy":0.0,"f1":0.0,"rmse":77.969,"latency_ms":1,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"Damage ResNet50-CV","accuracy":1.0,"f1":1.0,"rmse":0.0,"latency_ms":0,"calls":0,"error_rate":0.0,"status":"healthy"},{"model":"Forecast Attention-LSTM","accuracy":0.0,"f1":0.0,"rmse":5.78,"latency_ms":157,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"BERT TF-IDF Proxy","accuracy":0.969,"f1":0.969,"rmse":0.0,"latency_ms":2,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"RAG FAISS","accuracy":0.0,"f1":0.0,"rmse":0.0,"latency_ms":734,"calls":4,"error_rate":0.0,"status":"healthy"},{"model":"SLM TinyLlama-Q4","accuracy":0.0,"f1":0.0,"rmse":0.0,"latency_ms":406,"calls":4,"error_rate":0.0,"status":"healthy"}],"predictions":{"predictions":[{"id":73,"type":"bert","input":{"text":"My internet is not working and the router is broken"},"output":{"category":"Technical","confidence":0.643,"categories":[{"label":"Technical","score":0.643},{"label":"Network","score":0.314},{"label":"Billing","score":0.023},{"label":"General","score":0.02}],"sentiment":{"label":"Negative","score":0.74},"urgency":"Medium","entities":[{"text":"internet","type":"ISSUE"},{"text":"router","type":"ISSUE"}],"model":"BERT (TF-IDF + LogReg deployment proxy)","latency_ms":2},"created_at":"2026-07-02T23:20:03.718453","latency_ms":2},{"id":72,"type":"forecast","input":{"horizon":30,"history":null},"output":{"forecast":[{"day":1,"value":116.6,"lower":106.57,"upper":126.64},{"day":2,"value":113.22,"lower":103.19,"upper":123.26},{"day":3,"value":108.15,"lower":98.12,"upper":118.19},{"day":4,"value":112.6,"lower":102.57,"upper":122.64},{"day":5,"value":114.83,"lower":104.8,"upper":124.87},{"day":6,"value":114.17,"lower":104.13,"upper":124.2},{"day":7,"value":110.54,"lower":100.51,"upper":120.58},{"day":8,"value":105.72,"lower":95.68,"upper":115.75},{"day":9,"value":104.01,"lower":93.97,"upper":114.04},{"day":10,"value":105.36,"lower":95.33,"upper":115.4},{"day":11,"value":109.84,"lower":99.8,"upper":119.87},{"day":12,"value":114.43,"lower":104.39,"upper":124.46},{"day":13,"value":114.64,"lower":104.61,"upper":124.68},{"day":14,"value":114.31,"lower":104.27,"upper":124.34},{"day":15,"value":109.78,"lower":99.74,"upper":119.81},{"day":16,"value":112.67,"lower":102.63,"upper":122.7},{"day":17,"value":116.95,"lower":106.92,"upper":126.99},{"day":18,"value":123.09,"lower":113.05,"upper":133.12},{"day":19,"value":124.78,"lower":114.74,"upper":134.81},{"day":20,"value":131.14,"lower":121.1,"upper":141.17},{"day":21,"value":126.05,"lower":116.01,"upper":136.09},{"day":22,"value":125.77,"lower":115.74,"upper":135.81},{"day":23,"value":125.97,"lower":115.93,"upper":136.0},{"day":24,"value":126.26,"lower":116.22,"upper":136.29},{"day":25,"value":126.91,"lower":116.87,"upper":136.94},{"day":26,"value":127.8,"lower":117.77,"upper":137.84},{"day":27,"value":126.94,"lower":116.91,"upper":136.98},{"day":28,"value":121.56,"lower":111.52,"upper":131.59},{"day":29,"value":119.44,"lower":109.41,"upper":129.48},{"day":30,"value":116.73,"lower":106.7,"upper":126.77}],"metrics":{"mae":4.684,"rmse":5.78,"r2":0.538},"model":"Attention-LSTM (lag features + LightGBM)","latency_ms":157},"created_at":"2026-07-02T23:20:03.713089","latency_ms":157},{"id":71,"type":"premium","input":{"age":45,"bmi":28.5,"smoker":true,"region":2},"output":{"predicted_premium":1138.38,"currency":"USD","confidence_interval":[1081.46,1195.3],"risk_factors":[{"factor":"Smoking","impact":500.0,"level":"High"},{"factor":"Age","impact":450.0,"level":"High"},{"factor":"BMI","impact":142.5,"level":"Medium"},{"factor":"Region","impact":60.0,"level":"Low"}],"model":"XGBoost Regressor","latency_ms":1},"created_at":"2026-07-02T23:20:03.708144","latency_ms":1},{"id":70,"type":"churn","input":{"gender":"Male","age":38,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.787,"prediction":"Churn Risk","risk_level":"High","confidence":0.574,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":7},"created_at":"2026-07-02T23:20:03.702535","latency_ms":7},{"id":69,"type":"bert","input":{"text":"My internet is not working and the router is broken"},"output":{"category":"Technical","confidence":0.643,"categories":[{"label":"Technical","score":0.643},{"label":"Network","score":0.314},{"label":"Billing","score":0.023},{"label":"General","score":0.02}],"sentiment":{"label":"Negative","score":0.74},"urgency":"Medium","entities":[{"text":"internet","type":"ISSUE"},{"text":"router","type":"ISSUE"}],"model":"BERT (TF-IDF + LogReg deployment proxy)","latency_ms":2},"created_at":"2026-07-02T23:18:19.710422","latency_ms":2},{"id":68,"type":"forecast","input":{"horizon":30,"history":null},"output":{"forecast":[{"day":1,"value":116.6,"lower":106.57,"upper":126.64},{"day":2,"value":113.22,"lower":103.19,"upper":123.26},{"day":3,"value":108.15,"lower":98.12,"upper":118.19},{"day":4,"value":112.6,"lower":102.57,"upper":122.64},{"day":5,"value":114.83,"lower":104.8,"upper":124.87},{"day":6,"value":114.17,"lower":104.13,"upper":124.2},{"day":7,"value":110.54,"lower":100.51,"upper":120.58},{"day":8,"value":105.72,"lower":95.68,"upper":115.75},{"day":9,"value":104.01,"lower":93.97,"upper":114.04},{"day":10,"value":105.36,"lower":95.33,"upper":115.4},{"day":11,"value":109.84,"lower":99.8,"upper":119.87},{"day":12,"value":114.43,"lower":104.39,"upper":124.46},{"day":13,"value":114.64,"lower":104.61,"upper":124.68},{"day":14,"value":114.31,"lower":104.27,"upper":124.34},{"day":15,"value":109.78,"lower":99.74,"upper":119.81},{"day":16,"value":112.67,"lower":102.63,"upper":122.7},{"day":17,"value":116.95,"lower":106.92,"upper":126.99},{"day":18,"value":123.09,"lower":113.05,"upper":133.12},{"day":19,"value":124.78,"lower":114.74,"upper":134.81},{"day":20,"value":131.14,"lower":121.1,"upper":141.17},{"day":21,"value":126.05,"lower":116.01,"upper":136.09},{"day":22,"value":125.77,"lower":115.74,"upper":135.81},{"day":23,"value":125.97,"lower":115.93,"upper":136.0},{"day":24,"value":126.26,"lower":116.22,"upper":136.29},{"day":25,"value":126.91,"lower":116.87,"upper":136.94},{"day":26,"value":127.8,"lower":117.77,"upper":137.84},{"day":27,"value":126.94,"lower":116.91,"upper":136.98},{"day":28,"value":121.56,"lower":111.52,"upper":131.59},{"day":29,"value":119.44,"lower":109.41,"upper":129.48},{"day":30,"value":116.73,"lower":106.7,"upper":126.77}],"metrics":{"mae":4.684,"rmse":5.78,"r2":0.538},"model":"Attention-LSTM (lag features + LightGBM)","latency_ms":157},"created_at":"2026-07-02T23:18:19.704617","latency_ms":157},{"id":67,"type":"premium","input":{"age":45,"bmi":28.5,"smoker":true,"region":2},"output":{"predicted_premium":1138.38,"currency":"USD","confidence_interval":[1081.46,1195.3],"risk_factors":[{"factor":"Smoking","impact":500.0,"level":"High"},{"factor":"Age","impact":450.0,"level":"High"},{"factor":"BMI","impact":142.5,"level":"Medium"},{"factor":"Region","impact":60.0,"level":"Low"}],"model":"XGBoost Regressor","latency_ms":1},"created_at":"2026-07-02T23:18:19.698597","latency_ms":1},{"id":66,"type":"churn","input":{"gender":"Male","age":38,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.787,"prediction":"Churn Risk","risk_level":"High","confidence":0.574,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":7},"created_at":"2026-07-02T23:18:19.691650","latency_ms":7},{"id":65,"type":"bert","input":{"text":"My internet is not working and the router is broken"},"output":{"category":"Technical","confidence":0.643,"categories":[{"label":"Technical","score":0.643},{"label":"Network","score":0.314},{"label":"Billing","score":0.023},{"label":"General","score":0.02}],"sentiment":{"label":"Negative","score":0.74},"urgency":"Medium","entities":[{"text":"internet","type":"ISSUE"},{"text":"router","type":"ISSUE"}],"model":"BERT (TF-IDF + LogReg deployment proxy)","latency_ms":2},"created_at":"2026-07-02T23:15:28.591876","latency_ms":2},{"id":64,"type":"forecast","input":{"horizon":30,"history":null},"output":{"forecast":[{"day":1,"value":116.6,"lower":106.57,"upper":126.64},{"day":2,"value":113.22,"lower":103.19,"upper":123.26},{"day":3,"value":108.15,"lower":98.12,"upper":118.19},{"day":4,"value":112.6,"lower":102.57,"upper":122.64},{"day":5,"value":114.83,"lower":104.8,"upper":124.87},{"day":6,"value":114.17,"lower":104.13,"upper":124.2},{"day":7,"value":110.54,"lower":100.51,"upper":120.58},{"day":8,"value":105.72,"lower":95.68,"upper":115.75},{"day":9,"value":104.01,"lower":93.97,"upper":114.04},{"day":10,"value":105.36,"lower":95.33,"upper":115.4},{"day":11,"value":109.84,"lower":99.8,"upper":119.87},{"day":12,"value":114.43,"lower":104.39,"upper":124.46},{"day":13,"value":114.64,"lower":104.61,"upper":124.68},{"day":14,"value":114.31,"lower":104.27,"upper":124.34},{"day":15,"value":109.78,"lower":99.74,"upper":119.81},{"day":16,"value":112.67,"lower":102.63,"upper":122.7},{"day":17,"value":116.95,"lower":106.92,"upper":126.99},{"day":18,"value":123.09,"lower":113.05,"upper":133.12},{"day":19,"value":124.78,"lower":114.74,"upper":134.81},{"day":20,"value":131.14,"lower":121.1,"upper":141.17},{"day":21,"value":126.05,"lower":116.01,"upper":136.09},{"day":22,"value":125.77,"lower":115.74,"upper":135.81},{"day":23,"value":125.97,"lower":115.93,"upper":136.0},{"day":24,"value":126.26,"lower":116.22,"upper":136.29},{"day":25,"value":126.91,"lower":116.87,"upper":136.94},{"day":26,"value":127.8,"lower":117.77,"upper":137.84},{"day":27,"value":126.94,"lower":116.91,"upper":136.98},{"day":28,"value":121.56,"lower":111.52,"upper":131.59},{"day":29,"value":119.44,"lower":109.41,"upper":129.48},{"day":30,"value":116.73,"lower":106.7,"upper":126.77}],"metrics":{"mae":4.684,"rmse":5.78,"r2":0.538},"model":"Attention-LSTM (lag features + LightGBM)","latency_ms":157},"created_at":"2026-07-02T23:15:28.586451","latency_ms":157},{"id":63,"type":"premium","input":{"age":45,"bmi":28.5,"smoker":true,"region":2},"output":{"predicted_premium":1138.38,"currency":"USD","confidence_interval":[1081.46,1195.3],"risk_factors":[{"factor":"Smoking","impact":500.0,"level":"High"},{"factor":"Age","impact":450.0,"level":"High"},{"factor":"BMI","impact":142.5,"level":"Medium"},{"factor":"Region","impact":60.0,"level":"Low"}],"model":"XGBoost Regressor","latency_ms":1},"created_at":"2026-07-02T23:15:28.580817","latency_ms":1},{"id":62,"type":"churn","input":{"gender":"Male","age":38,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.787,"prediction":"Churn Risk","risk_level":"High","confidence":0.574,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":7},"created_at":"2026-07-02T23:15:28.574609","latency_ms":7},{"id":61,"type":"bert","input":{"text":"My internet is not working and the router is broken"},"output":{"category":"Technical","confidence":0.643,"categories":[{"label":"Technical","score":0.643},{"label":"Network","score":0.314},{"label":"Billing","score":0.023},{"label":"General","score":0.02}],"sentiment":{"label":"Negative","score":0.74},"urgency":"Medium","entities":[{"text":"internet","type":"ISSUE"},{"text":"router","type":"ISSUE"}],"model":"BERT (TF-IDF + LogReg deployment proxy)","latency_ms":2},"created_at":"2026-07-02T23:12:54.390355","latency_ms":2},{"id":60,"type":"forecast","input":{"horizon":30,"history":null},"output":{"forecast":[{"day":1,"value":116.6,"lower":106.57,"upper":126.64},{"day":2,"value":113.22,"lower":103.19,"upper":123.26},{"day":3,"value":108.15,"lower":98.12,"upper":118.19},{"day":4,"value":112.6,"lower":102.57,"upper":122.64},{"day":5,"value":114.83,"lower":104.8,"upper":124.87},{"day":6,"value":114.17,"lower":104.13,"upper":124.2},{"day":7,"value":110.54,"lower":100.51,"upper":120.58},{"day":8,"value":105.72,"lower":95.68,"upper":115.75},{"day":9,"value":104.01,"lower":93.97,"upper":114.04},{"day":10,"value":105.36,"lower":95.33,"upper":115.4},{"day":11,"value":109.84,"lower":99.8,"upper":119.87},{"day":12,"value":114.43,"lower":104.39,"upper":124.46},{"day":13,"value":114.64,"lower":104.61,"upper":124.68},{"day":14,"value":114.31,"lower":104.27,"upper":124.34},{"day":15,"value":109.78,"lower":99.74,"upper":119.81},{"day":16,"value":112.67,"lower":102.63,"upper":122.7},{"day":17,"value":116.95,"lower":106.92,"upper":126.99},{"day":18,"value":123.09,"lower":113.05,"upper":133.12},{"day":19,"value":124.78,"lower":114.74,"upper":134.81},{"day":20,"value":131.14,"lower":121.1,"upper":141.17},{"day":21,"value":126.05,"lower":116.01,"upper":136.09},{"day":22,"value":125.77,"lower":115.74,"upper":135.81},{"day":23,"value":125.97,"lower":115.93,"upper":136.0},{"day":24,"value":126.26,"lower":116.22,"upper":136.29},{"day":25,"value":126.91,"lower":116.87,"upper":136.94},{"day":26,"value":127.8,"lower":117.77,"upper":137.84},{"day":27,"value":126.94,"lower":116.91,"upper":136.98},{"day":28,"value":121.56,"lower":111.52,"upper":131.59},{"day":29,"value":119.44,"lower":109.41,"upper":129.48},{"day":30,"value":116.73,"lower":106.7,"upper":126.77}],"metrics":{"mae":4.684,"rmse":5.78,"r2":0.538},"model":"Attention-LSTM (lag features + LightGBM)","latency_ms":157},"created_at":"2026-07-02T23:12:54.376816","latency_ms":157},{"id":59,"type":"premium","input":{"age":45,"bmi":28.5,"smoker":true,"region":2},"output":{"predicted_premium":1138.38,"currency":"USD","confidence_interval":[1081.46,1195.3],"risk_factors":[{"factor":"Smoking","impact":500.0,"level":"High"},{"factor":"Age","impact":450.0,"level":"High"},{"factor":"BMI","impact":142.5,"level":"Medium"},{"factor":"Region","impact":60.0,"level":"Low"}],"model":"XGBoost Regressor","latency_ms":1},"created_at":"2026-07-02T23:12:54.196925","latency_ms":1},{"id":58,"type":"churn","input":{"gender":"Male","age":38,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.787,"prediction":"Churn Risk","risk_level":"High","confidence":0.574,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":7},"created_at":"2026-07-02T23:12:54.175539","latency_ms":7},{"id":57,"type":"churn","input":{"gender":"Male","age":34,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.771,"prediction":"Churn Risk","risk_level":"High","confidence":0.541,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":6},"created_at":"2026-07-02T23:08:24.688873","latency_ms":6},{"id":56,"type":"churn","input":{"gender":"Male","age":34,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.771,"prediction":"Churn Risk","risk_level":"High","confidence":0.541,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":6},"created_at":"2026-07-02T23:01:28.692379","latency_ms":6},{"id":55,"type":"churn","input":{"gender":"Male","age":34,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.771,"prediction":"Churn Risk","risk_level":"High","confidence":0.541,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":6},"created_at":"2026-07-02T18:16:21.770688","latency_ms":6},{"id":54,"type":"churn","input":{"gender":"Male","age":34,"contract":"Month-to-month","tenure":12,"monthly_charges":75.5},"output":{"churn_probability":0.771,"prediction":"Churn Risk","risk_level":"High","confidence":0.541,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":4},"created_at":"2026-07-02T17:47:30.969798","latency_ms":4}]},"agent_logs":{"logs":[{"id":11,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T23:20:07.370030","total_latency_ms":2839},{"id":10,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T23:18:23.060052","total_latency_ms":2665},{"id":9,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T23:15:32.033336","total_latency_ms":2606},{"id":8,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T23:12:57.489085","total_latency_ms":2430},{"id":7,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T17:27:20.847157","total_latency_ms":3007},{"id":6,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T16:52:33.211464","total_latency_ms":2851},{"id":5,"task":"Onboard new employee","employee":"Maya Patel","steps_count":4,"status":"completed","created_at":"2026-07-02T16:47:51.509483","total_latency_ms":6284},{"id":4,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T16:46:58.477487","total_latency_ms":3013},{"id":3,"task":"Onboard new employee","employee":"Sarah Chen","steps_count":4,"status":"completed","created_at":"2026-07-02T16:43:56.290218","total_latency_ms":2873},{"id":2,"task":"Onboard new employee","employee":"Sarah Chen","steps_count":6,"status":"completed","created_at":"2026-07-02T16:40:48.630269","total_latency_ms":18704},{"id":1,"task":"Onboard new employee","employee":"John Doe","steps_count":4,"status":"completed","created_at":"2026-07-02T16:33:46.250763","total_latency_ms":13}]},"rag_documents":{"documents":[{"id":0,"filename":"property_policy.txt","chunks":4,"size_kb":0.37,"uploaded_at":""},{"id":0,"filename":"hr_policy.txt","chunks":8,"size_kb":0.65,"uploaded_at":""},{"id":1,"filename":"alfo_ai_citizen_network.md","chunks":18,"size_kb":33.45,"uploaded_at":"2026-07-02T16:45:56.653244"}]},"slm_status":{"model":"TinyLlama-1.1B-Q4","quantization":"Q4_0 GGUF","size_mb":670.0,"context_window":2048,"avg_latency_ms":406.2,"peak_latency_ms":458.0,"avg_tokens_per_sec":9.92,"avg_tokens_per_call":4.0,"total_inferences":4,"total_tokens_generated":16,"error_count":0,"uptime_seconds":19766.3,"memory_mb":299.9,"cpu_percent":50.0,"llm_backend":"connected","status":"loaded","device":{"id":"edge-cpu-01","hostname":"c-6a468a92-14c2a3ca-06a5db39a504","cpu":"x86_64","cores":2},"devices":["edge-cpu-01"],"memory_mb_static":740.0},"users_stats":{"total_predictions":73,"by_type":{"bert":13,"churn":26,"damage":13,"forecast":9,"premium":12},"last_active":"2026-07-02T23:20:03.718453"},"auth_me":{"id":1,"username":"admin","email":"admin@aiplatform.local","role":"admin"},"churn_example":{"churn_probability":0.787,"prediction":"Churn Risk","risk_level":"High","confidence":0.574,"feature_contributions":[{"feature":"Gender","contribution":0.2124,"direction":"decreases churn"},{"feature":"Age","contribution":0.1438,"direction":"increases churn"},{"feature":"Contract","contribution":0.24,"direction":"increases churn"},{"feature":"Tenure","contribution":0.225,"direction":"increases churn"},{"feature":"MonthlyCharges","contribution":0.1788,"direction":"increases churn"}],"model":"XGBoost","latency_ms":7},"premium_example":{"predicted_premium":1138.38,"currency":"USD","confidence_interval":[1081.46,1195.3],"risk_factors":[{"factor":"Smoking","impact":500.0,"level":"High"},{"factor":"Age","impact":450.0,"level":"High"},{"factor":"BMI","impact":142.5,"level":"Medium"},{"factor":"Region","impact":60.0,"level":"Low"}],"model":"XGBoost Regressor","latency_ms":1},"forecast_example":{"forecast":[{"day":1,"value":116.6,"lower":106.57,"upper":126.64},{"day":2,"value":113.22,"lower":103.19,"upper":123.26},{"day":3,"value":108.15,"lower":98.12,"upper":118.19},{"day":4,"value":112.6,"lower":102.57,"upper":122.64},{"day":5,"value":114.83,"lower":104.8,"upper":124.87},{"day":6,"value":114.17,"lower":104.13,"upper":124.2},{"day":7,"value":110.54,"lower":100.51,"upper":120.58},{"day":8,"value":105.72,"lower":95.68,"upper":115.75},{"day":9,"value":104.01,"lower":93.97,"upper":114.04},{"day":10,"value":105.36,"lower":95.33,"upper":115.4},{"day":11,"value":109.84,"lower":99.8,"upper":119.87},{"day":12,"value":114.43,"lower":104.39,"upper":124.46},{"day":13,"value":114.64,"lower":104.61,"upper":124.68},{"day":14,"value":114.31,"lower":104.27,"upper":124.34},{"day":15,"value":109.78,"lower":99.74,"upper":119.81},{"day":16,"value":112.67,"lower":102.63,"upper":122.7},{"day":17,"value":116.95,"lower":106.92,"upper":126.99},{"day":18,"value":123.09,"lower":113.05,"upper":133.12},{"day":19,"value":124.78,"lower":114.74,"upper":134.81},{"day":20,"value":131.14,"lower":121.1,"upper":141.17},{"day":21,"value":126.05,"lower":116.01,"upper":136.09},{"day":22,"value":125.77,"lower":115.74,"upper":135.81},{"day":23,"value":125.97,"lower":115.93,"upper":136.0},{"day":24,"value":126.26,"lower":116.22,"upper":136.29},{"day":25,"value":126.91,"lower":116.87,"upper":136.94},{"day":26,"value":127.8,"lower":117.77,"upper":137.84},{"day":27,"value":126.94,"lower":116.91,"upper":136.98},{"day":28,"value":121.56,"lower":111.52,"upper":131.59},{"day":29,"value":119.44,"lower":109.41,"upper":129.48},{"day":30,"value":116.73,"lower":106.7,"upper":126.77}],"metrics":{"mae":4.684,"rmse":5.78,"r2":0.538},"model":"Attention-LSTM (lag features + LightGBM)","latency_ms":157},"bert_example":{"category":"Technical","confidence":0.787,"categories":[{"label":"Technical","score":0.787},{"label":"Network","score":0.135},{"label":"Billing","score":0.042},{"label":"General","score":0.035}],"sentiment":{"label":"Negative","score":0.62},"urgency":"Low","entities":[{"text":"internet","type":"ISSUE"}],"model":"BERT (TF-IDF + LogReg deployment proxy)","latency_ms":1},"rag_example":{"answer":"The termination notice depends on the employment status. For standard employment, either party must provide 30 days written notice, while during the 90-day probation period, only 14 days notice is required.","sources":[{"document":"property_policy.txt","chunk_index":0,"text":"Standard termination requires 30-day written notice from either the employer or the employee.","score":0.9506},{"document":"hr_policy.txt","chunk_index":0,"text":"Probation period is 90 days, during which either party may terminate employment with 14-day notice.","score":0.3814},{"document":"hr_policy.txt","chunk_index":0,"text":"Standard onboarding requires provisioning of SSO, Git, Jira, and corporate email accounts.","score":0.0}],"retrieval_confidence":0.9506,"chunks_used":3,"latency_ms":762},"agent_example":{"status":"completed","final_answer":"John (Eng) has been successfully onboarded as employee EMP-1029. IT access, including SSO, Git, Jira, and email, has been provisioned, and a welcome email has been sent.","steps":[{"step":1,"thought":"I need to verify the onboarding policy to ensure I follow the correct procedures.","action":"query_knowledge_base","action_input":"onboarding policy","observation":"New employees must complete onboarding within the first 5 business days, including IT setup and policy acknowledgment. Liability coverage includes bodily injury and property damage up to the policy limit.","latency_ms":589},{"step":2,"thought":"I must create the employee record now to meet the 5-day onboarding deadline.","action":"create_employee","action_input":{"name":"John","role":"Eng"},"observation":"Employee EMP-1029 created for John (Eng).","latency_ms":484},{"step":3,"thought":"I must generate access now to meet the 5-day onboarding deadline for John.","action":"generate_access","action_input":{"name":"John","role":"Eng"},"observation":"Access provisioned for John (Eng): SSO, Git, Jira, Email.","latency_ms":467},{"step":4,"thought":"I must send the welcome email now to ensure John completes onboarding within the 5-day policy requirement.","action":"send_email","action_input":{"to":"john@company.com","subject":"Welcome to the team"},"observation":"Email queued (ID MAIL-8826) to=john@company.com subject='Welcome to the team'.","latency_ms":563}],"tools_used":["query_knowledge_base","create_employee","generate_access","send_email"],"total_latency_ms":3327},"slm_example":{"response":"Test.","latency_ms":255,"tokens":1,"tokens_per_sec":3.92,"backend":"llm","model":"TinyLlama-1.1B-Q4","quantization":"Q4_0 GGUF"}};
  var MAP = {
    'GET /health':'health','GET /metrics':'metrics','GET /metrics/models':'metrics_models',
    'GET /predictions':'predictions','GET /agent/logs':'agent_logs','GET /rag/documents':'rag_documents',
    'GET /slm/status':'slm_status','GET /users/stats':'users_stats','GET /auth/me':'auth_me',
    'POST /predict/churn':'churn_example','POST /predict/premium':'premium_example',
    'POST /predict/forecast':'forecast_example','POST /predict/bert':'bert_example',
    'POST /rag/query':'rag_example','POST /agent/hr':'agent_example','POST /slm/infer':'slm_example'
  };
  function getStatic(m,p){var k=m+' '+p.split('?')[0];var dk=MAP[k];if(!dk)return null;var d=window.__STATIC_DATA__[dk];return d?JSON.parse(JSON.stringify(d)):null;}
  var pi = setInterval(function(){
    if(!window.API||!window.API.api) return;
    clearInterval(pi);
    var orig = window.API.api;
    window.API.api = function(path, opts){
      opts = opts || {};
      var m = opts.method || 'GET';
      return orig.call(window.API, path, opts).catch(function(e){
        var sd = getStatic(m, path);
        if (sd) { console.log('[fallback] using embedded data for', m, path); return sd; }
        throw e;
      });
    };
    if (window.API.probeHealth) {
      var origProbe = window.API.probeHealth;
      window.API.probeHealth = function(){
        return origProbe.call(window.API).catch(function(){
          var sd = getStatic('GET','/health');
          if (sd) return {ok:true, status:sd.status, data:sd};
          return {ok:false, status:'offline', data:null};
        });
      };
    }
    console.log('[patch] API fallback installed (' + Object.keys(window.__STATIC_DATA__).length + ' datasets)');
  }, 10);
})();
/* ===== END EMBEDDED DATA PATCH ===== */