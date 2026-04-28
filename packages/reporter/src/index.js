'use strict';

import fs from 'fs';
import path from 'path';
import { generateHtmlReport, generateHTMLReport as _generateHTMLReport } from './html.js';
import { generateReport as buildReportData } from '../../core/src/index.js';


/**
 * generateHTMLReport — called directly by the new CLI bin (bin/driftwatch.js).
 * Passes screenshots directly to the html.js template so breakpoint images are embedded.
 *
 * @param {object} report      - enriched { summary, components } from core's generateReport()
 * @param {object} screenshots - { [breakpointWidth]: 'data:image/png;base64,...' }
 * @returns {string}           - rendered HTML string
 */
export function generateHTMLReport(report, screenshots = {}) {
  return _generateHTMLReport(report, screenshots);
}


/**
 * Generate drift reports (HTML + JSON) from runCheck results.
 * Automatically enriches results via generateReport() for drift score + severity counts.
 * Returns the output directory path.
 */
export async function generateReport(results, config) {
  const outputDir = path.resolve(process.cwd(), config.output?.dir ?? './drift-report');
  const formats   = config.output?.format ?? ['html', 'json'];

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Enrich with drift score + severity counts via core's generateReport()
  const enriched = buildReportData(results);

  if (formats.includes('json')) {
    const jsonPath = path.join(outputDir, 'drift-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2));
  }

  if (formats.includes('html')) {
    const htmlPath = path.join(outputDir, 'index.html');
    const html = generateHtmlReport(enriched, results);
    fs.writeFileSync(htmlPath, html);
  }

  return outputDir;
}

