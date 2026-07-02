/* ============================================================
   components.js — reusable DOM builders.
   card, statCard, toast, spinner, table, chart canvases,
   modal, fileDropzone, skeleton, state (empty/error), chips.
   Exposed as window.C
   ============================================================ */
(function () {
  const C = {};
  const U = window.U;
  const Charts = window.Charts;

  /* ---------- Card ---------- */
  C.card = (opts = {}, ...children) => {
    const cls = U.cx('card', opts.interactive && 'card-interactive', opts.padSm && 'card-pad-sm', opts.padLg && 'card-pad-lg', opts.cls);
    const node = U.el('div', { class: cls }, children);
    if (opts.id) node.id = opts.id;
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    return node;
  };
  C.cardHead = (title, opts = {}) => {
    return U.el('div', { class: 'card-head' }, [
      U.el('div', {}, [
        U.el('div', { class: 'card-title', text: title }),
        opts.subtitle && U.el('div', { class: 'card-subtitle', text: opts.subtitle })
      ]),
      opts.right
    ]);
  };

  /* ---------- Stat card ---------- */
  C.statCard = ({ label, value, delta, deltaDir, spark, sparkColor, icon, hint }) => {
    const card = U.el('div', { class: 'card stat-card' });
    const head = U.el('div', { class: 'row-between' }, [
      U.el('span', { class: 'stat-label', text: label }),
      icon && U.el('div', { class: 'icon-btn', style: { width: '30px', height: '30px' } }, [icon])
    ]);
    card.appendChild(head);
    card.appendChild(U.el('div', { class: 'stat-value', text: value }));
    const foot = U.el('div', { class: 'stat-foot' }, []);
    if (delta != null) {
      const dir = deltaDir || (delta >= 0 ? 'up' : 'down');
      const cls = dir === 'up' ? 'badge-success' : (dir === 'down' ? 'badge-danger' : 'badge-soft');
      const arrow = dir === 'up' ? '▲' : (dir === 'down' ? '▼' : '•');
      foot.appendChild(U.el('span', { class: U.cx('badge', cls), text: `${arrow} ${Math.abs(delta)}%` }));
    }
    if (hint) foot.appendChild(U.el('span', { class: 'text-muted text-xs', text: hint }));
    card.appendChild(foot);
    if (spark && spark.length) {
      const host = U.el('canvas', { class: 'spark', width: 200, height: 38, style: { width: '100%', height: '38px' } });
      card.appendChild(host);
      // draw after insertion
      requestAnimationFrame(() => { try { Charts.sparkline(host, spark, sparkColor); } catch (e) {} });
    }
    return card;
  };

  /* ---------- Spinner ---------- */
  C.spinner = (size) => U.el('div', { class: U.cx('spinner', size) });
  C.loadingBlock = (msg = 'Loading…') => {
    return U.el('div', { class: 'center', style: { padding: 'var(--space-8)', flexDirection: 'column', gap: 'var(--space-3)' } }, [
      C.spinner('lg'),
      U.el('div', { class: 'text-muted', text: msg })
    ]);
  };

  /* ---------- Skeleton ---------- */
  C.skeletonCard = () => U.el('div', { class: 'card' }, [
    U.el('div', { class: 'skeleton title' }),
    U.el('div', { class: 'skeleton block' }),
    U.el('div', { class: 'skeleton line' }),
    U.el('div', { class: 'skeleton line', style: { width: '70%' } })
  ]);
  C.skeletonRow = (cells) => U.el('tr', {}, cells.map(() => U.el('td', {}, [U.el('div', { class: 'skeleton text' })])));
  C.skeletonStat = () => U.el('div', { class: 'card stat-card' }, [
    U.el('div', { class: 'skeleton text', style: { width: '60%' } }),
    U.el('div', { class: 'skeleton', style: { height: '24px', width: '80px', marginTop: '8px' } }),
    U.el('div', { class: 'skeleton text', style: { width: '40%', marginTop: '8px' } })
  ]);

  /* ---------- State (empty/error) ---------- */
  C.state = ({ type = 'empty', icon, title, message, action }) => {
    const iconName = type === 'error' ? 'alert' : (icon || 'info');
    return U.el('div', { class: U.cx('state', type) }, [
      U.el('div', { class: 'state-icon' }, [U.icon(iconName, 22)]),
      U.el('div', { class: 'state-title', text: title || (type === 'error' ? 'Something went wrong' : 'Nothing here yet') }),
      U.el('div', { class: 'state-msg', text: message || '' }),
      action
    ]);
  };
  C.errorState = (msg, onRetry) => C.state({
    type: 'error',
    title: 'Failed to load',
    message: msg,
    action: onRetry && U.el('button', { class: 'btn btn-secondary btn-sm', onClick: onRetry }, [U.icon('refresh', 14), 'Retry'])
  });
  C.emptyState = (msg, action) => C.state({ type: 'empty', message: msg, action });

  /* ---------- Toast ---------- */
  C.toast = (opts) => {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = U.el('div', { class: 'toast-stack' });
      document.body.appendChild(stack);
    }
    const type = opts.type || 'info';
    const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warning' ? 'alert' : 'info';
    const t = U.el('div', { class: U.cx('toast', type) }, [
      U.el('div', { class: 'toast-icon' }, [U.icon(iconName, 18)]),
      U.el('div', { class: 'toast-body' }, [
        U.el('div', { class: 'toast-title', text: opts.title || type }),
        opts.message && U.el('div', { class: 'toast-msg', text: opts.message })
      ]),
      U.el('div', { class: 'toast-close', onClick: () => dismiss(t) }, [U.icon('x', 14)]),
      U.el('div', { class: 'toast-bar' })
    ]);
    stack.appendChild(t);
    const duration = opts.duration || 4000;
    const timer = setTimeout(() => dismiss(t), duration);
    function dismiss(node) {
      clearTimeout(timer);
      node.classList.add('leave');
      setTimeout(() => node.remove(), 220);
    }
    return t;
  };
  C.toastSuccess = (msg, title) => C.toast({ type: 'success', title: title || 'Success', message: msg });
  C.toastError = (msg, title) => C.toast({ type: 'error', title: title || 'Error', message: msg, duration: 6000 });
  C.toastInfo = (msg, title) => C.toast({ type: 'info', title: title || 'Info', message: msg });
  C.toastWarning = (msg, title) => C.toast({ type: 'warning', title: title || 'Warning', message: msg, duration: 5000 });

  /* ---------- Modal ---------- */
  C.modal = ({ title, body, footer, onClose, size }) => {
    const back = U.el('div', { class: 'modal-backdrop' });
    const modal = U.el('div', { class: 'modal', style: size === 'lg' ? { maxWidth: '680px' } : size === 'sm' ? { maxWidth: '360px' } : {} }, [
      U.el('div', { class: 'modal-head' }, [
        U.el('div', { class: 'modal-title', text: title || '' }),
        U.el('div', { class: 'icon-btn', onClick: close }, [U.icon('x', 16)])
      ]),
      body && U.el('div', { class: 'modal-body' }, [body]),
      footer && U.el('div', { class: 'modal-foot' }, [footer])
    ]);
    back.appendChild(modal);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    function close() { back.remove(); if (onClose) onClose(); }
    document.body.appendChild(back);
    return { back, modal, close };
  };

  C.confirm = ({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) => {
    const foot = U.el('div', {}, [
      U.el('button', { class: 'btn btn-secondary', onClick: () => m.close() }, ['Cancel']),
      U.el('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', onClick: () => { m.close(); onConfirm && onConfirm(); } }, [confirmText])
    ]);
    const m = C.modal({ title, body: U.el('div', { class: 'text-md', style: { color: 'var(--text-muted)', lineHeight: 1.6 } }, [message]), footer: foot });
    return m;
  };

  /* ---------- Table ---------- */
  C.table = ({ columns, rows, empty, maxHeight }) => {
    const wrap = U.el('div', { class: 'table-wrap', style: maxHeight ? { maxHeight, overflowY: 'auto' } : {} });
    const table = U.el('table', { class: 'table' });
    const thead = U.el('thead', {}, [U.el('tr', {}, columns.map(c => U.el('th', { style: c.align ? { textAlign: c.align } : {}, text: c.label })))]);
    table.appendChild(thead);
    const tbody = U.el('tbody');
    if (rows && rows.length) {
      rows.forEach(row => {
        const tr = U.el('tr', {}, columns.map(c => {
          const val = typeof c.render === 'function' ? c.render(row) : row[c.key];
          return U.el('td', { class: c.mono && 'mono', style: c.align ? { textAlign: c.align } : {} }, [val == null ? '' : val]);
        }));
        if (row._onClick) tr.addEventListener('click', row._onClick);
        tbody.appendChild(tr);
      });
    } else {
      const tr = U.el('tr', {}, [U.el('td', { colspan: columns.length, style: { textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' } }, [empty || 'No data'])]);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  };

  /* ---------- Chart host ---------- */
  C.chart = (drawFn, height = 240) => {
    const host = U.el('canvas', { class: 'chart-host', width: 600, height: height, style: { width: '100%', height: height + 'px', display: 'block' } });
    // First draw after layout
    let disposed = false;
    const redraw = () => {
      if (disposed) return;
      // skip if canvas detached
      if (!host.isConnected) { disposed = true; Charts.instances.delete(redraw); return; }
      try { drawFn(host); } catch (e) { console.warn('chart draw error', e); }
    };
    Charts.register(redraw);
    requestAnimationFrame(redraw);
    // Re-draw on resize
    const ro = new ResizeObserver(U.debounce(redraw, 120));
    ro.observe(host);
    host._redraw = redraw;
    return host;
  };

  /* ---------- File dropzone ---------- */
  C.dropzone = ({ accept, onFile, label, sublabel }) => {
    const dz = U.el('div', { class: 'dropzone' }, [
      U.el('div', { class: 'dz-icon' }, [U.icon('upload', 40)]),
      U.el('div', { class: 'dz-title', text: label || 'Drag & drop file here' }),
      U.el('div', { class: 'dz-sub', text: sublabel || 'or click to browse' })
    ]);
    const input = U.el('input', { type: 'file', accept, style: { display: 'none' } });
    dz.appendChild(input);
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) onFile(f);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
    return dz;
  };

  /* ---------- Badge ---------- */
  C.badge = (text, variant = '') => U.el('span', { class: U.cx('badge', variant && ('badge-' + variant)) }, [text]);

  /* ---------- Section header ---------- */
  C.section = (title, opts = {}) => {
    return U.el('div', { class: 'row-between mb-3' }, [
      U.el('div', {}, [
        U.el('div', { class: 'caption', text: opts.caption || '' }),
        U.el('div', { class: 'text-lg', style: { fontWeight: 600 }, text: title })
      ]),
      opts.right
    ]);
  };

  window.C = C;
})();
