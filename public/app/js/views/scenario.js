/* ============================================================
   views/scenario.js — SLM Level: Scenario Practice
   Three tabs: Scenario Generator, Term Explorer, Conversation Practice.
   POST /slm/scenario, /slm/explain, /slm/converse
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const SPECIALTIES = ['cardiology', 'neurology', 'pediatrics', 'emergency', 'oncology', 'surgery', 'internal medicine'];
  const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
  const SCENARIO_TYPES = ['patient_consultation', 'case_discussion', 'handover', 'emergency_response'];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'SLM · Scenario Practice (TinyLlama-1.1B-Q4)' }),
        U.el('div', { class: 'view-title', text: 'Scenario Practice' })
      ])
    ]));

    // Tabs
    const tabsBar = U.el('div', { class: 'tabs-bar' });
    const tabs = [
      { id: 'scenario', label: 'Scenario Generator', icon: 'scenario' },
      { id: 'term', label: 'Term Explorer', icon: 'book' },
      { id: 'converse', label: 'Conversation Practice', icon: 'chat' }
    ];
    let activeTab = 'scenario';
    const tabHost = U.el('div');
    root.appendChild(tabsBar);
    root.appendChild(tabHost);

    tabs.forEach(t => {
      const btn = U.el('button', { class: U.cx('tab-btn', t.id === activeTab && 'active'), onClick: () => { activeTab = t.id; renderTabs(); renderPanel(); } }, [U.icon(t.icon, 14, 2), t.label]);
      tabsBar.appendChild(btn);
    });

    function renderTabs() {
      tabsBar.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', tabs[i].id === activeTab));
    }

    function renderPanel() {
      U.clear(tabHost);
      if (activeTab === 'scenario') tabHost.appendChild(buildScenarioTab());
      else if (activeTab === 'term') tabHost.appendChild(buildTermTab());
      else if (activeTab === 'converse') tabHost.appendChild(buildConverseTab());
    }

    /* ---------- Scenario tab ---------- */
    function buildScenarioTab() {
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
      const state = { specialty: 'cardiology', difficulty: 'intermediate', scenario_type: 'patient_consultation' };

      // Form
      const formCard = C.card({}, C.cardHead('Scenario Generator', { subtitle: 'configure the medical scenario' }));
      const grid = U.el('div', { class: 'form-grid' });
      grid.appendChild(buildSelect('Specialty', 'specialty', SPECIALTIES, state));
      grid.appendChild(buildSelect('Difficulty', 'difficulty', DIFFICULTIES, state));
      grid.appendChild(buildSelect('Scenario Type', 'scenario_type', SCENARIO_TYPES, state, true));
      formCard.appendChild(grid);
      const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('scenario', 18, 2), U.el('span', { text: 'Generate Scenario' })]);
      formCard.appendChild(runBtn);
      wrap.appendChild(formCard);

      const resultHost = U.el('div');
      wrap.appendChild(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Configure and generate a medical scenario with terminology cards and discussion questions.')));

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        U.clear(runBtn);
        runBtn.appendChild(C.spinner('on-primary'));
        runBtn.appendChild(U.el('span', { text: 'Generating…' }));
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, [C.loadingBlock('TinyLlama generating scenario…')]));
        try {
          const res = await API.post('/slm/scenario', state);
          showScenario(res);
          C.toastSuccess('Scenario generated.');
        } catch (e) {
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, C.errorState(e.message || 'Generation failed', () => runBtn.click())));
          C.toastError(e.message || 'Generation failed');
        } finally {
          runBtn.disabled = false;
          U.clear(runBtn);
          runBtn.appendChild(U.icon('scenario', 18, 2));
          runBtn.appendChild(U.el('span', { text: 'Generate Scenario' }));
        }
      });

      function showScenario(res) {
        U.clear(resultHost);
        const w = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });

        // Scenario text
        w.appendChild(C.card({}, [
          C.cardHead('Clinical Scenario', { subtitle: (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) }),
          U.el('div', { class: 'case-study-text', style: { marginTop: 'var(--space-3)' } }, [res.scenario || '—'])
        ]));

        // Terminology cards
        if (res.terminology && res.terminology.length) {
          const tGrid = U.el('div', { class: 'grid grid-2' });
          res.terminology.forEach(t => {
            tGrid.appendChild(U.el('div', { class: 'term-card' }, [
              U.el('div', { class: 'term-name', text: t.term }),
              U.el('div', { class: 'term-def', text: t.definition }),
              t.example && U.el('div', { class: 'term-ex', text: '“' + t.example + '”' })
            ]));
          });
          w.appendChild(C.card({}, [C.cardHead('Key Terminology', { subtitle: res.terminology.length + ' terms' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [tGrid])]));
        }

        // Discussion questions
        if (res.questions && res.questions.length) {
          const qList = U.el('div', { class: 'col gap-2' });
          res.questions.forEach((q, i) => qList.appendChild(U.el('div', { class: 'discussion-q' }, [U.el('span', { class: 'q-num', text: String(i + 1) }), U.el('div', { text: q, style: { fontSize: 'var(--font-size-sm)', flex: '1' } })])));
          w.appendChild(C.card({}, [C.cardHead('Discussion Questions', { subtitle: 'practice your reasoning' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [qList])]));
        }

        resultHost.appendChild(w);
      }

      return wrap;
    }

    /* ---------- Term tab ---------- */
    function buildTermTab() {
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
      const state = { term: 'myocardial infarction' };

      const formCard = C.card({}, C.cardHead('Term Explorer', { subtitle: 'get SLM-powered explanations for medical terms' }));
      const input = U.el('input', { class: 'input', value: state.term, onInput: (e) => state.term = e.target.value, placeholder: 'e.g. arrhythmia, ischemia, anticoagulation…' });
      formCard.appendChild(U.el('div', { class: 'field', style: { marginTop: 'var(--space-3)' } }, [U.el('label', { class: 'field-label', text: 'Medical term' }), input]));

      const chips = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
      ['myocardial infarction', 'arrhythmia', 'ischemia', 'anticoagulation', 'hypertension', 'diabetes mellitus'].forEach(t => {
        chips.appendChild(U.el('span', { class: 'example-chip', text: t, onClick: () => { state.term = t; input.value = t; } }));
      });
      formCard.appendChild(chips);

      const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('book', 18, 2), U.el('span', { text: 'Explain Term' })]);
      formCard.appendChild(runBtn);
      wrap.appendChild(formCard);

      const resultHost = U.el('div');
      wrap.appendChild(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Search any medical term to get a definition, examples, and related terms.')));

      runBtn.addEventListener('click', async () => {
        if (!state.term || !state.term.trim()) { C.toastError('Please enter a term.'); return; }
        runBtn.disabled = true;
        U.clear(runBtn);
        runBtn.appendChild(C.spinner('on-primary'));
        runBtn.appendChild(U.el('span', { text: 'Explaining…' }));
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, [C.loadingBlock('TinyLlama explaining term…')]));
        try {
          const res = await API.post('/slm/explain', { term: state.term });
          showTerm(res);
          C.toastSuccess('Explanation ready.');
        } catch (e) {
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, C.errorState(e.message || 'Explain failed', () => runBtn.click())));
          C.toastError(e.message || 'Explain failed');
        } finally {
          runBtn.disabled = false;
          U.clear(runBtn);
          runBtn.appendChild(U.icon('book', 18, 2));
          runBtn.appendChild(U.el('span', { text: 'Explain Term' }));
        }
      });

      function showTerm(res) {
        U.clear(resultHost);
        const w = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
        w.append(C.card({}, [
          C.cardHead('Explanation: ' + (res.term || state.term), { subtitle: (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) }),
          U.el('div', { style: { padding: 'var(--space-4)', marginTop: 'var(--space-3)', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 } }, [res.explanation || '—'])
        ]));

        if (res.examples && res.examples.length) {
          const eList = U.el('div', { class: 'col gap-2' });
          res.examples.forEach(ex => eList.appendChild(U.el('div', { class: 'term-ex', text: '“' + ex + '”' })));
          w.append(C.card({}, [C.cardHead('Example Sentences', { subtitle: 'contextual usage' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [eList])]));
        }

        if (res.related_terms && res.related_terms.length) {
          const chipsR = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
          res.related_terms.forEach(rt => chipsR.appendChild(U.el('span', { class: 'related-term-chip', text: rt, onClick: () => { state.term = rt; input.value = rt; runBtn.click(); } })));
          w.append(C.card({}, [C.cardHead('Related Terms', { subtitle: 'click to explore' }), chipsR]));
        }
        resultHost.appendChild(w);
      }

      return wrap;
    }

    /* ---------- Converse tab ---------- */
    function buildConverseTab() {
      const wrap = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
      const messages = [];

      const card = C.card({}, C.cardHead('Conversation Practice', { subtitle: 'chat with the SLM medical tutor · get corrections + suggestions' }));
      const msgHost = U.el('div', { class: 'converse-messages', style: { marginTop: 'var(--space-3)' } });
      msgHost.appendChild(U.el('div', { class: 'chat-msg assistant', style: { maxWidth: '85%' } }, [
        U.el('div', { class: 'avatar sm', text: 'AI' }),
        U.el('div', { class: 'bubble', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--font-size-sm)' } }, [U.el('span', { text: 'Hello! I am your MediLingua SLM tutor. Ask me anything about cardiology scenarios — for example, "What should I do for a suspected STEMI?"' })])
      ]));
      card.appendChild(msgHost);

      // Suggestions host (for SLM suggestions after each response)
      const sugHost = U.el('div');
      card.appendChild(sugHost);

      // Input row
      const inputRow = U.el('div', { class: 'chat-input', style: { marginTop: 'var(--space-3)' } });
      const input = U.el('textarea', { class: 'input textarea', placeholder: 'Ask the tutor…', rows: 2, style: { resize: 'none' } });
      const sendBtn = U.el('button', { class: 'btn btn-primary' }, [U.icon('send', 16, 2), 'Send']);
      inputRow.append(input, sendBtn);
      card.appendChild(inputRow);
      wrap.appendChild(card);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      sendBtn.addEventListener('click', send);

      async function send() {
        const text = (input.value || '').trim();
        if (!text) return;
        messages.push({ role: 'user', text });
        appendMsg('user', text);
        input.value = '';
        // Typing indicator
        const typing = U.el('div', { class: 'chat-msg assistant', style: { maxWidth: '85%' } }, [
          U.el('div', { class: 'avatar sm', text: 'AI' }),
          U.el('div', { class: 'typing-indicator', style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' } }, [U.el('span'), U.el('span'), U.el('span')])
        ]);
        msgHost.appendChild(typing);
        msgHost.scrollTop = msgHost.scrollHeight;
        sendBtn.disabled = true;
        try {
          const res = await API.post('/slm/converse', { message: text, context: 'cardiology' });
          typing.remove();
          messages.push({ role: 'assistant', text: res.response });
          appendMsg('assistant', res.response);
          // Corrections
          U.clear(sugHost);
          if (res.corrections && res.corrections.length) {
            const cList = U.el('div', { class: 'col gap-2', style: { marginTop: 'var(--space-3)' } });
            res.corrections.forEach(c => cList.appendChild(U.el('div', { class: 'correction-item' }, [
              U.el('span', { class: 'ci-orig', text: c.original }),
              U.el('span', { class: 'ci-arrow', text: '→' }),
              U.el('span', { class: 'ci-fix', text: c.correction })
            ])));
            sugHost.appendChild(cList);
          }
          // Suggestions
          if (res.suggestions && res.suggestions.length) {
            const sChips = U.el('div', { class: 'example-chips', style: { marginTop: 'var(--space-3)' } });
            res.suggestions.forEach(s => sChips.appendChild(U.el('span', { class: 'example-chip', text: s, onClick: () => { input.value = s.replace(/^Ask about: /, ''); } })));
            sugHost.appendChild(sChips);
          }
        } catch (e) {
          typing.remove();
          C.toastError(e.message || 'Conversation failed');
        } finally {
          sendBtn.disabled = false;
        }
      }

      function appendMsg(role, text) {
        const msg = U.el('div', { class: 'chat-msg ' + role, style: { maxWidth: '85%' } }, [
          U.el('div', { class: 'avatar sm', text: role === 'user' ? 'U' : 'AI' }),
          U.el('div', { class: 'bubble', style: role === 'user'
            ? { background: 'var(--primary-grad)', color: '#fff', borderRadius: 'var(--radius-md)', borderTopRightRadius: '4px', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--font-size-sm)' }
            : { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', borderTopLeftRadius: '4px', padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--font-size-sm)' }
          }, [text])
        ]);
        msgHost.appendChild(msg);
        msgHost.scrollTop = msgHost.scrollHeight;
      }

      return wrap;
    }

    function buildSelect(label, key, options, state, span2) {
      const wrap = U.el('div', { class: U.cx('field', span2 && 'span-2') });
      wrap.appendChild(U.el('label', { class: 'field-label', text: label }));
      const sel = U.el('select', { class: 'input' });
      options.forEach(o => {
        const opt = U.el('option', { value: o, text: o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' ') });
        if (o === state[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => state[key] = sel.value);
      wrap.appendChild(sel);
      return wrap;
    }

    renderPanel();
    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/scenario'] = { title: 'Scenario Practice', render };
})();
