'use strict';

import fs from 'fs';
import path from 'path';

/**
 * Capture a screenshot of the target element (or full page).
 * Returns the absolute path to the saved screenshot.
 */
export async function captureScreenshot(page, target, config) {
  const outputDir = config.output?.dir ?? './drift-report';
  const screenshotsDir = path.resolve(process.cwd(), outputDir, 'screenshots');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const safeName = (target.name ?? 'capture')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const screenshotPath = path.join(screenshotsDir, `${safeName}.png`);

  if (target.selector && target.selector !== 'body') {
    try {
      const element = await page.$(target.selector);
      if (element) {
        await element.screenshot({ path: screenshotPath });
        return screenshotPath;
      }
    } catch {
      // fall through to full page
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}
