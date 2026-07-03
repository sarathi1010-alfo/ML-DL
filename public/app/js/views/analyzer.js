/* ============================================================
   views/analyzer.js — NLP Level: Communication Analyzer
   POST /analyze/communication → grammar errors, sentiment,
   medical entities (ICD hints), readability, feedback,
   suggestions, communication score.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const CONTEXTS = [
    { value: 'patient_history', label: 'Patient History' },
    { value: 'medical_report', label: 'Medical Report' },
    { value: 'consultation', label: 'Consultation' }
  ];

  const EXAMPLES = {
    patient_history: 'The patient present with chest pain and shortness of breath. He has a history of hypertension and diabetes.',
    medical_report: 'MRI of the brain demonstrate a small ischemic infarct in the right MCA territory. No hemorrhage was identified.',
    consultation: 'Hello Mr. Chen, I understands you have been experiencing headaches. Can you tell me when it started?'
  };

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'NLP · Communication Analyzer' }),
        U.el('div', { class: 'view-title', text: 'Communication Analyzer' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    /* ---------- Form (left) ---------- */
    const formCard = C.card({}, C.cardHead('Learner Input', { subtitle: 'paste clinical text for grammar & medical NLP analysis' }));

    const state = { text: EXAMPLES.patient_history, context: 'patient_history' };

    // Context dropdown
    const ctxWrap = U.el('div', { class: 'field', style: { marginTop: 'var(--space-3)' } });
    ctxWrap.appendChild(U.el('label', { class: 'field-label', text: 'Context' }));
    const ctxSelect = U.el('select', { class: 'input' });
    CONTEXTS.forEach(c => {
      const opt = U.el('option', { value: c.value, text: c.label });
      if (c.value === state.context) opt.selected = true;
      ctxSelect.appendChild(opt);
    });
    ctxSelect.addEventListener('change', () => state.context = ctxSelect.value);
    ctxWrap.appendChild(ctxSelect);
    formCard.appendChild(ctxWrap);

    // Textarea
    const textInput = U.el('textarea', {
      class: 'input', rows: 6, style: { fontFamily: 'var(--font-sans)', fontSize: 'var(--font-size-sm)' },
      text: state.text,
      onInput: (e) => state.text = e.target.value
    });
    formCard.appendChild(U.el('div', { class: 'field', style: { marginTop: 'var(--space-3)' } }, [
      U.el('label', { class: 'field-label', text: 'Text to analyze' }), textInput
    ]));

    // Example chips
    const chipsRow = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
    Object.keys(EXAMPLES).forEach(k => {
      chipsRow.appendChild(U.el('span', {
        class: 'example-chip',
        text: k.replace(/_/g, ' ') + ' example',
        onClick: () => { state.text = EXAMPLES[k]; state.context = k; textInput.value = state.text; ctxSelect.value = k; }
      }));
    });
    formCard.appendChild(chipsRow);

    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('analyzer', 18, 2), U.el('span', { text: 'Analyze' })]);
    formCard.appendChild(runBtn);
    layout.appendChild(formCard);

    /* ---------- Result (right) ---------- */
    const resultHost = U.el('div');
    layout.appendChild(resultHost);
    showEmpty();

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, C.emptyState('Paste a patient history, medical report, or consultation note and click "Analyze" to detect grammar errors, identify medical entities with ICD hints, score readability, and get feedback.')));
    }

    runBtn.addEventListener('click', runAnalyze);

    async function runAnalyze() {
      if (!state.text || !state.text.trim()) {
        C.toastError('Please enter text to analyze.');
        return;
      }
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Analyzing…' }));
      U.clear(resultHost);
      resultHost.appendChild(C.card({ class: 'predict-result' }, [C.loadingBlock('Running spaCy + TF-IDF analyzer…')]));
      try {
        const res = await API.post('/analyze/communication', { text: state.text, context: state.context });
        showResult(res);
        C.toastSuccess('Analysis complete: score ' + res.communication_score);
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.card({ class: 'predict-result' }, C.errorState(e.message || 'Analysis failed', runAnalyze)));
        C.toastError(e.message || 'Analysis failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('analyzer', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Analyze' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Score + sentiment + readability banner
      const topCard = C.card({});
      topCard.appendChild(C.cardHead('Communication Analysis', { subtitle: (res.model || '—') + ' · latency ' + U.fmtMs(res.latency_ms) }));
      const scoreRow = U.el('div', { class: 'score-display', style: { marginTop: 'var(--space-3)' } });

      const scoreNum = U.el('div', { class: 'score-num', text: String(res.communication_score != null ? res.communication_score : '—') });
      const scoreMeta = U.el('div', { class: 'score-meta' }, [
        U.el('div', { class: 'score-lbl', text: 'Communication Score' }),
        U.el('div', { class: 'score-grade', text: gradeForScore(res.communication_score) })
      ]);
      scoreRow.appendChild(scoreNum);
      scoreRow.appendChild(scoreMeta);

      // Sentiment + readability mini cards
      const sCard = U.el('div', { class: 'metric-mini', style: { flex: '1', minWidth: '140px' } });
      const sent = res.sentiment || {};
      sCard.appendChild(U.el('div', { class: 'sentiment-badge ' + String(sent.label || 'neutral').toLowerCase(), text: sent.label || '—' }));
      sCard.appendChild(U.el('div', { class: 'mm-lbl', text: 'Sentiment · ' + U.fmtPct(sent.score || 0, 0), style: { marginTop: '6px' } }));
      scoreRow.appendChild(sCard);

      const rCard = U.el('div', { class: 'metric-mini', style: { flex: '1', minWidth: '140px' } });
      const rb = res.readability || {};
      rCard.appendChild(U.el('div', { class: 'mm-val', text: rb.score != null ? rb.score.toFixed(1) : '—' }));
      rCard.appendChild(U.el('div', { class: 'mm-lbl', text: 'Readability · ' + (rb.grade_level || '—') }));
      rCard.appendChild(U.el('div', { class: U.cx('clarity-tag', clarityClass(rb.clarity)), text: rb.clarity || '—', style: { marginTop: '6px' } }));
      scoreRow.appendChild(rCard);

      topCard.appendChild(scoreRow);
      wrap.appendChild(topCard);

      // Grammar errors
      if (res.grammar_errors && res.grammar_errors.length) {
        const geCard = C.card({});
        geCard.appendChild(C.cardHead('Grammar Errors', { subtitle: res.grammar_errors.length + ' detected · click to copy correction' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        res.grammar_errors.forEach(ge => {
          const sev = String(ge.severity || 'medium').toLowerCase();
          list.appendChild(U.el('div', { class: U.cx('grammar-error-row', sev), onClick: () => { U.copyToClipboard(ge.correction || ''); C.toastInfo('Copied: ' + (ge.correction || '')); } }, [
            U.el('div', {}, [
              U.el('div', { class: 'ge-error', text: ge.error }),
              U.el('div', { class: 'text-xs text-muted', text: 'at: "' + (ge.position || '—') + '"' })
            ]),
            U.el('div', { class: 'ge-correction', text: ge.correction || '—' }),
            U.el('div', { class: 'ge-sev ' + sev, text: sev })
          ]));
        });
        geCard.appendChild(list);
        wrap.appendChild(geCard);
      } else {
        wrap.appendChild(C.card({}, [
          C.cardHead('Grammar Errors', { subtitle: 'no errors detected' }),
          U.el('div', { style: { padding: 'var(--space-4)', textAlign: 'center', color: 'var(--success)' } }, [U.icon('check', 22, 2), U.el('span', { text: ' Clean grammar — no issues found.' })])
        ]));
      }

      // Medical entities
      if (res.medical_entities && res.medical_entities.length) {
        const eCard = C.card({});
        eCard.appendChild(C.cardHead('Medical Entities', { subtitle: 'extracted with type + ICD hints' }));
        const chips = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
        res.medical_entities.forEach(e => {
          const chip = U.el('span', { class: U.cx('entity-chip', String(e.type || '').toLowerCase()) }, [
            U.el('span', { text: e.text }),
            e.icd_hint && U.el('span', { class: 'entity-icd', text: 'ICD ' + e.icd_hint })
          ]);
          chips.appendChild(chip);
        });
        eCard.appendChild(chips);
        wrap.appendChild(eCard);
      }

      // Feedback
      if (res.feedback) {
        wrap.appendChild(C.card({}, [
          C.cardHead('AI Feedback', { subtitle: 'personalized coaching note' }),
          U.el('div', { style: { padding: 'var(--space-4)', marginTop: 'var(--space-3)', background: 'var(--surface-2)', borderLeft: '3px solid var(--primary)', borderRadius: 'var(--radius)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 } }, [res.feedback])
        ]));
      }

      // Suggestions (rewritten)
      if (res.suggestions && res.suggestions.length) {
        const sCard2 = C.card({});
        sCard2.appendChild(C.cardHead('Rewritten Suggestions', { subtitle: 'cleaner alternatives · click to copy' }));
        const list = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
        res.suggestions.forEach(s => {
          list.appendChild(U.el('div', {
            class: 'recommendation-row low',
            onClick: () => { U.copyToClipboard(s); C.toastInfo('Copied suggestion.'); },
            style: { cursor: 'pointer' }
          }, [
            U.el('div', { class: 'rec-pri low', text: '✓' }),
            U.el('div', { style: { flex: '1' } }, [
              U.el('div', { class: 'rec-action', text: s, style: { color: 'var(--text)', fontStyle: 'normal' } })
            ])
          ]));
        });
        sCard2.appendChild(list);
        wrap.appendChild(sCard2);
      }

      resultHost.appendChild(wrap);
    }

    function gradeForScore(s) {
      if (s == null) return '—';
      if (s >= 90) return 'A · Excellent';
      if (s >= 80) return 'B · Proficient';
      if (s >= 70) return 'C · Developing';
      if (s >= 60) return 'D · Basic';
      return 'F · Needs work';
    }
    function clarityClass(c) {
      const s = String(c || '').toLowerCase();
      if (s === 'good') return 'good';
      if (s === 'fair') return 'fair';
      if (s === 'poor') return 'poor';
      return 'fair';
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/analyzer'] = { title: 'Communication Analyzer', render };
})();
