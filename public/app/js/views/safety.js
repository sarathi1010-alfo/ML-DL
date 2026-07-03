/* ============================================================
   views/safety.js — AI Trust & Safety
   Three sections:
     A. Safety Statistics    — GET  /safety/stats
        Cards + donut for safe / warning / blocked distribution.
     B. Live Safety Screener  — POST /safety/screen {text, context}
        Verdict badge, confidence gauge, reasons, disclaimers,
        filtered text.
     C. Hallucination & Safety Evaluation — POST /safety/evaluate {}
        Test-case table + summary card "X/10 tests passed".
   Backend response shapes:
     - SafetyStats           (backend/app/schemas/safety.py)
     - ScreenResponse
     - EvaluateResponse
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const CONTEXTS = [
    { value: 'general', label: 'General' },
    { value: 'patient_handoff', label: 'Patient Handoff' },
    { value: 'discharge_note', label: 'Discharge Note' },
    { value: 'diagnosis', label: 'Diagnosis' },
    { value: 'education', label: 'Educational Material' },
    { value: 'slm', label: 'SLM Output' },
    { value: 'genai', label: 'GenAI Output' },
    { value: 'agent', label: 'Agent Output' }
  ];

  const EXAMPLES = {
    patient_handoff: 'The patient is a 58-year-old male presenting with chest pain and diaphoresis. Vitals: BP 156/94, HR 102. Aspirin 325mg chewed immediately and the cath lab is activated.',
    discharge_note: 'Discharge with amoxicillin 500mg three times daily for 7 days. Follow up in 1 week. Return if symptoms worsen.',
    diagnosis: 'You have myocardial infarction and need immediate surgery. Stop taking your insulin immediately — it is dangerous.',
    educational: 'Chest pain with diaphoresis may indicate acute coronary syndrome and warrants urgent evaluation including ECG and troponin. Please consult a healthcare professional.'
  };

  function verdictIcon(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'safe') return 'check';
    if (s === 'warning') return 'alert';
    if (s === 'blocked') return 'x';
    return 'info';
  }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    /* ---------- Header ---------- */
    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'AI Trust · Safety Layer' }),
        U.el('div', { class: 'view-title', text: 'AI Trust & Safety' })
      ]),
      U.el('div', { class: 'trust-pill accent', onClick: () => window.Router && Router.navigate('/explainability') }, [
        U.icon('lightbulb', 14, 2),
        U.el('span', { text: 'Pair with Explainability' })
      ])
    ]));

    /* ---------- Trust hero strip ---------- */
    root.appendChild(C.card({ class: 'trust-hero safety-hero' }, [
      U.el('div', { class: 'row', style: { gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' } }, [
        U.el('div', { class: 'trust-hero-icon safety' }, [U.icon('shield', 26, 2)]),
        U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
          U.el('div', { class: 'trust-hero-title', text: 'A guardrail for medical AI' }),
          U.el('div', { class: 'text-sm text-muted', style: { marginTop: '4px', lineHeight: 1.5 }, text: 'Every output MediLingua produces is screened for unsafe medical content — direct diagnoses, dangerous remedies, illegal drugs, self-harm references, and absolutist claims. Unsafe content is blocked, warnings are surfaced, and safe content is passed through with a medical disclaimer attached.' })
        ]),
        U.el('div', { class: 'row', style: { gap: 'var(--space-3)' } }, [
          trustMetric('Layer', 'Guardrail'),
          trustMetric('Verdicts', '3 tiers'),
          trustMetric('Eval', '10 cases')
        ])
      ])
    ]));

    /* ---------- Section A: Safety Statistics ---------- */
    const secA = C.card({}, C.cardHead('Section A · Safety Statistics', {
      subtitle: 'aggregate counters for all screened content',
      right: U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => loadStats(true) }, [U.icon('refresh', 14, 2), 'Refresh'])
    }));
    root.appendChild(secA);

    const statsHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    statsHost.appendChild(U.el('div', { class: 'dash-stats' }, [C.skeletonStat(), C.skeletonStat(), C.skeletonStat(), C.skeletonStat()]));
    secA.appendChild(statsHost);

    const statsExtra = U.el('div', { class: 'grid grid-2', style: { marginTop: 'var(--space-4)' } }, [C.skeletonCard(), C.skeletonCard()]);
    secA.appendChild(statsExtra);

    let statsTimer = null;

    async function loadStats(isRefresh) {
      if (isRefresh) C.toastInfo('Refreshing safety stats…');
      try {
        const data = await API.get('/safety/stats');
        renderStats(data);
      } catch (e) {
        U.clear(statsHost);
        statsHost.appendChild(C.errorState(e.message || 'Failed to load safety stats', () => loadStats(true)));
        U.clear(statsExtra);
        C.toastError(e.message || 'Failed to load safety stats');
      }
    }

    function renderStats(s) {
      const safeCount = s.safe_count || 0;
      const warnCount = s.warning_count || 0;
      const blockedCount = s.blocked_count || 0;
      const total = s.total_screened || (safeCount + warnCount + blockedCount) || 1;

      // Stat cards
      U.clear(statsHost);
      const cards = U.el('div', { class: 'dash-stats' }, [
        C.statCard({
          label: 'Total Screened', value: U.fmtNumber(s.total_screened),
          icon: U.icon('clipboard', 16, 2),
          spark: [12, 18, 24, 30, 28, 36, 42, 50],
          sparkColor: Charts.palette().accent
        }),
        C.statCard({
          label: 'Safe', value: U.fmtNumber(safeCount),
          icon: U.icon('check', 16, 2),
          spark: [10, 14, 18, 22, 26, 30, 34, 38],
          sparkColor: Charts.palette().primary
        }),
        C.statCard({
          label: 'Warning', value: U.fmtNumber(warnCount),
          icon: U.icon('alert', 16, 2),
          spark: [3, 5, 4, 6, 5, 7, 6, 8],
          sparkColor: Charts.palette().warning
        }),
        C.statCard({
          label: 'Blocked', value: U.fmtNumber(blockedCount),
          icon: U.icon('x', 16, 2),
          spark: [0, 1, 0, 2, 1, 1, 0, 2],
          sparkColor: Charts.palette().danger
        })
      ]);
      statsHost.appendChild(cards);

      // Donut + top categories
      U.clear(statsExtra);
      const donutItems = [
        { label: 'Safe', value: safeCount, color: Charts.palette().primary },
        { label: 'Warning', value: warnCount, color: Charts.palette().warning },
        { label: 'Blocked', value: blockedCount, color: Charts.palette().danger }
      ];
      const donutCard = C.card({ class: 'chart-card' },
        C.cardHead('Verdict Distribution', { subtitle: 'share of screened content by verdict' }),
        U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-4)' } }, [
          U.el('div', { style: { flex: '0 0 200px' } }, [
            C.chart((host) => Charts.donutChart(host, {
              items: donutItems,
              centerLabel: U.fmtPct(safeCount / total, 0),
              centerSub: 'safe'
            }), 200)
          ]),
          U.el('div', { class: 'col gap-2', style: { flex: '1', minWidth: '0' } },
            donutItems.map(it => U.el('div', { class: 'row gap-2' }, [
              U.el('span', { class: 'dot', style: { background: it.color } }),
              U.el('span', { class: 'text-sm grow', text: it.label }),
              U.el('span', { class: 'text-xs text-mono', text: U.fmtNumber(it.value) + ' · ' + U.fmtPct(it.value / total, 1) })
            ]))
          )
        ])
      );
      statsExtra.appendChild(donutCard);

      // Avg confidence + top categories (top_categories is a list of [name, count] tuples)
      const topCats = (s.top_categories || []).map(pair => {
        if (Array.isArray(pair)) return { category: pair[0], count: pair[1] };
        if (pair && typeof pair === 'object') return { category: pair.category || pair.label || pair.name, count: pair.count || 0 };
        return { category: String(pair), count: 0 };
      });
      const catList = topCats.length
        ? topCats.map(cat => {
            const max = Math.max(...topCats.map(c => c.count || 0), 1);
            const pct = Math.round(((cat.count || 0) / max) * 100);
            return U.el('div', { class: 'category-bar-row' }, [
              U.el('span', { class: 'label', text: cat.category }),
              U.el('div', { class: 'track' }, [U.el('div', { class: 'fill', style: { width: pct + '%', background: 'linear-gradient(90deg, var(--danger), var(--warning))' } })]),
              U.el('span', { class: 'val', text: U.fmtNumber(cat.count || 0) })
            ]);
          })
        : [U.el('div', { class: 'text-xs text-muted', text: 'No blocked categories yet.' })];

      const confCard = C.card({ class: 'chart-card' },
        C.cardHead('Average Confidence & Top Blocked Categories', { subtitle: 'avg model confidence on screening decisions' }),
        U.el('div', { class: 'col gap-3', style: { marginTop: 'var(--space-3)' } }, [
          U.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' } }, [
            U.el('div', { style: { flex: '0 0 200px' } }, [
              C.chart((host) => Charts.gaugeChart(host, s.avg_confidence || 0, {
                label: U.fmtPct(s.avg_confidence || 0, 0),
                sub: 'avg confidence',
                thresholds: { high: 0.85, med: 0.7 },
                colors: { high: Charts.palette().primary, med: Charts.palette().warning, low: Charts.palette().danger }
              }), 180)
            ]),
            U.el('div', { style: { flex: '1', minWidth: '240px' }, class: 'col gap-2' }, catList)
          ])
        ])
      );
      statsExtra.appendChild(confCard);
    }

    /* ---------- Section B: Live Safety Screener ---------- */
    const secB = C.card({}, C.cardHead('Section B · Live Safety Screener', {
      subtitle: 'paste any medical text to screen it through the safety layer',
      right: C.badge('Live', 'success')
    }));
    root.appendChild(secB);

    const bLayout = U.el('div', { class: 'predict-layout' });
    secB.appendChild(bLayout);

    const formB = U.el('div', { class: 'card-inner-col' });
    const screenState = { text: EXAMPLES.discharge_note, context: 'discharge_note' };

    const ctxWrap = U.el('div', { class: 'field', style: { marginTop: 'var(--space-3)' } });
    ctxWrap.appendChild(U.el('label', { class: 'field-label', text: 'Context' }));
    const ctxSelect = U.el('select', { class: 'input' });
    CONTEXTS.forEach(c => {
      const opt = U.el('option', { value: c.value, text: c.label });
      if (c.value === screenState.context) opt.selected = true;
      ctxSelect.appendChild(opt);
    });
    ctxSelect.addEventListener('change', () => screenState.context = ctxSelect.value);
    ctxWrap.appendChild(ctxSelect);
    formB.appendChild(ctxWrap);

    const textInput = U.el('textarea', {
      class: 'input', rows: 6, style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-3)' },
      text: screenState.text,
      onInput: (e) => screenState.text = e.target.value
    });
    formB.appendChild(textInput);

    // Example chips
    const chipsRow = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
    Object.keys(EXAMPLES).forEach(k => {
      chipsRow.appendChild(U.el('span', {
        class: 'example-chip',
        text: k.replace(/_/g, ' '),
        onClick: () => { screenState.text = EXAMPLES[k]; screenState.context = (k === 'patient_handoff') ? 'general' : k; textInput.value = screenState.text; ctxSelect.value = screenState.context; }
      }));
    });
    formB.appendChild(chipsRow);

    const screenBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('shield', 18, 2), U.el('span', { text: 'Screen Text' })]);
    formB.appendChild(screenBtn);
    bLayout.appendChild(formB);

    const bResult = U.el('div');
    bLayout.appendChild(bResult);
    bResult.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Paste medical text and click "Screen Text" to run it through the safety layer. You will get a verdict (safe / warning / blocked), confidence, reasons, disclaimers, and a filtered version of the text.')));

    screenBtn.addEventListener('click', runScreen);

    async function runScreen() {
      if (!screenState.text || !screenState.text.trim()) {
        C.toastError('Please enter text to screen.');
        return;
      }
      screenBtn.disabled = true;
      U.clear(screenBtn);
      screenBtn.appendChild(C.spinner('on-primary'));
      screenBtn.appendChild(U.el('span', { text: 'Screening…' }));
      U.clear(bResult);
      bResult.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Running Medical Safety Classifier + Rule Filters…')]));
      try {
        const res = await API.post('/safety/screen', { text: screenState.text, context: screenState.context });
        showScreenResult(res);
        C.toastInfo('Verdict: ' + res.verdict + ' (confidence ' + U.fmtPct(res.confidence, 0) + ')');
      } catch (e) {
        U.clear(bResult);
        bResult.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Screening failed', runScreen)));
        C.toastError(e.message || 'Screening failed');
      } finally {
        screenBtn.disabled = false;
        U.clear(screenBtn);
        screenBtn.appendChild(U.icon('shield', 18, 2));
        screenBtn.appendChild(U.el('span', { text: 'Screen Text' }));
      }
    }

    function showScreenResult(res) {
      U.clear(bResult);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
      const verdict = String(res.verdict || 'safe').toLowerCase();
      const subtitle = 'context: ' + (res.context || '—') + ' · latency ' + U.fmtMs(res.latency_ms) + (res.safe ? ' · safe=' + res.safe : '');

      // Verdict banner + confidence gauge
      const topCard = C.card({});
      topCard.appendChild(C.cardHead('Safety Verdict', { subtitle }));
      const topBody = U.el('div', { class: 'row', style: { gap: 'var(--space-5)', alignItems: 'center', flexWrap: 'wrap', marginTop: 'var(--space-3)' } });

      topBody.appendChild(U.el('div', { class: U.cx('verdict-banner', verdict) }, [
        U.el('div', { class: 'verdict-icon' }, [U.icon(verdictIcon(verdict), 28, 2)]),
        U.el('div', {}, [
          U.el('div', { class: 'verdict-label', text: 'Verdict' }),
          U.el('div', { class: 'verdict-text', text: verdict.toUpperCase() })
        ])
      ]));

      topBody.appendChild(U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
        C.chart((host) => Charts.gaugeChart(host, res.confidence || 0, {
          label: U.fmtPct(res.confidence, 0),
          sub: 'model confidence',
          thresholds: { high: 0.85, med: 0.7 },
          colors: { high: Charts.palette().primary, med: Charts.palette().warning, low: Charts.palette().danger }
        }), 200)
      ]));
      topCard.appendChild(topBody);
      wrap.appendChild(topCard);

      // Reasons (list of warnings)
      if (res.reasons && res.reasons.length) {
        const rCard = C.card({});
        rCard.appendChild(C.cardHead('Reasons', { subtitle: res.reasons.length + ' flag' + (res.reasons.length === 1 ? '' : 's') + ' detected' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        res.reasons.forEach(r => {
          list.appendChild(U.el('div', { class: 'safety-reason-row' }, [
            U.el('div', { class: 'safety-reason-icon' }, [U.icon('alert', 16, 2)]),
            U.el('div', { class: 'safety-reason-text', text: r })
          ]));
        });
        rCard.appendChild(list);
        wrap.appendChild(rCard);
      } else {
        wrap.appendChild(C.card({}, [
          C.cardHead('Reasons', { subtitle: 'no flags detected' }),
          U.el('div', { style: { padding: 'var(--space-4)', textAlign: 'center', color: 'var(--success)' } }, [U.icon('check', 22, 2), U.el('span', { text: ' Clean — no safety flags raised.' })])
        ]));
      }

      // Disclaimers
      if (res.disclaimers && res.disclaimers.length) {
        const dCard = C.card({});
        dCard.appendChild(C.cardHead('Disclaimers', { subtitle: 'attached to every screened output' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        res.disclaimers.forEach(d => {
          list.appendChild(U.el('div', { class: 'disclaimer-row' }, [
            U.el('div', { class: 'disclaimer-icon' }, [U.icon('info', 14, 2)]),
            U.el('div', { class: 'disclaimer-text', text: d })
          ]));
        });
        dCard.appendChild(list);
        wrap.appendChild(dCard);
      }

      // Filtered text
      if (res.filtered_text) {
        wrap.appendChild(C.card({}, [
          C.cardHead('Filtered Text', { subtitle: 'sanitised output after safety processing' }),
          U.el('div', { class: 'filtered-text-block' }, [res.filtered_text]),
          U.el('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: 'var(--space-3)' } }, [
            U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => { U.copyToClipboard(res.filtered_text); C.toastInfo('Filtered text copied.'); } }, [U.icon('clipboard', 14, 2), 'Copy'])
          ])
        ]));
      }

      bResult.appendChild(wrap);
    }

    /* ---------- Section C: Hallucination & Safety Evaluation ---------- */
    const secC = C.card({}, C.cardHead('Section C · Hallucination & Safety Evaluation', {
      subtitle: 'regression battery of 10 adversarial prompts',
      right: U.el('button', { class: 'btn btn-primary btn-sm', id: 'safety-eval-btn', onClick: runEvaluate }, [U.icon('zap', 14, 2), 'Run Safety Evaluation'])
    }));
    root.appendChild(secC);

    const evalHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    evalHost.appendChild(C.emptyState('Click "Run Safety Evaluation" to execute the 10-case regression battery and see which prompts the safety layer correctly blocked, warned on, or passed through.'));
    secC.appendChild(evalHost);

    async function runEvaluate() {
      const btn = document.getElementById('safety-eval-btn');
      if (btn) {
        btn.disabled = true;
        U.clear(btn);
        btn.appendChild(C.spinner('on-primary'));
        btn.appendChild(U.el('span', { text: 'Evaluating…' }));
      }
      U.clear(evalHost);
      evalHost.appendChild(C.loadingBlock('Running 10 adversarial prompts through the safety layer…'));
      try {
        const res = await API.post('/safety/evaluate', {});
        showEvalResult(res);
        const total = res.total || 0, passed = res.passed || 0;
        C.toastSuccess('Eval complete: ' + passed + '/' + total + ' tests passed.');
      } catch (e) {
        U.clear(evalHost);
        evalHost.appendChild(C.errorState(e.message || 'Evaluation failed', runEvaluate));
        C.toastError(e.message || 'Evaluation failed');
      } finally {
        if (btn) {
          btn.disabled = false;
          U.clear(btn);
          btn.appendChild(U.icon('zap', 14, 2));
          btn.appendChild(U.el('span', { text: 'Re-run Safety Evaluation' }));
        }
      }
    }

    function showEvalResult(res) {
      U.clear(evalHost);
      const total = res.total || 0;
      const passed = res.passed || 0;
      const failed = res.failed != null ? res.failed : (total - passed);
      const passRate = res.pass_rate != null ? res.pass_rate : (total ? passed / total : 0);
      const cases = res.results || res.test_cases || [];

      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Summary banner
      const summaryCard = U.el('div', { class: U.cx('eval-summary', passRate >= 0.9 ? 'good' : passRate >= 0.7 ? 'fair' : 'poor') }, [
        U.el('div', { class: 'eval-summary-num', text: passed + '/' + total }),
        U.el('div', { class: 'eval-summary-meta' }, [
          U.el('div', { class: 'eval-summary-lbl', text: 'safety tests passed' }),
          U.el('div', { class: 'eval-summary-sub', text: U.fmtPct(passRate, 0) + ' pass rate · ' + failed + ' failed · ' + (cases.length || 0) + ' total cases' })
        ]),
        U.el('div', { class: 'eval-summary-gauge' }, [
          C.chart((host) => Charts.gaugeChart(host, passRate, {
            label: U.fmtPct(passRate, 0),
            sub: 'pass rate',
            thresholds: { high: 0.9, med: 0.7 },
            colors: { high: Charts.palette().primary, med: Charts.palette().warning, low: Charts.palette().danger }
          }), 140)
        ])
      ]);
      wrap.appendChild(summaryCard);

      // Test cases table — backend uses {label, text, context, expected, actual, confidence, reasons, passed}
      const tableCard = C.card({}, [
        C.cardHead('Test Cases', { subtitle: cases.length + ' adversarial prompts · expected vs actual verdict' }),
        U.el('div', { style: { marginTop: 'var(--space-3)' } },
          C.table({
            columns: [
              { label: '#', mono: true, align: 'right', render: r => String(r._idx) },
              { label: 'Label', render: r => U.el('span', { class: 'text-sm', style: { fontWeight: 600 }, text: r.label || '—' }) },
              { label: 'Prompt', render: r => U.el('span', { class: 'text-xs', text: (r.text || '').length > 80 ? (r.text || '').slice(0, 80) + '…' : (r.text || ''), title: r.text }) },
              { label: 'Context', render: r => U.el('span', { class: 'text-mono text-xs', text: r.context || '—' }) },
              { label: 'Expected', render: r => verdictBadge(r.expected) },
              { label: 'Actual', render: r => verdictBadge(r.actual) },
              { label: 'Confidence', render: r => U.el('span', { class: 'text-mono text-xs', text: U.fmtPct(r.confidence, 0) }), align: 'right', mono: true },
              { label: 'Result', render: r => r.passed ? C.badge('PASS', 'success') : C.badge('FAIL', 'danger'), align: 'center' }
            ],
            rows: cases.map((c, i) => Object.assign({}, c, { _idx: i + 1 })),
            empty: 'No test cases.'
          })
        )
      ]);
      wrap.appendChild(tableCard);

      // If any failures, list them with their reasons
      const failures = cases.filter(c => !c.passed);
      if (failures.length) {
        const fCard = C.card({});
        fCard.appendChild(C.cardHead('Failures', { subtitle: failures.length + ' case' + (failures.length === 1 ? '' : 's') + ' did not match expected verdict' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        failures.forEach(f => {
          list.appendChild(U.el('div', { class: 'safety-reason-row danger' }, [
            U.el('div', { class: 'safety-reason-icon danger' }, [U.icon('x', 16, 2)]),
            U.el('div', { class: 'safety-reason-text' }, [
              U.el('div', { style: { fontWeight: 600 }, text: f.label || '—' }),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '2px' }, text: 'Expected ' + f.expected + ' but got ' + f.actual + ' (confidence ' + U.fmtPct(f.confidence, 0) + ').' }),
              f.reasons && f.reasons.length ? U.el('div', { class: 'text-xs', style: { marginTop: '4px', color: 'var(--text-muted)' }, text: 'Reasons: ' + f.reasons.join('; ') }) : null
            ])
          ]));
        });
        fCard.appendChild(list);
        wrap.appendChild(fCard);
      }

      evalHost.appendChild(wrap);
    }

    function verdictBadge(v) {
      const s = String(v || '').toLowerCase();
      return U.el('span', { class: U.cx('safety-verdict-badge', s) }, [
        U.icon(verdictIcon(s), 12, 2),
        U.el('span', { text: s })
      ]);
    }

    function trustMetric(label, value) {
      return U.el('div', { class: 'trust-metric' }, [
        U.el('div', { class: 'trust-metric-val', text: value }),
        U.el('div', { class: 'trust-metric-lbl', text: label })
      ]);
    }

    /* ---------- Boot ---------- */
    loadStats(false);
    statsTimer = setInterval(() => loadStats(false), 30000);

    return {
      dispose() { if (statsTimer) { clearInterval(statsTimer); statsTimer = null; } }
    };
  }

  window.Views = window.Views || {};
  window.Views['/safety'] = { title: 'AI Trust & Safety', render };
})();
