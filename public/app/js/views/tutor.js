/* ============================================================
   views/tutor.js — Agentic AI Level: AI Tutor
   POST /agent/tutor → ReAct loop with steps (thought/action/observation),
   learning path summary, final answer banner, tools used chips.
   GET /agent/logs → recent agent runs table.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const SPECIALTIES = ['cardiology', 'neurology', 'pediatrics', 'emergency', 'oncology', 'surgery', 'internal medicine', 'general practice'];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'Agentic AI · ReAct Tutor' }),
        U.el('div', { class: 'view-title', text: 'AI Tutor' })
      ])
    ]));

    // Form card
    const formCard = C.card({}, C.cardHead('Run Tutor', { subtitle: 'configure the learning path design task' }));
    const state = { learner_id: 'L001', task: 'Design learning path', current_level: 'B1', target_level: 'C1', specialty: 'cardiology' };

    const formGrid = U.el('div', { class: 'form-grid' });
    function textField(label, key, placeholder) {
      const input = U.el('input', { class: 'input', placeholder, value: state[key], onInput: (e) => state[key] = e.target.value });
      return U.el('div', { class: 'field' }, [U.el('label', { class: 'field-label', text: label }), input]);
    }
    function selectField(label, key, options) {
      const wrap = U.el('div', { class: 'field' });
      wrap.appendChild(U.el('label', { class: 'field-label', text: label }));
      const sel = U.el('select', { class: 'input' });
      options.forEach(o => {
        const opt = U.el('option', { value: o, text: o });
        if (o === state[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => state[key] = sel.value);
      wrap.appendChild(sel);
      return wrap;
    }
    formGrid.appendChild(textField('Learner ID', 'learner_id', 'L001'));
    formGrid.appendChild(textField('Task', 'task', 'Design learning path'));
    formGrid.appendChild(selectField('Current Level', 'current_level', LEVELS));
    formGrid.appendChild(selectField('Target Level', 'target_level', LEVELS));
    formGrid.appendChild(selectField('Specialty', 'specialty', SPECIALTIES));
    formCard.appendChild(formGrid);

    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('tutor', 18, 2), U.el('span', { text: 'Run Tutor' })]);
    formCard.appendChild(runBtn);
    root.appendChild(formCard);

    // Result host
    const resultHost = U.el('div');
    root.appendChild(resultHost);
    showEmpty();

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Configure the task above and click "Run Tutor" to see the ReAct agent design a personalized learning path with step-by-step reasoning.')));
    }

    runBtn.addEventListener('click', runTutor);

    async function runTutor() {
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Running tutor…' }));
      U.clear(resultHost);
      resultHost.appendChild(C.card({}, [
        C.cardHead('Tutor running', { subtitle: 'executing ReAct steps…' }),
        U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
          U.el('div', { class: 'skeleton line' }),
          U.el('div', { class: 'skeleton line' }),
          U.el('div', { class: 'skeleton line', style: { width: '70%' } })
        ])
      ]));
      try {
        const res = await API.post('/agent/tutor', state);
        showResult(res);
        C.toastSuccess('Tutor completed: ' + (res.learning_path ? res.learning_path.total_steps : 0) + ' steps.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, C.errorState(e.message || 'Tutor failed', runTutor)));
        C.toastError(e.message || 'Tutor failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('tutor', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Run Tutor' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Learning path summary
      const lp = res.learning_path || {};
      const sumCard = C.card({});
      sumCard.appendChild(C.cardHead('Learning Path Summary', { subtitle: 'designed by the ReAct agent' }));
      sumCard.appendChild(U.el('div', { class: 'path-summary', style: { marginTop: 'var(--space-3)' } }, [
        U.el('div', { class: 'ps-cell' }, [
          U.el('div', { class: 'ps-lbl', text: 'Total Steps' }),
          U.el('div', { class: 'ps-val', text: String(lp.total_steps || 0) }),
          U.el('div', { class: 'ps-sub', text: 'ReAct iterations' })
        ]),
        U.el('div', { class: 'ps-cell' }, [
          U.el('div', { class: 'ps-lbl', text: 'Estimated Days' }),
          U.el('div', { class: 'ps-val', text: String(lp.estimated_days || 0) }),
          U.el('div', { class: 'ps-sub', text: 'to reach ' + state.target_level })
        ]),
        U.el('div', { class: 'ps-cell' }, [
          U.el('div', { class: 'ps-lbl', text: 'Focus Areas' }),
          U.el('div', { class: 'focus-chips' }, (lp.focus_areas || []).map(f => U.el('span', { class: 'focus-chip', text: f })))
        ])
      ]));
      wrap.appendChild(sumCard);

      // Final answer banner
      if (res.final_answer) {
        wrap.appendChild(U.el('div', { class: 'final-banner' }, [
          U.el('div', { class: 'fb-label', text: 'Final Answer' }),
          U.el('div', { class: 'fb-text', text: res.final_answer })
        ]));
      }

      // Tools used
      const tools = res.tools_used || [];
      if (tools.length) {
        wrap.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-2)' } }, [
          U.el('span', { class: 'caption', text: 'Tools used:' }),
          ...tools.map(t => C.badge(t, 'accent'))
        ]));
      }

      // Timeline
      const steps = res.steps || [];
      const timeline = U.el('div', { class: 'timeline' });
      steps.forEach((step, i) => {
        const stepEl = U.el('div', { class: 'timeline-step', style: { animationDelay: (i * 0.12) + 's' } });
        const card = U.el('div', { class: 'step-card' }, [
          U.el('div', { class: 'row-between mb-2' }, [
            U.el('div', { class: 'row' }, [
              U.el('span', { class: 'step-num', text: step.step || (i + 1) }),
              U.el('span', { class: 'action-badge' }, [U.icon('zap', 11, 2), step.action || '—'])
            ]),
            U.el('span', { class: 'text-xs text-muted text-mono', text: U.fmtMs(step.latency_ms) })
          ]),
          stepRow('Thought', step.thought, 'thought'),
          stepRow('Action Input', formatJSON(step.action_input), 'mono'),
          stepRow('Observation', step.observation, 'observation')
        ]);
        stepEl.appendChild(card);
        timeline.appendChild(stepEl);
      });
      wrap.appendChild(C.card({}, [
        C.cardHead('Execution Timeline', { subtitle: steps.length + ' steps · total ' + U.fmtMs(res.total_latency_ms) }),
        timeline
      ]));

      resultHost.appendChild(wrap);

      // Reload logs
      loadLogs();
    }

    function stepRow(k, v, cls) {
      return U.el('div', { class: 'step-row' }, [
        U.el('div', { class: 'k', text: k }),
        U.el('div', { class: U.cx('v', cls), text: v == null ? '—' : String(v) })
      ]);
    }
    function formatJSON(v) {
      if (v == null) return '—';
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    }

    // ----- Logs table -----
    const logsHost = U.el('div');
    root.appendChild(logsHost);

    async function loadLogs() {
      U.clear(logsHost);
      const card = C.card({}, C.cardHead('Tutor Logs', { subtitle: 'recent agent runs' }));
      logsHost.appendChild(card);
      const tableHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
      card.appendChild(tableHost);
      tableHost.appendChild(C.loadingBlock('Loading logs…'));
      try {
        const res = await API.get('/agent/logs');
        const logs = (res && res.logs) || [];
        U.clear(tableHost);
        tableHost.appendChild(C.table({
          columns: [
            { label: 'Task', key: 'task' },
            { label: 'Learner', key: 'learner_id', mono: true },
            { label: 'Level', render: r => r.current_level + ' → ' + r.target_level, mono: true },
            { label: 'Specialty', key: 'specialty' },
            { label: 'Steps', key: 'steps_count', align: 'right', mono: true, render: r => U.fmtNumber(r.steps_count || 0) },
            { label: 'Status', render: r => C.badge(r.status || '—', U.statusVariant(r.status)) },
            { label: 'Latency', key: 'total_latency_ms', align: 'right', mono: true, render: r => U.fmtMs(r.total_latency_ms) },
            { label: 'When', render: r => U.fmtRelTime(r.created_at), align: 'right' }
          ],
          rows: logs,
          empty: 'No tutor runs yet.'
        }));
      } catch (e) {
        U.clear(tableHost);
        tableHost.appendChild(C.errorState(e.message || 'Failed to load logs', loadLogs));
      }
    }
    loadLogs();

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/tutor'] = { title: 'AI Tutor', render };
})();
