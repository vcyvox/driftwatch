#!/usr/bin/env node
/**
 * Driftwatch end-to-end demo
 *
 * 1. Spins up a tiny local HTML page on port 4747
 * 2. Creates a demo config pointing at it
 * 3. Runs `driftwatch check` in --skip-figma mode
 * 4. Prints the output dir so you can open the report
 */

'use strict';

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCheck } from '../packages/core/src/index.js';
import { generateReport } from '../packages/reporter/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// ─── Demo HTML page ───────────────────────────────────────────────────────────
const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Driftwatch Demo Page</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      padding: 48px;
    }
    .hero {
      background: linear-gradient(135deg, #1e1b4b, #312e81);
      border-radius: 16px;
      padding: 64px 48px;
      text-align: center;
    }
    .hero h1 {
      font-size: 48px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
    }
    .hero p {
      font-size: 18px;
      color: #a5b4fc;
      max-width: 480px;
      margin: 0 auto 32px;
    }
    .btn {
      display: inline-block;
      background: #6366f1;
      color: #fff;
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 40px;
    }
    .card {
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 24px;
    }
    .card h3 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .card p { font-size: 14px; color: #94a3b8; }
  </style>
</head>
<body>
  <section class="hero" id="hero">
    <h1>Driftwatch Demo</h1>
    <p>Your Figma designs are now being compared to this live page.</p>
    <button class="btn" id="cta-btn">Get Started</button>
  </section>
  <div class="card-grid">
    <div class="card" id="card-1">
      <h3>Design Tokens</h3>
      <p>Extract color, spacing and typography tokens from Figma.</p>
    </div>
    <div class="card" id="card-2">
      <h3>Live Capture</h3>
      <p>Playwright headlessly captures your production UI.</p>
    </div>
    <div class="card" id="card-3">
      <h3>Drift Report</h3>
      <p>A beautiful HTML report highlights every deviation.</p>
    </div>
  </div>
</body>
</html>`;

// ─── Demo config ──────────────────────────────────────────────────────────────
const PORT = 4747;

const demoConfig = {
  figma: { token: 'DEMO', fileId: 'DEMO', nodeIds: [] },
  targets: [
    {
      name: 'Hero Section',
      url: `http://localhost:${PORT}`,
      selector: '.hero',
      figmaNodeId: '0:1'
    },
    {
      name: 'Feature Card 1',
      url: `http://localhost:${PORT}`,
      selector: '#card-1',
      figmaNodeId: '0:2'
    },
    {
      name: 'Full Page',
      url: `http://localhost:${PORT}`,
      selector: 'body',
      figmaNodeId: '0:3'
    }
  ],
  output: { dir: path.join(ROOT, 'drift-report'), format: ['html', 'json'] },
  thresholds: { colorDeltaE: 2, spacingPx: 4, fontSizePx: 1, borderRadiusPx: 2 },
  _headless: true,
  _skipFigma: true
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  🚀 Driftwatch Demo\n');
  console.log('  ► Spinning up demo server...');

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DEMO_HTML);
  });

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`  ✔ Demo page running at http://localhost:${PORT}`);

  try {
    console.log('  ► Running drift analysis (skip-figma mode)...\n');

    const results = await runCheck(demoConfig, {
      onProgress: (msg) => process.stdout.write(`  … ${msg}\r`)
    });

    process.stdout.write('\n');

    const reportDir = await generateReport(results, demoConfig);

    console.log('\n  ✔ Analysis complete!\n');
    console.log('  Targets checked:', results.length);
    const totalDrifts = results.reduce((s, r) => s + (r.drifts?.length ?? 0), 0);
    console.log('  Total drifts:   ', totalDrifts, '(no Figma data, so 0 by design)');
    console.log('\n  📄 Report saved to:', reportDir);
    console.log('  Open: ' + path.join(reportDir, 'index.html') + '\n');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('\n  ✖ Demo failed:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
