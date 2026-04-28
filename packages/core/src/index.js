'use strict';

// @driftwatch/core
// The heart of Driftwatch — compares Figma design specs vs live UI

import { chromium } from 'playwright';
import { captureScreenshot } from './capture.js';

// ─── Figma API ────────────────────────────────────────────────────────────────

/**
 * fetch() wrapper that retries on 429 (rate limited) with exponential backoff.
 * Figma's rate limit resets quickly — 3 attempts with 2s/4s/8s delays covers
 * rapid repeated test runs without long waits.
 */
async function fetchWithRetry(url, options, maxAttempts = 3) {
  let delay = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt === maxAttempts) return res; // let caller handle the error
    console.warn(`  ⚠  Figma rate limit (429). Retrying in ${delay / 1000}s... (attempt ${attempt}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2; // 2s → 4s → 8s
  }
}

/**
 * Fetches design data from Figma API using the full-file endpoint.

 * Returns a flat array of parsed component objects.
 * @param {string} fileKey - Figma file key
 * @param {string} token   - Figma personal access token
 */
export async function fetchFigmaData(fileKey, token) {
  const res = await fetchWithRetry(
    `https://api.figma.com/v1/files/${fileKey}`,
    { headers: { 'X-Figma-Token': token } }
  );

  if (!res.ok) {
    throw new Error(`Figma API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const parsed = parseFigmaNodes(data.document);
  return deduplicateByName(parsed); // keep first occurrence of each name
}

/**
 * Fetches a single Figma node by ID (used when a specific nodeId is provided in config).
 * @param {string} fileKey - Figma file key
 * @param {string} token   - Figma personal access token
 * @param {string} nodeId  - Figma node ID (e.g. "123:456")
 */
export async function fetchFigmaNode(fileKey, token, nodeId) {
  const res = await fetchWithRetry(
    `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    { headers: { 'X-Figma-Token': token } }
  );

  if (!res.ok) {
    throw new Error(`Figma API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const nodeWrapper = data.nodes?.[nodeId];
  if (!nodeWrapper) {
    throw new Error(`Node ${nodeId} not found in Figma file ${fileKey}`);
  }

  // Parse just this one node (and its children), deduplicate, return first
  const parsed = deduplicateByName(parseFigmaNodes(nodeWrapper.document));
  return parsed.length > 0 ? parsed[0] : null;
}

// ─── Deduplication helper ───────────────────────────────────────────────────

/**
 * Deduplicates a flat array of parsed Figma components by name.
 * When the same name appears multiple times (e.g. a reused component across
 * frames), only the first occurrence is kept.
 * @param {object[]} components
 * @returns {object[]}
 */
function deduplicateByName(components) {
  const seen = new Map();
  for (const comp of components) {
    if (comp.name && !seen.has(comp.name)) {
      seen.set(comp.name, comp);
    }
  }
  return Array.from(seen.values());
}

// ─── Figma Node Parser ────────────────────────────────────────────────────────

/**
 * Recursively parses Figma document nodes into a flat list of components.
 * Each component has normalized CSS-comparable properties.
 * @param {object} node   - Figma document node
 * @param {array}  result - accumulator
 */
export function parseFigmaNodes(node, result = []) {
  if (!node) return result;

  if (node.name && node.type !== 'DOCUMENT' && node.type !== 'CANVAS') {
    const component = {
      id: node.id,
      name: node.name,
      type: node.type,
      properties: {}
    };

    // ── Fills → background / text color ──────────────────────────────────────
    if (node.fills?.length > 0) {
      const fill = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
      if (fill?.color) {
        component.properties.color = rgbToHex(fill.color);
      }
    }

    // ── Strokes → border color ────────────────────────────────────────────────
    if (node.strokes?.length > 0) {
      const stroke = node.strokes.find((s) => s.type === 'SOLID');
      if (stroke?.color) {
        component.properties.borderColor = rgbToHex(stroke.color);
      }
    }

    // ── Border radius ─────────────────────────────────────────────────────────
    if (node.cornerRadius !== undefined) {
      component.properties.borderRadius = `${node.cornerRadius}px`;
    } else if (node.rectangleCornerRadii) {
      const [tl, tr, br, bl] = node.rectangleCornerRadii;
      component.properties.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }

    // ── Stroke weight → border width ──────────────────────────────────────────
    if (node.strokeWeight !== undefined) {
      component.properties.borderWidth = `${node.strokeWeight}px`;
    }

    // ── Padding (auto-layout) ─────────────────────────────────────────────────
    if (node.paddingTop !== undefined) {
      component.properties.paddingTop    = `${node.paddingTop}px`;
      component.properties.paddingRight  = `${node.paddingRight ?? 0}px`;
      component.properties.paddingBottom = `${node.paddingBottom ?? 0}px`;
      component.properties.paddingLeft   = `${node.paddingLeft ?? 0}px`;
    }

    // ── Gap (auto-layout) ─────────────────────────────────────────────────────
    if (node.itemSpacing !== undefined) {
      component.properties.gap = `${node.itemSpacing}px`;
    }

    // ── Typography ────────────────────────────────────────────────────────────
    if (node.style) {
      const s = node.style;
      if (s.fontSize)      component.properties.fontSize      = `${s.fontSize}px`;
      if (s.fontFamily)    component.properties.fontFamily    = s.fontFamily;
      if (s.fontWeight)    component.properties.fontWeight    = String(s.fontWeight);
      if (s.letterSpacing) component.properties.letterSpacing = `${s.letterSpacing}px`;
      if (s.lineHeightPx)  component.properties.lineHeight    = `${s.lineHeightPx}px`;
    }

    // ── Bounding box → width / height ────────────────────────────────────────
    if (node.absoluteBoundingBox) {
      component.properties.width  = `${Math.round(node.absoluteBoundingBox.width)}px`;
      component.properties.height = `${Math.round(node.absoluteBoundingBox.height)}px`;
    }

    // ── Opacity ───────────────────────────────────────────────────────────────
    if (node.opacity !== undefined && node.opacity !== 1) {
      component.properties.opacity = String(node.opacity);
    }

    if (Object.keys(component.properties).length > 0) {
      result.push(component);
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) parseFigmaNodes(child, result);
  }

  return result;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

/**
 * Converts Figma's RGB (0–1 range) to CSS hex string.
 * @param {{ r, g, b, a }} color
 */
export function rgbToHex({ r, g, b }) {
  const toHex = (val) => Math.round(val * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Comparator ───────────────────────────────────────────────────────────────

/**
 * The full set of CSS properties Driftwatch checks.
 */
const COMPARE_PROPS = [
  'color', 'borderColor', 'borderRadius', 'borderWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing',
  'lineHeight', 'opacity', 'width', 'height', 'gap'
];

/**
 * Severity classification per property.
 */
const SEVERITY_MAP = {
  critical: new Set(['color', 'fontSize', 'fontFamily']),
  warning:  new Set(['borderRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontWeight', 'gap']),
  info:     new Set(['letterSpacing', 'lineHeight', 'opacity', 'width', 'height', 'borderColor', 'borderWidth'])
};

export function getSeverity(prop) {
  if (SEVERITY_MAP.critical.has(prop)) return 'critical';
  if (SEVERITY_MAP.warning.has(prop))  return 'warning';
  return 'info';
}

/**
 * Normalizes a CSS/Figma value for comparison.
 * - Hex colors → lowercase
 * - RGB/RGBA → nearest hex
 * - px values → rounded integer
 * - everything else → lowercased string
 */
export function normalizeValue(val) {
  if (val == null) return val;
  const str = String(val).toLowerCase().trim();

  if (str.startsWith('#')) return str;

  // Convert rgb(r, g, b) → #rrggbb for color comparison
  const rgbMatch = str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const toHex = (n) => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  if (str.endsWith('px')) {
    return `${Math.round(parseFloat(str))}px`;
  }

  return str;
}

/**
 * Returns true if a borderRadius value represents the "fully rounded" Figma
 * trick (e.g. cornerRadius: 9999). These should be skipped in comparisons
 * because they are design-intent, not a literal pixel value.
 * Threshold: any value > 100px is treated as "pill / fully rounded".
 */
function isFullyRounded(val) {
  if (!val) return false;
  const px = parseFloat(String(val));
  return !isNaN(px) && px > 100;
}

/**
 * Compares a Figma component's properties against live DOM computed styles.
 * Returns an array of drift objects with severity.
 * @param {object} figmaComponent - parsed figma node (from parseFigmaNodes)
 * @param {object} liveStyles     - computed styles extracted from Playwright
 */
export function compareComponent(figmaComponent, liveStyles) {
  const drifts = [];
  if (!figmaComponent?.properties || !liveStyles) return drifts;

  for (const prop of COMPARE_PROPS) {
    const figmaRaw = figmaComponent.properties[prop];
    const liveRaw  = liveStyles[prop];

    if (figmaRaw === undefined || liveRaw === undefined) continue;

    // Fix 3 — skip "fully rounded" borderRadius (Figma 9999px pill trick)
    if (prop === 'borderRadius' && isFullyRounded(figmaRaw)) continue;

    const figmaVal = normalizeValue(figmaRaw);
    const liveVal  = normalizeValue(liveRaw);

    if (figmaVal !== liveVal) {
      drifts.push({
        property: prop,
        figma:    figmaRaw,
        live:     liveRaw,
        severity: getSeverity(prop),
        // keep legacy fields for reporter compatibility
        expected: figmaRaw,
        type:     getSeverity(prop) === 'critical' ? 'typography' :
                  getSeverity(prop) === 'warning'  ? 'spacing' : 'layout'
      });
    }
  }

  return drifts;
}

// ─── Report Generator ─────────────────────────────────────────────────────────

/**
 * Wraps raw comparison results into the canonical Driftwatch report shape.
 * Computes drift score (0–100) and severity counts.
 * @param {array} results - array of { component, drifts, ... }
 */
export function generateReport(results) {
  // Safety-net dedup: if the same component name appears multiple times,
  // keep the entry with the most drifts (most informative).
  const deduped = [];
  const seenNames = new Map();
  for (const r of results) {
    const key = r.name ?? r.component ?? '';
    if (!seenNames.has(key)) {
      seenNames.set(key, deduped.length);
      deduped.push(r);
    } else {
      const idx = seenNames.get(key);
      if ((r.drifts?.length ?? 0) > (deduped[idx].drifts?.length ?? 0)) {
        deduped[idx] = r; // replace with the richer entry
      }
    }
  }

  const totalComponents   = deduped.length;
  const driftedComponents = deduped.filter((r) => (r.drifts?.length ?? 0) > 0);
  const cleanComponents   = deduped.filter((r) => (r.drifts?.length ?? 0) === 0);

  const allDrifts   = driftedComponents.flatMap((r) => r.drifts ?? []);
  const critical    = allDrifts.filter((d) => d.severity === 'critical').length;
  const warning     = allDrifts.filter((d) => d.severity === 'warning').length;
  const info        = allDrifts.filter((d) => d.severity === 'info').length;

  return {
    summary: {
      totalComponents,
      driftedComponents: driftedComponents.length,
      cleanComponents:   cleanComponents.length,
      driftScore: totalComponents > 0
        ? Math.round((cleanComponents.length / totalComponents) * 100)
        : 100,
      critical,
      warning,
      info,
      timestamp: new Date().toISOString()
    },
    components: deduped
  };
}

// ─── Playwright Orchestrator ──────────────────────────────────────────────────

/**
 * Main entry point for the drift check pipeline.
 * Launches Playwright, captures CSS per target, fetches Figma data (if configured),
 * compares properties, and returns structured results.
 *
 * @param {object} config - driftwatch.config.json contents
 * @param {object} hooks  - { onProgress(msg) }
 * @returns {Promise<array>} enriched results array (compatible with reporter)
 */
export async function runCheck(config, hooks = {}) {
  const { onProgress = () => {} } = hooks;
  const targets = config.targets ?? [];

  if (targets.length === 0) throw new Error('No targets defined in config.');

  onProgress('Launching browser...');
  const browser = await chromium.launch({ headless: config._headless !== false });

  const rawResults = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      onProgress(`[${i + 1}/${targets.length}] Capturing: ${target.name}`);

      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });

      const screenshotPath = await captureScreenshot(page, target, config);

      onProgress(`[${i + 1}/${targets.length}] Extracting CSS: ${target.name}`);
      const liveStyles = await extractComputedStyles(page, target.selector);

      await page.close();

      // ── Figma fetch ────────────────────────────────────────────────────────
      let figmaComponent = null;
      const hasToken =
        !config._skipFigma &&
        config.figma?.token &&
        config.figma.token !== 'YOUR_FIGMA_TOKEN';

      if (hasToken) {
        onProgress(`[${i + 1}/${targets.length}] Fetching Figma: ${target.figmaNodeId ?? 'full file'}`);
        try {
          if (target.figmaNodeId) {
            figmaComponent = await fetchFigmaNode(
              config.figma.fileId,
              config.figma.token,
              target.figmaNodeId
            );
          } else {
            // Full file parse — use first component whose name matches the target name
            const all = await fetchFigmaData(config.figma.fileId, config.figma.token);
            figmaComponent = all.find((c) => c.name === target.name) ?? all[0] ?? null;
          }
        } catch (err) {
          console.warn(`  ⚠  Figma fetch failed for "${target.name}": ${err.message}`);
        }
      }

      // ── Compare ────────────────────────────────────────────────────────────
      onProgress(`[${i + 1}/${targets.length}] Comparing: ${target.name}`);
      const drifts = figmaComponent
        ? compareComponent(figmaComponent, liveStyles)
        : [];

      rawResults.push({
        // Legacy shape (used by CLI summary)
        name:           target.name,
        url:            target.url,
        selector:       target.selector,
        figmaNodeId:    target.figmaNodeId,
        screenshotPath,
        liveStyles,
        figmaProps:     figmaComponent?.properties ?? null,
        drifts,
        timestamp:      new Date().toISOString(),
        // Rich shape (used by reporter + generateReport)
        component:      figmaComponent ?? { id: target.figmaNodeId, name: target.name, type: 'UNKNOWN', properties: {} }
      });
    }
  } finally {
    await browser.close();
  }

  return rawResults;
}

// ─── CSS Extraction ───────────────────────────────────────────────────────────

async function extractComputedStyles(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = window.getComputedStyle(el);
    return {
      color:            s.color,
      backgroundColor:  s.backgroundColor,
      fontSize:         s.fontSize,
      fontFamily:       s.fontFamily,
      fontWeight:       s.fontWeight,
      lineHeight:       s.lineHeight,
      letterSpacing:    s.letterSpacing,
      padding:          s.padding,
      paddingTop:       s.paddingTop,
      paddingRight:     s.paddingRight,
      paddingBottom:    s.paddingBottom,
      paddingLeft:      s.paddingLeft,
      margin:           s.margin,
      marginTop:        s.marginTop,
      marginRight:      s.marginRight,
      marginBottom:     s.marginBottom,
      marginLeft:       s.marginLeft,
      borderRadius:     s.borderRadius,
      borderColor:      s.borderColor,
      borderWidth:      s.borderWidth,
      width:            s.width,
      height:           s.height,
      display:          s.display,
      gap:              s.gap,
      alignItems:       s.alignItems,
      justifyContent:   s.justifyContent,
      opacity:          s.opacity,
      boxShadow:        s.boxShadow
    };
  }, selector);
}
