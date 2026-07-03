/* ============================================================
   views/tracker.js — DL Level: Learning Acquisition Tracker
   POST /track/acquisition → forecast with confidence bands,
   mastery prediction, optimal intervention, metrics.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  function defaultHistory() {
    // 14-point realistic learning curve (rising with noise)
    return [62, 64, 65, 67, 66, 68, 70, 71, 70, 72, 74, 73, 76, 78];
  }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'DL · Learning Acquisition Tracker' }),
        U.el('div', { class: 'view-title', text: 'Learning Tracker' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    /* ---------- Form (left) ---------- */
    const formCard = C.card({}, C.cardHead('Daily Score History', { subtitle: 'paste scores (comma-separated) or use defaults' }));
    const state = { history: defaultHistory().join(', '), horizon: 30 };

    const historyInput = U.el('textarea', {
      class: 'input', rows: 4, style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)' },
      text: state.history,
      onInput: (e) => state.history = e.target.value
    });
    formCard.appendChild(U.el('div', { class: 'field', style: { marginTop: 'var(--space-3)' } }, [
      U.el('label', { class: 'field-label', text: 'Daily scores (oldest → newest)' }), historyInput
    ]));

    // Quick actions
    const qa = U.el('div', { class: 'row wrap gap-2', style: { marginTop: 'var(--space-3)' } });
    qa.appendChild(U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => { state.history = defaultHistory().join(', '); historyInput.value = state.history; } }, [U.icon('refresh', 14, 2), 'Default series']));
    qa.appendChild(U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => { const s = Array.from({ length: 20 }, (_, i) => 50 + i * 1.5 + Math.random() * 4).map(v => Math.round(v)); state.history = s.join(', '); historyInput.value = state.history; } }, [U.icon('plus', 14, 2), 'Generate 20-pt']));
    qa.appendChild(U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => { const s = Array.from({ length: 30 }, (_, i) => 40 + i * 1.8 + Math.random() * 6).map(v => Math.round(v)); state.history = s.join(', '); historyInput.value = state.history; } }, [U.icon('plus', 14, 2), 'Generate 30-pt']));
    formCard.appendChild(qa);

    // Horizon slider
    formCard.appendChild(U.el('div', { class: 'field', style: { marginTop: 'var(--space-4)' } }, [
      U.el('label', { class: 'field-label', text: 'Forecast horizon (days)' }),
      U.el('div', { class: 'slider-row' }, [
        U.el('input', {
          class: 'slider', type: 'range', min: '7', max: '90', step: '1', value: String(state.horizon),
          onInput: (e) => { state.horizon = Number(e.target.value); hVal.textContent = state.horizon + ' days'; }
        }),
        U.el('span', { class: 'slider-val', text: state.horizon + ' days' })
      ])
    ]));
    const hVal = formCard.querySelector('.slider-val');

    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('tracker', 18, 2), U.el('span', { text: 'Track Acquisition' })]);
    formCard.appendChild(runBtn);
    layout.appendChild(formCard);

    /* ---------- Result (right) ---------- */
    const resultHost = U.el('div');
    layout.appendChild(resultHost);
    showEmpty();

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Paste your daily learning scores and click "Track Acquisition" to forecast your learning curve with confidence bands, mastery prediction, and an optimal intervention plan.')));
    }

    runBtn.addEventListener('click', runTrack);

    async function runTrack() {
      // Parse history
      const parsed = String(state.history)
        .split(/[\s,;\n]+/)
        .map(s => parseFloat(s))
        .filter(v => !isNaN(v));
      if (parsed.length < 3) {
        C.toastError('Please provide at least 3 numeric scores.');
        return;
      }
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Forecasting…' }));
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Running Attention-LSTM forecast…')]));
      try {
        const res = await API.post('/track/acquisition', { history: parsed, horizon: state.horizon });
        showResult(res, parsed);
        C.toastSuccess('Forecast complete: ' + (res.forecast ? res.forecast.length : 0) + ' days predicted.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Tracking failed', runTrack)));
        C.toastError(e.message || 'Tracking failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('tracker', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Track Acquisition' }));
      }
    }

    function showResult(res, history) {
      U.clear(resultHost);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Forecast chart with confidence bands (rendered as 3 series: upper, score, lower)
      const fc = res.forecast || [];
      const histLen = history.length;
      const combined = [];
      // History portion
      history.forEach((v, i) => combined.push({ x: i, score: v, lower: null, upper: null }));
      // Forecast portion (continuous)
      fc.forEach((p, i) => {
        const x = histLen - 1 + p.day;
        combined.push({ x, score: p.score, lower: p.lower, upper: p.upper });
      });

      const chartCard = C.card({ class: 'chart-card' },
        C.cardHead('Learning Curve & Forecast', { subtitle: 'history + forecast with confidence bands · ' + (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) }),
        C.chart((host) => {
          // Background confidence band
          const series = [
            { name: 'Lower bound', color: Charts.palette().primary3, points: combined.filter(p => p.lower != null).map(p => ({ x: p.x, y: p.lower })), dashed: true },
            { name: 'Score', color: Charts.palette().primary, points: combined.map(p => ({ x: p.x, y: p.score })) },
            { name: 'Upper bound', color: Charts.palette().primary3, points: combined.filter(p => p.upper != null).map(p => ({ x: p.x, y: p.upper })), dashed: true }
          ];
          // Use a custom draw with bands
          Charts.lineChart(host, {
            series,
            xLabels: combined.map((_, i) => i % 5 === 0 ? 'D' + (i + 1) : ''),
            yFormat: (v) => Math.round(v),
            legend: true,
            area: false
          });
          // Overlay confidence band fill
          try {
            const ctx = host.getContext('2d');
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const rect = host.getBoundingClientRect();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const w = rect.width, h = rect.height;
            const padL = 44, padR = 12, padT = 14, padB = 28;
            const cw = w - padL - padR, ch = h - padT - padB;
            const allY = combined.flatMap(p => [p.score, p.lower, p.upper]).filter(v => v != null && !isNaN(v));
            if (allY.length) {
              let yMin = Math.min(...allY), yMax = Math.max(...allY);
              const pad = (yMax - yMin) * 0.1;
              yMin -= pad; yMax += pad;
              const xMin = combined[0].x, xMax = combined[combined.length - 1].x;
              const xs = (x) => xMax === xMin ? padL + cw / 2 : padL + ((x - xMin) / (xMax - xMin)) * cw;
              const ys = (y) => padT + ch - ((y - yMin) / (yMax - yMin)) * ch;
              const fcPts = combined.filter(p => p.lower != null && p.upper != null);
              if (fcPts.length) {
                ctx.beginPath();
                fcPts.forEach((p, i) => i === 0 ? ctx.moveTo(xs(p.x), ys(p.upper)) : ctx.lineTo(xs(p.x), ys(p.upper)));
                for (let i = fcPts.length - 1; i >= 0; i--) ctx.lineTo(xs(fcPts[i].x), ys(fcPts[i].lower));
                ctx.closePath();
                ctx.fillStyle = Charts.palette().primary;
                ctx.globalAlpha = 0.12;
                ctx.fill();
                ctx.globalAlpha = 1;
              }
            }
          } catch (e) { /* ignore band overlay errors */ }
        }, 320)
      );
      wrap.appendChild(chartCard);

      // Mastery + Intervention cards
      const mp = res.mastery_prediction || {};
      const oi = res.optimal_intervention || {};
      const mRow = U.el('div', { class: 'grid grid-2' }, [
        U.el('div', { class: 'mastery-card' }, [
          U.el('div', { class: 'm-title', text: 'Mastery Prediction' }),
          U.el('div', { class: 'm-value', text: String(mp.days_to_mastery != null ? mp.days_to_mastery : '—') }),
          U.el('div', { class: 'm-sub', text: 'days to reach ' + (mp.target_level || 'target') + ' · ' + U.fmtPct(mp.probability || 0, 0) + ' probability' })
        ]),
        U.el('div', { class: 'intervention-card' }, [
          U.el('div', { class: 'i-title', text: 'Optimal Intervention' }),
          U.el('div', { class: 'i-value', text: '+' + (oi.expected_boost != null ? oi.expected_boost : '—') + ' pts' }),
          U.el('div', { class: 'm-sub', text: String(oi.type || '—').replace(/_/g, ' ') + ' on ' + (oi.focus_area || 'focus area') })
        ])
      ]);
      wrap.appendChild(mRow);

      // Metrics mini grid
      if (res.metrics) {
        const m = res.metrics;
        const metricsGrid = U.el('div', { class: 'metric-mini-grid' }, [
          U.el('div', { class: 'metric-mini' }, [U.el('div', { class: 'mm-val', text: m.mae != null ? m.mae.toFixed(2) : '—' }), U.el('div', { class: 'mm-lbl', text: 'MAE' })]),
          U.el('div', { class: 'metric-mini' }, [U.el('div', { class: 'mm-val', text: m.rmse != null ? m.rmse.toFixed(2) : '—' }), U.el('div', { class: 'mm-lbl', text: 'RMSE' })]),
          U.el('div', { class: 'metric-mini' }, [U.el('div', { class: 'mm-val', text: m.r2 != null ? m.r2.toFixed(3) : '—' }), U.el('div', { class: 'mm-lbl', text: 'R²' })])
        ]);
        wrap.appendChild(C.card({}, [
          C.cardHead('Forecast Accuracy', { subtitle: 'held-out validation metrics' }),
          U.el('div', { style: { marginTop: 'var(--space-3)' } }, [metricsGrid])
        ]));
      }

      resultHost.appendChild(wrap);
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/tracker'] = { title: 'Learning Tracker', render };
})();
