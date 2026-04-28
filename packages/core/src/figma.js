'use strict';

// figma.js — standalone Figma helpers (no circular deps)
// The main orchestration (runCheck) lives in index.js and imports capture.js.
// parseFigmaNodes, rgbToHex, fetchFigmaData, fetchFigmaNode are all in index.js.
// This file exists as a named entry point for external tooling / testing.

// Nothing extra needed here — index.js is the canonical export.
// Direct consumers should import from '@driftwatch/core' (resolves to index.js).
