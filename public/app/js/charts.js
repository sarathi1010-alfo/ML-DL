/* ============================================================
   charts.js — vanilla canvas charts (no libraries).
   lineChart, areaChart, barChart, hbarChart, donutChart,
   sparkline, gaugeChart.
   All DPR-aware, themed via CSS variables.
   Exposed as window.Charts
   ============================================================ */
(function () {
  const Charts = {};

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function palette() {
    return {
      text: cssVar('--text', '#e6edf3'),
      muted: cssVar('--text-muted', '#8b98a9'),
      grid: cssVar('--border', 'rgba(255,255,255,0.08)'),
      primary: cssVar('--primary', '#10b981'),
      primary2: cssVar('--teal', '#14b8a6'),
      primary3: cssVar('--cyan', '#06b6d4'),
      accent: cssVar('--accent', '#8b5cf6'),
      accent2: cssVar('--fuchsia', '#d946ef'),
      warning: cssVar('--warning', '#f59e0b'),
      danger: cssVar('--danger', '#f43f5e'),
      surface: cssVar('--surface', '#121826'),
    };
  }
  const SERIES_COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#8b5cf6', '#d946ef', '#f59e0b', '#f43f5e'];

  function setup(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, rect.width), h = Math.max(2, rect.height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  function hexToRgba(hex, a) {
    if (!hex) return `rgba(255,255,255,${a})`;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const m = hex.replace('#', '');
    const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
    const r = parseInt(n.slice(0, 2), 16) || 0;
    const g = parseInt(n.slice(2, 4), 16) || 0;
    const b = parseInt(n.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${a})`;
  }

  function makeGradient(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    return g;
  }

  /* ---------------- LINE / AREA ---------------- */
  /**
   * lineChart(canvas, { series: [{name, color, points:[{x,y}]}], xLabels, yFormat })
   * area: bool — fill below the line
   */
  function lineChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    const series = opts.series || [];
    const area = !!opts.area;
    const padL = opts.padL || 44, padR = opts.padR || 12, padT = opts.padT || 14, padB = opts.padB || 28;
    const cw = w - padL - padR, ch = h - padT - padB;

    // Compute domains
    let allY = [], allX = [];
    series.forEach(s => s.points.forEach(pt => { allY.push(pt.y); allX.push(pt.x); }));
    if (allY.length === 0) return;
    let yMin = opts.yMin != null ? opts.yMin : Math.min(...allY, 0);
    let yMax = opts.yMax != null ? opts.yMax : Math.max(...allY, 1);
    if (yMin === yMax) { yMax = yMin + 1; }
    const yPad = (yMax - yMin) * 0.1;
    yMin -= yPad; yMax += yPad;

    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const xs = (x) => xMax === xMin ? padL + cw / 2 : padL + ((x - xMin) / (xMax - xMin)) * cw;
    const ys = (y) => padT + ch - ((y - yMin) / (yMax - yMin)) * ch;

    // Grid + Y labels
    ctx.font = '10px ' + (cssVar('--font-mono', 'monospace'));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (yMax - yMin) * (i / ticks);
      const yy = ys(yv);
      ctx.beginPath();
      ctx.moveTo(padL, yy); ctx.lineTo(padL + cw, yy);
      ctx.globalAlpha = i === 0 ? 0.8 : 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.muted;
      const label = opts.yFormat ? opts.yFormat(yv) : Math.round(yv).toString();
      ctx.fillText(label, padL - 6, yy);
    }

    // X labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const xLabels = opts.xLabels || [];
    if (xLabels.length) {
      const step = Math.max(1, Math.ceil(xLabels.length / 8));
      xLabels.forEach((lbl, i) => {
        if (i % step !== 0 && i !== xLabels.length - 1) return;
        const x = xs(i);
        ctx.fillStyle = p.muted;
        ctx.fillText(lbl, x, padT + ch + 6);
      });
    }

    // Series
    series.forEach((s, si) => {
      const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
      if (area) {
        ctx.beginPath();
        s.points.forEach((pt, i) => {
          const x = xs(pt.x), y = ys(pt.y);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(xs(s.points[s.points.length - 1].x), padT + ch);
        ctx.lineTo(xs(s.points[0].x), padT + ch);
        ctx.closePath();
        const grad = makeGradient(ctx, 0, padT, 0, padT + ch, [[0, hexToRgba(color, 0.34)], [1, hexToRgba(color, 0)]]);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      // Line
      ctx.beginPath();
      s.points.forEach((pt, i) => {
        const x = xs(pt.x), y = ys(pt.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();

      if (opts.points !== false) {
        ctx.fillStyle = p.surface;
        s.points.forEach(pt => {
          ctx.beginPath();
          ctx.arc(xs(pt.x), ys(pt.y), 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(xs(pt.x), ys(pt.y), 2.8, 0, Math.PI * 2);
          ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
        });
      }
    });

    // Legend
    if (opts.legend && series.length > 1) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let lx = padL;
      series.forEach((s, si) => {
        const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(lx + 5, padT + 6, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.muted;
        ctx.font = '10px ' + cssVar('--font-sans', 'sans-serif');
        ctx.fillText(s.name, lx + 13, padT + 6);
        lx += ctx.measureText(s.name).width + 30;
      });
    }
  }

  /* ---------------- BAR (vertical) ---------------- */
  function barChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    const labels = opts.labels || [];
    const values = opts.values || [];
    const colors = opts.colors || labels.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]);
    const padL = 44, padR = 12, padT = 14, padB = 32;
    const cw = w - padL - padR, ch = h - padT - padB;
    if (!values.length) return;

    let yMax = opts.yMax != null ? opts.yMax : Math.max(...values, 1) * 1.15;
    const yMin = 0;
    const ys = (y) => padT + ch - ((y - yMin) / (yMax - yMin)) * ch;

    // grid
    ctx.font = '10px ' + (cssVar('--font-mono', 'monospace'));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const yv = yMin + (yMax - yMin) * (i / ticks);
      const yy = ys(yv);
      ctx.globalAlpha = i === 0 ? 0.8 : 0.4;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + cw, yy); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.muted;
      ctx.fillText(opts.yFormat ? opts.yFormat(yv) : Math.round(yv).toString(), padL - 6, yy);
    }

    const gap = 8;
    const bw = Math.max(2, (cw - gap * (values.length - 1)) / values.length);
    values.forEach((v, i) => {
      const x = padL + i * (bw + gap);
      const y = ys(v);
      const color = colors[i] || p.primary;
      const grad = makeGradient(ctx, 0, y, 0, padT + ch, [[0, color], [1, hexToRgba(color, 0.45)]]);
      ctx.fillStyle = grad;
      const r = Math.min(5, bw / 3);
      roundRect(ctx, x, y, bw, padT + ch - y, [r, r, 0, 0]);
      ctx.fill();

      // value on top
      ctx.fillStyle = p.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = '600 10px ' + (cssVar('--font-mono', 'monospace'));
      ctx.fillText(opts.valueFormat ? opts.valueFormat(v) : v.toFixed(0), x + bw / 2, y - 3);

      // label
      ctx.fillStyle = p.muted;
      ctx.font = '10px ' + (cssVar('--font-sans', 'sans-serif'));
      ctx.textBaseline = 'top';
      const lbl = String(labels[i] || '');
      let display = lbl;
      if (ctx.measureText(lbl).width > bw + 4) {
        // truncate
        display = lbl.slice(0, Math.max(1, Math.floor(bw / 6))) + '…';
      }
      ctx.fillText(display, x + bw / 2, padT + ch + 6);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + r[0], y);
    ctx.lineTo(x + w - r[1], y);
    ctx.arcTo(x + w, y, x + w, y + r[1], r[1]);
    ctx.lineTo(x + w, y + h - r[2]);
    ctx.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
    ctx.lineTo(x + r[3], y + h);
    ctx.arcTo(x, y + h, x, y + h - r[3], r[3]);
    ctx.lineTo(x, y + r[0]);
    ctx.arcTo(x, y, x + r[0], y, r[0]);
    ctx.closePath();
  }

  /* ---------------- HORIZONTAL BAR ---------------- */
  function hbarChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    const items = opts.items || []; // [{label, value, color}]
    const padL = opts.labelWidth || 110, padR = 12, padT = 6, padB = 6;
    const cw = w - padL - padR, ch = h - padT - padB;
    if (!items.length) return;

    const rowH = ch / items.length;
    const barH = Math.min(18, rowH * 0.6);
    const maxV = Math.max(...items.map(i => Math.abs(i.value)), 1);

    ctx.font = '12px ' + cssVar('--font-sans', 'sans-serif');

    items.forEach((item, i) => {
      const y = padT + i * rowH + rowH / 2;
      // label
      ctx.fillStyle = p.text;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(item.label, padL - 8, y);

      // bar
      const bw = (Math.abs(item.value) / maxV) * cw;
      const color = item.color || p.primary;
      const x = padL;
      const grad = makeGradient(ctx, x, 0, x + bw, 0, [[0, color], [1, hexToRgba(color, 0.55)]]);
      ctx.fillStyle = grad;
      roundRect(ctx, x, y - barH / 2, bw, barH, barH / 2);
      ctx.fill();

      // value
      ctx.fillStyle = p.text;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 11px ' + cssVar('--font-mono', 'monospace');
      ctx.fillText(opts.valueFormat ? opts.valueFormat(item.value) : item.value.toFixed(2), x + bw + 6, y);
      ctx.font = '12px ' + cssVar('--font-sans', 'sans-serif');
    });
  }

  /* ---------------- DONUT ---------------- */
  function donutChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    const items = opts.items || []; // [{label, value, color}]
    const total = items.reduce((a, b) => a + b.value, 0) || 1;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 - 10;
    const innerR = r * (opts.innerRatio || 0.62);

    let start = -Math.PI / 2;
    items.forEach((item, i) => {
      const frac = item.value / total;
      const end = start + frac * Math.PI * 2;
      const color = item.color || SERIES_COLORS[i % SERIES_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      start = end;
    });

    // inner hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = cssVar('--surface', '#121826');
    ctx.fill();

    // center label
    if (opts.centerLabel) {
      ctx.fillStyle = p.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (opts.centerSize || 18) + 'px ' + cssVar('--font-mono', 'monospace');
      ctx.fillText(opts.centerLabel, cx, cy - 6);
    }
    if (opts.centerSub) {
      ctx.fillStyle = p.muted;
      ctx.font = '10px ' + cssVar('--font-sans', 'sans-serif');
      ctx.textBaseline = 'top';
      ctx.fillText(opts.centerSub, cx, cy + 8);
    }

    // legend (right)
    if (opts.legend !== false) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '11px ' + cssVar('--font-sans', 'sans-serif');
      // The legend overlay is rendered as DOM by caller typically; we skip canvas legend
    }
  }

  /* ---------------- SPARKLINE ---------------- */
  function sparkline(canvas, values, color) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    if (!values || values.length === 0) return;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const pad = 2;
    const cw = w - pad * 2, ch = h - pad * 2;
    const x = (i) => pad + (i / (values.length - 1)) * cw;
    const y = (v) => pad + ch - ((v - min) / range) * ch;
    const c = color || p.primary;

    // fill
    ctx.beginPath();
    values.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(values.length - 1), pad + ch);
    ctx.lineTo(x(0), pad + ch);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(c, 0.2);
    ctx.fill();

    // line
    ctx.beginPath();
    values.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();

    // last dot
    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values[values.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  }

  /* ---------------- GAUGE (arc) ---------------- */
  // value: 0..1, color stops by threshold
  function gaugeChart(canvas, value, opts = {}) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    // Clean 180° semicircle gauge: arc spans the top half (left → over top → right).
    const cx = w / 2;
    const r = Math.max(8, Math.min(w / 2 - 18, h - 24));
    const cy = r + 8;                       // center near the top so the semicircle fits
    const start = Math.PI;                  // 180° (left)
    const end = 2 * Math.PI;                // 360° (right)  → top half
    const arc = end - start;                // 180°
    const v = Math.max(0, Math.min(1, value));

    let color = p.primary;
    if (opts.thresholds) {
      if (v >= opts.thresholds.high) color = opts.colors?.high || p.danger;
      else if (v >= opts.thresholds.med) color = opts.colors?.med || p.warning;
      else color = opts.colors?.low || p.primary;
    }

    // background track (full semicircle)
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = cssVar('--surface-3', '#1c2438');
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.stroke();

    // value arc (fills proportionally from the left)
    if (v > 0.001) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + arc * v);
      ctx.strokeStyle = color;
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // tick marks at 0%, 50%, 100%
    ctx.strokeStyle = cssVar('--border', '#2a3550');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const a = start + (arc * i) / 4;
      const x1 = cx + Math.cos(a) * (r - 10);
      const y1 = cy + Math.sin(a) * (r - 10);
      const x2 = cx + Math.cos(a) * (r + 10);
      const y2 = cy + Math.sin(a) * (r + 10);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // center value (placed below the arc, inside the semicircle bowl)
    ctx.fillStyle = p.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 30px ' + cssVar('--font-mono', 'monospace');
    ctx.fillText(opts.label || (v * 100).toFixed(0) + '%', cx, cy + r * 0.42);
    if (opts.sub) {
      ctx.fillStyle = p.muted;
      ctx.font = '11px ' + cssVar('--font-sans', 'sans-serif');
      ctx.fillText(opts.sub, cx, cy + r * 0.42 + 22);
    }
  }

  /* ---------------- SHAP / DIVERGING HORIZONTAL BARS ----------------
     Horizontal bars diverging from a center line (x=0).
     opts.items: [{label, value, value_label, color?}]
     value > 0 → bar grows to the right (green by default)
     value < 0 → bar grows to the left (red by default)
  */
  function shapChart(canvas, opts) {
    const { ctx, w, h } = setup(canvas);
    const p = palette();
    const items = opts.items || [];
    if (!items.length) return;
    const padL = opts.labelWidth || 130, padR = opts.padR || 14, padT = opts.padT || 18, padB = opts.padB || 10;
    const cw = w - padL - padR, ch = h - padT - padB;
    const center = padL + cw / 2;

    // max abs value for scaling (symmetric)
    const maxAbs = Math.max(...items.map(i => Math.abs(i.value)), 0.0001);

    // gridlines around the center
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px ' + cssVar('--font-mono', 'monospace');
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const gridSteps = 4;
    for (let i = -gridSteps; i <= gridSteps; i++) {
      const x = center + (i / gridSteps) * (cw / 2);
      ctx.globalAlpha = i === 0 ? 0.9 : 0.35;
      ctx.beginPath();
      ctx.moveTo(x, padT); ctx.lineTo(x, padT + ch);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (i !== 0) {
        ctx.fillStyle = p.muted;
        const val = (i / gridSteps) * maxAbs;
        ctx.fillText(val.toFixed(2), x, padT + ch + 4);
      }
    }
    // center axis label "0"
    ctx.fillStyle = p.muted;
    ctx.fillText('0', center, padT + ch + 4);

    const rowH = ch / items.length;
    const barH = Math.min(22, rowH * 0.6);

    items.forEach((item, i) => {
      const y = padT + i * rowH + rowH / 2;
      // label
      ctx.fillStyle = p.text;
      ctx.font = '12px ' + cssVar('--font-sans', 'sans-serif');
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(item.label, padL - 10, y);

      const val = item.value;
      const isPos = val >= 0;
      const color = item.color || (isPos ? p.primary : p.danger);
      const bw = (Math.abs(val) / maxAbs) * (cw / 2);
      const x = isPos ? center : center - bw;

      // bar with gradient
      const grad = makeGradient(ctx, x, 0, x + bw, 0, [
        [0, hexToRgba(color, 0.55)],
        [1, color]
      ]);
      ctx.fillStyle = grad;
      roundRect(ctx, x, y - barH / 2, bw, barH, Math.min(barH / 2, 6));
      ctx.fill();

      // subtle outline
      ctx.strokeStyle = hexToRgba(color, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();

      // value label at end of bar
      ctx.fillStyle = p.text;
      ctx.font = '600 11px ' + cssVar('--font-mono', 'monospace');
      ctx.textAlign = isPos ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const label = item.value_label != null ? item.value_label : (val >= 0 ? '+' : '') + val.toFixed(3);
      ctx.fillText(label, isPos ? x + bw + 5 : x - 5, y);
    });

    // legend (top-left)
    if (opts.legend !== false) {
      ctx.font = '10px ' + cssVar('--font-sans', 'sans-serif');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = p.primary;
      ctx.fillRect(padL, 4, 8, 8);
      ctx.fillStyle = p.muted; ctx.fillText('increases level', padL + 12, 8);
      ctx.fillStyle = p.danger;
      ctx.fillRect(padL + 110, 4, 8, 8);
      ctx.fillStyle = p.muted; ctx.fillText('decreases level', padL + 122, 8);
    }
  }

  Charts.lineChart = lineChart;
  Charts.areaChart = (canvas, opts) => lineChart(canvas, { ...opts, area: true });
  Charts.barChart = barChart;
  Charts.hbarChart = hbarChart;
  Charts.shapChart = shapChart;
  Charts.donutChart = donutChart;
  Charts.sparkline = sparkline;
  Charts.gaugeChart = gaugeChart;
  Charts.SERIES_COLORS = SERIES_COLORS;
  Charts.palette = palette;

  // Re-render helper: stores draw fns to re-run on theme change
  Charts.instances = new Set();
  Charts.register = (redraw) => { Charts.instances.add(redraw); return redraw; };
  Charts.rerenderAll = () => { Charts.instances.forEach(fn => { try { fn(); } catch (e) {} }); };

  window.Charts = Charts;
})();
