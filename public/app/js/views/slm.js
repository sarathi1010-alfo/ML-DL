/* ============================================================
   views/slm.js — Small Language Model edge inference
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
        U.el('div', { class: 'caption', text: 'GenAI · TinyLlama GGUF (edge deployment)' }),
        U.el('div', { class: 'view-title', text: 'SLM Edge Inference' })
      ])
    ]));

    // Status panel
    const statusCard = C.card({},
      C.cardHead('Model Status', { subtitle: 'edge-deployed small language model' })
    );
    const statusHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    statusCard.appendChild(statusHost);
    root.appendChild(statusCard);

    // Playground
    const playCard = C.card({},
      C.cardHead('Inference Playground', { subtitle: 'run a prompt through the SLM' })
    );
    const promptInput = U.el('textarea', { class: 'textarea', placeholder: 'Summarize: The quarterly results exceeded expectations with revenue up 18% year-over-year, driven primarily by enterprise expansion in the EMEA region.', style: { minHeight: '110px' } });
    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg btn-block', style: { marginTop: 'var(--space-3)' } }, [U.icon('zap', 18, 2), U.el('span', { text: 'Run Inference' })]);
    playCard.appendChild(promptInput);
    playCard.appendChild(runBtn);
    const resultHost = U.el('div', { style: { marginTop: 'var(--space-4)' } });
    playCard.appendChild(resultHost);
    root.appendChild(playCard);

    // Load status
    statusHost.appendChild(C.loadingBlock('Loading model status…'));
    let status = null;
    try {
      status = await API.get('/slm/status');
      renderStatus(status);
    } catch (e) {
      U.clear(statusHost);
      statusHost.appendChild(C.errorState(e.message || 'Failed to load SLM status', () => render(container)));
    }

    function renderStatus(s) {
      U.clear(statusHost);
      const v = U.statusVariant(s.status);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Info grid
      const infoGrid = U.el('div', { class: 'grid grid-4' });
      infoGrid.appendChild(metricTile(s.model || '—', 'Model'));
      infoGrid.appendChild(metricTile(s.quantization || '—', 'Quantization'));
      infoGrid.appendChild(metricTile(s.size_mb ? U.fmtNumber(s.size_mb) + ' MB' : '—', 'Size'));
      infoGrid.appendChild(metricTile(s.avg_latency_ms ? U.fmtMs(s.avg_latency_ms) : '—', 'Avg Latency'));
      infoGrid.appendChild(metricTile(s.memory_mb ? U.fmtNumber(s.memory_mb) + ' MB' : '—', 'Memory'));
      infoGrid.appendChild(metricTile(s.devices && s.devices.length ? s.devices.length : '—', 'Devices'));
      infoGrid.appendChild(U.el('div', { class: 'metric-tile' }, [
        U.el('div', { class: 'mt-val', text: '—' }),
        U.el('div', { class: 'mt-label', text: 'Tokens/sec' })
      ]));
      infoGrid.appendChild(U.el('div', { class: 'metric-tile' }, [
        U.el('div', { class: 'mt-val', style: { fontSize: 'var(--font-size-lg)' } }, [C.badge(s.status || '—', v)]),
        U.el('div', { class: 'mt-label', text: 'Status' })
      ]));
      host.appendChild(infoGrid);

      // Devices
      const devices = s.devices || [];
      if (devices.length) {
        host.appendChild(U.el('div', {}, [
          U.el('div', { class: 'caption mb-2', text: 'Edge Devices' }),
          U.el('div', { class: 'device-grid' },
            devices.map(d => U.el('div', { class: 'device-card' }, [
              U.el('div', { class: 'device-icon' }, [U.icon('cpu', 24, 2)]),
              U.el('div', { class: 'device-name', text: d }),
              U.el('div', { class: 'device-status' }, [C.badge('online', 'success')])
            ]))
          )
        ]));
      }

      // Note
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { background: 'var(--surface-2)', borderStyle: 'dashed' } }, [
        U.el('div', { class: 'row gap-2 mb-2' }, [U.icon('info', 16, 2), U.el('span', { class: 'caption', text: 'About this simulation' })]),
        U.el('div', { class: 'text-sm text-muted', text: 'This module simulates an edge-deployed TinyLlama-1.1B model quantized to GGUF (Q4_0). In production, this would run via llama.cpp on edge CPUs/GPUs with sub-100MB memory footprint. The server-side inference is proxied for demo purposes.' })
      ]));

      statusHost.appendChild(host);
    }

    function metricTile(val, label) {
      return U.el('div', { class: 'metric-tile' }, [
        U.el('div', { class: 'mt-val', text: val }),
        U.el('div', { class: 'mt-label', text: label })
      ]);
    }

    showResultEmpty();

    function showResultEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Enter a prompt above and run inference to see the SLM response, latency, and throughput.'));
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
        U.el('div', { class: 'caption mb-2', text: 'Response' }),
        U.el('div', { class: 'text-md', style: { lineHeight: 1.6, whiteSpace: 'pre-wrap' }, text: res.response || '(empty)' })
      ]));

      // Metrics
      host.appendChild(U.el('div', { class: 'grid grid-4' }, [
        metricTile(U.fmtMs(res.latency_ms), 'Latency'),
        metricTile(U.fmtNumber(res.tokens), 'Tokens'),
        metricTile(res.tokens_per_sec != null ? res.tokens_per_sec.toFixed(1) : '—', 'Tokens/sec'),
        metricTile(res.tokens && res.latency_ms ? (res.tokens_per_sec || 0).toFixed(1) : '—', 'Throughput')
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
