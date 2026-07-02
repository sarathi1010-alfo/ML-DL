/* ============================================================
   views/damage.js — CNN vehicle damage detection (detailed)
   Multi-stage CV pipeline: vehicle detection → 8 part zones →
   8 damage-type classifiers → severity → cost → risk.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Charts = window.Charts;

  // Damage-type color map (matches backend DAMAGE_TYPE_META semantics)
  const TYPE_COLORS = {
    scratch: '#f59e0b',    dent: '#f43f5e',     crack: '#d946ef',
    glass: '#06b6d4',      rust: '#b45309',     paint_chip: '#8b5cf6',
    hail: '#14b8a6',       puncture: '#ef4444', damage: '#94a3b8',
  };
  const SEV_COLOR = { Severe: 'danger', Moderate: 'warning', Low: 'accent', None: 'success' };

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'AI Model · ResNet50 (CV feature pipeline) · 8-stage analysis' }),
        U.el('div', { class: 'view-title', text: 'Vehicle Damage Detection' })
      ])
    ]));

    const layout = U.el('div', { class: 'predict-layout damage-layout' });
    root.appendChild(layout);

    // ---------- LEFT: upload + annotated preview ----------
    const uploadCard = C.card({}, C.cardHead('Upload Image', { subtitle: 'JPG or PNG of the vehicle' }));
    let currentFile = null, previewUrl = null;
    const previewHost = U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } });
    const dz = C.dropzone({ accept: 'image/png,image/jpeg,image/jpg', onFile: (f) => handleFile(f) });
    uploadCard.appendChild(dz);
    uploadCard.appendChild(U.el('div', { style: { marginTop: 'var(--space-4)' } }, [previewHost]));
    layout.appendChild(uploadCard);

    // ---------- RIGHT: detailed report ----------
    const resultCard = C.card({ class: 'predict-result damage-result' },
      C.cardHead('Damage Assessment Report', { subtitle: 'part-level analysis · severity · cost · risk' }));
    const resultHost = U.el('div');
    resultCard.appendChild(resultHost);
    layout.appendChild(resultCard);

    showEmpty();

    function handleFile(file) {
      if (!file.type.startsWith('image/')) { C.toastError('Please upload an image file (JPG or PNG).'); return; }
      currentFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      U.clear(previewHost);
      const previewWrap = U.el('div', { class: 'image-preview damage-preview', style: { position: 'relative' } });
      const img = U.el('img', { src: previewUrl, alt: 'vehicle preview' });
      previewWrap.appendChild(img);
      const overlay = U.el('div', { class: 'image-overlay', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } });
      previewWrap.appendChild(overlay);
      previewWrap.dataset.overlay = '';
      previewHost.appendChild(previewWrap);
      previewHost.appendChild(U.el('div', { class: 'row-between' }, [
        U.el('div', { class: 'text-sm', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }, text: file.name }),
        U.el('div', { class: 'row gap-2' }, [
          U.el('span', { class: 'text-xs text-muted', text: U.fmtBytes(file.size / 1024) }),
          U.el('button', { class: 'btn btn-primary btn-sm', onClick: runClassify }, [U.icon('damage', 14, 2), 'Analyze Damage'])
        ])
      ]));
      showEmpty();
    }

    function showEmpty() {
      U.clear(resultHost);
      resultHost.appendChild(C.emptyState(
        'Upload a vehicle image and click "Analyze Damage" to run the full 8-stage pipeline: vehicle detection, 8-zone part segmentation, multi-type damage scoring, severity, cost breakdown, and risk assessment.',
        'damage'
      ));
    }

    async function runClassify() {
      if (!currentFile) { C.toastError('Please choose an image first.'); return; }
      U.clear(resultHost);
      resultHost.appendChild(U.el('div', { class: 'col', style: { gap: 'var(--space-3)' } }, [
        U.el('div', { class: 'skeleton', style: { height: '90px' } }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton line' }),
        U.el('div', { class: 'skeleton', style: { height: '160px' } }),
        U.el('div', { class: 'skeleton line', style: { width: '60%' } })
      ]));
      // Clear any previous overlay boxes
      const overlay = previewHost.querySelector('.image-overlay');
      if (overlay) U.clear(overlay);
      try {
        const fd = new FormData();
        fd.append('file', currentFile);
        const res = await API.upload('/predict/damage', fd);
        showResult(res);
        C.toastSuccess('Damage analysis complete.');
      } catch (e) {
        U.clear(resultHost);
        resultHost.appendChild(C.errorState(e.message || 'Analysis failed', runClassify));
        C.toastError(e.message || 'Analysis failed');
      }
    }

    function showResult(res) {
      U.clear(resultHost);
      // 1) Draw annotations on the preview overlay
      drawOverlay(res);

      const host = U.el('div', { class: 'col', style: { gap: 'var(--space-4)' } });

      // 2) Pipeline stages strip
      host.appendChild(pipelineStrip(res.pipeline_stages || []));

      // 3) Big verdict banner
      host.appendChild(verdictBanner(res));

      // 4) Key metrics grid (severity score gauge, confidence, total cost, labor hours)
      host.appendChild(keyMetrics(res));

      // 5) Analysis summary
      if (res.analysis_summary) {
        host.appendChild(U.el('div', { class: 'card card-pad-sm' }, [
          U.el('div', { class: 'caption mb-2', text: 'Analysis Summary' }),
          U.el('div', { class: 'text-sm', style: { lineHeight: 1.6 }, text: res.analysis_summary })
        ]));
      }

      // 6) Damage type scores (horizontal bars)
      host.appendChild(damageTypeScores(res.damage_type_scores || {}, res.damage_types || []));

      // 7) Detected parts grid (8 zones)
      host.appendChild(detectedParts(res.detected_parts || []));

      // 8) Damage regions list
      if (res.damage_regions && res.damage_regions.length) {
        host.appendChild(damageRegionsList(res.damage_regions));
      }

      // 9) Cost breakdown table
      if (res.cost_breakdown && res.cost_breakdown.length) {
        host.appendChild(costBreakdown(res.cost_breakdown, res.total_labor_hours, res.estimated_repair_cost_usd));
      }

      // 10) Risk + image quality + colors row
      host.appendChild(U.el('div', { class: 'grid grid-3' }, [
        riskPanel(res.risk_assessment),
        imageQualityPanel(res.image_quality),
        colorPanel(res.color_analysis),
      ]));

      // 11) Recommendations
      if (res.recommendations && res.recommendations.length) {
        host.appendChild(recommendationsPanel(res.recommendations));
      }

      // 12) Footer meta
      host.appendChild(U.el('div', { class: 'row wrap', style: { gap: 'var(--space-3)' } }, [
        C.badge('Model: ' + (res.model || '—'), 'soft'),
        C.badge('Pipeline: ' + (res.pipeline_stage_count || 8) + ' stages', 'soft'),
        C.badge('Latency: ' + U.fmtMs(res.latency_ms), 'soft')
      ]));

      resultHost.appendChild(host);
    }

    // ---------- overlay drawing ----------
    function drawOverlay(res) {
      const overlay = previewHost.querySelector('.image-overlay');
      if (!overlay) return;
      // Vehicle region outline
      if (res.vehicle_region) {
        const v = res.vehicle_region;
        const box = U.el('div', { class: 'bbox bbox-vehicle', style: {
          left: (v.x * 100) + '%', top: (v.y * 100) + '%',
          width: (v.w * 100) + '%', height: (v.h * 100) + '%'
        }});
        box.appendChild(U.el('div', { class: 'bbox-label', text: 'VEHICLE · ' + U.fmtPct(v.confidence, 0) }));
        overlay.appendChild(box);
      }
      // Part-zone grid (faint)
      (res.detected_parts || []).forEach((p) => {
        const r = p.region;
        const isDmg = p.damage_detected;
        const box = U.el('div', { class: 'bbox bbox-part' + (isDmg ? ' bbox-part-dmg' : ''), style: {
          left: (r.x * 100) + '%', top: (r.y * 100) + '%',
          width: (r.w * 100) + '%', height: (r.h * 100) + '%'
        }});
        box.appendChild(U.el('div', { class: 'bbox-label bbox-label-part', text: p.part }));
        overlay.appendChild(box);
      });
      // Damage hotspots (on top)
      (res.damage_regions || []).forEach((r) => {
        const col = TYPE_COLORS[r.type] || TYPE_COLORS.damage;
        const box = U.el('div', { class: 'bbox bbox-damage', style: {
          left: (r.x * 100) + '%', top: (r.y * 100) + '%',
          width: (r.w * 100) + '%', height: (r.h * 100) + '%',
          borderColor: col, boxShadow: '0 0 0 1px ' + col + '33'
        }});
        const lbl = U.el('div', { class: 'bbox-label', text: (r.type || 'damage') + ' · ' + U.fmtPct(r.confidence, 0), style: { background: col } });
        box.appendChild(lbl);
        overlay.appendChild(box);
      });
    }

    // ---------- sub-components ----------
    function pipelineStrip(stages) {
      const steps = stages.map((s, i) => {
        const kids = [
          U.el('div', { class: 'pipeline-dot', text: String(i + 1) }),
          U.el('div', { class: 'pipeline-name', text: s.replace(/_/g, ' ') })
        ];
        if (i < stages.length - 1) kids.push(U.el('div', { class: 'pipeline-conn' }));
        return U.el('div', { class: 'pipeline-step' }, kids);
      });
      return U.el('div', { class: 'pipeline-strip' }, steps);
    }

    function verdictBanner(res) {
      const cls = (res.class || '').toLowerCase();
      const isDamaged = cls.includes('damage');
      return U.el('div', { class: 'card card-pad-sm verdict-banner ' + (isDamaged ? 'verdict-damage' : 'verdict-clean') }, [
        U.el('div', { class: 'verdict-icon' }, [U.icon(isDamaged ? 'alert' : 'check', 28, 2)]),
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'caption', text: 'Verdict' }),
          U.el('div', { class: 'verdict-title', text: res.class || '—' }),
          U.el('div', { class: 'text-xs text-muted', text: res.severity + (res.severity_score != null ? ' · score ' + res.severity_score + '/100' : '') })
        ]),
        U.el('div', { style: { textAlign: 'right' } }, [
          U.el('div', { class: 'caption', text: 'Confidence' }),
          U.el('div', { class: 'text-mono', style: { fontSize: 'var(--font-size-xl)', fontWeight: 700 }, text: U.fmtPct(res.confidence, 0) })
        ])
      ]);
    }

    function keyMetrics(res) {
      const sevScore = res.severity_score != null ? res.severity_score : 0;
      const gaugeColor = sevScore >= 65 ? 'var(--danger)' : sevScore >= 30 ? 'var(--warning)' : sevScore >= 8 ? 'var(--accent)' : 'var(--success)';
      return U.el('div', { class: 'grid grid-4' }, [
        metricCard('Severity Score', String(sevScore) + '/100', gaugeColor, () => {
          const host = U.el('div', { class: 'mini-gauge' });
          const bar = U.el('div', { class: 'mini-gauge-bar', style: { width: sevScore + '%', background: gaugeColor } });
          host.appendChild(bar);
          return host;
        }),
        metricCard('Confidence', U.fmtPct(res.confidence, 0), 'var(--accent)'),
        metricCard('Est. Repair Cost', U.fmtMoney(res.estimated_repair_cost_usd), 'var(--danger)'),
        metricCard('Labor Hours', String(res.total_labor_hours != null ? res.total_labor_hours.toFixed(1) : '0.0') + ' h', 'var(--warning)'),
      ]);
    }

    function metricCard(label, value, color, extra) {
      const kids = [
        U.el('div', { class: 'caption', text: label }),
        U.el('div', { class: 'text-mono', style: { fontSize: 'var(--font-size-xl)', fontWeight: 700, color: color, marginTop: 'var(--space-1)' }, text: value })
      ];
      if (extra) kids.push(extra());
      return U.el('div', { class: 'card card-pad-sm' }, kids);
    }

    function damageTypeScores(scores, present) {
      const entries = Object.keys(TYPE_COLORS).filter(t => t !== 'damage').map(t => ({ t, s: scores[t] || 0 }));
      entries.sort((a, b) => b.s - a.s);
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Damage Type Scores' }),
        U.el('div', { class: 'col', style: { gap: 'var(--space-2)' } },
          entries.map(({ t, s }) => {
            const col = TYPE_COLORS[t];
            const active = present.indexOf(t) >= 0;
            return U.el('div', { class: 'row align-center gap-2' }, [
              U.el('div', { class: 'dmg-type-swatch', style: { background: col } }),
              U.el('div', { class: 'dmg-type-name' + (active ? ' dmg-type-active' : ''), text: t.replace('_', ' '), style: { minWidth: '84px' } }),
              U.el('div', { class: 'dmg-bar' }, [
                U.el('div', { class: 'dmg-bar-fill', style: { width: Math.round(s * 100) + '%', background: col, opacity: active ? 1 : 0.4 } })
              ]),
              U.el('div', { class: 'text-mono text-xs', style: { minWidth: '44px', textAlign: 'right', color: active ? col : 'var(--text-muted)' }, text: U.fmtPct(s, 0) })
            ]);
          })
        )
      ]);
    }

    function detectedParts(parts) {
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'row-between mb-2' }, [
          U.el('div', { class: 'caption', text: 'Part-Level Analysis (' + parts.length + ' zones)' }),
          U.el('div', { class: 'row gap-2' }, [
            legendDot('var(--danger)', 'damaged'),
            legendDot('var(--success)', 'intact')
          ])
        ]),
        U.el('div', { class: 'parts-grid' },
          parts.map((p) => {
            const dmg = p.damage_detected;
            return U.el('div', { class: 'part-cell' + (dmg ? ' part-cell-dmg' : '') }, [
              U.el('div', { class: 'row-between' }, [
                U.el('div', { class: 'part-name', text: p.part }),
                dmg ? C.badge(p.severity, SEV_COLOR[p.severity] || 'soft') : C.badge('intact', 'success')
              ]),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '4px' }, text: dmg ? p.damage_types.join(', ').replace(/_/g, ' ') : 'No damage detected' }),
              p.structural ? U.el('div', { class: 'part-tag', text: p.is_glass ? 'glass · structural' : 'structural' }) : null
            ].filter(Boolean));
          })
        )
      ]);
    }

    function legendDot(color, label) {
      return U.el('div', { class: 'row gap-1 align-center' }, [
        U.el('div', { style: { width: '8px', height: '8px', borderRadius: '50%', background: color } }),
        U.el('span', { class: 'text-xs text-muted', text: label })
      ]);
    }

    function damageRegionsList(regions) {
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Localized Damage Regions (' + regions.length + ')' }),
        U.el('div', { class: 'col', style: { gap: 'var(--space-2)' } },
          regions.map((r, i) => U.el('div', { class: 'region-row' }, [
            U.el('div', { class: 'region-swatch', style: { background: TYPE_COLORS[r.type] || TYPE_COLORS.damage } }),
            U.el('div', { class: 'grow' }, [
              U.el('div', { class: 'row gap-2 align-center' }, [
                U.el('span', { class: 'text-sm', style: { fontWeight: 600 }, text: '#' + (i + 1) + ' ' + (r.type || 'damage').replace(/_/g, ' ') }),
                C.badge(r.severity, SEV_COLOR[r.severity] || 'soft')
              ]),
              U.el('div', { class: 'text-xs text-muted', style: { marginTop: '2px' }, text: (r.part || '—') + ' · ' + U.fmtPct(r.confidence, 0) + ' conf · ' + (r.area_percent != null ? r.area_percent + '% area' : '') })
            ]),
            U.el('div', { class: 'text-mono text-xs text-muted', text: '(' + r.x.toFixed(2) + ',' + r.y.toFixed(2) + ')' })
          ]))
        )
      ]);
    }

    function costBreakdown(rows, totalHours, totalCost) {
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Repair Cost Breakdown' }),
        U.el('div', { class: 'table-wrap' }, [
          U.el('table', { class: 'data-table' }, [
            U.el('thead', {}, [U.el('tr', {}, [
              th('Part'), th('Damage'), th('Labor (h)', 'right'),
              th('Labor $', 'right'), th('Parts $', 'right'),
              th('Paint $', 'right'), th('Total', 'right')
            ])]),
            U.el('tbody', {},
              rows.map((r) => U.el('tr', {}, [
                td(r.part),
                td(r.damage_types.map(t => t.replace(/_/g, ' ')).join(', ')),
                td(r.labor_hours.toFixed(1), 'right'),
                td(U.fmtMoney(r.labor_cost), 'right'),
                td(U.fmtMoney(r.parts_cost), 'right'),
                td(U.fmtMoney(r.paint_cost), 'right'),
                td(U.fmtMoney(r.total), 'right', true)
              ]))
            ),
            U.el('tfoot', {}, [U.el('tr', {}, [
              td('TOTAL'), td(totalHours.toFixed(1) + ' h'), td(''),
              td('', 'right'), td('', 'right'), td('', 'right'),
              td(U.fmtMoney(totalCost), 'right', true)
            ])])
          ])
        ])
      ]);
    }

    function riskPanel(risk) {
      if (!risk) return U.el('div', { class: 'card card-pad-sm' }, [U.el('div', { class: 'caption', text: 'Risk Assessment' })]);
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Risk Assessment' }),
        riskRow('Structural Risk', risk.structural_risk, SEV_COLOR[risk.structural_risk] || 'soft'),
        riskRow('Cosmetic Risk', risk.cosmetic_risk, SEV_COLOR[risk.cosmetic_risk] || 'soft'),
        U.el('div', { class: 'row-between', style: { marginTop: 'var(--space-2)' } }, [
          U.el('span', { class: 'text-sm', text: 'Drivable' }),
          C.badge(risk.drivable ? 'Yes' : 'No', risk.drivable ? 'success' : 'danger')
        ]),
        risk.safety_concerns && risk.safety_concerns.length
          ? U.el('div', { class: 'safety-list', style: { marginTop: 'var(--space-2)' } },
              risk.safety_concerns.map(s => U.el('div', { class: 'safety-item', text: '⚠ ' + s })))
          : null
      ].filter(Boolean));
    }
    function riskRow(label, value, variant) {
      return U.el('div', { class: 'row-between', style: { marginTop: 'var(--space-1)' } }, [
        U.el('span', { class: 'text-sm', text: label }),
        C.badge(value, variant)
      ]);
    }

    function imageQualityPanel(q) {
      if (!q) return U.el('div', { class: 'card card-pad-sm' }, [U.el('div', { class: 'caption', text: 'Image Quality' })]);
      const sc = q.score;
      const col = sc >= 0.7 ? 'var(--success)' : sc >= 0.45 ? 'var(--warning)' : 'var(--danger)';
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Image Quality' }),
        U.el('div', { class: 'row-between' }, [U.el('span', { class: 'text-sm', text: 'Score' }), U.el('span', { class: 'text-mono', style: { color: col, fontWeight: 700 }, text: U.fmtPct(sc, 0) })]),
        U.el('div', { class: 'dmg-bar', style: { marginTop: '6px' } }, [U.el('div', { class: 'dmg-bar-fill', style: { width: Math.round(sc * 100) + '%', background: col } })]),
        U.el('div', { class: 'col', style: { gap: '4px', marginTop: 'var(--space-2)' } }, [
          qRow('Brightness', U.fmtPct(q.brightness, 0)),
          qRow('Contrast', U.fmtPct(q.contrast, 0)),
          qRow('Blur', U.fmtPct(q.blur, 0)),
          qRow('Resolution', q.resolution),
        ]),
        q.issues && q.issues.length
          ? U.el('div', { class: 'row wrap gap-1', style: { marginTop: 'var(--space-2)' } }, q.issues.map(i => C.badge(i, 'warning')))
          : null
      ].filter(Boolean));
    }
    function qRow(k, v) {
      return U.el('div', { class: 'row-between' }, [
        U.el('span', { class: 'text-xs text-muted', text: k }),
        U.el('span', { class: 'text-mono text-xs', text: v })
      ]);
    }

    function colorPanel(ca) {
      if (!ca) return U.el('div', { class: 'card card-pad-sm' }, [U.el('div', { class: 'caption', text: 'Color Analysis' })]);
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Color Analysis' }),
        U.el('div', { class: 'row-between', style: { marginBottom: 'var(--space-2)' } }, [
          U.el('span', { class: 'text-sm', text: 'Vehicle Color' }),
          C.badge(ca.vehicle_color_estimate, 'soft')
        ]),
        U.el('div', { class: 'col', style: { gap: '6px' } },
          (ca.dominant_colors || []).map(c => U.el('div', { class: 'row align-center gap-2' }, [
            U.el('div', { style: { width: '20px', height: '20px', borderRadius: '4px', background: c.hex, border: '1px solid var(--border)' } }),
            U.el('span', { class: 'text-sm', text: c.name, style: { minWidth: '64px' } }),
            U.el('div', { class: 'dmg-bar' }, [U.el('div', { class: 'dmg-bar-fill', style: { width: c.percent + '%', background: c.hex } })]),
            U.el('span', { class: 'text-mono text-xs', style: { minWidth: '44px', textAlign: 'right' }, text: c.percent + '%' })
          ]))
        )
      ]);
    }

    function recommendationsPanel(recs) {
      return U.el('div', { class: 'card card-pad-sm' }, [
        U.el('div', { class: 'caption mb-2', text: 'Recommendations' }),
        U.el('div', { class: 'col', style: { gap: '6px' } },
          recs.map((r, i) => U.el('div', { class: 'rec-item' }, [
            U.el('div', { class: 'rec-num', text: String(i + 1) }),
            U.el('div', { class: 'text-sm', style: { lineHeight: 1.5 }, text: r })
          ]))
        )
      ]);
    }

    // table helpers
    function th(label, align) { return U.el('th', { style: align ? { textAlign: align } : {}, text: label }); }
    function td(label, align, bold) {
      return U.el('td', { style: Object.assign(align ? { textAlign: align } : {}, bold ? { fontWeight: 700 } : {}), text: String(label) });
    }

    return { dispose() { if (previewUrl) URL.revokeObjectURL(previewUrl); } };
  }

  window.Views = window.Views || {};
  window.Views['/damage'] = { title: 'Damage Detection', render };
})();
