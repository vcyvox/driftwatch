'use strict';

/**
 * captureDOM — launches Playwright, optionally handles auth login,
 * then visits the target URL at each breakpoint.
 *
 * Element matching strategy:
 *   ONLY elements with data-driftwatch="Component Name" are captured.
 *   Everything else is ignored to avoid noise.
 *
 * Returns:
 *   { elements: [...], screenshots: { [width]: 'data:image/png;base64,...' }, noAttributesFound: bool }
 */

import { chromium } from 'playwright';

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
 */
export async function captureDOM(url, breakpoints = [375, 768, 1280], auth = null) {
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

      // ── ONLY extract elements with data-driftwatch attribute ──────────────
      const extracted = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('[data-driftwatch]').forEach((el) => {
          const name = el.getAttribute('data-driftwatch');
          if (!name) return;
          const style = window.getComputedStyle(el);
          results.push({
            name,
            dataAttr: name.toLowerCase().replace(/\s+/g, '-'),
            tagName:  el.tagName.toLowerCase(),
            styles: {
              color:           style.color,
              backgroundColor: style.backgroundColor,
              fontSize:        style.fontSize,
              fontFamily:      style.fontFamily,
              fontWeight:      style.fontWeight,
              lineHeight:      style.lineHeight,
              letterSpacing:   style.letterSpacing,
              paddingTop:      style.paddingTop,
              paddingRight:    style.paddingRight,
              paddingBottom:   style.paddingBottom,
              paddingLeft:     style.paddingLeft,
              borderRadius:    style.borderRadius,
              borderColor:     style.borderColor,
              borderWidth:     style.borderWidth,
              width:           style.width,
              height:          style.height,
              gap:             style.gap,
              opacity:         style.opacity,
              display:         style.display
            }
          });
        });
        return results;
      });

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
    // Flag to tell CLI whether any data-driftwatch elements were found
    noAttributesFound: elements.length === 0
  };
}
