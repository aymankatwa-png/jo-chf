// ECG motifs: a live monitor sweep (sign-in page) and the enrollment "rhythm strip" (dashboard).
const g = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
export function pqrst(t) {
  return 0.11 * g(t, 0.12, 0.025) - 0.09 * g(t, 0.215, 0.008) + 1.0 * g(t, 0.24, 0.011) - 0.24 * g(t, 0.265, 0.01) + 0.27 * g(t, 0.47, 0.045);
}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function monitor(canvas, { bpm = 72, speed = 210 } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, x = 0, last = performance.now(), raf = 0, prevY = null, phase = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); x = 0; prevY = null;
    if (reduce) drawStatic();
  }
  const baseY = () => (h > 700 ? h * 0.42 : h * 0.5), amp = () => Math.min(h * 0.22, 150);
  function drawStatic() {
    ctx.strokeStyle = css('--trace'); ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i <= w; i++) { const t = ((i / speed) * (bpm / 60)) % 1; const y = baseY() - pqrst(t) * amp(); i ? ctx.lineTo(i, y) : ctx.moveTo(i, y); }
    ctx.stroke();
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const color = css('--trace');
    const steps = Math.max(1, Math.round(speed * dt));
    for (let s = 0; s < steps; s++) {
      const nx = x + 1;
      phase = (phase + (bpm / 60) / speed) % 1;
      const y = baseY() - pqrst(phase) * amp();
      // erase a band ahead of the cursor, like a bedside monitor
      ctx.clearRect(nx, 0, 26, h);
      if (prevY != null) {
        ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(x, prevY); ctx.lineTo(nx, y); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      prevY = y; x = nx;
      if (x > w) { x = 0; prevY = null; }
    }
    // cursor dot
    raf = requestAnimationFrame(frame);
  }
  size();
  const ro = new ResizeObserver(size); ro.observe(canvas);
  if (!reduce) raf = requestAnimationFrame(t => { last = t; frame(t); });
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

// Rhythm strip: each heartbeat is one month; the height of the R wave is that month's enrollment.
export function rhythmStrip(values, labels, { width = 900, height = 190 } = {}) {
  const n = values.length; if (!n) return '';
  const max = Math.max(1, ...values);
  const pad = 14, base = height - 34, top = 26;
  const seg = (width - pad * 2) / n;
  let d = `M0 ${base} L${pad} ${base}`;
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const x0 = pad + i * seg, a = (values[i] / max) * (base - top);
    const pts = 44;
    for (let k = 0; k <= pts; k++) {
      const t = k / pts;
      // scale P and T with a floor so empty months still look like a beat
      const yv = 0.11 * g(t, 0.14, 0.03) * (base - top) * 0.6 - 0.09 * g(t, 0.235, 0.012) * 40 + g(t, 0.27, 0.016) * a - 0.24 * g(t, 0.3, 0.014) * Math.max(16, a * 0.35) + 0.27 * g(t, 0.55, 0.06) * (base - top) * 0.32;
      d += ` L${(x0 + t * seg).toFixed(1)} ${(base - yv).toFixed(1)}`;
    }
    peaks.push({ x: x0 + 0.27 * seg, y: base - a, v: values[i], label: labels[i] });
  }
  d += ` L${width} ${base}`;
  const last = peaks[peaks.length - 1];
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Monthly enrollment for the last ${n} months">
    <path class="rs-trace" d="${d}" fill="none" stroke="var(--trace)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" style="filter:drop-shadow(0 0 5px color-mix(in srgb, var(--trace) 45%, transparent))"/>
    ${peaks.map((p, i) => `<g class="rs-lab" style="opacity:0;transition:opacity .4s ${0.25 + i * 0.09}s">
      <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)" style="font-variant-numeric:tabular-nums;font-family:var(--sans)">${p.v}</text>
      <text x="${p.x}" y="${height - 10}" text-anchor="middle" font-size="11" fill="var(--muted)" style="font-family:var(--sans)">${p.label}</text></g>`).join('')}
    <circle class="rs-dot" cx="${last.x}" cy="${last.y}" r="4.5" fill="var(--trace)" style="opacity:0;transition:opacity .3s 1.7s"><animate attributeName="r" values="4.5;7;4.5" dur="1.2s" repeatCount="indefinite"/></circle>
  </svg>`;
}
export function playRhythm(root) {
  const p = root.querySelector('.rs-trace'); if (!p) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  p.style.transition = reduce ? 'none' : 'stroke-dashoffset 2s cubic-bezier(.45,.05,.3,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    p.style.strokeDashoffset = '0';
    root.querySelectorAll('.rs-lab, .rs-dot').forEach(el => (el.style.opacity = '1'));
  }));
}
