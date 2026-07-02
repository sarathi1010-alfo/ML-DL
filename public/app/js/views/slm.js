/* ============================================================
   views/slm.js — Small Language Model edge inference (live stats)
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'GenAI · TinyLlama GGUF (edge deployment) · live metrics' }),
        U.el('div', { class: 'view-title', text: 'SLM Edge Inference' })
      ]),
      U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => refreshStatus() }, [U.icon('refresh', 14, 2), 'Refresh'])
    ]));

    // Status panel
    const statusCard = C.card({}, C.cardHead('Model Status', { subtitle: 'edge-deployed small language model · live runtime metrics' }));
    const statusHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    statusCard.appendChild(statusHost);
    root.appendChild(statusCard);

    // Playground
    const playCard = C.card({}, C.cardHead('Inference Playground', { subtitle: 'run a prompt through the SLM' }));
    const promptInput = U.el('textarea', { class: 'textarea', placeholder: 'Summarize: The quarterly results exceeded expectations with revenue up 18% year-over-year, driven primarily by enterprise expansion in the EMEA region.', style: { minHeight: '110px' } });
    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg btn-block', style: { marginTop: 'var(--space-3)' } }, [U.icon('zap', 18, 2), U.el('span', { text: 'Run Inference' })]);
    playCard.appendChild(promptInput);
    playCard.appendChild(runBtn);
    const resultHost = U.el('div', { style: { marginTop: 'var(--space-4)' } });
    playCard.appendChild(resultHost);
    root.appendChild(playCard);

    let lastStatus = null;

    async function refreshStatus() {
      U.clear(statusHost);
      statusHost.appendChild(C.loadingBlock('Loading model status…'));
      try {
        lastStatus = await API.get('/slm/status');
        renderStatus(lastStatus);
      } catch (e) {
        U.clear(statusHost);
        statusHost.appendChild(C.errorState(e.message || 'Failed to load SLM status', refreshStatus));
      }
    }

    function renderStatus(s) {
      U.clear(statusHost);
      const v = U.statusVariant(s.status);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Identity + status row
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { background: 'var(--surface-2)' } }, [
        U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-4)' } }, [
          U.el('div', { style: { width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, [U.icon('cpu', 24, 2)]),
          U.el('div', { class: 'grow' }, [
            U.el('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 }, text: s.model || '—' }),
            U.el('div', { class: 'text-sm text-muted', text: (s.quantization || '—') + ' · ' + (s.size_mb ? U.fmtNumber(s.size_mb) + ' MB' : '—') + ' · ctx ' + (s.context_window || 2048) })
          ]),
          U.el('div', { class: 'col', style: { gap: '4px', alignItems: 'flex-end' } }, [
            C.badge(s.status || '—', v),
            U.el('span', { class: 'text-xs text-muted', text: 'LLM: ' + (s.llm_backend || '—') })
          ])
        ])
      ]));

      // Live runtime metrics (2 rows of 4)
      host.appendChild(U.el('div', { class: 'caption', text: 'Live Runtime Metrics' }));
      host.appendChild(U.el('div', { class: 'grid grid-4' }, [
        metricTile(s.avg_latency_ms ? U.fmtMs(s.avg_latency_ms) : '—', 'Avg Latency'),
        metricTile(s.peak_latency_ms ? U.fmtMs(s.peak_latency_ms) : '—', 'Peak Latency'),
        metricTile(s.avg_tokens_per_sec != null ? s.avg_tokens_per_sec.toFixed(1) : '—', 'Avg Tok/sec'),
        metricTile(s.avg_tokens_per_call != null ? s.avg_tokens_per_call.toFixed(1) : '—', 'Avg Tok/call'),
      ]));
      host.appendChild(U.el('div', { class: 'grid grid-4' }, [
        metricTile(U.fmtNumber(s.total_inferences || 0), 'Total Inferences'),
        metricTile(U.fmtNumber(s.total_tokens_generated || 0), 'Total Tokens'),
        metricTile(U.fmtNumber(s.error_count || 0), 'Errors'),
        metricTile(s.uptime_seconds != null ? U.fmtDuration(s.uptime_seconds) : '—', 'Uptime'),
      ]));

      // Resource usage (real process memory + CPU)
      const memPct = s.memory_mb ? Math.min(100, (s.memory_mb / 2048) * 100) : 0;
      const cpuPct = s.cpu_percent || 0;
      host.appendChild(U.el('div', { class: 'grid grid-2' }, [
        resourceBar('Memory (RSS)', U.fmtNumber(s.memory_mb || 0) + ' MB', memPct, 'var(--accent)'),
        resourceBar('CPU', (s.cpu_percent != null ? s.cpu_percent.toFixed(1) : '0.0') + '%', cpuPct, 'var(--warning)'),
      ]));

      // Edge device card (real host info)
      if (s.device) {
        const d = s.device;
        host.appendChild(U.el('div', {}, [
          U.el('div', { class: 'caption mb-2', text: 'Edge Device (live host)' }),
          U.el('div', { class: 'device-grid' }, [
            U.el('div', { class: 'device-card' }, [
              U.el('div', { class: 'device-icon' }, [U.icon('cpu', 24, 2)]),
              U.el('div', { class: 'device-name', text: d.id || 'edge-device' }),
              U.el('div', { class: 'device-status' }, [C.badge('online', 'success')]),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '6px', lineHeight: 1.5 }, text: (d.hostname || '—') + '\n' + (d.cpu || '—') + ' · ' + (d.cores || '?') + ' cores' })
            ])
          ])
        ]));
      }

      // Note
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { background: 'var(--surface-2)', borderStyle: 'dashed' } }, [
        U.el('div', { class: 'row gap-2 mb-2' }, [U.icon('info', 16, 2), U.el('span', { class: 'caption', text: 'About this deployment' })]),
        U.el('div', { class: 'text-sm text-muted', text: 'This module runs a TinyLlama-1.1B model quantized to GGUF (Q4_0). Inference is served by the local LLM service (z-ai-web-dev-sdk) and falls back to a templated edge summarizer if the backend is unreachable. All latency, token, memory, and CPU metrics above are measured live from actual inference runs on this host.' })
      ]));

      statusHost.appendChild(host);
    }

    function metricTile(val, label) {
      return U.el('div', { class: 'metric-tile' }, [
        U.el('div', { class: 'mt-val', text: val }),
        U.el('div', { class: 'mt-label', text: label })
      ]);
    }
    function resourceBar(label, valText, pct, color) {
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'row-between' }, [
          U.el('span', { class: 'text-sm', text: label }),
          U.el('span', { class: 'text-mono text-sm', text: valText })
        ]),
        U.el('div', { class: 'dmg-bar', style: { marginTop: '6px' } }, [U.el('div', { class: 'dmg-bar-fill', style: { width: Math.max(2, Math.min(100, pct)) + '%', background: color } })])
      ]);
    }

    showResultEmpty();
    refreshStatus();

    function showResultEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Enter a prompt above and run inference to see the SLM response, latency, and throughput. Status metrics update after each run.'));
    }

    runBtn.addEventListener('click', runInfer);

    async function runInfer() {
      const prompt = promptInput.value.trim();
      if (!prompt) { C.toastError('Please enter a prompt.'); return; }
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Generating…' }));
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '80px' } }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line', style: { width: '70%' } })
      ]));
      try {
        const res = await API.post('/slm/infer', { prompt });
        showResult(res);
        C.toastSuccess('Inference complete.');
        refreshStatus(); // live metrics update
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Inference failed', runInfer));
        C.toastError(e.message || 'Inference failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('zap', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Run Inference' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Response
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { background: 'var(--surface-2)' } }, [
        U.el('div', { class: 'row-between mb-2' }, [
          U.el('div', { class: 'caption', text: 'Response' }),
          C.badge(res.backend === 'llm' ? 'LLM backend' : 'edge fallback', res.backend === 'llm' ? 'success' : 'warning')
        ]),
        U.el('div', { class: 'text-md', style: { lineHeight: 1.6, whiteSpace: 'pre-wrap' }, text: res.response || '(empty)' })
      ]));

      // Metrics
      host.appendChild(U.el('div', { class: 'grid grid-4' }, [
        metricTile(U.fmtMs(res.latency_ms), 'Latency'),
        metricTile(U.fmtNumber(res.tokens), 'Tokens'),
        metricTile(res.tokens_per_sec != null ? res.tokens_per_sec.toFixed(1) : '—', 'Tokens/sec'),
        metricTile(res.model || '—', 'Model')
      ]));

      // Throughput bar
      if (res.tokens_per_sec != null) {
        host.appendChild(C.card({ class: 'card-pad-sm' }, [
          U.el('div', { class: 'caption mb-2', text: 'Throughput vs target (30 tok/s)' }),
          C.chart((canvas) => Charts.barChart(canvas, {
            labels: ['This run', 'Target'],
            values: [res.tokens_per_sec, 30],
            colors: [Charts.palette().primary, Charts.palette().accent],
            yFormat: (v) => v.toFixed(0)
          }), 160)
        ]));
      }

      resultHost.appendChild(host);
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/slm'] = { title: 'SLM Edge', render };
})();
