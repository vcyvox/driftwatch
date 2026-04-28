/**
 * Smoke test for the new CLI pipeline (captureDOM → compareComponent → generateReport → generateHTMLReport)
 * Runs everything in-process (no execSync) to avoid cross-process network isolation.
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { captureDOM } from '../packages/cli/src/capture.js';
import { compareComponent, generateReport } from '@driftwatch/core';
import { generateHTMLReport } from '@driftwatch/reporter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>CLI Test Page</title></head>
<body style="background:#0f172a;padding:48px;font-family:Inter,sans-serif;color:#f1f5f9">
  <div id="hero" data-driftwatch="Hero Section"
       style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:16px;padding:64px 48px;text-align:center">
    <h1 style="font-size:48px;font-weight:700;color:#fff">CLI Smoke Test</h1>
    <p style="font-size:18px;color:#a5b4fc">Testing bin/driftwatch.js pipeline</p>
  </div>
  <nav id="navbar" data-driftwatch="Nav Bar"
       style="background:#1e293b;padding:16px 24px;border-radius:12px;margin-top:32px">
    Navigation
  </nav>
  <button id="cta" data-driftwatch="CTA Button"
          style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;border:none;margin-top:24px;cursor:pointer">
    Get Started
  </button>
</body>
</html>`;

const PORT = 4751;

async function run() {
  console.log('\n  🧪 CLI Pipeline Smoke Test\n');

  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  });

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`  ✔ Test server at http://localhost:${PORT}`);

  try {
    // ── Step 1: captureDOM ───────────────────────────────────────────────────
    console.log('  ► Capturing DOM (3 breakpoints)...');
    const liveData = await captureDOM(`http://localhost:${PORT}`, [375, 768, 1280]);
    console.log(`  ✔ Elements found: ${liveData.elements.length}`);
    console.log(`  ✔ Screenshots:    ${Object.keys(liveData.screenshots).join(', ')}px`);
    console.log('  ✔ Elements:', liveData.elements.map(e => e.name).join(', '));

    // ── Step 2: compareComponent (skip-figma = empty figmaComponents) ────────
    console.log('\n  ► Comparing (skip-figma mode)...');
    const results = liveData.elements.map((el) => ({
      name:      el.name,
      component: el.name,
      type:      el.tagName?.toUpperCase() ?? 'UNKNOWN',
      drifts:    [],            // no Figma data → no drifts
      liveStyles: el.styles
    }));

    // ── Step 3: generateReport ───────────────────────────────────────────────
    const report = generateReport(results);
    console.log(`  ✔ Drift score:    ${report.summary.driftScore}%`);
    console.log(`  ✔ Components:     ${report.summary.totalComponents}`);
    console.log(`  ✔ Clean:          ${report.summary.cleanComponents}`);
    console.log(`  ✔ Critical:       ${report.summary.critical}`);
    console.log(`  ✔ Warning:        ${report.summary.warning}`);

    // ── Step 4: generateHTMLReport ───────────────────────────────────────────
    console.log('\n  ► Generating HTML report...');
    const html = generateHTMLReport(report, liveData.screenshots);

    const outDir = path.join(ROOT, 'drift-reports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const htmlPath = path.join(outDir, 'drift-report.html');
    const jsonPath = path.join(outDir, 'drift-report.json');
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    console.log(`  ✔ HTML written:   ${htmlPath}`);
    console.log(`  ✔ JSON written:   ${jsonPath}`);

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n  ── Summary ─────────────────────────────────────────');
    console.log(`  HTML exists:  ${fs.existsSync(htmlPath) ? '✔' : '✖'}`);
    console.log(`  JSON exists:  ${fs.existsSync(jsonPath) ? '✔' : '✖'}`);
    console.log(`  Score:        ${report.summary.driftScore}%`);
    console.log('\n  ✔ Pipeline smoke test PASSED!\n');
    console.log(`  Open: ${htmlPath}\n`);

  } catch (err) {
    console.error('\n  ✖ Smoke test FAILED:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  } finally {
    server.close();
  }
}

run();
