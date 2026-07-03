/* ============================================================
   views/monitoring.js — MediLingua Model Monitoring
   System health, API usage, latency p50/p95/p99, error rate,
   per-model table, endpoints table, auto-refresh every 15s.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  let refreshTimer = null;

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'Operations · Live metrics' }),
        U.el('div', { class: 'view-title', text: 'Model Monitoring' })
      ]),
      U.el('div', { class: 'row' }, [
        U.el('span', { class: 'text-xs text-muted', id: 'mon-updated', text: '—' }),
        U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => load(true) }, [U.icon('refresh', 14, 2), 'Refresh'])
      ])
    ]));

    const statsRow = U.el('div', { class: 'dash-stats' }, [C.skeletonStat(), C.skeletonStat(), C.skeletonStat(), C.skeletonStat()]);
    root.appendChild(statsRow);

    const chartsRow = U.el('div', { class: 'grid grid-3' }, [C.skeletonCard(), C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(chartsRow);

    const tablesRow = U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()]);
    root.appendChild(tablesRow);

    async function load(isRefresh) {
      if (isRefresh) C.toastInfo('Refreshing metrics…');
      try {
        const data = await API.get('/metrics');
        renderAll(data);
        const upd = document.getElementById('mon-updated');
        if (upd) upd.textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch (e) {
        U.clear(statsRow);
        statsRow.appendChild(C.errorState(e.message || 'Failed to load metrics', () => load(true)));
        C.toastError(e.message || 'Failed to load metrics');
      }
    }

    function renderAll(m) {
      const api = m.api_usage || {};
      const lat = m.latency || {};
      const sys = m.system || {};
      const series = (m.time_series || []).slice(-24);

      // Stats
      U.clear(statsRow);
      const reqDelta = series.length >= 2 ? Math.round(((series.slice(-12).reduce((a, b) => a + (b.requests || 0), 0) - series.slice(0, 12).reduce((a, b) => a + (b.requests || 0), 0)) / Math.max(1, series.slice(0, 12).reduce((a, b) => a + (b.requests || 0), 0))) * 100) : 0;
      statsRow.appendChild(C.statCard({
        label: 'Total Requests', value: U.fmtNumber(api.total_requests),
        delta: Math.abs(reqDelta), deltaDir: reqDelta >= 0 ? 'up' : 'down',
        spark: series.map(s => s.requests || 0)
      }));
      statsRow.appendChild(C.statCard({
        label: 'Requests / min', value: U.fmtNumber(api.requests_per_min, 2),
        spark: series.map(s => s.requests || 0),
        sparkColor: Charts.palette().accent
      }));
      statsRow.appendChild(C.statCard({
        label: 'Success Rate', value: U.fmtPct(api.success_rate, 2),
        spark: series.map(s => 100 - (s.errors || 0) * 10),
        sparkColor: Charts.palette().primary
      }));
      statsRow.appendChild(C.statCard({
        label: 'Error Rate', value: U.fmtPct(m.error_rate, 3),
        spark: series.map(s => (s.errors || 0)),
        sparkColor: Charts.palette().danger
      }));

      // Charts
      U.clear(chartsRow);
      chartsRow.appendChild(C.card({ class: 'chart-card' },
        C.cardHead('System Health', { subtitle: 'CPU · Memory · Disk' }),
        U.el('div', { class: 'col gap-3', style: { padding: 'var(--space-2)' } }, [
          healthBar('CPU', sys.cpu_percent, 'primary'),
          healthBar('Memory', sys.memory_percent, 'accent'),
          healthBar('Disk', sys.disk_percent, 'warning')
        ])
      ));
      chartsRow.appendChild(C.card({ class: 'chart-card' },
        C.cardHead('Latency Percentiles', { subtitle: 'p50 · p95 · p99 (ms)' }),
        C.chart((host) => Charts.barChart(host, {
          labels: ['p50', 'p95', 'p99'],
          values: [lat.p50_ms || 0, lat.p95_ms || 0, lat.p99_ms || 0],
          colors: [Charts.palette().primary, Charts.palette().warning, Charts.palette().danger],
          yFormat: (v) => v.toFixed(0) + 'ms'
        }), 220)
      ));
      chartsRow.appendChild(C.card({ class: 'chart-card' },
        C.cardHead('Error Rate', { subtitle: 'live gauge' }),
        C.chart((host) => Charts.gaugeChart(host, m.error_rate || 0, {
          label: U.fmtPct(m.error_rate || 0, 3),
          sub: 'error rate',
          thresholds: { high: 0.05, med: 0.02 },
          colors: { high: Charts.palette().danger, med: Charts.palette().warning, low: Charts.palette().primary }
        }), 220)
      ));

      // Tables
      U.clear(tablesRow);
      const mm = m.model_metrics || [];
      tablesRow.appendChild(C.card({},
        C.cardHead('Per-Model Metrics', { subtitle: 'accuracy, latency, calls, status' }),
        U.el('div', { style: { marginTop: 'var(--space-3)' } },
          C.table({
            columns: [
              { label: 'Model', key: 'model' },
              { label: 'Accuracy', render: r => r.accuracy ? U.fmtPct(r.accuracy, 2) : '—', align: 'right', mono: true },
              { label: 'F1', render: r => r.f1 ? r.f1.toFixed(2) : '—', align: 'right', mono: true },
              { label: 'RMSE', render: r => r.rmse ? r.rmse.toFixed(2) : '—', align: 'right', mono: true },
              { label: 'Latency', render: r => U.fmtMs(r.latency_ms), align: 'right', mono: true },
              { label: 'Calls', render: r => U.fmtNumber(r.calls), align: 'right', mono: true },
              { label: 'Status', render: r => C.badge(r.status, U.statusVariant(r.status)) }
            ],
            rows: mm,
            empty: 'No model metrics available.'
          })
        )
      ));
      const ep = m.endpoints || [];
      tablesRow.appendChild(C.card({},
        C.cardHead('Endpoint Usage', { subtitle: 'API paths · calls · latency' }),
        U.el('div', { style: { marginTop: 'var(--space-3)' } },
          C.table({
            columns: [
              { label: 'Path', key: 'path', render: r => U.el('span', { class: 'text-mono text-xs', text: r.path }) },
              { label: 'Calls', render: r => U.fmtNumber(r.calls), align: 'right', mono: true },
              { label: 'Avg Latency', render: r => U.fmtMs(r.avg_latency_ms), align: 'right', mono: true },
              { label: 'Error Rate', render: r => U.fmtPct(r.error_rate, 2), align: 'right', mono: true }
            ],
            rows: ep,
            empty: 'No endpoint data.'
          })
        )
      ));
    }

    function healthBar(label, val, color) {
      const v = Math.round(val || 0);
      const cls = v >= 80 ? 'danger' : v >= 60 ? 'warning' : color;
      return U.el('div', { class: 'health-bar-row' }, [
        U.el('div', { class: 'head' }, [
          U.el('span', { class: 'name', text: label }),
          U.el('span', { class: 'val', text: v + '%' })
        ]),
        U.el('div', { class: 'progress' }, [U.el('div', { class: U.cx('progress-bar', cls), style: { width: v + '%' } })])
      ]);
    }

    load(false);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => load(false), 15000);

    return {
      dispose() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }
    };
  }

  window.Views = window.Views || {};
  window.Views['/monitoring'] = { title: 'Model Monitoring', render };
})();
