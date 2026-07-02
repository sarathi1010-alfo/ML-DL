/* ============================================================
   views/agent.js — Agentic HR workflow
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
        U.el('div', { class: 'caption', text: 'GenAI · ReAct Agent' }),
        U.el('div', { class: 'view-title', text: 'Agentic HR Workflow' })
      ])
    ]));

    // Form card
    const formCard = C.card({}, C.cardHead('Run Agent', { subtitle: 'configure the task and employee' }));
    const formGrid = U.el('div', { class: 'form-grid' });
    const state = { task: 'Onboard new employee', employee_name: 'John Doe', role: 'Software Engineer', department: 'Engineering' };

    function textField(label, key, placeholder) {
      const input = U.el('input', { class: 'input', placeholder, value: state[key] });
      input.addEventListener('input', () => state[key] = input.value);
      return U.el('div', { class: 'field' }, [U.el('label', { class: 'field-label', text: label }), input]);
    }
    formGrid.appendChild(textField('Task', 'task', 'Onboard new employee'));
    formGrid.appendChild(textField('Employee Name', 'employee_name', 'John Doe'));
    formGrid.appendChild(textField('Role', 'role', 'Software Engineer'));
    formGrid.appendChild(textField('Department', 'department', 'Engineering'));
    formCard.appendChild(formGrid);

    const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('agent', 18, 2), U.el('span', { text: 'Run Agent' })]);
    formCard.appendChild(runBtn);
    root.appendChild(formCard);

    // Result host
    const resultHost = U.el('div');
    root.appendChild(resultHost);
    showEmpty();

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Configure the task above and click "Run Agent" to see the step-by-step reasoning, actions, and observations.')));
    }

    runBtn.addEventListener('click', runAgent);

    async function runAgent() {
      if (!state.employee_name) {
        C.toastError('Employee name is required.');
        return;
      }
      runBtn.disabled = true;
      U.clear(runBtn);
      runBtn.appendChild(C.spinner('on-primary'));
      runBtn.appendChild(U.el('span', { text: 'Running agent…' }));
      U.clear(resultHost);
      const progressCard = C.card({}, [
        C.cardHead('Agent running', { subtitle: 'executing steps…' }),
        U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
          U.el('div', { class: 'skeleton line' }),
          U.el('div', { class: 'skeleton line' }),
          U.el('div', { class: 'skeleton line', style: { width: '70%' } })
        ])
      ]);
      resultHost.appendChild(progressCard);
      try {
        const res = await API.post('/agent/hr', state);
        showResult(res);
        C.toastSuccess('Agent completed.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, C.errorState(e.message || 'Agent failed', runAgent)));
        C.toastError(e.message || 'Agent failed');
      } finally {
        runBtn.disabled = false;
        U.clear(runBtn);
        runBtn.appendChild(U.icon('agent', 18, 2));
        runBtn.appendChild(U.el('span', { text: 'Run Agent' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

      // Final banner
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
        const stepEl = U.el('div', { class: 'timeline-step', style: { animationDelay: (i * 0.18) + 's' } });
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
        C.cardHead('Execution Timeline', { subtitle: `${steps.length} steps · total ${U.fmtMs(res.total_latency_ms)}` }),
        timeline
      ]));

      resultHost.appendChild(wrap);

      // Load logs table
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
      const card = C.card({}, C.cardHead('Agent Logs', { subtitle: 'recent agent runs' }));
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
            { label: 'Employee', key: 'employee' },
            { label: 'Steps', key: 'steps_count', align: 'right', mono: true, render: r => U.fmtNumber(r.steps_count || 0) },
            { label: 'Status', render: r => C.badge(r.status || '—', U.statusVariant(r.status)) },
            { label: 'Latency', key: 'total_latency_ms', align: 'right', mono: true, render: r => U.fmtMs(r.total_latency_ms) },
            { label: 'When', render: r => U.fmtRelTime(r.created_at), align: 'right' }
          ],
          rows: logs,
          empty: 'No agent runs yet.'
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
  window.Views['/agent'] = { title: 'Agentic AI', render };
})();
