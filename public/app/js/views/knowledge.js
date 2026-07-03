/* ============================================================
   views/knowledge.js — Medical Knowledge Base (RAG)
   Two-panel layout:
     Left:  document list (GET /rag/documents), upload (POST /rag/upload,
            multipart), delete (DELETE /rag/documents/{id}).
     Right: Q&A chat interface — POST /rag/query, show answer + expandable
            sources with confidence scores. Suggested question chips.
   Backend response shapes (backend/app/schemas/rag.py):
     - RagQueryResponse: {answer, sources: [RagSource], retrieval_confidence,
                         chunks_used, latency_ms, model, llm_used}
     - RagSource: {chunk_id, text, score, rank, document_id,
                   document_filename, category}
     - RagDocumentsResponse: {documents: [RagDocumentOut],
                              total_documents, total_chunks}
     - RagDocumentOut: {id, filename, chunks, uploaded_at, source}
     - RagUploadResponse: {document_id, filename, chunks, message}
     - RagDeleteResponse: {status, id, chunks_removed}
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;

  const SUGGESTED_QUESTIONS = [
    'How should I explain a diagnosis to a patient?',
    'What is the SOAP note format?',
    'How do I use the teach-back method?',
    'Explain the SBAR handover framework.',
    'When should I use passive voice in medical writing?',
    'What are conditional tenses used for in clinical English?',
    'How do I break bad news using the SPIKES protocol?',
    'What CEFR level do I need for fluent clinical communication?'
  ];

  const CATEGORY_COLORS = {
    cardiology: 'var(--danger)',
    neurology: 'var(--accent)',
    pediatrics: 'var(--warning)',
    emergency: 'var(--danger)',
    communication: 'var(--primary)',
    documentation: 'var(--info)',
    cultural: 'var(--indigo)',
    grammar: 'var(--accent-2)',
    cefr: 'var(--success)',
    specialty: 'var(--primary-2)',
    user_upload: 'var(--sand)',
    general: 'var(--text-muted)'
  };

  function categoryColor(c) {
    return CATEGORY_COLORS[c] || CATEGORY_COLORS.general;
  }

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    /* ---------- Header ---------- */
    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'RAG · Medical Knowledge Base (TF-IDF + SVD + FAISS)' }),
        U.el('div', { class: 'view-title', text: 'Medical Knowledge Base' })
      ]),
      U.el('div', { class: 'trust-pill accent', onClick: () => window.Router && Router.navigate('/scenario') }, [
        U.icon('sparkles', 14, 2),
        U.el('span', { text: 'Try in Scenario Practice' })
      ])
    ]));

    /* ---------- Hero strip ---------- */
    root.appendChild(C.card({ class: 'trust-hero knowledge-hero' }, [
      U.el('div', { class: 'row', style: { gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' } }, [
        U.el('div', { class: 'trust-hero-icon knowledge' }, [U.icon('book', 26, 2)]),
        U.el('div', { style: { flex: '1', minWidth: '260px' } }, [
          U.el('div', { class: 'trust-hero-title', text: 'Retrieval-augmented medical communication knowledge' }),
          U.el('div', { class: 'text-sm text-muted', style: { marginTop: '4px', lineHeight: 1.5 }, text: 'Ask clinical-communication questions and get answers grounded in a curated knowledge base of medical terminology, patient-communication best practices, documentation guidelines, cultural competence, and CEFR descriptors. Upload your own .txt or .json documents to extend the knowledge base.' })
        ]),
        U.el('div', { class: 'row', style: { gap: 'var(--space-3)' } }, [
          trustMetric('Pipeline', 'TF-IDF → SVD(64) → FAISS'),
          trustMetric('Store', 'IndexFlatIP'),
          trustMetric('Seed KB', '60 chunks')
        ])
      ])
    ]));

    /* ---------- Two-panel layout ---------- */
    const layout = U.el('div', { class: 'knowledge-layout' });
    root.appendChild(layout);

    const leftPanel = U.el('div', { class: 'knowledge-left' });
    const rightPanel = U.el('div', { class: 'knowledge-right' });
    layout.append(leftPanel, rightPanel);

    /* ---------- Left: Documents ---------- */
    leftPanel.appendChild(C.card({ class: 'knowledge-docs-card' },
      C.cardHead('Knowledge Documents', {
        subtitle: 'seed KB + uploaded .txt / .json',
        right: U.el('button', { class: 'btn btn-secondary btn-sm', onClick: () => loadDocuments(true) }, [U.icon('refresh', 14, 2), 'Refresh'])
      })
    ));

    const uploadHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    leftPanel.querySelector('.card').appendChild(uploadHost);
    const dz = C.dropzone({
      accept: '.txt,.json,.md,text/plain,application/json',
      label: 'Drop a .txt or .json file',
      sublabel: 'or click to browse (max 500 KB)',
      onFile: handleUpload
    });
    uploadHost.appendChild(dz);

    const docsListHost = U.el('div', { style: { marginTop: 'var(--space-4)' } });
    leftPanel.querySelector('.card').appendChild(docsListHost);
    docsListHost.appendChild(C.loadingBlock('Loading documents…'));

    /* ---------- Right: Q&A ---------- */
    rightPanel.appendChild(C.card({ class: 'knowledge-qa-card' },
      C.cardHead('Ask the Knowledge Base', {
        subtitle: 'retrieval-augmented generation over medical communication knowledge'
      })
    ));

    // Suggested-question chips
    const chipRow = U.el('div', { class: 'chip-row', style: { marginTop: 'var(--space-3)' } });
    SUGGESTED_QUESTIONS.forEach(q => {
      const chip = U.el('button', { class: 'chip', onClick: () => askQuestion(q) }, [q]);
      chipRow.appendChild(chip);
    });
    rightPanel.querySelector('.card').appendChild(chipRow);

    // Chat transcript
    const transcript = U.el('div', { class: 'qa-transcript', style: { marginTop: 'var(--space-4)' } });
    transcript.appendChild(U.el('div', { class: 'qa-empty' }, [
      U.el('div', { class: 'qa-empty-icon' }, [U.icon('book', 36, 1.5)]),
      U.el('div', { class: 'qa-empty-title', text: 'Ask a question to get a grounded answer' }),
      U.el('div', { class: 'text-sm text-muted', text: 'Your question is embedded with TF-IDF + SVD, matched against the FAISS index, and the retrieved chunks ground an LLM answer.' })
    ]));
    rightPanel.querySelector('.card').appendChild(transcript);

    // Input row
    const inputRow = U.el('div', { class: 'qa-input-row', style: { marginTop: 'var(--space-3)' } });
    const input = U.el('input', {
      class: 'input qa-input',
      type: 'text',
      placeholder: 'Ask about medical terminology, communication, documentation, grammar…',
      onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion(input.value); } }
    });
    const sendBtn = U.el('button', { class: 'btn btn-primary qa-send-btn', onClick: () => askQuestion(input.value) }, [
      U.icon('send', 18, 2),
      U.el('span', { text: 'Ask' })
    ]);
    inputRow.append(input, sendBtn);
    rightPanel.querySelector('.card').appendChild(inputRow);

    /* ---------- Functions ---------- */
    function trustMetric(label, value) {
      return U.el('div', { class: 'trust-metric' }, [
        U.el('div', { class: 'text-xs text-muted', text: label }),
        U.el('div', { style: { fontSize: '13px', fontWeight: 700 }, text: value })
      ]);
    }

    async function loadDocuments(isRefresh) {
      if (isRefresh) C.toastInfo('Refreshing documents…');
      try {
        const data = await API.get('/rag/documents');
        renderDocuments(data);
      } catch (e) {
        U.clear(docsListHost);
        docsListHost.appendChild(C.errorState(e.message || 'Failed to load documents', () => loadDocuments(true)));
        C.toastError(e.message || 'Failed to load documents');
      }
    }

    function renderDocuments(data) {
      U.clear(docsListHost);
      const docs = (data && data.documents) || [];
      const totalChunks = data && data.total_chunks != null ? data.total_chunks : docs.reduce((s, d) => s + (d.chunks || 0), 0);

      // Summary
      docsListHost.appendChild(U.el('div', { class: 'docs-summary' }, [
        U.el('span', { class: 'badge badge-soft', text: docs.length + ' document' + (docs.length === 1 ? '' : 's') }),
        U.el('span', { class: 'badge badge-soft', text: totalChunks + ' chunks' })
      ]));

      if (!docs.length) {
        docsListHost.appendChild(C.emptyState('No documents yet. Upload a .txt or .json file to extend the knowledge base.'));
        return;
      }
      const list = U.el('div', { class: 'docs-list' });
      docs.forEach(d => {
        const isSeed = d.source === 'seed';
        const item = U.el('div', { class: U.cx('doc-item', isSeed && 'seed') }, [
          U.el('div', { class: 'doc-item-icon' }, [U.icon(isSeed ? 'book' : 'file', 18, 2)]),
          U.el('div', { class: 'doc-item-body' }, [
            U.el('div', { class: 'doc-item-name', text: d.filename || 'Untitled' }),
            U.el('div', { class: 'doc-item-meta' }, [
              U.el('span', { class: U.cx('badge', isSeed ? 'badge-soft' : 'badge-success'), text: isSeed ? 'seed' : 'uploaded' }),
              U.el('span', { class: 'text-xs text-muted', text: d.chunks + ' chunks' }),
              U.el('span', { class: 'text-xs text-muted', text: U.fmtRelTime(d.uploaded_at) })
            ])
          ]),
          U.el('div', { class: 'doc-item-actions' }, [
            !isSeed && U.el('button', {
              class: 'icon-btn doc-delete-btn',
              title: 'Delete document',
              onClick: (e) => { e.stopPropagation(); confirmDelete(d); }
            }, [U.icon('trash', 16, 2)])
          ])
        ]);
        list.appendChild(item);
      });
      docsListHost.appendChild(list);
    }

    function confirmDelete(doc) {
      C.confirm({
        title: 'Delete document?',
        message: 'Remove "' + doc.filename + '" and its ' + doc.chunks + ' chunk' + (doc.chunks === 1 ? '' : 's') + ' from the knowledge base?',
        confirmText: 'Delete',
        danger: true,
        onConfirm: async () => {
          try {
            await API.del('/rag/documents/' + doc.id);
            C.toastSuccess('Deleted ' + doc.filename);
            loadDocuments();
          } catch (e) {
            C.toastError(e.message || 'Failed to delete document');
          }
        }
      });
    }

    async function handleUpload(file) {
      // Validate
      const lower = (file.name || '').toLowerCase();
      const okExt = lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.md');
      if (!okExt) {
        C.toastError('Only .txt, .json, or .md files are supported.');
        return;
      }
      if (file.size > 500 * 1024) {
        C.toastError('File too large (max 500 KB).');
        return;
      }
      const fd = new FormData();
      fd.append('file', file, file.name);
      C.toastInfo('Uploading ' + file.name + '…');
      try {
        const res = await API.upload('/rag/upload', fd);
        C.toastSuccess(res.message || ('Added ' + res.chunks + ' chunks.'));
        loadDocuments();
      } catch (e) {
        C.toastError(e.message || 'Upload failed.');
      }
    }

    function askQuestion(q) {
      const text = (q || '').trim();
      if (!text) { C.toastWarning('Please enter a question.'); return; }
      input.value = '';
      doQuery(text);
    }

    async function doQuery(q) {
      // Add user bubble
      const userBubble = U.el('div', { class: 'qa-bubble user' }, [
        U.el('div', { class: 'qa-bubble-avatar user' }, [U.icon('user', 14, 2)]),
        U.el('div', { class: 'qa-bubble-body' }, [U.el('div', { class: 'qa-bubble-text', text: q })])
      ]);
      // Clear empty state if present
      const empty = transcript.querySelector('.qa-empty');
      if (empty) empty.remove();
      transcript.appendChild(userBubble);
      // Add loading bubble
      const loadingBubble = U.el('div', { class: 'qa-bubble assistant loading' }, [
        U.el('div', { class: 'qa-bubble-avatar assistant' }, [U.icon('book', 14, 2)]),
        U.el('div', { class: 'qa-bubble-body' }, [C.spinner('lg'), U.el('div', { class: 'text-xs text-muted', style: { marginTop: '8px' }, text: 'Retrieving + generating…' })])
      ]);
      transcript.appendChild(loadingBubble);
      transcript.scrollTop = transcript.scrollHeight;

      sendBtn.disabled = true;
      try {
        const res = await API.post('/rag/query', { query: q, top_k: 3 });
        loadingBubble.remove();
        transcript.appendChild(renderAnswer(q, res));
        transcript.scrollTop = transcript.scrollHeight;
      } catch (e) {
        loadingBubble.remove();
        transcript.appendChild(U.el('div', { class: 'qa-bubble assistant error' }, [
          U.el('div', { class: 'qa-bubble-avatar assistant' }, [U.icon('alert', 14, 2)]),
          U.el('div', { class: 'qa-bubble-body' }, [
            U.el('div', { class: 'qa-bubble-text', text: 'Failed to get an answer.' }),
            U.el('div', { class: 'text-xs text-muted', style: { marginTop: '4px' }, text: e.message || 'Network error' })
          ])
        ]));
        transcript.scrollTop = transcript.scrollHeight;
        C.toastError(e.message || 'Query failed.');
      } finally {
        sendBtn.disabled = false;
      }
    }

    function renderAnswer(q, res) {
      const bubble = U.el('div', { class: 'qa-bubble assistant' }, [
        U.el('div', { class: 'qa-bubble-avatar assistant' }, [U.icon('book', 14, 2)]),
        U.el('div', { class: 'qa-bubble-body' })
      ]);
      const body = bubble.querySelector('.qa-bubble-body');

      // Answer text
      body.appendChild(U.el('div', { class: 'qa-bubble-text', text: res.answer || '(no answer)' }));

      // Meta strip
      const meta = U.el('div', { class: 'qa-bubble-meta' });
      const confidence = res.retrieval_confidence || 0;
      const confCls = confidence >= 0.6 ? 'success' : confidence >= 0.35 ? 'warning' : 'danger';
      meta.appendChild(U.el('span', { class: U.cx('badge', 'badge-' + confCls), text: 'Confidence ' + U.fmtPct(confidence, 0) }));
      meta.appendChild(U.el('span', { class: 'badge badge-soft', text: (res.chunks_used || 0) + ' chunks' }));
      meta.appendChild(U.el('span', { class: 'badge badge-soft', text: U.fmtMs(res.latency_ms || 0) }));
      meta.appendChild(U.el('span', { class: U.cx('badge', res.llm_used ? 'badge-success' : 'badge-warning'), text: res.llm_used ? 'LLM' : 'fallback' }));
      body.appendChild(meta);

      // Sources
      const sources = res.sources || [];
      if (sources.length) {
        const sourcesHeader = U.el('div', { class: 'qa-sources-header', onClick: () => {
          const open = sourcesList.style.display !== 'none';
          sourcesList.style.display = open ? 'none' : 'block';
          chevron.style.transform = open ? '' : 'rotate(180deg)';
        } }, [
          U.el('span', { text: 'Sources (' + sources.length + ')' }),
          U.el('span', { class: 'text-xs text-muted', text: 'retrieved knowledge chunks' }),
          U.el('span', { class: 'qa-chevron' }, [U.icon('chevronDown', 16, 2)])
        ]);
        const chevron = sourcesHeader.querySelector('.qa-chevron');
        body.appendChild(sourcesHeader);

        const sourcesList = U.el('div', { class: 'qa-sources-list', style: { display: 'none' } });
        sources.forEach((s, i) => {
          const score = s.score || 0;
          const scoreCls = score >= 0.6 ? 'success' : score >= 0.35 ? 'warning' : 'danger';
          const item = U.el('div', { class: 'qa-source-item' }, [
            U.el('div', { class: 'qa-source-head' }, [
              U.el('span', { class: 'qa-source-rank', text: '#' + (i + 1) }),
              U.el('span', { class: 'qa-source-cat', style: { background: categoryColor(s.category), color: '#fff' }, text: s.category || 'general' }),
              U.el('span', { class: U.cx('qa-source-score', 'badge-' + scoreCls), text: U.fmtPct(score, 0) }),
              U.el('span', { class: 'text-xs text-muted', style: { marginLeft: 'auto', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }, text: s.document_filename || '' })
            ]),
            U.el('div', { class: 'qa-source-text', text: s.text || '' })
          ]);
          sourcesList.appendChild(item);
        });
        body.appendChild(sourcesList);
      }
      return bubble;
    }

    /* ---------- Init ---------- */
    loadDocuments();

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/knowledge'] = { title: 'Medical Knowledge Base', render };
})();
