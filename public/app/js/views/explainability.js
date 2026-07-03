/* ============================================================
   views/explainability.js — AI Trust · Explainability Dashboard
   Three panels:
     A. Proficiency Explainability — SHAP-style feature contributions
        + natural-language reasoning + per-recommendation "why".
     B. Acquisition Explainability  — attention weights + NL summary.
     C. Skill Progression Graph     — simulated 4-skill trajectory.
   Endpoints used:
     POST /assess/proficiency      → prediction (then passed to explainer)
     POST /explain/proficiency     → SHAP contributions + summary
     POST /explain/recommendations → per-rec "why" reasoning
     POST /track/acquisition       → forecast (then passed to explainer)
     POST /explain/acquisition     → attention weights + summary
   Backend response shapes:
     - ProficiencyExplainResponse (backend/app/schemas/explainability.py)
     - AcquisitionExplainResponse
     - RecommendationsExplainResponse
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const SPECIALTIES = ['cardiology', 'neurology', 'pediatrics', 'emergency', 'oncology', 'surgery', 'internal medicine', 'general practice'];

  /* ---------- Synthetic skill progression (Panel C) ---------- */
  function syntheticProgression() {
    // 12 weeks, 4 skills, rising with noise — deterministic enough to feel real.
    const weeks = 12;
    const skills = [
      { name: 'Vocabulary',    start: 58, rate: 1.7, noise: 2.0, color: '#10b981' },
      { name: 'Grammar',       start: 52, rate: 1.1, noise: 2.6, color: '#06b6d4' },
      { name: 'Fluency',       start: 60, rate: 1.3, noise: 1.8, color: '#8b5cf6' },
      { name: 'Comprehension', start: 64, rate: 1.5, noise: 1.5, color: '#f59e0b' }
    ];
    // Seeded pseudo-random for stability across renders.
    let seed = 17;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    return skills.map(s => ({
      name: s.name,
      color: s.color,
      points: Array.from({ length: weeks }, (_, w) => {
        const v = s.start + s.rate * w + (rnd() - 0.5) * 2 * s.noise;
        return { x: w, y: Math.round(Math.max(0, Math.min(100, v)) * 10) / 10 };
      })
    }));
  }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    /* ---------- Header ---------- */
    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'AI Trust · Explainability Dashboard' }),
        U.el('div', { class: 'view-title', text: 'Explainability Dashboard' })
      ]),
      U.el('div', { class: 'trust-pill', onClick: () => window.Router && Router.navigate('/safety') }, [
        U.icon('shield', 14, 2),
        U.el('span', { text: 'Trust layer active' })
      ])
    ]));

    /* ---------- Trust hero strip ---------- */
    root.appendChild(C.card({ class: 'trust-hero' }, [
      U.el('div', { class: 'row', style: { gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' } }, [
        U.el('div', { class: 'trust-hero-icon' }, [U.icon('lightbulb', 26, 2)]),
        U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
          U.el('div', { class: 'trust-hero-title', text: 'From black box to trustworthy AI' }),
          U.el('div', { class: 'text-sm text-muted', style: { marginTop: '4px', lineHeight: 1.5 }, text: 'Every prediction in MediLingua ships with a SHAP-style contribution chart, an attention-weight visualisation, and a natural-language reasoning trace — so clinicians and learners can audit why the model said what it said.' })
        ]),
        U.el('div', { class: 'row', style: { gap: 'var(--space-3)' } }, [
          trustMetric('SHAP', 'TreeExplainer'),
          trustMetric('Methods', '3'),
          trustMetric('Auditable', '100%')
        ])
      ])
    ]));

    /* ---------- Panel A: Proficiency Explainability ---------- */
    const panelA = C.card({}, C.cardHead('Panel A · Proficiency Explainability', {
      subtitle: 'run the assessment, then SHAP-explain the predicted CEFR level',
      right: C.badge('SHAP', 'info')
    }));
    root.appendChild(panelA);

    const aLayout = U.el('div', { class: 'predict-layout' });
    panelA.appendChild(aLayout);

    // Form (left)
    const formA = U.el('div', { class: 'card-inner-col' });
    const state = {
      vocabulary_score: 78, grammar_score: 65, fluency_score: 72, comprehension_score: 80,
      exercises_completed: 45, study_hours: 120, days_active: 30, specialty: 'cardiology'
    };
    formA.appendChild(U.el('div', { class: 'caption', text: 'Assessment inputs' }));

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

    const formGrid = U.el('div', { class: 'form-grid', style: { marginTop: 'var(--space-3)' } });
    formGrid.appendChild(sliderField('Vocabulary', 'vocabulary_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Grammar', 'grammar_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Fluency', 'fluency_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Comprehension', 'comprehension_score', 0, 100, 1, ''));
    formGrid.appendChild(sliderField('Exercises', 'exercises_completed', 0, 200, 1, ''));
    formGrid.appendChild(sliderField('Study Hours', 'study_hours', 0, 500, 1, 'h'));
    formGrid.appendChild(sliderField('Days Active', 'days_active', 0, 365, 1, 'd'));
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
    formA.appendChild(formGrid);

    const explainBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('lightbulb', 18, 2), U.el('span', { text: 'Explain Assessment' })]);
    formA.appendChild(explainBtn);

    aLayout.appendChild(formA);

    // Result (right)
    const aResult = U.el('div');
    aLayout.appendChild(aResult);
    aResult.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Adjust the sliders and click "Explain Assessment" to score the learner and generate a SHAP-style breakdown of why the model predicted that CEFR level.')));

    explainBtn.addEventListener('click', runExplainProficiency);

    async function runExplainProficiency() {
      explainBtn.disabled = true;
      U.clear(explainBtn);
      explainBtn.appendChild(C.spinner('on-primary'));
      explainBtn.appendChild(U.el('span', { text: 'Explaining…' }));
      U.clear(aResult);
      aResult.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Assessing with RandomForest + XGBoost, then SHAP-explaining…')]));
      try {
        const prediction = await API.post('/assess/proficiency', state);
        // Fire all three explainers in parallel — prof + recs share input/prediction.
        const [profExpl, recsExpl] = await Promise.all([
          API.post('/explain/proficiency', { input: state, prediction }),
          API.post('/explain/recommendations', { input: state, prediction }).catch(() => ({ reasoning: [] }))
        ]);
        showProficiencyExplanation(prediction, profExpl, recsExpl);
        C.toastSuccess('Explanation ready: ' + (profExpl.level || prediction.level) + ' level');
      } catch (e) {
        U.clear(aResult);
        aResult.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Explanation failed', runExplainProficiency)));
        C.toastError(e.message || 'Explanation failed');
      } finally {
        explainBtn.disabled = false;
        U.clear(explainBtn);
        explainBtn.appendChild(U.icon('lightbulb', 18, 2));
        explainBtn.appendChild(U.el('span', { text: 'Explain Assessment' }));
      }
    }

    function showProficiencyExplanation(prediction, expl, recsExpl) {
      U.clear(aResult);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
      const level = expl.level || prediction.level;
      const conf = prediction.confidence != null ? prediction.confidence : 0;
      const model = prediction.model || '—';

      // Top: big level + gauge (uses prediction confidence, expl doesn't have it)
      const topCard = C.card({});
      topCard.appendChild(C.cardHead('Predicted CEFR Level & Confidence', { subtitle: model + ' · explainer latency ' + U.fmtMs(expl.latency_ms) }));
      const topBody = U.el('div', { class: 'row', style: { gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap', marginTop: 'var(--space-3)' } });
      topBody.appendChild(U.el('div', { class: 'level-badge-wrap' }, [
        U.el('div', { class: U.cx('level-badge', String(level).toLowerCase()) }, [level || '—']),
        U.el('div', { class: 'caption', text: 'Confidence: ' + U.fmtPct(conf, 0) })
      ]));
      topBody.appendChild(U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
        C.chart((host) => Charts.gaugeChart(host, conf || 0, {
          label: U.fmtPct(conf, 0),
          sub: 'model confidence',
          thresholds: { high: 0.85, med: 0.7 },
          colors: { high: Charts.palette().primary, med: Charts.palette().warning, low: Charts.palette().danger }
        }), 200)
      ]));
      topCard.appendChild(topBody);
      wrap.appendChild(topCard);

      // SHAP contribution chart — uses all_contributions (so we see every feature)
      const contribs = expl.all_contributions || expl.top_contributions || [];
      if (contribs.length) {
        wrap.appendChild(C.card({ class: 'chart-card' },
          C.cardHead('Feature Contribution Chart (SHAP)', { subtitle: 'how each input pushed the prediction toward higher (+) or lower (−) CEFR level' }),
          C.chart((host) => Charts.shapChart(host, {
            items: contribs.map(c => ({
              label: c.label || c.feature.replace(/_/g, ' '),
              value: c.contribution,
              value_label: (c.contribution >= 0 ? '+' : '') + c.contribution.toFixed(3),
              color: c.direction === 'decreases' ? Charts.palette().danger
                   : c.direction === 'neutral' ? Charts.palette().muted
                   : Charts.palette().primary
            })),
            labelWidth: 130
          }), Math.max(220, contribs.length * 36 + 40))
        ));
      }

      // Summary banner (1-2 sentence natural-language summary from explainer)
      if (expl.summary) {
        wrap.appendChild(C.card({}, [
          C.cardHead('Natural-Language Summary', { subtitle: 'model-generated plain-English reasoning' }),
          U.el('div', { class: 'reasoning-summary-banner', style: { marginTop: 'var(--space-3)' } }, [
            U.icon('sparkles', 18, 2),
            U.el('div', { text: expl.summary })
          ])
        ]));
      }

      // Per-feature natural-language explanation list (uses each contribution's `explanation`)
      const nl = contribs.filter(c => c.explanation);
      if (nl.length) {
        const nlCard = C.card({});
        nlCard.appendChild(C.cardHead('Per-Feature Explanation', { subtitle: 'plain-English reasoning for each contributing factor' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        nl.forEach((c, i) => {
          const dirColor = c.direction === 'decreases' ? 'danger' : c.direction === 'neutral' ? 'muted' : 'primary';
          list.appendChild(U.el('div', { class: 'reasoning-row' }, [
            U.el('div', { class: U.cx('reasoning-num', dirColor === 'danger' && 'danger', dirColor === 'muted' && 'accent'), text: String(i + 1) }),
            U.el('div', { class: 'reasoning-text' }, [
              U.el('span', { class: U.cx('direction-chip', dirColor), text: c.direction }),
              U.el('span', { style: { marginLeft: '6px' }, text: c.explanation }),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '4px', fontFamily: 'var(--font-mono)' }, text: 'value ' + c.value + ' · importance ' + U.fmtPct(c.importance, 1) + ' · contribution ' + (c.contribution >= 0 ? '+' : '') + c.contribution.toFixed(3) })
            ])
          ]));
        });
        nlCard.appendChild(list);
        wrap.appendChild(nlCard);
      }

      // Per-recommendation reasoning — comes from /explain/recommendations
      const recs = (recsExpl && recsExpl.reasoning) || prediction.recommendations || [];
      if (recs.length) {
        const rCard = C.card({});
        rCard.appendChild(C.cardHead('Recommendation Reasoning', { subtitle: 'each recommendation annotated with a "Why?" explanation' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        recs.forEach(r => {
          const pri = String(r.priority || 'medium').toLowerCase();
          const why = r.why || r.reason || '';
          const fiPct = r.feature_importance_pct;
          const gap = r.gap_vs_threshold;
          list.appendChild(U.el('div', { class: U.cx('recommendation-row', pri) }, [
            U.el('div', { class: 'rec-pri ' + pri, text: pri }),
            U.el('div', { style: { flex: '1' } }, [
              U.el('div', { class: 'rec-area', text: r.area }),
              U.el('div', { class: 'rec-action', text: r.action }),
              why && U.el('div', { class: 'rec-why' }, [
                U.el('span', { class: 'rec-why-label', text: 'Why? ' }),
                U.el('span', { text: why })
              ]),
              (fiPct != null || gap != null) && U.el('div', { class: 'rec-meta', style: { marginTop: '6px', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' } }, [
                fiPct != null && U.el('span', { class: 'text-xs text-mono', style: { color: 'var(--accent)' }, text: 'feature importance: ' + fiPct.toFixed(1) + '%' }),
                gap != null && U.el('span', { class: 'text-xs text-mono', style: { color: gap > 0 ? 'var(--danger)' : 'var(--success)' }, text: 'gap vs next-level threshold: ' + (gap > 0 ? '+' : '') + gap.toFixed(1) + ' pts' })
              ].filter(Boolean))
            ])
          ]));
        });
        rCard.appendChild(list);
        wrap.appendChild(rCard);
      }

      aResult.appendChild(wrap);
    }

    /* ---------- Panel B: Acquisition Explainability ---------- */
    const panelB = C.card({}, C.cardHead('Panel B · Acquisition Explainability', {
      subtitle: 'attention weights on your score history explain the forecast',
      right: C.badge('Attention', 'accent')
    }));
    root.appendChild(panelB);

    const bLayout = U.el('div', { class: 'predict-layout' });
    panelB.appendChild(bLayout);

    const formB = U.el('div', { class: 'card-inner-col' });
    formB.appendChild(U.el('div', { class: 'caption', text: 'Score history & horizon' }));
    const trackState = { history: '62, 64, 65, 67, 66, 68, 70, 71, 70, 72, 74, 73, 76, 78', horizon: 30 };
    const historyInput = U.el('textarea', {
      class: 'input', rows: 4, style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-3)' },
      text: trackState.history,
      onInput: (e) => trackState.history = e.target.value
    });
    formB.appendChild(historyInput);

    formB.appendChild(U.el('div', { class: 'field', style: { marginTop: 'var(--space-4)' } }, [
      U.el('label', { class: 'field-label', text: 'Forecast horizon (days)' }),
      U.el('div', { class: 'slider-row' }, [
        U.el('input', {
          class: 'slider', type: 'range', min: '7', max: '90', step: '1', value: String(trackState.horizon),
          onInput: (e) => { trackState.horizon = Number(e.target.value); hValB.textContent = trackState.horizon + ' days'; }
        }),
        U.el('span', { class: 'slider-val', text: trackState.horizon + ' days' })
      ])
    ]));
    const hValB = formB.querySelector('.slider-val');

    const explainFcBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('tracker', 18, 2), U.el('span', { text: 'Explain Forecast' })]);
    formB.appendChild(explainFcBtn);
    bLayout.appendChild(formB);

    const bResult = U.el('div');
    bLayout.appendChild(bResult);
    bResult.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Paste your daily scores and click "Explain Forecast" to generate the learning curve forecast plus an attention-weight visualisation showing which historical days most influenced the prediction.')));

    explainFcBtn.addEventListener('click', runExplainAcquisition);

    async function runExplainAcquisition() {
      const parsed = String(trackState.history)
        .split(/[\s,;\n]+/)
        .map(s => parseFloat(s))
        .filter(v => !isNaN(v));
      if (parsed.length < 3) {
        C.toastError('Please provide at least 3 numeric scores.');
        return;
      }
      explainFcBtn.disabled = true;
      U.clear(explainFcBtn);
      explainFcBtn.appendChild(C.spinner('on-primary'));
      explainFcBtn.appendChild(U.el('span', { text: 'Forecasting…' }));
      U.clear(bResult);
      bResult.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Running Attention-LSTM forecast + SHAP…')]));
      try {
        const prediction = await API.post('/track/acquisition', { history: parsed, horizon: trackState.horizon });
        const explanation = await API.post('/explain/acquisition', { history: parsed, forecast: prediction });
        showAcquisitionExplanation(prediction, explanation, parsed);
        C.toastSuccess('Forecast explained — attention weights computed.');
      } catch (e) {
        U.clear(bResult);
        bResult.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Explanation failed', runExplainAcquisition)));
        C.toastError(e.message || 'Explanation failed');
      } finally {
        explainFcBtn.disabled = false;
        U.clear(explainFcBtn);
        explainFcBtn.appendChild(U.icon('tracker', 18, 2));
        explainFcBtn.appendChild(U.el('span', { text: 'Explain Forecast' }));
      }
    }

    function showAcquisitionExplanation(prediction, expl, history) {
      U.clear(bResult);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Forecast chart (history + forecast)
      const fc = prediction.forecast || [];
      const histLen = history.length;
      const combined = [];
      history.forEach((v, i) => combined.push({ x: i, score: v, lower: null, upper: null }));
      fc.forEach((p, i) => {
        const x = histLen - 1 + p.day;
        combined.push({ x, score: p.score, lower: p.lower, upper: p.upper });
      });

      wrap.appendChild(C.card({ class: 'chart-card' },
        C.cardHead('Learning Curve & Forecast', { subtitle: (prediction.model || '—') + ' · latency ' + U.fmtMs(prediction.latency_ms) }),
        C.chart((host) => {
          const series = [
            { name: 'Lower bound', color: Charts.palette().primary3, points: combined.filter(p => p.lower != null).map(p => ({ x: p.x, y: p.lower })) },
            { name: 'Score', color: Charts.palette().primary, points: combined.map(p => ({ x: p.x, y: p.score })) },
            { name: 'Upper bound', color: Charts.palette().primary3, points: combined.filter(p => p.upper != null).map(p => ({ x: p.x, y: p.upper })) }
          ];
          Charts.lineChart(host, {
            series,
            xLabels: combined.map((_, i) => i % Math.max(1, Math.floor(combined.length / 8)) === 0 ? 'D' + (i + 1) : ''),
            yFormat: (v) => Math.round(v),
            legend: true
          });
          // Confidence band overlay
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
      ));

      // Attention weights chart
      const weights = expl.attention_weights || [];
      const topInfluencerIdx = new Set((expl.top_influencers || []).map(t => t.index));
      if (weights.length) {
        const subtitle = (expl.top_influencers && expl.top_influencers.length)
          ? 'top influencers: ' + expl.top_influencers.map(t => 'score ' + t.score + ' (' + Math.abs(t.day_offset) + 'd ago, w=' + t.weight.toFixed(3) + ')').join(', ')
          : 'which historical days most influenced the forecast';
        wrap.appendChild(C.card({ class: 'chart-card' },
          C.cardHead('Attention Weights Visualization', { subtitle }),
          C.chart((host) => Charts.barChart(host, {
            labels: weights.map(w => 'D' + (w.day_offset === 0 ? 0 : Math.abs(w.day_offset)) + ' ago'),
            values: weights.map(w => w.weight),
            colors: weights.map(w => topInfluencerIdx.has(w.index) ? Charts.palette().accent : Charts.palette().primary3),
            yFormat: (v) => v.toFixed(2),
            valueFormat: (v) => v.toFixed(3)
          }), 220)
        ));
      }

      // Summary banner
      if (expl.summary) {
        wrap.appendChild(C.card({}, [
          C.cardHead('Natural-Language Summary', { subtitle: 'why the model forecasts this trajectory' }),
          U.el('div', { class: 'reasoning-summary-banner accent', style: { marginTop: 'var(--space-3)' } }, [
            U.icon('sparkles', 18, 2),
            U.el('div', { text: expl.summary })
          ])
        ]));
      }

      // Top influencers as reasoning rows
      const tops = expl.top_influencers || [];
      if (tops.length) {
        const nlCard = C.card({});
        nlCard.appendChild(C.cardHead('Top Influencers', { subtitle: 'the historical points with the highest attention weight' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        tops.forEach((t, i) => {
          list.appendChild(U.el('div', { class: 'reasoning-row' }, [
            U.el('div', { class: 'reasoning-num accent', text: '#' + (i + 1) }),
            U.el('div', { class: 'reasoning-text' }, [
              U.el('div', {}, [
                U.el('span', { class: 'text-sm', style: { fontWeight: 600 }, text: 'Score ' + t.score + ' · ' + Math.abs(t.day_offset) + ' day(s) ago' }),
                U.el('span', { class: 'badge badge-accent', style: { marginLeft: '8px' }, text: 'weight ' + t.weight.toFixed(3) }),
                U.el('span', { class: 'badge badge-soft', style: { marginLeft: '4px' }, text: 'rank ' + t.rank })
              ]),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '4px', lineHeight: 1.5 }, text: t.explanation })
            ])
          ]));
        });
        nlCard.appendChild(list);
        wrap.appendChild(nlCard);
      }

      bResult.appendChild(wrap);
    }

    /* ---------- Panel C: Skill Progression Graph ---------- */
    const panelC = C.card({ class: 'chart-card' },
      C.cardHead('Panel C · Skill Progression Graph', {
        subtitle: 'simulated learner trajectory across four skill dimensions (12 weeks)',
        right: C.badge('Synthetic', 'soft')
      })
    );
    root.appendChild(panelC);

    const progression = syntheticProgression();
    panelC.appendChild(C.chart((host) => Charts.lineChart(host, {
      series: progression,
      xLabels: Array.from({ length: 12 }, (_, i) => 'W' + (i + 1)),
      yFormat: (v) => Math.round(v),
      yMin: 40, yMax: 90,
      legend: true,
      points: true
    }), 320));

    // Skill legend cards under the chart
    const legendGrid = U.el('div', { class: 'grid grid-4', style: { marginTop: 'var(--space-3)' } });
    progression.forEach(s => {
      const first = s.points[0].y, last = s.points[s.points.length - 1].y;
      const delta = (last - first).toFixed(1);
      const dir = Number(delta) >= 0 ? 'up' : 'down';
      legendGrid.appendChild(U.el('div', { class: 'skill-prog-cell' }, [
        U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-2)' } }, [
          U.el('span', { class: 'dot', style: { background: s.color } }),
          U.el('span', { class: 'text-sm', style: { fontWeight: 600 }, text: s.name })
        ]),
        U.el('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '6px', alignItems: 'baseline' } }, [
          U.el('span', { class: 'text-xs text-muted', text: 'W1 ' + first }),
          U.el('span', { class: 'text-xs text-muted', text: 'W12 ' + last })
        ]),
        U.el('div', { class: U.cx('badge', dir === 'up' ? 'badge-success' : 'badge-danger'), style: { marginTop: '6px' }, text: (dir === 'up' ? '▲ +' : '▼ ') + Math.abs(delta) + ' pts' })
      ]));
    });
    panelC.appendChild(legendGrid);

    panelC.appendChild(U.el('div', { class: 'trust-foot-note', style: { marginTop: 'var(--space-4)' } }, [
      U.icon('info', 14, 2),
      U.el('span', { text: 'Synthetic data is shown when no real history is available. Plug a real learner_id to render the actual trajectory.' })
    ]));

    return { dispose() {} };
  }

  function trustMetric(label, value) {
    return U.el('div', { class: 'trust-metric' }, [
      U.el('div', { class: 'trust-metric-val', text: value }),
      U.el('div', { class: 'trust-metric-lbl', text: label })
    ]);
  }

  window.Views = window.Views || {};
  window.Views['/explainability'] = { title: 'Explainability Dashboard', render };
})();
