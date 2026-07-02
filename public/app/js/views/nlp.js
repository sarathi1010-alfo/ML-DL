/* ============================================================
   views/nlp.js — BERT complaint classification
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const EXAMPLES = [
    'My internet has been down for 3 days and no one is helping me!',
    'I was overcharged on my latest bill by $50.',
    'How do I upgrade my current service plan?',
    'The technician never showed up for my scheduled appointment.'
  ];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'AI Model · BERT (TF-IDF + LogReg deployment proxy)' }),
        U.el('div', { class: 'view-title', text: 'Complaint Classification (NLP)' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    // Left: input
    const inputCard = C.card({},
      C.cardHead('Complaint Text', { subtitle: 'type or pick an example' })
    );
    const textarea = U.el('textarea', { class: 'textarea', placeholder: 'Enter the customer complaint text…', style: { minHeight: '160px' } });
    inputCard.appendChild(textarea);
    inputCard.appendChild(U.el('div', { class: 'mt-3' }, [
      U.el('div', { class: 'caption mb-2', text: 'Examples' }),
      U.el('div', { class: 'example-chips' },
        EXAMPLES.map(ex => U.el('div', { class: 'chip', onClick: () => { textarea.value = ex; } }, [U.el('span', { text: ex.length > 40 ? ex.slice(0, 40) + '…' : ex })]))
      )
    ]));
    const classifyBtn = U.el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: 'var(--space-4)' } }, [U.icon('nlp', 18, 2), U.el('span', { text: 'Classify' })]);
    inputCard.appendChild(classifyBtn);
    layout.appendChild(inputCard);

    // Right: result
    const resultCard = C.card({ class: 'predict-result' },
      C.cardHead('Classification Result', { subtitle: 'category, sentiment & urgency' })
    );
    const resultHost = U.el('div');
    resultCard.appendChild(resultHost);
    layout.appendChild(resultCard);

    showEmpty();
    classifyBtn.addEventListener('click', runClassify);

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Enter a complaint and click Classify to see category, confidence scores, sentiment, urgency, and entities.'));
    }

    async function runClassify() {
      const text = textarea.value.trim();
      if (!text) {
        C.toastError('Please enter some complaint text.');
        return;
      }
      classifyBtn.disabled = true;
      U.clear(classifyBtn);
      classifyBtn.appendChild(C.spinner('on-primary'));
      classifyBtn.appendChild(U.el('span', { text: 'Classifying…' }));
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '80px' } }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line', style: { width: '70%' } })
      ]));
      try {
        const res = await API.post('/predict/bert', { text });
        showResult(res);
        C.toastSuccess('Classification complete.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Classification failed', runClassify));
        C.toastError(e.message || 'Classification failed');
      } finally {
        classifyBtn.disabled = false;
        U.clear(classifyBtn);
        classifyBtn.appendChild(U.icon('nlp', 18, 2));
        classifyBtn.appendChild(U.el('span', { text: 'Classify' }));
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Top result banner
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { background: 'var(--surface-2)' } }, [
        U.el('div', { class: 'row-between' }, [
          U.el('div', {}, [
            U.el('div', { class: 'caption', text: 'Category' }),
            U.el('div', { style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: '4px' }, text: res.category || '—' })
          ]),
          U.el('div', { style: { textAlign: 'right' } }, [
            U.el('div', { class: 'caption', text: 'Confidence' }),
            U.el('div', { class: 'text-mono', style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700 }, text: U.fmtPct(res.confidence, 0) })
          ])
        ])
      ]));

      // Category scores
      const cats = res.categories || [];
      if (cats.length) {
        host.appendChild(U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption mb-3', text: 'Per-category scores' }),
          C.chart((canvas) => Charts.hbarChart(canvas, {
            items: cats.map(c => ({
              label: c.label,
              value: c.score,
              color: c.label === res.category ? Charts.palette().accent : Charts.palette().primary
            })),
            valueFormat: (v) => U.fmtPct(v, 2)
          }), Math.max(110, cats.length * 38 + 20))
        ]));
      }

      // Sentiment + urgency
      const sent = res.sentiment || {};
      const sentV = (sent.label || '').toLowerCase().includes('neg') ? 'danger' : (sent.label || '').toLowerCase().includes('pos') ? 'success' : 'info';
      const urg = (res.urgency || '').toLowerCase();
      const urgV = urg.includes('high') ? 'danger' : urg.includes('med') ? 'warning' : 'success';
      host.appendChild(U.el('div', { class: 'grid grid-2' }, [
        U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption', text: 'Sentiment' }),
          U.el('div', { class: 'row', style: { marginTop: 'var(--space-2)' } }, [
            C.badge(sent.label || '—', sentV),
            U.el('span', { class: 'text-mono text-sm', text: U.fmtPct(sent.score, 2) })
          ])
        ]),
        U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption', text: 'Urgency' }),
          U.el('div', { style: { marginTop: 'var(--space-2)' } }, [C.badge(res.urgency || '—', urgV)])
        ])
      ]));

      // Entities
      const ents = res.entities || [];
      if (ents.length) {
        host.appendChild(U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption mb-2', text: 'Extracted Entities' }),
          U.el('div', { class: 'row wrap gap-2' },
            ents.map(e => C.badge(e.text + ' · ' + e.type, 'info'))
          )
        ]));
      }

      host.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)' } }, [
        C.badge('Model: ' + (res.model || '—'), 'soft'),
        C.badge('Latency: ' + U.fmtMs(res.latency_ms), 'soft')
      ]));

      resultHost.appendChild(host);
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/nlp'] = { title: 'NLP / BERT', render };
})();
