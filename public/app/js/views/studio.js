/* ============================================================
   views/studio.js — GenAI Level: Content Studio
   Three cards: Case Study Generator, Quiz Generator, Consultation Simulation.
   POST /genai/case-study, /genai/quiz, /genai/simulation
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const SPECIALTIES = ['cardiology', 'neurology', 'pediatrics', 'emergency', 'oncology', 'surgery', 'internal medicine', 'radiology'];
  const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
  const ROLES = ['patient', 'physician', 'nurse', 'specialist'];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'GenAI · Content Studio (GPT-4o-mini)' }),
        U.el('div', { class: 'view-title', text: 'Content Studio' })
      ])
    ]));

    // Three mode cards
    let activeMode = 'case-study';
    const modeCardsRow = U.el('div', { class: 'studio-cards' });
    const modes = [
      { id: 'case-study', icon: 'clipboard', title: 'Case Study Generator', desc: 'Specialty × difficulty → rich clinical case' },
      { id: 'quiz', icon: 'target', title: 'Quiz Generator', desc: 'Topic × questions → interactive quiz with explanations' },
      { id: 'simulation', icon: 'user', title: 'Consultation Simulation', desc: 'Specialty × role → role-play prompt' }
    ];
    modes.forEach(m => {
      const card = U.el('div', { class: U.cx('studio-card', m.id === activeMode && 'active'), onClick: () => { activeMode = m.id; renderModes(); renderPanel(); } }, [
        U.el('div', { class: 'sc-icon' }, [U.icon(m.icon, 22, 2)]),
        U.el('div', { class: 'sc-title', text: m.title }),
        U.el('div', { class: 'sc-desc', text: m.desc })
      ]);
      modeCardsRow.appendChild(card);
    });
    root.appendChild(modeCardsRow);

    const panelHost = U.el('div');
    root.appendChild(panelHost);

    function renderModes() {
      modeCardsRow.querySelectorAll('.studio-card').forEach((c, i) => c.classList.toggle('active', modes[i].id === activeMode));
    }
    function renderPanel() {
      U.clear(panelHost);
      if (activeMode === 'case-study') panelHost.appendChild(buildCaseTab());
      else if (activeMode === 'quiz') panelHost.appendChild(buildQuizTab());
      else panelHost.appendChild(buildSimTab());
    }

    /* ---------- Case Study ---------- */
    function buildCaseTab() {
      const wrap = U.el('div', { class: 'predict-layout' });
      const state = { specialty: 'emergency', difficulty: 'advanced' };

      const formCard = C.card({}, C.cardHead('Case Study Generator', { subtitle: 'specialty × difficulty' }));
      const grid = U.el('div', { class: 'form-grid' });
      grid.appendChild(buildSelect('Specialty', 'specialty', SPECIALTIES, state));
      grid.appendChild(buildSelect('Difficulty', 'difficulty', DIFFICULTIES, state));
      formCard.appendChild(grid);
      const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('clipboard', 18, 2), U.el('span', { text: 'Generate Case Study' })]);
      formCard.appendChild(runBtn);
      wrap.appendChild(formCard);

      const resultHost = U.el('div');
      wrap.appendChild(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Generate a clinical case study with discussion questions and learning objectives.')));

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        U.clear(runBtn);
        runBtn.appendChild(C.spinner('on-primary'));
        runBtn.appendChild(U.el('span', { text: 'Generating…' }));
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, [C.loadingBlock('GPT-4o-mini generating case…')]));
        try {
          const res = await API.post('/genai/case-study', state);
          showCase(res);
          C.toastSuccess('Case study ready.');
        } catch (e) {
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, C.errorState(e.message || 'Failed', () => runBtn.click())));
          C.toastError(e.message || 'Failed');
        } finally {
          runBtn.disabled = false;
          U.clear(runBtn);
          runBtn.appendChild(U.icon('clipboard', 18, 2));
          runBtn.appendChild(U.el('span', { text: 'Generate Case Study' }));
        }
      });

      function showCase(res) {
        U.clear(resultHost);
        const w = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
        w.append(C.card({}, [
          C.cardHead('Case Study', { subtitle: (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) }),
          U.el('div', { class: 'case-study-text', style: { marginTop: 'var(--space-3)' } }, [res.case_study || '—'])
        ]));
        if (res.questions && res.questions.length) {
          const ql = U.el('div', { class: 'col gap-2' });
          res.questions.forEach((q, i) => ql.appendChild(U.el('div', { class: 'discussion-q' }, [U.el('span', { class: 'q-num', text: String(i + 1) }), U.el('div', { text: q, style: { fontSize: 'var(--font-size-sm)', flex: '1' } })])));
          w.append(C.card({}, [C.cardHead('Discussion Questions', { subtitle: 'test clinical reasoning' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [ql])]));
        }
        if (res.learning_objectives && res.learning_objectives.length) {
          const ol = U.el('div', {});
          res.learning_objectives.forEach(o => ol.appendChild(U.el('div', { class: 'objective-item' }, [U.el('span', { class: 'o-check' }, [U.icon('check', 16, 2)]), U.el('span', { text: o, style: { fontSize: 'var(--font-size-sm)' } })])));
          w.append(C.card({}, [C.cardHead('Learning Objectives', { subtitle: 'master these' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [ol])]));
        }
        resultHost.appendChild(w);
      }
      return wrap;
    }

    /* ---------- Quiz ---------- */
    function buildQuizTab() {
      const wrap = U.el('div', { class: 'predict-layout' });
      const state = { specialty: 'pediatrics', topic: 'vaccination', num_questions: 5, difficulty: 'intermediate' };

      const formCard = C.card({}, C.cardHead('Quiz Generator', { subtitle: 'specialty × topic × count × difficulty' }));
      const grid = U.el('div', { class: 'form-grid' });
      grid.appendChild(buildSelect('Specialty', 'specialty', SPECIALTIES, state));
      grid.appendChild(buildSelect('Difficulty', 'difficulty', DIFFICULTIES, state));
      const topicWrap = U.el('div', { class: 'field' });
      topicWrap.appendChild(U.el('label', { class: 'field-label', text: 'Topic' }));
      const topicInput = U.el('input', { class: 'input', value: state.topic, onInput: (e) => state.topic = e.target.value });
      topicWrap.appendChild(topicInput);
      grid.appendChild(topicWrap);
      // num_questions slider
      const nqWrap = U.el('div', { class: 'field' });
      nqWrap.appendChild(U.el('label', { class: 'field-label', text: 'Number of questions' }));
      const nqRow = U.el('div', { class: 'slider-row' }, [
        U.el('input', { class: 'slider', type: 'range', min: '3', max: '10', step: '1', value: String(state.num_questions), onInput: (e) => { state.num_questions = Number(e.target.value); nqVal.textContent = state.num_questions; } }),
        U.el('span', { class: 'slider-val', text: String(state.num_questions) })
      ]);
      nqWrap.appendChild(nqRow);
      grid.appendChild(nqWrap);
      formCard.appendChild(grid);

      const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('target', 18, 2), U.el('span', { text: 'Generate Quiz' })]);
      formCard.appendChild(runBtn);
      wrap.appendChild(formCard);
      const nqVal = formCard.querySelector('.slider-val');

      const resultHost = U.el('div');
      wrap.appendChild(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Generate an interactive quiz with explanations and answer reveal.')));

      runBtn.addEventListener('click', async () => {
        if (!state.topic || !state.topic.trim()) { C.toastError('Please enter a topic.'); return; }
        runBtn.disabled = true;
        U.clear(runBtn);
        runBtn.appendChild(C.spinner('on-primary'));
        runBtn.appendChild(U.el('span', { text: 'Generating…' }));
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, [C.loadingBlock('GPT-4o-mini generating quiz…')]));
        try {
          const res = await API.post('/genai/quiz', state);
          showQuiz(res);
          C.toastSuccess('Quiz ready: ' + (res.questions ? res.questions.length : 0) + ' questions.');
        } catch (e) {
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, C.errorState(e.message || 'Failed', () => runBtn.click())));
          C.toastError(e.message || 'Failed');
        } finally {
          runBtn.disabled = false;
          U.clear(runBtn);
          runBtn.appendChild(U.icon('target', 18, 2));
          runBtn.appendChild(U.el('span', { text: 'Generate Quiz' }));
        }
      });

      function showQuiz(res) {
        U.clear(resultHost);
        const w = U.el('div', { class: 'col', style: { gap: 'var(--space-5)' } });
        w.append(C.card({}, [
          C.cardHead('Interactive Quiz', { subtitle: (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) + ' · ' + (res.questions ? res.questions.length : 0) + ' questions · click an option to reveal the answer' })
        ]));
        const questions = res.questions || [];
        questions.forEach((q, qi) => {
          const selected = { idx: -1 };
          const qCard = U.el('div', { class: 'quiz-question' }, [
            U.el('div', { class: 'q-text', text: (qi + 1) + '. ' + q.question })
          ]);
          const optionsHost = U.el('div');
          const explainHost = U.el('div');
          q.options.forEach((opt, oi) => {
            const letter = String.fromCharCode(65 + oi);
            const optEl = U.el('div', { class: 'quiz-option', onClick: () => {
              if (selected.idx >= 0) return; // lock after first click
              selected.idx = oi;
              optEl.classList.add('selected');
              // Reveal correct/wrong
              optionsHost.querySelectorAll('.quiz-option').forEach((node, i) => {
                node.classList.remove('selected');
                if (i === q.answer) node.classList.add('correct');
                else if (i === oi && oi !== q.answer) node.classList.add('wrong');
              });
              explainHost.appendChild(U.el('div', { class: 'quiz-explanation' }, [
                U.el('div', { style: { fontWeight: 700, marginBottom: 4 }, text: oi === q.answer ? '✓ Correct' : '✗ Incorrect — correct answer is ' + String.fromCharCode(65 + q.answer) }),
                q.explanation
              ]));
              // Update score
              if (oi === q.answer) score.add(1);
            }});
            optEl.appendChild(U.el('span', { class: 'opt-letter', text: letter }));
            optEl.appendChild(U.el('span', { class: 'opt-text', text: opt }));
            optionsHost.appendChild(optEl);
          });
          qCard.appendChild(optionsHost);
          qCard.appendChild(explainHost);
          w.append(qCard);
        });

        // Score summary at top of card
        const score = {
          _n: 0,
          add(n) { this._n += n; if (this._onUpdate) this._onUpdate(this._n); }
        };
        const summary = U.el('div', { class: 'metric-mini', style: { marginBottom: 'var(--space-3)' } });
        const scoreVal = U.el('div', { class: 'mm-val', text: '0 / ' + questions.length });
        const scoreLbl = U.el('div', { class: 'mm-lbl', text: 'Score (revealed as you answer)' });
        summary.append(scoreVal, scoreLbl);
        score._onUpdate = (n) => { scoreVal.textContent = n + ' / ' + questions.length; };

        w.insertBefore(C.card({}, [C.cardHead('Quiz Score', { subtitle: 'your progress' }), U.el('div', { style: { marginTop: 'var(--space-3)' } }, [summary])]), w.firstChild.nextSibling);
        resultHost.appendChild(w);
      }

      return wrap;
    }

    /* ---------- Simulation ---------- */
    function buildSimTab() {
      const wrap = U.el('div', { class: 'predict-layout' });
      const state = { specialty: 'neurology', role: 'patient' };

      const formCard = C.card({}, C.cardHead('Consultation Simulation', { subtitle: 'specialty × role' }));
      const grid = U.el('div', { class: 'form-grid' });
      grid.appendChild(buildSelect('Specialty', 'specialty', SPECIALTIES, state));
      grid.appendChild(buildSelect('Role', 'role', ROLES, state));
      formCard.appendChild(grid);
      const runBtn = U.el('button', { class: 'btn btn-primary btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('user', 18, 2), U.el('span', { text: 'Generate Simulation' })]);
      formCard.appendChild(runBtn);
      wrap.appendChild(formCard);

      const resultHost = U.el('div');
      wrap.appendChild(resultHost);
      resultHost.appendChild(C.card({}, C.emptyState('Generate a role-play simulation prompt to practice consultations.')));

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        U.clear(runBtn);
        runBtn.appendChild(C.spinner('on-primary'));
        runBtn.appendChild(U.el('span', { text: 'Generating…' }));
        U.clear(resultHost);
        resultHost.appendChild(C.card({}, [C.loadingBlock('GPT-4o-mini generating simulation…')]));
        try {
          const res = await API.post('/genai/simulation', state);
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, [
            C.cardHead('Simulation Prompt', { subtitle: (res.model || '—') + ' · ' + U.fmtMs(res.latency_ms) }),
            U.el('div', { class: 'simulation-text', style: { marginTop: 'var(--space-3)' } }, [res.simulation || '—'])
          ]));
          C.toastSuccess('Simulation ready.');
        } catch (e) {
          U.clear(resultHost);
          resultHost.appendChild(C.card({}, C.errorState(e.message || 'Failed', () => runBtn.click())));
          C.toastError(e.message || 'Failed');
        } finally {
          runBtn.disabled = false;
          U.clear(runBtn);
          runBtn.appendChild(U.icon('user', 18, 2));
          runBtn.appendChild(U.el('span', { text: 'Generate Simulation' }));
        }
      });

      return wrap;
    }

    function buildSelect(label, key, options, state) {
      const wrap = U.el('div', { class: 'field' });
      wrap.appendChild(U.el('label', { class: 'field-label', text: label }));
      const sel = U.el('select', { class: 'input' });
      options.forEach(o => {
        const opt = U.el('option', { value: o, text: o.charAt(0).toUpperCase() + o.slice(1) });
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
  window.Views['/studio'] = { title: 'Content Studio', render };
})();
