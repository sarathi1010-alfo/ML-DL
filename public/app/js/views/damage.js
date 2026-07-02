/* ============================================================
   views/damage.js — CNN auto damage detection
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
        U.el('div', { class: 'caption', text: 'AI Model · ResNet50 (CV feature pipeline)' }),
        U.el('div', { class: 'view-title', text: 'Vehicle Damage Detection' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout' });
    root.appendChild(layout);

    // Left: upload
    const uploadCard = C.card({},
      C.cardHead('Upload Image', { subtitle: 'JPG or PNG of vehicle' })
    );
    let currentFile = null;
    let previewUrl = null;
    const previewHost = U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } });
    const dz = C.dropzone({
      accept: 'image/png,image/jpeg,image/jpg',
      onFile: (f) => handleFile(f)
    });
    uploadCard.appendChild(dz);
    uploadCard.appendChild(U.el('div', { style: { marginTop: 'var(--space-4)' } }, [previewHost]));
    layout.appendChild(uploadCard);

    // Right: result
    const resultCard = C.card({ class: 'predict-result' },
      C.cardHead('Classification Result', { subtitle: 'damage class, severity & repair estimate' })
    );
    const resultHost = U.el('div');
    resultCard.appendChild(resultHost);
    layout.appendChild(resultCard);

    showEmpty();

    function handleFile(file) {
      if (!file.type.startsWith('image/')) {
        C.toastError('Please upload an image file (JPG or PNG).');
        return;
      }
      currentFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      U.clear(previewHost);
      const previewWrap = U.el('div', { class: 'image-preview', style: { position: 'relative' } });
      const img = U.el('img', { src: previewUrl, alt: 'preview' });
      previewWrap.appendChild(img);
      const overlay = U.el('div', { class: 'image-overlay', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
      previewWrap.dataset.overlay = '';
      previewWrap.appendChild(overlay);
      previewHost.appendChild(previewWrap);
      previewHost.appendChild(U.el('div', { class: 'row-between' }, [
        U.el('div', { class: 'text-sm', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }, text: file.name }),
        U.el('div', { class: 'row gap-2' }, [
          U.el('span', { class: 'text-xs text-muted', text: U.fmtBytes(file.size / 1024) }),
          U.el('button', { class: 'btn btn-primary btn-sm', onClick: runClassify }, [U.icon('damage', 14, 2), 'Classify'])
        ])
      ]));
    }

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState('Upload a vehicle image and click Classify to detect damage, severity, and estimated repair cost.'));
    }

    async function runClassify() {
      if (!currentFile) {
        C.toastError('Please choose an image first.');
        return;
      }
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '80px' } }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line', style: { width: '60%' } })
      ]));
      try {
        const fd = new FormData();
        fd.append('file', currentFile);
        const res = await API.upload('/predict/damage', fd);
        showResult(res);
        C.toastSuccess('Classification complete.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Classification failed', runClassify));
        C.toastError(e.message || 'Classification failed');
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // Draw bboxes on the preview overlay
      const overlay = previewHost.querySelector('.image-overlay');
      if (overlay && res.damage_regions && res.damage_regions.length) {
        const colors = [Charts.palette().danger, Charts.palette().warning, Charts.palette().accent, Charts.palette().primary];
        res.damage_regions.forEach((r, i) => {
          const box = U.el('div', { class: 'bbox', style: {
            left: (r.x * 100) + '%', top: (r.y * 100) + '%',
            width: (r.w * 100) + '%', height: (r.h * 100) + '%',
            borderColor: colors[i % colors.length]
          }});
          const lbl = U.el('div', { class: 'bbox-label', text: r.type || 'damage', style: { background: colors[i % colors.length] } });
          box.appendChild(lbl);
          overlay.appendChild(box);
        });
      }

      // Big result banner
      const cls = (res.class || '').toLowerCase();
      const isDamaged = cls.includes('damage');
      const v = isDamaged ? 'danger' : 'success';
      host.appendChild(U.el('div', { class: 'card card-pad-sm', style: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)', background: 'var(--surface-2)' } }, [
        U.el('div', { style: { width: '52px', height: '52px', borderRadius: '12px', background: isDamaged ? 'var(--danger-soft)' : 'var(--success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDamaged ? 'var(--danger)' : 'var(--success)', flexShrink: 0 } }, [U.icon(isDamaged ? 'alert' : 'check', 24, 2)]),
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'caption', text: 'Class' }),
          U.el('div', { style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 }, text: res.class || '—' })
        ]),
        U.el('div', { style: { textAlign: 'right' } }, [
          U.el('div', { class: 'caption', text: 'Confidence' }),
          U.el('div', { class: 'text-mono', style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 }, text: U.fmtPct(res.confidence, 0) })
        ])
      ]));

      // Severity + cost
      const sev = (res.severity || '').toLowerCase();
      const sevV = sev.includes('severe') ? 'danger' : sev.includes('moderate') ? 'warning' : 'success';
      host.appendChild(U.el('div', { class: 'grid grid-2' }, [
        U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption', text: 'Severity' }),
          U.el('div', { style: { marginTop: 'var(--space-2)' } }, [C.badge(res.severity || '—', sevV)])
        ]),
        U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption', text: 'Estimated Repair Cost' }),
          U.el('div', { class: 'text-mono', style: { fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginTop: 'var(--space-2)' }, text: U.fmtMoney(res.estimated_repair_cost_usd) })
        ])
      ]));

      // Damage types chips
      if (res.damage_types && res.damage_types.length) {
        host.appendChild(U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption mb-2', text: 'Damage Types' }),
          U.el('div', { class: 'row wrap gap-2' },
            res.damage_types.map(t => C.badge(t, 'danger'))
          )
        ]));
      }

      host.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)' } }, [
        C.badge('Model: ' + (res.model || '—'), 'soft'),
        C.badge('Latency: ' + U.fmtMs(res.latency_ms), 'soft')
      ]));

      resultHost.appendChild(host);
    }

    return { dispose() { if (previewUrl) URL.revokeObjectURL(previewUrl); } };
  }

  window.Views = window.Views || {};
  window.Views['/damage'] = { title: 'Damage Detection', render };
})();
