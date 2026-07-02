/* ============================================================
   views/dashboard.js — Overview
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;
  const Router = window.Router;

  async function loadMetrics() {
    return API.get('/metrics');
  }
  async function loadRecent() {
    return API.get('/predictions?limit=8');
  }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    // Header
    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'Overview' }),
        U.el('div', { class: 'view-title', text: 'Dashboard' })
      ]),
      U.el('div', { class: 'row' }, [
        U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => render(container) }, [U.icon('refresh', 14, 2), 'Refresh'])
      ])
    ]));

    // Skeletons initially
    const statsRow = U.el('div', { class: 'dash-stats stagger' }, [
      C.skeletonStat(), C.skeletonStat(), C.skeletonStat(), C.skeletonStat()
    ]);
    root.appendChild(statsRow);

    const chartsRow = U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(chartsRow);

    const lowerRow = U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(lowerRow);

    // Load in parallel
    let metrics = null, recent = null, mErr = null, rErr = null;
    try { metrics = await loadMetrics(); }
    catch (e) { mErr = e; }
    try { recent = await loadRecent(); }
    catch (e) { rErr = e; }

    // Render stats
    U.clear(statsRow);
    statsRow.classList.remove('stagger');
    if (mErr) {
      statsRow.appendChild(C.errorState(mErr.message, () => render(container)));
    } else {
      const api = metrics.api_usage || {};
      const lat = metrics.latency || {};
      const series = (metrics.time_series || []).slice(-24);

      // --- Real trend computation from the live time series ---
      // Split the series into a recent half and a prior half; compare sums/avgs.
      function splitTrend(arr) {
        const n = arr.length;
        if (n < 2) return { recent: arr, prior: [] };
        const mid = Math.floor(n / 2);
        return { recent: arr.slice(mid), prior: arr.slice(0, mid) };
      }
      function pctDelta(recentSum, priorSum) {
        if (priorSum === 0) return recentSum > 0 ? 100 : 0;
        return Math.round(((recentSum - priorSum) / priorSum) * 100);
      }
      function avg(arr, key) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + (b[key] || 0), 0) / arr.length;
      }
      const tReq = splitTrend(series);
      const reqRecent = tReq.recent.reduce((a, b) => a + (b.requests || 0), 0);
      const reqPrior = tReq.prior.reduce((a, b) => a + (b.requests || 0), 0);
      const reqDelta = pctDelta(reqRecent, reqPrior);
      const reqDeltaDir = reqRecent >= reqPrior ? 'up' : 'down';

      // Success-rate trend: compare error rates of recent vs prior halves
      const errRecent = tReq.recent.reduce((a, b) => a + (b.errors || 0), 0);
      const errPrior = tReq.prior.reduce((a, b) => a + (b.errors || 0), 0);
      const srRecent = reqRecent > 0 ? (1 - errRecent / reqRecent) * 100 : 100;
      const srPrior = reqPrior > 0 ? (1 - errPrior / reqPrior) * 100 : 100;
      const srDelta = Math.round((srRecent - srPrior) * 10) / 10;
      const srDeltaDir = srRecent >= srPrior ? 'up' : 'down';

      // Latency trend: compare recent avg vs prior avg
      const latRecent = avg(tReq.recent, 'latency_ms');
      const latPrior = avg(tReq.prior, 'latency_ms');
      const latDelta = latPrior > 0 ? Math.round(((latRecent - latPrior) / latPrior) * 100) : 0;
      const latDeltaDir = latRecent <= latPrior ? 'up' : 'down'; // lower latency = "up" (good)

      const totalReqs = api.total_requests || 0;
      const successRate = api.success_rate || 0;
      const avgLat = lat.p50_ms || 0;
      const modelCount = (metrics.model_metrics || []).length;
      const mm = metrics.model_metrics || [];
      const healthyModels = mm.filter(m => (m.status || 'healthy') === 'healthy').length;

      statsRow.appendChild(C.statCard({
        label: 'Total Predictions', value: U.fmtNumber(totalReqs),
        delta: Math.abs(reqDelta), deltaDir: reqDeltaDir,
        hint: series.length >= 2 ? 'vs prior period' : 'last 24h',
        spark: series.map(s => s.requests || 0),
        sparkColor: Charts.palette().primary
      }));
      statsRow.appendChild(C.statCard({
        label: 'Active Models', value: U.fmtNumber(modelCount),
        hint: healthyModels + '/' + modelCount + ' healthy',
        spark: mm.map(m => m.calls || 0),
        sparkColor: Charts.palette().accent
      }));
      statsRow.appendChild(C.statCard({
        label: 'API Success Rate', value: U.fmtPct(successRate, 2),
        delta: Math.abs(srDelta), deltaDir: srDeltaDir,
        hint: series.length >= 2 ? 'vs prior period' : 'current',
        spark: series.map(s => 100 - (s.errors || 0)),
        sparkColor: Charts.palette().primary
      }));
      statsRow.appendChild(C.statCard({
        label: 'Avg Latency (p50)', value: U.fmtMs(avgLat),
        delta: Math.abs(latDelta), deltaDir: latDeltaDir,
        hint: series.length >= 2 ? 'vs prior period' : 'current',
        spark: series.map(s => s.latency_ms || 0),
        sparkColor: Charts.palette().warning
      }));
    }

    // Charts row
    U.clear(chartsRow);
    if (mErr) {
      chartsRow.appendChild(C.errorState(mErr.message, () => render(container)));
      chartsRow.appendChild(C.errorState(mErr.message, () => render(container)));
    } else {
      const series = (metrics.time_series || []).slice(-24);
      const requestsSeries = series.map((s, i) => ({ x: i, y: s.requests || 0 }));
      const latencySeries = series.map((s, i) => ({ x: i, y: s.latency_ms || 0 }));
      const xLabels = series.map(s => U.fmtTime(s.timestamp));

      const reqCard = C.card({ class: 'chart-card' },
        C.cardHead('API Requests (last 24h)', { subtitle: 'requests & latency per bucket', right: C.badge('Live', 'success') }),
        C.chart((host) => Charts.lineChart(host, {
          series: [
            { name: 'Requests', color: Charts.palette().primary, points: requestsSeries },
            { name: 'Latency (ms)', color: Charts.palette().accent, points: latencySeries }
          ],
          xLabels,
          yFormat: (v) => U.fmtNumber(v),
          legend: true,
          area: false
        }), 280)
      );
      chartsRow.appendChild(reqCard);

      // Donut: predictions by type from model_metrics calls
      const mm = metrics.model_metrics || [];
      const donutItems = mm.slice(0, 6).map((m, i) => ({
        label: m.model, value: m.calls || 0, color: Charts.SERIES_COLORS[i % Charts.SERIES_COLORS.length]
      }));
      const totalCalls = donutItems.reduce((a, b) => a + b.value, 0);
      const donutCard = C.card({ class: 'chart-card' },
        C.cardHead('Predictions by Model', { subtitle: 'distribution of API calls' }),
        U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-4)' } }, [
          U.el('div', { style: { flex: '0 0 200px' } }, [
            C.chart((host) => Charts.donutChart(host, {
              items: donutItems.length ? donutItems : [{ label: 'None', value: 1, color: '#333' }],
              centerLabel: U.fmtNumber(totalCalls),
              centerSub: 'calls'
            }), 200)
          ]),
          U.el('div', { class: 'col gap-2', style: { flex: '1', minWidth: '0' } },
            donutItems.map(it => U.el('div', { class: 'row gap-2' }, [
              U.el('span', { class: 'dot', style: { background: it.color } }),
              U.el('span', { class: 'text-sm grow', text: it.label, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
              U.el('span', { class: 'text-xs text-mono', text: U.fmtNumber(it.value) })
            ]))
          )
        ])
      );
      chartsRow.appendChild(donutCard);
    }

    // Lower row: model latency bar + model health
    U.clear(lowerRow);
    if (mErr) {
      lowerRow.appendChild(C.errorState(mErr.message, () => render(container)));
    } else {
      const mm = metrics.model_metrics || [];
      const latencyCard = C.card({ class: 'chart-card' },
        C.cardHead('Model Latency (ms)', { subtitle: 'average inference time per model' }),
        C.chart((host) => Charts.barChart(host, {
          labels: mm.map(m => m.model.split(' ')[0]),
          values: mm.map(m => m.latency_ms || 0),
          yFormat: (v) => v.toFixed(0) + 'ms'
        }), 220)
      );
      lowerRow.appendChild(latencyCard);

      const healthCard = C.card({},
        C.cardHead('Model Health', { subtitle: 'live status of deployed models' }),
        U.el('div', {},
          mm.length ? mm.map(m => {
            const v = U.statusVariant(m.status);
            return U.el('div', { class: 'model-health-item' }, [
              U.el('span', { class: U.cx('dot', 'dot-' + (v === 'success' ? 'success' : v === 'warning' ? 'warning' : 'danger')) }),
              U.el('span', { class: 'name', text: m.model }),
              U.el('span', { class: 'meta', text: U.fmtMs(m.latency_ms) + ' · ' + U.fmtNumber(m.calls) + ' calls' }),
              C.badge(m.status, v)
            ]);
          }) : [C.emptyState('No models reporting.')]
        )
      );
      lowerRow.appendChild(healthCard);
    }

    // Recent predictions table
    const recCard = C.card({},
      C.cardHead('Recent Predictions', { subtitle: 'latest inference calls', right: U.el('a', { class: 'link text-sm', onClick: () => Router.navigate('/monitoring') }, [U.el('span', { text: 'View all' })]) })
    );
    const tableHost = U.el('div');
    recCard.appendChild(tableHost);
    if (rErr) {
      tableHost.appendChild(C.errorState(rErr.message, () => render(container)));
    } else {
      const preds = (recent && recent.predictions) || [];
      const table = C.table({
        columns: [
          { label: 'Type', render: (r) => C.badge(r.type || '—', 'accent') },
          { label: 'Input', render: (r) => {
            const raw = r.input;
            let inp = typeof raw === 'string' ? raw : (raw == null ? '' : JSON.stringify(raw));
            const text = inp.length > 60 ? inp.slice(0, 60) + '…' : inp;
            return U.el('span', { class: 'text-mono text-xs', text: text || '—' });
          }},
          { label: 'Output', render: (r) => {
            const raw = r.output;
            let out = typeof raw === 'string' ? raw : (raw == null ? '' : JSON.stringify(raw));
            const text = out.length > 50 ? out.slice(0, 50) + '…' : out;
            return U.el('span', { class: 'text-xs text-muted', text: text || '—' });
          }},
          { label: 'Latency', key: 'latency_ms', mono: true, render: (r) => U.fmtMs(r.latency_ms), align: 'right' },
          { label: 'When', render: (r) => U.fmtRelTime(r.created_at), align: 'right' }
        ],
        rows: preds,
        empty: 'No predictions yet — try the Churn or NLP modules.'
      });
      tableHost.appendChild(table);
    }
    root.appendChild(recCard);

    // Quick actions
    const qaCard = C.card({},
      C.cardHead('Quick Actions', { subtitle: 'jump to a module' })
    );
    const qaGrid = U.el('div', { class: 'grid grid-auto', style: { marginTop: 'var(--space-3)' } });
    const actions = [
      { path: '/churn', icon: 'churn', title: 'Churn Prediction', desc: 'Score customer churn risk' },
      { path: '/healthcare', icon: 'health', title: 'Healthcare Premium', desc: 'Estimate insurance premium' },
      { path: '/damage', icon: 'damage', title: 'Damage Detection', desc: 'Classify vehicle damage' },
      { path: '/nlp', icon: 'nlp', title: 'NLP Classification', desc: 'Categorize complaints' },
      { path: '/rag', icon: 'rag', title: 'RAG Assistant', desc: 'Ask your knowledge base' },
      { path: '/agent', icon: 'agent', title: 'Agentic Workflow', desc: 'Run HR automation' },
    ];
    actions.forEach(a => {
      const card = U.el('div', { class: U.cx('card', 'card-interactive', 'quick-action', a.icon === 'rag' && 'accent'), onClick: () => Router.navigate(a.path) }, [
        U.el('div', { class: 'qa-icon' }, [U.icon(a.icon, 20, 2)]),
        U.el('div', { class: 'qa-title', text: a.title }),
        U.el('div', { class: 'qa-desc', text: a.desc })
      ]);
      qaGrid.appendChild(card);
    });
    qaCard.appendChild(qaGrid);
    root.appendChild(qaCard);

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/dashboard'] = { title: 'Dashboard', render };
})();
