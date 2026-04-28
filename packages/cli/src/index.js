#!/usr/bin/env node

'use strict';

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { runCheck } from '../../core/src/index.js';
import { generateReport } from '../../reporter/src/index.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

// ─── ASCII Banner ────────────────────────────────────────────────────────────
function printBanner() {
  console.log(
    chalk.cyan(`
  ██████╗ ██████╗ ██╗███████╗████████╗██╗    ██╗ █████╗ ████████╗ ██████╗██╗  ██╗
  ██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝██║    ██║██╔══██╗╚══██╔══╝██╔════╝██║  ██║
  ██║  ██║██████╔╝██║█████╗     ██║   ██║ █╗ ██║███████║   ██║   ██║     ███████║
  ██║  ██║██╔══██╗██║██╔══╝     ██║   ██║███╗██║██╔══██║   ██║   ██║     ██╔══██║
  ██████╔╝██║  ██║██║██║        ██║   ╚███╔███╔╝██║  ██║   ██║   ╚██████╗██║  ██║
  ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝        ╚═╝    ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
  `)
  );
  console.log(chalk.gray('  Figma → Live UI Drift Detector\n'));
}

// ─── CLI Setup ───────────────────────────────────────────────────────────────
program
  .name('driftwatch')
  .description('Detect visual drift between your Figma designs and live UI')
  .version(pkg.version);

// ─── init command ────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize a driftwatch.config.json in the current directory')
  .action(() => {
    printBanner();
    const configPath = path.join(process.cwd(), 'driftwatch.config.json');

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow('⚠  driftwatch.config.json already exists.'));
      return;
    }

    const defaultConfig = {
      figma: {
        token: 'YOUR_FIGMA_TOKEN',
        fileId: 'YOUR_FIGMA_FILE_ID',
        nodeIds: []
      },
      targets: [
        {
          name: 'Homepage Hero',
          url: 'http://localhost:3000',
          selector: 'body',
          figmaNodeId: '0:1'
        }
      ],
      output: {
        dir: './drift-report',
        format: ['html', 'json']
      },
      thresholds: {
        colorDeltaE: 2,
        spacingPx: 4,
        fontSizePx: 1,
        borderRadiusPx: 2,
        pixelDiffPercent: 1
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green('✔  Created driftwatch.config.json'));
    console.log(
      chalk.gray(
        '\n  Next steps:\n' +
        '  1. Add your Figma token and file ID\n' +
        '  2. Add target URLs and selectors\n' +
        '  3. Run: npx driftwatch check\n'
      )
    );
  });

// ─── check command ────────────────────────────────────────────────────────────
program
  .command('check')
  .description('Run drift detection against your live UI')
  .option('-c, --config <path>', 'path to config file', './driftwatch.config.json')
  .option('-o, --output <dir>', 'output directory for reports')
  .option('--no-headless', 'show browser window during capture')
  .option('--skip-figma', 'skip Figma API calls (CSS-only mode)', false)
  .action(async (options) => {
    printBanner();

    const configPath = path.resolve(process.cwd(), options.config);

    if (!fs.existsSync(configPath)) {
      console.error(
        chalk.red(`✖  Config not found: ${configPath}`) +
        chalk.gray('\n  Run: npx driftwatch init')
      );
      process.exit(1);
    }

    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(chalk.red('✖  Failed to parse config:'), err.message);
      process.exit(1);
    }

    if (options.output) {
      config.output = config.output || {};
      config.output.dir = options.output;
    }

    config._headless = options.headless !== false;
    config._skipFigma = options.skipFigma;

    console.log(chalk.cyan(`  Config:    ${configPath}`));
    console.log(chalk.cyan(`  Targets:   ${config.targets?.length ?? 0}`));
    console.log(chalk.cyan(`  Skip Figma: ${config._skipFigma}\n`));

    const spinner = ora({
      text: 'Starting drift analysis...',
      color: 'cyan'
    }).start();

    try {
      const results = await runCheck(config, {
        onProgress: (msg) => { spinner.text = msg; }
      });

      spinner.succeed(chalk.green('Drift analysis complete!'));

      const reportDir = await generateReport(results, config);

      console.log('\n' + chalk.bold('  Drift Summary:'));
      console.log(chalk.gray('  ─────────────────────────────────'));

      let totalDrifts = 0;
      for (const result of results) {
        const driftCount = result.drifts?.length ?? 0;
        totalDrifts += driftCount;
        const icon = driftCount === 0 ? chalk.green('✔') : chalk.red('✖');
        console.log(`  ${icon}  ${result.name}  ${chalk.gray(`(${driftCount} drift${driftCount !== 1 ? 's' : ''})`)}`);

        if (driftCount > 0) {
          for (const d of result.drifts) {
            console.log(
              chalk.yellow(`       • ${d.property}: `) +
              chalk.red(d.live) +
              chalk.gray(' → expected ') +
              chalk.green(d.expected)
            );
          }
        }
      }

      console.log(chalk.gray('  ─────────────────────────────────'));
      console.log(
        `\n  ${totalDrifts === 0 ? chalk.green('✔  No drift detected!') : chalk.red(`✖  ${totalDrifts} drift(s) detected`)}`
      );
      console.log(chalk.cyan(`\n  Report: ${reportDir}\n`));

      process.exit(totalDrifts > 0 ? 1 : 0);
    } catch (err) {
      spinner.fail(chalk.red('Drift analysis failed'));
      console.error(chalk.red('\n  Error:'), err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  });

program.parse();
