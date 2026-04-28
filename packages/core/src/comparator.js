'use strict';

/**
 * Compare live CSS properties against Figma design properties.
 * Returns an array of drift objects.
 */
export function compareProperties(liveStyles, figmaProps, thresholds = {}) {
  const drifts = [];

  if (!figmaProps || !liveStyles) {
    // No Figma data — return empty (CSS-only mode)
    return drifts;
  }

  const {
    colorDeltaE = 2,
    spacingPx = 4,
    fontSizePx = 1,
    borderRadiusPx = 2
  } = thresholds;

  // ── Color properties ──────────────────────────────────────────────────────
  const colorProps = ['color', 'backgroundColor', 'borderColor'];
  for (const prop of colorProps) {
    if (figmaProps[prop] != null && liveStyles[prop] != null) {
      const delta = colorDistance(parseColor(figmaProps[prop]), parseColor(liveStyles[prop]));
      if (delta > colorDeltaE) {
        drifts.push({
          property: prop,
          expected: figmaProps[prop],
          live: liveStyles[prop],
          delta,
          type: 'color'
        });
      }
    }
  }

  // ── Spacing properties ───────────────────────────────────────────────────
  const spacingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap'];
  for (const prop of spacingProps) {
    if (figmaProps[prop] != null && liveStyles[prop] != null) {
      const expected = parsePx(figmaProps[prop]);
      const live = parsePx(liveStyles[prop]);
      if (Math.abs(expected - live) > spacingPx) {
        drifts.push({
          property: prop,
          expected: figmaProps[prop],
          live: liveStyles[prop],
          delta: Math.abs(expected - live),
          type: 'spacing'
        });
      }
    }
  }

  // ── Font size ─────────────────────────────────────────────────────────────
  if (figmaProps.fontSize != null && liveStyles.fontSize != null) {
    const expected = parsePx(figmaProps.fontSize);
    const live = parsePx(liveStyles.fontSize);
    if (Math.abs(expected - live) > fontSizePx) {
      drifts.push({
        property: 'fontSize',
        expected: figmaProps.fontSize,
        live: liveStyles.fontSize,
        delta: Math.abs(expected - live),
        type: 'typography'
      });
    }
  }

  // ── Font weight ───────────────────────────────────────────────────────────
  if (figmaProps.fontWeight != null && liveStyles.fontWeight != null) {
    if (String(figmaProps.fontWeight) !== String(liveStyles.fontWeight)) {
      drifts.push({
        property: 'fontWeight',
        expected: String(figmaProps.fontWeight),
        live: String(liveStyles.fontWeight),
        delta: null,
        type: 'typography'
      });
    }
  }

  // ── Border radius ─────────────────────────────────────────────────────────
  if (figmaProps.borderRadius != null && liveStyles.borderRadius != null) {
    const expected = parsePx(figmaProps.borderRadius.split(' ')[0]);
    const live = parsePx(liveStyles.borderRadius.split(' ')[0]);
    if (Math.abs(expected - live) > borderRadiusPx) {
      drifts.push({
        property: 'borderRadius',
        expected: figmaProps.borderRadius,
        live: liveStyles.borderRadius,
        delta: Math.abs(expected - live),
        type: 'layout'
      });
    }
  }

  // ── Border width ──────────────────────────────────────────────────────────
  if (figmaProps.borderWidth != null && liveStyles.borderWidth != null) {
    const expected = parsePx(figmaProps.borderWidth);
    const live = parsePx(liveStyles.borderWidth);
    if (Math.abs(expected - live) > 0.5) {
      drifts.push({
        property: 'borderWidth',
        expected: figmaProps.borderWidth,
        live: liveStyles.borderWidth,
        delta: Math.abs(expected - live),
        type: 'layout'
      });
    }
  }

  return drifts;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Parse px value to number */
function parsePx(value) {
  return parseFloat(value) || 0;
}

/** Parse CSS/Figma color string to {r, g, b} (0–255) */
function parseColor(str) {
  if (!str) return { r: 0, g: 0, b: 0 };

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3])
    };
  }

  // #hex
  const hexMatch = str.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16)
    };
  }

  return { r: 0, g: 0, b: 0 };
}

/**
 * Simple Euclidean distance in RGB space (approximate ΔE).
 * A proper CIEDE2000 would be used for production.
 */
function colorDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  // Weighted per human perception
  return Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
}
