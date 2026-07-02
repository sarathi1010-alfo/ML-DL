/* ============================================================
   views/healthcare.js — Healthcare premium prediction
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
        U.el('div', { class: 'caption', text: 'AI Model · XGBoost Regressor' }),
        U.el('div', { class: 'view-title', text: 'Healthcare Premium Estimation' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    const state = { age: 45, bmi: 28.5, smoker: true, region: 2 };

    const formCard = C.card({},
      C.cardHead('Patient Profile', { subtitle: 'enter attributes to estimate premium' })
    );
    const form = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

    form.appendChild(sliderField('Age', 18, 90, 1, state.age, v => state.age = v, v => v + ' yrs'));
    form.appendChild(sliderField('BMI', 12, 50, 0.1, state.bmi, v => state.bmi = v, v => v.toFixed(1)));

    // Smoker toggle
    const smokeToggle = U.el('div', { class: 'toggle', role: 'switch', 'aria-checked': String(state.smoker), tabindex: '0' });
    function setSmoker(v) { state.smoker = v; smokeToggle.setAttribute('aria-checked', String(v)); }
    smokeToggle.addEventListener('click', () => setSmoker(!state.smoker));
    smokeToggle.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSmoker(!state.smoker); } });
    form.appendChild(U.el('div', { class: 'field' }, [
      U.el('div', { class: 'slider-row' }, [
        U.el('label', { class: 'field-label', text: 'Smoker' }),
        U.el('span', { class: 'slider-val', id: 'smoke-val', text: state.smoker ? 'Yes' : 'No' })
      ]),
      smokeToggle
    ]));
    // sync val label
    smokeToggle.addEventListener('click', () => {
      document.getElementById('smoke-val').textContent = state.smoker ? 'Yes' : 'No';
    });

    // Region
    const regionSel = U.el('select', { class: 'select' }, [
      U.el('option', { value: 0, text: 'North' }),
      U.el('option', { value: 1, text: 'East' }),
      U.el('option', { value: 2, text: 'South', selected: true }),
      U.el('option', { value: 3, text: 'West' })
    ]);
    regionSel.addEventListener('change', () => state.region = parseInt(regionSel.value));
    form.appendChild(U.el('div', { class: 'field' }, [
      U.el('label', { class: 'field-label', text: 'Region' }),
      regionSel
    ]));

    const predictBtn = U.el('button', { class: 'btn btn-primary btn-block btn-lg' }, [U.icon('health', 18, 2), U.el('span', { text: 'Estimate Premium' })]);
    form.appendChild(predictBtn);
    formCard.appendChild(form);
    layout.appendChild(formCard);

    const resultCard = C.card({ class: 'predict-result' },
      C.cardHead('Estimated Premium', { subtitle: 'predicted annual insurance cost' })
    );
    const resultHost = U.el('div');
    resultCard.appendChild(resultHost);
    layout.appendChild(resultCard);

    showEmpty();
    predictBtn.addEventListener('click', runPredict);

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Enter patient attributes and run the estimator to see predicted premium, confidence interval, and risk factor breakdown.'));
    }

    async function runPredict() {
      predictBtn.disabled = true;
      U.clear(predictBtn);
      predictBtn.appendChild(C.spinner('on-primary'));
      predictBtn.appendChild(U.el('span', { text: 'Estimating…' }));
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '120px' } }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line', style: { width: '70%' } })
      ]));
      try {
        const res = await API.post('/predict/premium', state);
        showResult(res);
        C.toastSuccess('Premium estimate ready.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Estimation failed', runPredict));
        C.toastError(e.message || 'Estimation failed');
      } finally {
        predictBtn.disabled = false;
        U.clear(predictBtn);
        predictBtn.appendChild(U.icon('health', 18, 2));
        predictBtn.appendChild(U.el('span', { text: 'Estimate Premium' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Big premium number
      const premium = res.predicted_premium || 0;
      const ci = res.confidence_interval || [premium, premium];
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { textAlign: 'center', background: 'var(--surface-2)' } }, [
        U.el('div', { class: 'caption', text: 'Predicted Annual Premium' }),
        U.el('div', { class: 'gradient-text', style: { fontSize: '44px', fontWeight: 800, fontFamily: 'var(--font-mono)', lineHeight: 1.1, marginTop: 'var(--space-2)' }, text: U.fmtMoney(premium, res.currency === 'USD' ? '$' : (res.currency || '$')) }),
        U.el('div', { class: 'text-sm text-muted', style: { marginTop: 'var(--space-2)' }, text: `95% CI: ${U.fmtMoney(ci[0])} – ${U.fmtMoney(ci[1])}` })
      ]));

      // Risk factors
      const rf = res.risk_factors || [];
      if (rf.length) {
        const rfCard = C.card({ class: 'card-pad-sm' },
          U.el('div', { class: 'caption mb-3', text: 'Risk Factors' }),
          C.chart((canvas) => Charts.hbarChart(canvas, {
            items: rf.map(r => ({
              label: r.factor,
              value: r.impact,
              color: (r.level || '').toLowerCase() === 'high' ? Charts.palette().danger
                   : (r.level || '').toLowerCase() === 'medium' ? Charts.palette().warning
                   : Charts.palette().primary
            })),
            labelWidth: 90,
            valueFormat: (v) => '$' + U.fmtNumber(v)
          }), Math.max(120, rf.length * 42 + 20)),
          U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)', marginTop: 'var(--space-3)' } },
            rf.map(r => {
              const v = (r.level || '').toLowerCase() === 'high' ? 'danger' : (r.level || '').toLowerCase() === 'medium' ? 'warning' : 'success';
              return C.badge(r.factor + ': ' + r.level, v);
            })
          )
        );
        host.appendChild(rfCard);
      }

      host.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)' } }, [
        C.badge('Model: ' + (res.model || '—'), 'soft'),
        C.badge('Latency: ' + U.fmtMs(res.latency_ms), 'soft')
      ]));

      resultHost.appendChild(host);
    }

    return { dispose() {} };
  }

  function sliderField(label, min, max, step, init, onChange, fmt) {
    const valEl = U.el('span', { class: 'slider-val', text: fmt(init) });
    const slider = U.el('input', { class: 'slider', type: 'range', min, max, step, value: init });
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valEl.textContent = fmt(v);
      onChange(v);
    });
    return U.el('div', { class: 'field' }, [
      U.el('div', { class: 'slider-row' }, [
        U.el('label', { class: 'field-label', text: label }),
        valEl
      ]),
      slider
    ]);
  }

  window.Views = window.Views || {};
  window.Views['/healthcare'] = { title: 'Healthcare Premium', render };
})();
