'use strict';

/**
 * captureDOM — launches Playwright, optionally handles auth login,
 * then visits the target URL at each breakpoint.
 *
 * Element matching strategy:
 *   manual mode    → ONLY elements with data-driftwatch="Component Name" are captured.
 *   auto-scan mode → ALL visible children inside the given selector container are captured.
 *
 * Returns:
 *   { elements: [...], screenshots: { [width]: 'data:image/png;base64,...' }, noAttributesFound: bool }
 */

import { chromium } from 'playwright';

// ─── Shared style extractor ────────────────────────────────────────────────────

/**
 * The CSS properties we extract from each element.
 * Kept in one place so manual and auto-scan share the same schema.
 */
const STYLE_KEYS = [
  'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight',
  'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'borderRadius', 'borderColor',
  'borderWidth', 'width', 'height', 'gap', 'opacity', 'display'
];

// ─── captureDOM ────────────────────────────────────────────────────────────────

/**
 * @param {string}   url          - URL to capture
 * @param {number[]} breakpoints  - viewport widths e.g. [375, 768, 1280]
 * @param {object|null} auth      - optional auth config from driftwatch.config.json
 *   {
 *     loginUrl:          string  - URL of the login page (defaults to the target url)
 *     usernameSelector:  string  - CSS selector for the username/email input
 *     passwordSelector:  string  - CSS selector for the password input
 *     username:          string  - credential to fill
 *     password:          string  - credential to fill
 *     submitSelector:    string  - CSS selector for the submit button (optional, falls back to Enter key)
 *     waitAfterLogin:    number  - ms to wait after login before capturing (default: 2000)
 *   }
 * @param {object} options
 *   {
 *     mode:     'manual' | 'auto-scan'  (default: 'manual')
 *     selector: string  - required for auto-scan, the container CSS selector
 *   }
 */
export async function captureDOM(url, breakpoints = [375, 768, 1280], auth = null, options = {}) {
  const mode     = options.mode ?? 'manual';
  const selector = options.selector ?? null;

  const browser = await chromium.launch({ headless: true });

  const elementMap  = new Map();  // name → merged element data
  const screenshots = {};

  try {
    // ── Auth flow (shared browser context keeps session across viewports) ───────
    const context = await browser.newContext();

    if (auth?.username && auth?.password) {
      const loginPage = await context.newPage();
      const loginUrl  = auth.loginUrl ?? url;

      console.log(`    → Navigating to login: ${loginUrl}`);
      await loginPage.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (auth.usernameSelector) {
        await loginPage.waitForSelector(auth.usernameSelector, { timeout: 10000 });
        await loginPage.fill(auth.usernameSelector, auth.username);
      }

      if (auth.passwordSelector) {
        await loginPage.fill(auth.passwordSelector, auth.password);
      }

      if (auth.submitSelector) {
        await loginPage.click(auth.submitSelector);
      } else {
        await loginPage.keyboard.press('Enter');
      }

      const delay = auth.waitAfterLogin ?? 2000;
      await loginPage.waitForTimeout(delay);

      // ── Fix 1: Detect login failure ─────────────────────────────────────────
      // If we are still on the login page after waiting, credentials likely failed.
      const loginUrlObj  = new URL(loginUrl);
      const currentUrl   = loginPage.url();
      const currentPath  = new URL(currentUrl).pathname;
      if (currentPath === loginUrlObj.pathname) {
        await loginPage.close();
        await context.close();
        throw new Error(
          `Login failed: still on ${loginUrl} after submitting credentials. ` +
          `Check username/password in driftwatch.config.json.`
        );
      }

      console.log(`    → Login complete, waited ${delay}ms`);
      await loginPage.close();
    }

    // ── Capture at each breakpoint ───────────────────────────────────────────
    for (const width of breakpoints) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500); // let layout settle

      // Screenshot at this breakpoint
      const buf = await page.screenshot({ fullPage: false });
      screenshots[width] = `data:image/png;base64,${buf.toString('base64')}`;

      let extracted = [];

      if (mode === 'auto-scan') {
        // ── Auto-scan mode: capture all visible children inside selector ──────
        extracted = await page.evaluate(({ sel, styleKeys }) => {
          const container = sel ? document.querySelector(sel) : document.body;
          if (!container) return [];

          const results = [];
          const tagCounters = {};

          // Walk direct + nested visible children
          container.querySelectorAll('*').forEach((el) => {
            // Skip invisible elements
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

            const tag = el.tagName.toLowerCase();
            tagCounters[tag] = (tagCounters[tag] ?? 0) + 1;
            const name = `${tag}-${tagCounters[tag]}`;

            const styles = {};
            for (const key of styleKeys) styles[key] = style[key];

            results.push({
              name,
              dataAttr: name,
              tagName:  tag,
              styles
            });
          });

          return results;
        }, { sel: selector, styleKeys: STYLE_KEYS });
      } else {
        // ── Manual mode: ONLY extract elements with data-driftwatch attribute ──
        extracted = await page.evaluate(({ styleKeys }) => {
          const results = [];
          document.querySelectorAll('[data-driftwatch]').forEach((el) => {
            const name = el.getAttribute('data-driftwatch');
            if (!name) return;
            const style = window.getComputedStyle(el);
            const styles = {};
            for (const key of styleKeys) styles[key] = style[key];
            results.push({
              name,
              dataAttr: name.toLowerCase().replace(/\s+/g, '-'),
              tagName:  el.tagName.toLowerCase(),
              styles
            });
          });
          return results;
        }, { styleKeys: STYLE_KEYS });
      }

      for (const el of extracted) {
        if (!elementMap.has(el.name)) {
          elementMap.set(el.name, {
            name:            el.name,
            dataAttr:        el.dataAttr,
            tagName:         el.tagName,
            styles:          el.styles,
            breakpointStyles: {}
          });
        }
        elementMap.get(el.name).breakpointStyles[width] = el.styles;
      }

      await page.close();
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const elements = Array.from(elementMap.values());

  return {
    elements,
    screenshots,
    mode,
    // Flag to tell CLI whether any elements were found
    // In auto-scan mode we never show the "add data-driftwatch" hint
    noAttributesFound: mode === 'manual' && elements.length === 0
  };
}
