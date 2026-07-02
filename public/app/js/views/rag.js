/* ============================================================
   views/rag.js — RAG chat with document list
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  const SUGGESTED = [
    'What is the termination notice?',
    'Summarize the onboarding policy.',
    'How is PTO accrual calculated?'
  ];

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'GenAI · FAISS + LLM' }),
        U.el('div', { class: 'view-title', text: 'RAG Knowledge Assistant' })
      ])
    ]));

    const layout = U.el('div', { class: 'rag-layout' });
    root.appendChild(layout);

    // ----- Documents sidebar -----
    const docCard = C.card({ class: 'card-pad-sm', style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
      C.cardHead('Documents', { subtitle: 'knowledge base' })
    );
    const docListHost = U.el('div', { class: 'doc-list', style: { flex: '1' } });
    docCard.appendChild(docListHost);
    const uploadBtn = U.el('button', { class: 'btn btn-secondary btn-sm btn-block', style: { marginTop: 'var(--space-3)' } }, [U.icon('upload', 14, 2), 'Upload document']);
    docCard.appendChild(uploadBtn);
    layout.appendChild(docCard);

    // hidden file input
    const fileInput = U.el('input', { type: 'file', accept: '.pdf,.txt,.md', style: { display: 'none' } });
    docCard.appendChild(fileInput);
    uploadBtn.addEventListener('click', () => fileInput.click());

    // Dropzone behavior on the uploadBtn (simple)
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) uploadDoc(f);
      fileInput.value = '';
    });

    async function loadDocs() {
      U.clear(docListHost);
      docListHost.appendChild(C.loadingBlock('Loading documents…'));
      try {
        const res = await API.get('/rag/documents');
        U.clear(docListHost);
        const docs = (res && res.documents) || [];
        if (!docs.length) {
          docListHost.appendChild(C.emptyState('No documents yet. Upload a PDF or TXT to start.'));
        } else {
          docs.forEach(d => {
            const item = U.el('div', { class: 'doc-item' }, [
              U.icon('file', 22, 2),
              U.el('div', { class: 'doc-meta' }, [
                U.el('div', { class: 'doc-name', text: d.filename }),
                U.el('div', { class: 'doc-sub', text: `${d.chunks || 0} chunks · ${U.fmtBytes(d.size_kb || 0)} · ${U.fmtRelTime(d.uploaded_at)}` })
              ]),
              U.el('div', { class: 'doc-del', title: 'Delete', onClick: (e) => { e.stopPropagation(); deleteDoc(d.id); } }, [U.icon('trash', 14, 2)])
            ]);
            docListHost.appendChild(item);
          });
        }
      } catch (e) {
        U.clear(docListHost);
        docListHost.appendChild(C.errorState(e.message || 'Failed to load documents', loadDocs));
      }
    }

    async function uploadDoc(file) {
      C.toastInfo('Uploading ' + file.name + '…');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await API.upload('/rag/upload', fd);
        C.toastSuccess(`Indexed ${res.filename || file.name} — ${res.chunks || 0} chunks.`);
        loadDocs();
      } catch (e) {
        C.toastError(e.message || 'Upload failed');
      }
    }

    async function deleteDoc(id) {
      const m = C.confirm({
        title: 'Delete document?',
        message: 'This will remove the document and its embeddings from the knowledge base.',
        confirmText: 'Delete',
        danger: true,
        onConfirm: async () => {
          try {
            await API.del('/rag/documents/' + id);
            C.toastSuccess('Document deleted.');
            loadDocs();
          } catch (e) {
            C.toastError(e.message || 'Delete failed');
          }
        }
      });
    }

    loadDocs();

    // ----- Chat panel -----
    const chatPanel = U.el('div', { class: 'chat-panel' });
    const messages = U.el('div', { class: 'chat-messages' });
    const inputArea = U.el('div', { class: 'chat-input' });
    const chatInput = U.el('textarea', { class: 'textarea', placeholder: 'Ask a question about your documents…' });
    const sendBtn = U.el('button', { class: 'btn btn-primary' }, [U.icon('send', 16, 2)]);
    inputArea.appendChild(chatInput);
    inputArea.appendChild(sendBtn);
    chatPanel.appendChild(messages);
    chatPanel.appendChild(inputArea);
    layout.appendChild(chatPanel);

    // Welcome message + suggestions
    function addMessage(role, content, sources) {
      const msg = U.el('div', { class: U.cx('chat-msg', role) }, [
        U.el('div', { class: U.cx('avatar', role === 'user' ? '' : 'accent'), text: role === 'user' ? 'U' : 'AI' }),
        U.el('div', {}, [
          U.el('div', { class: 'bubble', html: U.escapeHTML(content).replace(/\n/g, '<br>') }),
          sources && sources.length ? renderSources(sources) : null
        ])
      ]);
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
      return msg;
    }

    function renderSources(sources) {
      const wrap = U.el('div', { class: 'chat-sources' }, [
        U.el('div', { class: 'caption', text: `Sources (${sources.length})` })
      ]);
      sources.forEach((s, i) => {
        const item = U.el('div', { class: 'chat-source' }, [
          U.icon('file', 14, 2),
          U.el('span', { class: 'text-xs', text: (s.document || 'doc') + ' · chunk ' + (s.chunk_index != null ? s.chunk_index : i) }),
          U.el('span', { class: 'score', text: 'score ' + U.fmtPct(s.score || 0, 2) })
        ]);
        const snippet = U.el('div', { class: 'text-xs text-muted', style: { padding: '4px 12px', marginTop: '2px', fontStyle: 'italic' }, text: '“' + (s.text || '').slice(0, 160) + (s.text && s.text.length > 160 ? '…' : '') + '”' });
        wrap.appendChild(item);
        wrap.appendChild(snippet);
      });
      return wrap;
    }

    function addTyping() {
      const t = U.el('div', { class: 'chat-msg assistant' }, [
        U.el('div', { class: 'avatar accent', text: 'AI' }),
        U.el('div', { class: 'bubble', style: { padding: 'var(--space-3)' } }, [
          U.el('div', { class: 'typing-indicator' }, [U.el('span'), U.el('span'), U.el('span')])
        ])
      ]);
      messages.appendChild(t);
      messages.scrollTop = messages.scrollHeight;
      return t;
    }

    // Welcome
    addMessage('assistant', 'Hi! I\'m your RAG assistant. Upload documents on the left, then ask me anything about their content. Try one of the suggested questions below to get started.');
    const chipsRow = U.el('div', { class: 'row wrap gap-2', style: { marginTop: 'var(--space-2)' } },
      SUGGESTED.map(q => U.el('div', { class: 'chip', onClick: () => { chatInput.value = q; send(); } }, [U.el('span', { text: q })]))
    );
    messages.lastChild.querySelector('.bubble').appendChild(chipsRow);

    async function send() {
      const q = chatInput.value.trim();
      if (!q) return;
      chatInput.value = '';
      addMessage('user', q);
      const typing = addTyping();
      sendBtn.disabled = true;
      try {
        const res = await API.post('/rag/query', { query: q, top_k: 3 });
        typing.remove();
        addMessage('assistant', res.answer || '(no answer)', res.sources);
      } catch (e) {
        typing.remove();
        addMessage('assistant', '⚠️ I couldn\'t process that: ' + (e.message || 'unknown error'));
      } finally {
        sendBtn.disabled = false;
        chatInput.focus();
      }
    }

    sendBtn.addEventListener('click', send);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/rag'] = { title: 'RAG Assistant', render };
})();
