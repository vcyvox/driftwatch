#!/usr/bin/env node

'use strict';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchFigmaData, compareComponent, generateReport } from '@driftwatch/core';
import { captureDOM } from '../src/capture.js';
import { generateHTMLReport } from '@driftwatch/reporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(chalk.cyan(`
  ██████╗ ██████╗ ██╗███████╗████████╗██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗
  ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║
  ██║  ██║██████╔╝██║█████╗     ██║   ██║ █╗ ██║███████║   ██║   ██║     ███████║
  ██║  ██║██╔══██╗██║██╔══╝     ██║   ██║███╗██║██╔══██║   ██║   ██║     ██╔══██║
  ██████╔╝██║  ██║██║██║        ██║   ╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝        ╚═╝    ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
`));
console.log(chalk.gray('  Watches for design drift between your Figma and live UI.\n'));

// ─── Program ──────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name('driftwatch')
  .description('Figma to live UI drift detector')
  .version('0.1.0');

// ─── check ───────────────────────────────────────────────────────────────────
program
  .command('check')
  .description('Check for drift between Figma and your live UI')
  .option('-u, --url <url>',        'Override the URL to check (default: read from config)')
  .option('-f, --figma-file <key>', 'Override Figma file key (default: read from config)')
  .option('-o, --out <dir>',        'Override output directory (default: read from config)')
  .option('-c, --config <path>',    'Path to config file', './driftwatch.config.json')
  .option('--skip-figma',           'Skip Figma API call (demo / testing mode)')
  .action(async (options) => {
    // ── Load config file ───────────────────────────────────────────────────
    let config = {};
    const configPath = path.resolve(process.cwd(), options.config);
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log(chalk.gray(`  Config loaded from ${options.config}\n`));
      } catch {
        console.warn(chalk.yellow(`  ⚠  Could not parse config at ${options.config}, using defaults.\n`));
      }
    }

    // ── Resolve config values ───────────────────────────────────────────
    // CLI flags always win, then config file, then sensible defaults.
    // --token is intentionally removed — always read from config or FIGMA_TOKEN env.
    const url = options.url
      || config.baseUrl
      || config.targets?.[0]?.url
      || 'http://localhost:3000';

    const figmaFile = options.figmaFile
      || config.figmaFileKey
      || config.figma?.fileId;

    const token = config.figma?.token
      || config.figmaToken
      || process.env.FIGMA_TOKEN;

    const outDir = options.out
      || config.out
      || config.output?.dir
      || './drift-reports';

    const breakpoints = config.breakpoints || [1280];
    const auth        = config.auth ?? null;

    // ── Validate ────────────────────────────────────────────────
    if (!options.skipFigma) {
      if (!figmaFile) {
        console.error(chalk.red('  ✖ No Figma file key found.'));
        console.error(chalk.gray('    Set figma.fileId in driftwatch.config.json'));
        process.exit(1);
      }
      if (!token) {
        console.error(chalk.red('  ✖ No Figma token found.'));
        console.error(chalk.gray('    Set figma.token in driftwatch.config.json, or export FIGMA_TOKEN=<token>'));
        process.exit(1);
      }
    }

    console.log(chalk.white(`  Checking:    ${chalk.cyan(url)}`));
    console.log(chalk.white(`  Breakpoints: ${chalk.cyan(breakpoints.join(', '))}px`));
    if (auth?.username) {
      console.log(chalk.white(`  Auth:        ${chalk.cyan(auth.usernameSelector ?? 'auto')} as ${chalk.cyan(auth.username)}`));
    }
    console.log('');

    // ── Step 1: Fetch Figma data ───────────────────────────────────────────
    let figmaComponents = [];
    if (!options.skipFigma) {
      const figmaSpinner = ora('  Fetching Figma design specs...').start();
      try {
        figmaComponents = await fetchFigmaData(figmaFile, token);
        figmaSpinner.succeed(
          chalk.green(`  Figma data fetched — ${figmaComponents.length} components found`)
        );
      } catch (err) {
        figmaSpinner.fail(chalk.red(`  Failed to fetch Figma data: ${err.message}`));
        process.exit(1);
      }
    }

    // ── Step 2: Capture live DOM ───────────────────────────────────────────
    const domSpinner = ora('  Capturing live UI...').start();
    let liveData;
    try {
      liveData = await captureDOM(url, breakpoints, auth);
      domSpinner.succeed(
        chalk.green(`  Live UI captured — ${liveData.elements.length} element${liveData.elements.length !== 1 ? 's' : ''} found`)
      );
    } catch (err) {
      domSpinner.fail(chalk.red(`  Failed to capture live UI: ${err.message}`));
      process.exit(1);
    }

    // ── No data-driftwatch attributes? Show helpful message and exit ───────
    if (liveData.noAttributesFound) {
      console.log('');
      console.log(chalk.yellow('  ⚠  No data-driftwatch attributes found on this page.'));
      console.log(chalk.gray('\n  Driftwatch only compares elements you explicitly tag.'));
      console.log(chalk.gray('  Add data-driftwatch attributes to your components to get precise results:\n'));
      console.log(chalk.cyan('     <div data-driftwatch="Hero Section">...</div>'));
      console.log(chalk.cyan('     <button data-driftwatch="CTA Button">...</button>'));
      console.log(chalk.cyan('     <nav data-driftwatch="Navigation">...</nav>'));
      console.log('');
      console.log(chalk.gray('  Then re-run: npx driftwatch check\n'));
      process.exit(0);
    }

    // ── Step 3: Compare Figma vs live ──────────────────────────────────────
    const compareSpinner = ora('  Comparing Figma vs live UI...').start();
    const rawResults = [];

    if (figmaComponents.length > 0) {
      // Deduplicate Figma components by name — keep first occurrence
      const seenFigma = new Set();
      const uniqueFigmaComponents = figmaComponents.filter((c) => {
        if (seenFigma.has(c.name)) return false;
        seenFigma.add(c.name);
        return true;
      });

      for (const figmaComp of uniqueFigmaComponents) {
        // Match by exact name or slugified data attribute value
        const liveElement = liveData.elements.find(
          (el) =>
            el.name === figmaComp.name ||
            el.dataAttr === figmaComp.name.toLowerCase().replace(/\s+/g, '-')
        );

        if (liveElement) {
          const drifts = compareComponent(figmaComp, liveElement.styles);
          rawResults.push({
            name:             figmaComp.name,
            component:        figmaComp.name,
            type:             figmaComp.type,
            drifts,
            figmaProperties:  figmaComp.properties,
            liveStyles:       liveElement.styles
          });
        }
      }
    } else {
      // --skip-figma: wrap captured elements as "clean" results for the report
      for (const el of liveData.elements) {
        rawResults.push({
          name:       el.name,
          component:  el.name,
          type:       el.tagName?.toUpperCase() ?? 'UNKNOWN',
          drifts:     [],
          liveStyles: el.styles
        });
      }
    }

    // Deduplicate results by name — keep the entry with the most drifts
    const seen = new Map();
    for (const r of rawResults) {
      const key = r.name ?? r.component ?? '';
      if (!seen.has(key)) {
        seen.set(key, r);
      } else if ((r.drifts?.length ?? 0) > (seen.get(key).drifts?.length ?? 0)) {
        seen.set(key, r); // richer entry wins
      }
    }
    const results = Array.from(seen.values());

    const report = generateReport(results);
    compareSpinner.succeed(chalk.green('  Comparison complete'));

    // ── Step 4: Write reports ──────────────────────────────────────────────
    const reportSpinner = ora('  Generating drift report...').start();
    try {
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const jsonPath = path.join(outDir, 'drift-report.json');
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

      const htmlPath = path.join(outDir, 'drift-report.html');
      const html = generateHTMLReport(report, liveData.screenshots);
      fs.writeFileSync(htmlPath, html);

      reportSpinner.succeed(chalk.green(`  Report saved to ${outDir}/`));
    } catch (err) {
      reportSpinner.fail(chalk.red(`  Failed to generate report: ${err.message}`));
      process.exit(1);
    }

    // ── Step 5: Print summary ──────────────────────────────────────────────
    console.log('\n' + chalk.white('─'.repeat(52)));
    console.log(chalk.bold('\n  📊 DRIFT SUMMARY\n'));
    console.log(`  Drift Score:     ${getDriftScoreColor(report.summary.driftScore)}  `);
    console.log(`  Total Checked:   ${chalk.white(report.summary.totalComponents)} components`);
    console.log(`  Clean:           ${chalk.green('✓')} ${report.summary.cleanComponents} components`);
    console.log(`  Drifted:         ${chalk.red('✖')} ${report.summary.driftedComponents} components\n`);

    if (report.summary.critical > 0) console.log(`  ${chalk.red('●')} Critical: ${report.summary.critical} issue${report.summary.critical !== 1 ? 's' : ''}`);
    if (report.summary.warning  > 0) console.log(`  ${chalk.yellow('●')} Warning:  ${report.summary.warning}  issue${report.summary.warning  !== 1 ? 's' : ''}`);
    if (report.summary.info     > 0) console.log(`  ${chalk.blue('●')} Info:     ${report.summary.info}     issue${report.summary.info     !== 1 ? 's' : ''}`);

    const drifted = results.filter((r) => r.drifts.length > 0);
    if (drifted.length > 0) {
      console.log('\n' + chalk.white('─'.repeat(52)));
      console.log(chalk.bold('\n  🔍 DRIFTED COMPONENTS\n'));
      for (const result of drifted) {
        console.log(`  ${chalk.cyan(result.component ?? result.name)}`);
        for (const drift of result.drifts) {
          const icon =
            drift.severity === 'critical' ? chalk.red('●') :
            drift.severity === 'warning'  ? chalk.yellow('●') :
                                            chalk.blue('●');
          console.log(
            `    ${icon} ${chalk.white(drift.property)}: ` +
            `${chalk.red(drift.live ?? drift.live)} → should be ${chalk.green(drift.figma ?? drift.expected)}`
          );
        }
        console.log('');
      }
    } else {
      console.log('\n  ' + chalk.green('✓ No drift detected! Your UI matches Figma perfectly.') + '\n');
    }

    console.log(chalk.white('─'.repeat(52)));
    console.log(chalk.gray(`\n  Full report: ${path.resolve(outDir)}/drift-report.html\n`));

    // ── CI/CD: exit 1 on critical drift ───────────────────────────────────
    if (report.summary.critical > 0) process.exit(1);
  });

// ─── init ─────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Create a driftwatch.config.json in your project')
  .action(() => {
    const configPath = path.join(process.cwd(), 'driftwatch.config.json');

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow('\n  ⚠  driftwatch.config.json already exists!\n'));
      return;
    }

    const config = {
      figmaFileKey: 'your-figma-file-key',
      figmaToken:   'your-figma-token',
      baseUrl:      'http://localhost:3000',
      breakpoints:  [375, 768, 1280],
      out:          './drift-reports',
      threshold:    0.05,
      auth: {
        _comment:          'Remove this block if your app does not require login',
        loginUrl:          'http://localhost:3000/login',
        usernameSelector:  '#email',
        passwordSelector:  '#password',
        submitSelector:    'button[type="submit"]',
        username:          'your-username',
        password:          'your-password',
        waitAfterLogin:    2000
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green('\n  ✓ driftwatch.config.json created!\n'));
    console.log(
      chalk.gray('  Next steps:\n') +
      chalk.gray('  1. Add your Figma file key and token\n') +
      chalk.gray('  2. Set baseUrl to your local dev server\n') +
      chalk.gray('  3. If your app needs login, fill in the auth block\n') +
      chalk.gray('  4. Tag components with data-driftwatch="Name"\n') +
      chalk.gray('  5. Run: npx driftwatch check\n')
    );
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDriftScoreColor(score) {
  if (score >= 90) return chalk.bgGreen.black(` ${score}% `);
  if (score >= 70) return chalk.bgYellow.black(` ${score}% `);
  return chalk.bgRed.white(` ${score}% `);
}

program.parse(process.argv);
