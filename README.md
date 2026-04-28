# Driftwatch 🎯

> **Figma → Live UI Drift Detector**  
> Catch visual regressions before your users do.

Driftwatch compares your live production UI against your Figma designs by fetching design specs via the Figma REST API, capturing your live UI with Playwright, and diffing computed CSS properties side-by-side.

---

## Features

- 🎨 **Figma API integration** — pulls colors, spacing, typography, border radius from design nodes
- 🤖 **Playwright capture** — headless browser screenshot + computed CSS extraction
- 📊 **Beautiful HTML report** — dark-themed, collapsible cards per target, property-level diff table
- 📁 **JSON output** — CI-friendly structured report
- ⚡ **CSS-only mode** — run without a Figma token to audit live styles standalone
- 🔧 **Configurable thresholds** — tolerance per property type (ΔE for color, px for spacing)

---

## Quick Start

```bash
# Install globally — Playwright Chromium downloads automatically
npm install -g driftwatchjs

# Initialize config in your project
driftwatchjs init

# Edit driftwatch.config.json with your Figma token + targets
# Tag your components:  <div data-driftwatch="Hero Section">

# Run drift check
driftwatchjs check
```

---

## Demo (no Figma token needed)

```bash
node scripts/demo.js
```

This spins up a local demo page, runs the full pipeline, and saves a report to `./drift-report/index.html`.

---

## Configuration

```json
{
  "figma": {
    "token": "YOUR_FIGMA_TOKEN",
    "fileId": "YOUR_FIGMA_FILE_ID"
  },
  "targets": [
    {
      "name": "Hero Section",
      "url": "http://localhost:3000",
      "selector": ".hero",
      "figmaNodeId": "123:456"
    }
  ],
  "output": {
    "dir": "./drift-report",
    "format": ["html", "json"]
  },
  "thresholds": {
    "colorDeltaE": 2,
    "spacingPx": 4,
    "fontSizePx": 1,
    "borderRadiusPx": 2
  }
}
```

---

## CLI Commands

| Command | Description |
|---|---|
| `npx driftwatch init` | Create `driftwatch.config.json` |
| `npx driftwatch check` | Run drift detection |
| `npx driftwatch check --skip-figma` | CSS capture only (no Figma API) |
| `npx driftwatch check --config ./my.config.json` | Custom config path |
| `npx driftwatch check --output ./reports` | Custom output dir |

---

## Monorepo Structure

```
driftwatch/
├── packages/
│   ├── cli/         → npx driftwatch (commander.js)
│   ├── core/        → comparison engine (Figma API + Playwright + diff)
│   ├── reporter/    → HTML + JSON report generator
│   └── extension/  → browser extension (coming soon)
├── scripts/
│   └── demo.js     → end-to-end demo runner
├── driftwatch.config.json
└── README.md
```

---

## CI Integration

```yaml
# .github/workflows/drift.yml
- name: Run Driftwatch
  run: npx driftwatch check
  env:
    FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
```

Add `driftwatch check` to your CI pipeline — it exits with code `1` if drift is detected, `0` if clean.

---

## License

MIT
