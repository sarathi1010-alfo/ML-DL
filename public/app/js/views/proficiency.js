/* ============================================================
   views/proficiency.js — ML Level: Proficiency Assessment
   POST /assess/proficiency → CEFR level (A1-C2) with confidence,
   per-level probability bars, recommendations, feature importance.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const SPECIALTIES = ['cardiology', 'neurology', 'pediatrics', 'emergency', 'oncology', 'surgery', 'internal medicine', 'general practice'];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'ML · Proficiency Assessment' }),
        U.el('div', { class: 'view-title', text: 'Proficiency Assessment' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    /* ---------- Form (left) ---------- */
    const formCard = C.card({}, C.cardHead('Assessment Inputs', { subtitle: 'adjust sliders and run the ML model' }));
    const formGrid = U.el('div', { class: 'form-grid' });

    const state = {
      vocabulary_score: 78, grammar_score: 65, fluency_score: 72, comprehension_score: 80,
      exercises_completed: 45, study_hours: 120, days_active: 30, specialty: 'cardiology'
    };

    function sliderField(label, key, min, max, step, unit) {
      const wrap = U.el('div', { class: 'field' });
      wrap.appendChild(U.el('label', { class: 'field-label', text: label }));
      const row = U.el('div', { class: 'slider-row' }, [
        U.el('input', {
          class: 'slider', type: 'range',
          min: String(min), max: String(max), step: String(step), value: String(state[key]),
          onInput: (e) => { state[key] = Number(e.target.value); val.textContent = state[key] + (unit || ''); }
        }),
        U.el('span', { class: 'slider-val', text: state[key] + (unit || '') })
      ]);
      const val = row.querySelector('.slider-val');
      wrap.appendChild(row);
      return wrap;
    }

    formGrid.appendChild(sliderField('Vocabulary Score', 'vocabulary_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Grammar Score', 'grammar_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Fluency Score', 'fluency_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Comprehension Score', 'comprehension_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Exercises Completed', 'exercises_completed', 0, 200, 1, ''));
    formGrid.appendChild(sliderField('Study Hours', 'study_hours', 0, 500, 1, 'h'));
    formGrid.appendChild(sliderField('Days Active', 'days_active', 0, 365, 1, 'd'));

    // Specialty select
    const specWrap = U.el('div', { class: 'field span-2' });
    specWrap.appendChild(U.el('label', { class: 'field-label', text: 'Specialty' }));
    const specSelect = U.el('select', { class: 'input' });
    SPECIALTIES.forEach(s => {
      const opt = U.el('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) });
      if (s === state.specialty) opt.selected = true;
      specSelect.appendChild(opt);
    });
    specSelect.addEventListener('change', () => state.specialty = specSelect.value);
    specWrap.appendChild(specSelect);
    formGrid.appendChild(specWrap);

    formCard.appendChild(formGrid);

    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('gauge', 18, 2), U.el('span', { text: 'Assess Proficiency' })]);
    formCard.appendChild(runBtn);
    layout.appendChild(formCard);

    /* ---------- Result (right) ---------- */
    const resultHost = U.el('div');
    layout.appendChild(resultHost);
    showEmpty();

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Adjust the input sliders and click "Assess Proficiency" to see your CEFR level (A1-C2), confidence, per-level probability distribution, recommendations, and feature importance.')));
    }

    runBtn.addEventListener('click', runAssess);

    async function runAssess() {
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Assessing…' }));
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Running RandomForest + XGBoost…')]));
      try {
        const res = await API.post('/assess/proficiency', state);
        showResult(res);
        C.toastSuccess('Proficiency assessed: level ' + res.level);
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Assessment failed', runAssess)));
        C.toastError(e.message || 'Assessment failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('gauge', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Assess Proficiency' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Level badge + gauge
      const topCard = C.card({});
      topCard.appendChild(C.cardHead('CEFR Proficiency Result', { subtitle: 'model: ' + (res.model || '—') + ' · latency ' + U.fmtMs(res.latency_ms) }));
      const topBody = U.el('div', { class: 'row', style: { gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap', marginTop: 'var(--space-3)' } });

      topBody.appendChild(U.el('div', { class: 'level-badge-wrap' }, [
        U.el('div', { class: U.cx('level-badge', String(res.level || '').toLowerCase()) }, [res.level || '—']),
        U.el('div', { class: 'caption', text: 'Confidence: ' + U.fmtPct(res.confidence, 0) })
      ]));

      // Gauge for confidence
      const gaugeHost = U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
        C.chart((host) => Charts.gaugeChart(host, res.confidence || 0, {
          label: U.fmtPct(res.confidence, 0),
          sub: 'model confidence',
          thresholds: { high: 0.85, med: 0.7 },
          colors: { high: Charts.palette().primary, med: Charts.palette().warning, low: Charts.palette().danger }
        }), 200)
      ]);
      topBody.appendChild(gaugeHost);
      topCard.appendChild(topBody);

      // CEFR probability bars
      if (res.cefr_scale) {
        const scaleHost = U.el('div', { style: { marginTop: 'var(--space-4)' } });
        scaleHost.appendChild(U.el('div', { class: 'caption', text: 'Per-level probability distribution' }));
        const grid = U.el('div', { class: 'level-scale-grid' });
        const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        order.forEach(lvl => {
          const p = res.cefr_scale[lvl] || 0;
          const cell = U.el('div', { class: U.cx('level-scale-cell', lvl === res.level && 'win') }, [
            U.el('div', { class: 'lbl', text: lvl }),
            U.el('div', { class: 'bar' }, [U.el('div', { class: 'bar-fill', style: { width: (p * 100) + '%' } })]),
            U.el('div', { class: 'pct', text: U.fmtPct(p, 1) })
          ]);
          grid.appendChild(cell);
        });
        scaleHost.appendChild(grid);
        topCard.appendChild(scaleHost);
      }
      wrap.appendChild(topCard);

      // Recommendations
      if (res.recommendations && res.recommendations.length) {
        const recCard = C.card({});
        recCard.appendChild(C.cardHead('Personalized Recommendations', { subtitle: 'targeted actions for improvement' }));
        const recList = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        res.recommendations.forEach(r => {
          const pri = String(r.priority || 'medium').toLowerCase();
          recList.appendChild(U.el('div', { class: U.cx('recommendation-row', pri) }, [
            U.el('div', { class: 'rec-pri ' + pri, text: pri }),
            U.el('div', { style: { flex: '1' } }, [
              U.el('div', { class: 'rec-area', text: r.area }),
              U.el('div', { class: 'rec-action', text: r.action })
            ])
          ]));
        });
        recCard.appendChild(recList);
        wrap.appendChild(recCard);
      }

      // Feature importance bar chart
      if (res.feature_importance && res.feature_importance.length) {
        const fiCard = C.card({ class: 'chart-card' },
          C.cardHead('Feature Importance', { subtitle: 'which inputs drive the proficiency score' }),
          C.chart((host) => Charts.hbarChart(host, {
            items: res.feature_importance.map((f, i) => ({
              label: f.feature.replace(/_/g, ' '),
              value: f.importance,
              color: Charts.SERIES_COLORS[i % Charts.SERIES_COLORS.length]
            })),
            valueFormat: (v) => v.toFixed(2)
          }), 220)
        );
        wrap.appendChild(fiCard);
      }

      resultHost.appendChild(wrap);
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/proficiency'] = { title: 'Proficiency Assessment', render };
})();
