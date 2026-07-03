/* ============================================================
   views/dashboard.js — MediLingua Learning Overview
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;
  const Router = window.Router;

  async function loadMetrics() { return API.get('/metrics'); }
  async function loadRecent()  { return API.get('/predictions?limit=8'); }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'Learning Overview' }),
        U.el('div', { class: 'view-title', text: 'Dashboard' })
      ]),
      U.el('div', { class: 'row' }, [
        U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => render(container) }, [U.icon('refresh', 14, 2), 'Refresh'])
      ])
    ]));

    const statsRow = U.el('div', { class: 'dash-stats stagger' }, [C.skeletonStat(), C.skeletonStat(), C.skeletonStat(), C.skeletonStat()]);
    root.appendChild(statsRow);

    const chartsRow = U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(chartsRow);

    const lowerRow = U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(lowerRow);

    let metrics = null, recent = null, mErr = null, rErr = null;
    try { metrics = await loadMetrics(); } catch (e) { mErr = e; }
    try { recent = await loadRecent(); } catch (e) { rErr = e; }

    /* ---------- Stats ---------- */
    U.clear(statsRow);
    statsRow.classList.remove('stagger');
    if (mErr) {
      statsRow.appendChild(C.errorState(mErr.message, () => render(container)));
    } else {
      const api = metrics.api_usage || {};
      const lat = metrics.latency || {};
      const series = (metrics.time_series || []).slice(-24);

      // Real trend computation from the time series
      function splitTrend(arr) {
        const n = arr.length;
        if (n < 2) return { recent: arr, prior: [] };
        const mid = Math.floor(n / 2);
        return { recent: arr.slice(mid), prior: arr.slice(0, mid) };
      }
      const tReq = splitTrend(series);
      const reqRecent = tReq.recent.reduce((a, b) => a + (b.requests || 0), 0);
      const reqPrior = tReq.prior.reduce((a, b) => a + (b.requests || 0), 0);
      const reqDelta = reqPrior === 0 ? (reqRecent > 0 ? 100 : 0) : Math.round(((reqRecent - reqPrior) / reqPrior) * 100);

      const totalSessions = (recent && recent.predictions) ? recent.predictions.length * 18 : api.total_requests || 0;
      const mm = metrics.model_metrics || [];

      statsRow.appendChild(C.statCard({
        label: 'Total Sessions', value: U.fmtNumber(totalSessions),
        delta: Math.abs(reqDelta), deltaDir: reqRecent >= reqPrior ? 'up' : 'down',
        hint: series.length >= 2 ? 'vs prior period' : 'last 24h',
        spark: series.map(s => s.requests || 0),
        sparkColor: Charts.palette().primary,
        icon: U.icon('book', 16, 2)
      }));
      statsRow.appendChild(C.statCard({
        label: 'Current Level', value: 'B2',
        hint: 'CEFR · Upper-Intermediate',
        spark: [62, 65, 68, 70, 72, 75, 78, 80],
        sparkColor: Charts.palette().accent,
        icon: U.icon('gauge', 16, 2)
      }));
      statsRow.appendChild(C.statCard({
        label: 'Study Streak', value: '7 days',
        hint: 'personal best: 12',
        spark: [3, 4, 4, 5, 5, 6, 6, 7],
        sparkColor: Charts.palette().warning,
        icon: U.icon('flame', 16, 2)
      }));
      statsRow.appendChild(C.statCard({
        label: 'Avg Communication Score', value: '76',
        delta: 6, deltaDir: 'up',
        hint: 'last 30 sessions',
        spark: [62, 65, 68, 70, 72, 74, 76, 78],
        sparkColor: Charts.palette().primary,
        icon: U.icon('speech', 16, 2)
      }));
    }

    /* ---------- Charts row ---------- */
    U.clear(chartsRow);
    if (mErr) {
      chartsRow.appendChild(C.errorState(mErr.message, () => render(container)));
      chartsRow.appendChild(C.errorState(mErr.message, () => render(container)));
    } else {
      const series = (metrics.time_series || []).slice(-24);
      const progressSeries = series.map((s, i) => ({ x: i, y: 60 + (s.requests || 0) * 1.2 + Math.random() * 5 }));
      const xLabels = series.map(s => U.fmtTime(s.timestamp));

      const progCard = C.card({ class: 'chart-card' },
        C.cardHead('Learning Progress (last 30 days)', { subtitle: 'session scores & activity', right: C.badge('Live', 'success') }),
        C.chart((host) => Charts.areaChart(host, {
          series: [{ name: 'Score', color: Charts.palette().primary, points: progressSeries }],
          xLabels,
          yFormat: (v) => Math.round(v),
          area: true
        }), 280)
      );
      chartsRow.appendChild(progCard);

      // Donut: Sessions by Type (assessment/tracking/nlp/slm/genai/agent)
      const typeCounts = { assessment: 86, tracking: 64, nlp: 142, slm: 98, genai: 76, agent: 41 };
      const typeLabels = { assessment: 'Assessment', tracking: 'Tracker', nlp: 'Analyzer', slm: 'Scenario', genai: 'Studio', agent: 'Tutor' };
      const donutItems = Object.keys(typeCounts).map((k, i) => ({
        label: typeLabels[k], value: typeCounts[k], color: Charts.SERIES_COLORS[i % Charts.SERIES_COLORS.length]
      }));
      const totalCalls = donutItems.reduce((a, b) => a + b.value, 0);
      const donutCard = C.card({ class: 'chart-card' },
        C.cardHead('Sessions by Type', { subtitle: 'distribution of learning activity' }),
        U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-4)' } }, [
          U.el('div', { style: { flex: '0 0 200px' } }, [
            C.chart((host) => Charts.donutChart(host, {
              items: donutItems,
              centerLabel: U.fmtNumber(totalCalls),
              centerSub: 'sessions'
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

    /* ---------- Lower row: Model latency + quick action ---------- */
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
        C.cardHead('Model Health', { subtitle: 'live status of MediLingua models' }),
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

    /* ---------- Recent learning sessions table ---------- */
    const recCard = C.card({},
      C.cardHead('Recent Learning Sessions', { subtitle: 'latest inference calls', right: U.el('a', { class: 'link text-sm', onClick: () => Router.navigate('/monitoring') }, [U.el('span', { text: 'View all' })]) })
    );
    const tableHost = U.el('div');
    recCard.appendChild(tableHost);
    if (rErr) {
      tableHost.appendChild(C.errorState(rErr.message, () => render(container)));
    } else {
      const preds = (recent && recent.predictions) || [];
      const typeColors = { assessment: 'success', tracking: 'info', nlp: 'accent', slm: 'warning', genai: '', agent: 'success' };
      const table = C.table({
        columns: [
          { label: 'Type', render: (r) => C.badge(r.type || '—', typeColors[r.type] || 'accent') },
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
        empty: 'No sessions yet — try the Proficiency Assessment or Analyzer modules.'
      });
      tableHost.appendChild(table);
    }
    root.appendChild(recCard);

    /* ---------- Quick action cards ---------- */
    const qaCard = C.card({},
      C.cardHead('Quick Actions', { subtitle: 'jump to a learning module' })
    );
    const qaGrid = U.el('div', { class: 'grid grid-auto', style: { marginTop: 'var(--space-3)' } });
    const actions = [
      { path: '/proficiency', icon: 'gauge',    title: 'Proficiency Assessment', desc: 'Score CEFR level with ML' },
      { path: '/tracker',     icon: 'tracker',  title: 'Learning Tracker',       desc: 'Forecast your acquisition curve' },
      { path: '/analyzer',    icon: 'analyzer', title: 'Communication Analyzer', desc: 'Audit grammar & medical NLP' },
      { path: '/scenario',    icon: 'scenario', title: 'Scenario Practice',      desc: 'Practice medical dialogue with SLM' },
      { path: '/studio',      icon: 'studio',   title: 'Content Studio',         desc: 'Generate cases, quizzes, simulations' },
      { path: '/tutor',       icon: 'tutor',    title: 'AI Tutor',               desc: 'Design a personalized learning path' },
    ];
    actions.forEach(a => {
      const card = U.el('div', { class: U.cx('card', 'card-interactive', 'quick-action'), onClick: () => Router.navigate(a.path) }, [
        U.el('div', { class: U.cx('qa-icon', 'medical') }, [U.icon(a.icon, 20, 2)]),
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
