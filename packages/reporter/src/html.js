'use strict';

import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// generateHTMLReport  (primary — called by bin/driftwatch.js)
//
// @param {object} report      – enriched { summary, components } from core's generateReport()
// @param {object} screenshots – { [breakpointWidth]: 'data:image/png;base64,...' }
//                               Keyed by px number (e.g. 375, 768, 1280)
// ─────────────────────────────────────────────────────────────────────────────
export function generateHTMLReport(report, screenshots = {}) {
  const { summary, components } = report;

  // Normalize component shape — handle both CLI and runCheck pipelines:
  //   CLI shape:      { component, type, drifts: [{ property, live, figma, severity }] }
  //   runCheck shape: { name, drifts: [{ property, live, expected, severity }] }
  const normalized = (components ?? []).map((c) => ({
    component: c.component ?? c.name ?? 'Unknown',
    type:      c.type      ?? c.tagName ?? 'ELEMENT',
    drifts: (c.drifts ?? []).map((d) => ({
      property: d.property,
      live:     d.live,
      figma:    d.figma ?? d.expected ?? '—',   // both field names accepted
      severity: d.severity ?? 'info'
    }))
  }));

  const driftedComponents = normalized.filter((c) => c.drifts.length > 0);
  const cleanComponents   = normalized.filter((c) => c.drifts.length === 0);

  const scoreColor =
    summary.driftScore >= 90 ? '#22c55e' :
    summary.driftScore >= 70 ? '#f59e0b' : '#ef4444';

  const screenshotBreakpoints = Object.keys(screenshots);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Driftwatch Report — ${new Date(summary.timestamp).toLocaleDateString()}</title>
  <meta name="description" content="Figma-to-live-UI drift detection report by Driftwatch" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;600;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:      #0a0a0f;
      --surface: #111118;
      --border:  #1e1e2e;
      --text:    #e2e2f0;
      --muted:   #6b6b8a;
      --cyan:    #00d4ff;
      --green:   #22c55e;
      --yellow:  #f59e0b;
      --red:     #ef4444;
      --blue:    #3b82f6;
    }

    body { font-family: 'Syne', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

    /* ── Header ── */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 32px 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon {
      width: 36px; height: 36px;
      background: var(--cyan);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .logo-text { font-size: 22px; font-weight: 800; color: var(--cyan); }
    .header-meta { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); text-align: right; }

    /* ── Layout ── */
    .main { padding: 48px; max-width: 1200px; margin: 0 auto; }

    /* ── Score section ── */
    .score-section {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 32px;
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 40px;
      margin-bottom: 40px;
    }
    @media (max-width: 600px) { .score-section { grid-template-columns: 1fr; } }

    /* Conic-gradient score circle */
    .score-circle {
      width: 120px; height: 120px;
      border-radius: 50%;
      background: conic-gradient(${scoreColor} ${summary.driftScore * 3.6}deg, var(--border) 0deg);
      display: flex; align-items: center; justify-content: center;
      position: relative;
      flex-shrink: 0;
    }
    .score-circle::before {
      content: '';
      position: absolute;
      width: 90px; height: 90px;
      background: var(--surface);
      border-radius: 50%;
    }
    .score-number {
      position: relative;
      z-index: 1;
      font-size: 28px;
      font-weight: 800;
      color: ${scoreColor};
    }
    .score-details { display: flex; gap: 32px; flex-wrap: wrap; margin-top: 16px; }
    .score-stat { display: flex; flex-direction: column; gap: 4px; }
    .score-stat-value { font-size: 36px; font-weight: 800; line-height: 1; }
    .score-stat-label { font-size: 13px; color: var(--muted); font-family: 'JetBrains Mono', monospace; }

    /* ── Badges ── */
    .badges { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 100px;
      font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: 600;
    }
    .badge.critical { background: rgba(239,68,68,0.15);  color: var(--red);    border: 1px solid rgba(239,68,68,0.3); }
    .badge.warning  { background: rgba(245,158,11,0.15); color: var(--yellow); border: 1px solid rgba(245,158,11,0.3); }
    .badge.info     { background: rgba(59,130,246,0.15); color: var(--blue);   border: 1px solid rgba(59,130,246,0.3); }
    .badge.clean    { background: rgba(34,197,94,0.15);  color: var(--green);  border: 1px solid rgba(34,197,94,0.3); }

    /* ── Section title ── */
    .section-title {
      font-size: 13px; font-weight: 600; color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase; letter-spacing: 1px;
      margin-bottom: 16px;
    }

    /* ── Screenshots grid ── */
    .screenshots-section { margin-bottom: 40px; }
    .screenshots-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .screenshot-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; overflow: hidden;
    }
    .screenshot-card-header {
      padding: 12px 16px; border-bottom: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted);
    }
    .screenshot-card img { width: 100%; display: block; max-height: 300px; object-fit: cover; object-position: top; }

    /* ── Component cards ── */
    .components-section { margin-bottom: 40px; }
    .component-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; margin-bottom: 12px; overflow: hidden;
    }
    .component-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; cursor: pointer; user-select: none;
      transition: background 0.15s;
    }
    .component-header:hover { background: rgba(255,255,255,0.025); }
    .component-name { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
    .component-type {
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted);
      background: var(--border); padding: 2px 8px; border-radius: 4px;
    }
    .drift-count { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); }

    /* ── Drifts table ── */
    .drifts-table { border-top: 1px solid var(--border); display: none; }
    .drifts-table.open { display: block; }
    .drift-row {
      display: grid;
      grid-template-columns: 20px 180px 1fr 1fr;
      gap: 16px; align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
    }
    .drift-row:last-child { border-bottom: none; }
    .drift-row:hover { background: rgba(255,255,255,0.02); }
    .drift-header-row { color: var(--muted); font-size: 11px; padding: 8px 20px; }
    .drift-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .drift-dot.critical { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,0.5); }
    .drift-dot.warning  { background: var(--yellow); box-shadow: 0 0 6px rgba(245,158,11,0.5); }
    .drift-dot.info     { background: var(--blue); box-shadow: 0 0 6px rgba(59,130,246,0.5); }
    .drift-prop  { color: var(--text); font-weight: 600; }
    .drift-live  { color: var(--red); }
    .drift-figma { color: var(--green); }

    /* ── Clean list ── */
    .clean-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .clean-item {
      display: flex; align-items: center; gap: 6px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; padding: 6px 12px; font-size: 13px;
    }
    .clean-check { color: var(--green); font-size: 12px; }

    /* ── Footer ── */
    .footer {
      text-align: center; padding: 32px;
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: var(--muted); border-top: 1px solid var(--border); margin-top: 40px;
    }
    .footer a { color: var(--cyan); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>

<header class="header">
  <div class="logo">
    <div class="logo-icon">👁</div>
    <span class="logo-text">driftwatch</span>
  </div>
  <div class="header-meta">
    <div>Generated ${new Date(summary.timestamp).toLocaleString()}</div>
    <div style="margin-top:4px">v0.1.0</div>
  </div>
</header>

<main class="main">

  <!-- ── Score card ─────────────────────────────────────────────────────── -->
  <div class="score-section">
    <div class="score-circle">
      <span class="score-number">${summary.driftScore}%</span>
    </div>
    <div>
      <div style="font-size:24px;font-weight:800;margin-bottom:4px">
        ${summary.driftScore >= 90 ? '✓ Looking great!' :
          summary.driftScore >= 70 ? '⚠ Some drift detected' :
                                     '✖ Significant drift found'}
      </div>
      <div class="score-details">
        <div class="score-stat">
          <span class="score-stat-value" style="color:var(--text)">${summary.totalComponents}</span>
          <span class="score-stat-label">total</span>
        </div>
        <div class="score-stat">
          <span class="score-stat-value" style="color:var(--green)">${summary.cleanComponents}</span>
          <span class="score-stat-label">clean</span>
        </div>
        <div class="score-stat">
          <span class="score-stat-value" style="color:var(--red)">${summary.driftedComponents}</span>
          <span class="score-stat-label">drifted</span>
        </div>
      </div>
      <div class="badges">
        ${summary.critical > 0 ? `<span class="badge critical">● ${summary.critical} critical</span>` : ''}
        ${summary.warning  > 0 ? `<span class="badge warning">● ${summary.warning} warning</span>` : ''}
        ${summary.info     > 0 ? `<span class="badge info">● ${summary.info} info</span>` : ''}
        ${summary.driftedComponents === 0 ? `<span class="badge clean">✓ No drift</span>` : ''}
      </div>
    </div>
  </div>

  <!-- ── Screenshots ───────────────────────────────────────────────────── -->
  ${screenshotBreakpoints.length > 0 ? `
  <div class="screenshots-section">
    <div class="section-title">Screenshots — ${screenshotBreakpoints.length} breakpoint${screenshotBreakpoints.length !== 1 ? 's' : ''}</div>
    <div class="screenshots-grid">
      ${screenshotBreakpoints.map((bp) => {
        const src = screenshots[bp];
        // src may already be a data URI or a raw base64 string
        const imgSrc = src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
        return `
      <div class="screenshot-card">
        <div class="screenshot-card-header">
          ${Number(bp) <= 480 ? '📱' : Number(bp) <= 900 ? '📟' : '🖥'} ${bp}px breakpoint
        </div>
        <img src="${imgSrc}" alt="${bp}px screenshot" loading="lazy" />
      </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- ── Drifted components ─────────────────────────────────────────────── -->
  ${driftedComponents.length > 0 ? `
  <div class="components-section">
    <div class="section-title">Drifted Components (${driftedComponents.length})</div>
    ${driftedComponents.map((comp, i) => `
    <div class="component-card" id="comp-${i}">
      <div class="component-header" onclick="toggleDrift(${i})" aria-expanded="true">
        <div class="component-name">
          <span style="color:var(--red)">✖</span>
          ${escapeHtml(comp.component)}
          <span class="component-type">${escapeHtml(comp.type || 'ELEMENT')}</span>
        </div>
        <span class="drift-count" id="arrow-${i}">▼ ${comp.drifts.length} drift${comp.drifts.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="drifts-table open" id="table-${i}">
        <div class="drift-row drift-header-row">
          <span></span><span>PROPERTY</span><span>LIVE VALUE</span><span>FIGMA VALUE</span>
        </div>
        ${comp.drifts.map((drift) => `
        <div class="drift-row">
          <div class="drift-dot ${escapeHtml(drift.severity)}"></div>
          <span class="drift-prop">${escapeHtml(drift.property)}</span>
          <span class="drift-live">${escapeHtml(String(drift.live ?? '—'))}</span>
          <span class="drift-figma">${escapeHtml(String(drift.figma ?? '—'))}</span>
        </div>`).join('')}
      </div>
    </div>`).join('')}
  </div>` : ''}

  <!-- ── Clean components ───────────────────────────────────────────────── -->
  ${cleanComponents.length > 0 ? `
  <div class="components-section">
    <div class="section-title">Clean Components (${cleanComponents.length})</div>
    <div class="clean-list">
      ${cleanComponents.map((comp) => `
      <div class="clean-item">
        <span class="clean-check">✓</span>
        ${escapeHtml(comp.component)}
      </div>`).join('')}
    </div>
  </div>` : ''}

</main>

<footer class="footer">
  Generated by <a href="https://github.com/driftwatch/driftwatch" target="_blank">driftwatch</a>
  — No more manual design reviews.
</footer>

<script>
  function toggleDrift(i) {
    const table = document.getElementById('table-' + i);
    const arrow = document.getElementById('arrow-' + i);
    const isOpen = table.classList.contains('open');
    table.classList.toggle('open', !isOpen);
    const drifts = table.querySelectorAll('.drift-row:not(.drift-header-row)').length;
    arrow.textContent = isOpen
      ? '▶ ' + drifts + ' drift' + (drifts !== 1 ? 's' : '')
      : '▼ ' + drifts + ' drift' + (drifts !== 1 ? 's' : '');
  }
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateHtmlReport  (adapter — called by reporter/src/index.js → runCheck pipeline)
//
// Adapts the runCheck data shape (enriched + rawResults) to the format
// expected by generateHTMLReport, then delegates to it.
//
// @param {object} enriched   – { summary, components } from core's generateReport()
// @param {array}  rawResults – original runCheck() results (have .screenshotPath)
// ─────────────────────────────────────────────────────────────────────────────
export function generateHtmlReport(enriched, rawResults = []) {
  // Build screenshots map from file-based screenshotPaths if available.
  // runCheck only captures at one viewport (1440px), so we key it as "1440".
  const screenshots = {};
  for (const r of rawResults) {
    if (r.screenshotPath && fs.existsSync(r.screenshotPath)) {
      try {
        const buf = fs.readFileSync(r.screenshotPath);
        // Key by "1440" (the default runCheck viewport width)
        screenshots['1440'] = screenshots['1440'] ?? `data:image/png;base64,${buf.toString('base64')}`;
      } catch {
        // ignore unreadable files
      }
    }
  }

  // Adapt components: merge enriched.components with rawResults for liveStyles
  const rawByName = Object.fromEntries(rawResults.map((r) => [r.name ?? r.component, r]));
  const adapted = (enriched.components ?? []).map((comp) => {
    const raw = rawByName[comp.name ?? comp.component] ?? {};
    return {
      component: comp.name ?? comp.component ?? 'Unknown',
      type:      comp.type ?? raw.type ?? 'ELEMENT',
      drifts: (comp.drifts ?? raw.drifts ?? []).map((d) => ({
        property: d.property,
        live:     d.live,
        figma:    d.figma ?? d.expected ?? '—',
        severity: d.severity ?? 'info'
      }))
    };
  });

  return generateHTMLReport({ summary: enriched.summary, components: adapted }, screenshots);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
