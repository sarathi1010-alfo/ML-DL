/* ============================================================
   views/churn.js — Churn prediction
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
        U.el('div', { class: 'caption', text: 'AI Model · XGBoost' }),
        U.el('div', { class: 'view-title', text: 'Customer Churn Prediction' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    // ----- Form -----
    const formCard = C.card({},
      C.cardHead('Customer Profile', { subtitle: 'enter attributes to score' })
    );
    const form = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

    const state = { gender: 'Male', age: 38, contract: 'Month-to-month', tenure: 12, monthly_charges: 75.5 };

    const genderField = field('Gender', () => {
      const sel = U.el('select', { class: 'select' },
        ['Male', 'Female'].map(v => U.el('option', { value: v, text: v }))
      );
      sel.value = state.gender;
      sel.addEventListener('change', () => state.gender = sel.value);
      return sel;
    });
    form.appendChild(genderField);

    const ageField = sliderField('Age', 18, 90, 1, state.age, (v) => state.age = v, v => v + ' yrs');
    form.appendChild(ageField);

    const contractField = field('Contract', () => {
      const sel = U.el('select', { class: 'select' },
        ['Month-to-month', 'One year', 'Two year'].map(v => U.el('option', { value: v, text: v }))
      );
      sel.value = state.contract;
      sel.addEventListener('change', () => state.contract = sel.value);
      return sel;
    });
    form.appendChild(contractField);

    const tenureField = sliderField('Tenure', 0, 72, 1, state.tenure, (v) => state.tenure = v, v => v + ' months');
    form.appendChild(tenureField);

    const chargesField = sliderField('Monthly Charges', 18, 120, 0.5, state.monthly_charges, (v) => state.monthly_charges = v, v => '$' + v.toFixed(2));
    form.appendChild(chargesField);

    const predictBtn = U.el('button', { class: 'btn btn-primary btn-block btn-lg' }, [U.icon('churn', 18, 2), U.el('span', { text: 'Predict Churn' })]);
    form.appendChild(predictBtn);
    formCard.appendChild(form);
    layout.appendChild(formCard);

    // ----- Result panel -----
    const resultCard = C.card({ class: 'predict-result' },
      C.cardHead('Prediction Result', { subtitle: 'churn risk & contributing factors' })
    );
    const resultHost = U.el('div');
    resultCard.appendChild(resultHost);
    layout.appendChild(resultCard);

    // initial state
    showEmpty();
    predictBtn.addEventListener('click', runPredict);

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Configure the customer profile and run a prediction to see churn risk, confidence, and feature contributions.'));
    }

    function showLoading() {
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '200px' } }),
        U.el('div', { class: 'skeleton title' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line', style: { width: '70%' } })
      ]));
    }

    async function runPredict() {
      predictBtn.disabled = true;
      U.clear(predictBtn);
      predictBtn.appendChild(C.spinner('on-primary'));
      predictBtn.appendChild(U.el('span', { text: 'Scoring…' }));
      showLoading();
      try {
        const res = await API.post('/predict/churn', {
          gender: state.gender,
          age: state.age,
          contract: state.contract,
          tenure: state.tenure,
          monthly_charges: state.monthly_charges
        });
        showResult(res);
        C.toastSuccess('Churn prediction completed.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Prediction failed', runPredict));
        C.toastError(e.message || 'Prediction failed');
      } finally {
        predictBtn.disabled = false;
        U.clear(predictBtn);
        predictBtn.appendChild(U.icon('churn', 18, 2));
        predictBtn.appendChild(U.el('span', { text: 'Predict Churn' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const prob = res.churn_probability || 0;
      const level = (res.risk_level || '').toLowerCase();
      const v = level.includes('high') ? 'danger' : level.includes('med') ? 'warning' : 'success';
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Gauge
      host.appendChild(U.el('div', { class: 'gauge-wrap' }, [
        C.chart((canvas) => Charts.gaugeChart(canvas, prob, {
          label: U.fmtPct(prob, 0),
          sub: 'churn probability',
          thresholds: { high: 0.66, med: 0.33 },
          colors: { high: Charts.palette().danger, med: Charts.palette().warning, low: Charts.palette().primary }
        }), 200),
        U.el('div', { class: 'row', style: { gap: 'var(--space-3)' } }, [
          C.badge(res.prediction || '—', v),
          C.badge('Risk: ' + (res.risk_level || '—'), v),
          C.badge('Confidence: ' + U.fmtPct(res.confidence, 0), 'info')
        ])
      ]));

      // Feature contributions
      const fc = res.feature_contributions || [];
      if (fc.length) {
        const fcCard = C.card({ class: 'card-pad-sm' },
          U.el('div', { class: 'caption mb-3', text: 'Feature Contributions' }),
          C.chart((canvas) => Charts.hbarChart(canvas, {
            items: fc.map(c => ({
              label: c.feature,
              value: c.contribution,
              color: c.contribution >= 0 ? Charts.palette().danger : Charts.palette().primary
            })),
            valueFormat: (v) => (v >= 0 ? '+' : '') + v.toFixed(3)
          }), Math.max(120, fc.length * 42 + 20)),
          U.el('div', { class: 'text-xs text-muted', style: { marginTop: 'var(--space-3)' }, text: 'Red bars increase churn risk, green bars decrease it.' })
        );
        host.appendChild(fcCard);
      }

      // Meta
      host.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)' } }, [
        C.badge('Model: ' + (res.model || '—'), 'soft'),
        C.badge('Latency: ' + U.fmtMs(res.latency_ms), 'soft')
      ]));

      resultHost.appendChild(host);
    }

    return { dispose() {} };
  }

  // ---- helpers ----
  function field(label, controlBuilder) {
    return U.el('div', { class: 'field' }, [
      U.el('label', { class: 'field-label', text: label }),
      controlBuilder()
    ]);
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
  window.Views['/churn'] = { title: 'Churn Prediction', render };
})();
