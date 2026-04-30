# DriftwatchJS 🎯

> **Catch design drift before your users do.**  
> Compare your live UI against Figma — automatically.

```bash
npm install -g driftwatchjs
```

[![npm version](https://img.shields.io/npm/v/driftwatchjs.svg)](https://www.npmjs.com/package/driftwatchjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## The Problem

Your designer hands off a beautiful Figma file. Your dev team implements it pixel-perfect. Three months later — after dozens of features, hotfixes, and "quick tweaks" — your live UI has silently drifted from the design. Wrong font sizes. Slightly off colors. Button padding that no longer matches. Nobody caught it.

**DriftwatchJS automates this review.** It fetches your Figma specs, visits your live UI with a real browser, and tells you exactly what's different — with a beautiful report.

---

## How It Works

```
1. Tag your components     →   <button data-driftwatch="Sign In Button">
2. Run driftwatchjs check  →   Figma API + Playwright capture + CSS diff
3. Open the report         →   drift-reports/drift-report.html
```

That's it. No screenshots. No pixel-diffing. Pure CSS property comparison — so it works at every breakpoint and is immune to anti-aliasing noise.

---

## Quick Start

### 1. Install

```bash
npm install -g driftwatchjs
# Playwright Chromium downloads automatically on install
```

### 2. Initialize your config

```bash
cd your-project/
driftwatchjs init
# Creates driftwatch.config.json
```

### 3. Edit your config

Open `driftwatch.config.json` and fill in your details:

```json
{
  "figmaFileKey": "abc123XYZ",
  "figmaToken":   "figd_your_personal_access_token",
  "figmaNodeIds": ["737:9476", "2216:6154"],
  "baseUrl":      "http://localhost:3000",
  "breakpoints":  [375, 768, 1280],
  "out":          "./drift-reports"
}
```

### 4. Tag your components

Add `data-driftwatch="ComponentName"` to any element you want tracked:

```html
<!-- React / JSX -->
<Typography data-driftwatch="Login Heading" variant="h2">
  Sign in to Your Account
</Typography>

<Button data-driftwatch="Sign In Button" type="submit">
  Sign In
</Button>
```

```html
<!-- Plain HTML -->
<h1 data-driftwatch="Hero Heading">Welcome</h1>
<button data-driftwatch="CTA Button">Get Started</button>
```

### 5. Run the check

```bash
driftwatchjs check
```

```
  ✓ Figma data fetched — 142 components found (via nodeIds)
  ✓ Live UI captured — 7 elements found
  ✓ Comparison complete
  ✓ Report saved to ./drift-reports/

  ────────────────────────────────────────────────────
  📊 DRIFT SUMMARY

  Drift Score:      71%
  Total Checked:   7 components
  Clean:           ✓ 5 components
  Drifted:         ✖ 2 components

  ● Critical:  2 issues
  ● Warning:   1 issue

  🔍 DRIFTED COMPONENTS

  Sign In Button
    ● color: rgb(255, 255, 255) → should be #f5f5f5
    ● fontSize: 14px → should be 16px

  Login Heading
    ● fontWeight: 600 → should be 700
```

---

## Two Modes

### Mode 1: Manual (Recommended for Component Testing)

Tag specific elements with `data-driftwatch`. You control exactly what gets compared.

```json
{
  "mode": "manual"
}
```

```html
<input data-driftwatch="Email Input" name="email" />
<input data-driftwatch="Password Input" name="password" />
<button data-driftwatch="Sign In Button">Sign In</button>
```

**Best for:** Targeted component audits, form elements, specific design system components.

---

### Mode 2: Auto-Scan (Recommended for Full Page/Module Testing)

No need to tag anything. Driftwatch automatically scans all visible elements inside a container selector.

```json
{
  "mode": "auto-scan",
  "selector": "#dashboard"
}
```

Elements are named automatically by tag + index: `h1-1`, `button-1`, `input-2`, etc.

**Best for:** Scanning entire pages, dashboards, or layout sections quickly.

---

## Full Config Reference

```json
{
  "figmaFileKey": "S6h31XxPKNCNSP4uLZOkiR",
  "figmaToken":   "figd_your_token_here",
  "figmaNodeIds": ["737:9476", "2216:6154"],
  "baseUrl":      "http://localhost:3000",
  "breakpoints":  [375, 768, 1280],
  "out":          "./drift-reports",
  "threshold":    0.05,
  "mode":         "manual",
  "selector":     null,
  "auth": {
    "loginUrl":          "http://localhost:3000/login",
    "usernameSelector":  "input[name='email']",
    "passwordSelector":  "input[name='password']",
    "submitSelector":    "button[type='submit']",
    "username":          "your-email@example.com",
    "password":          "your-password",
    "waitAfterLogin":    3000
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `figmaFileKey` | string | ✅ | Your Figma file key (from the URL: `figma.com/file/{KEY}/...`) |
| `figmaToken` | string | ✅ | Figma personal access token (Settings → Personal access tokens) |
| `figmaNodeIds` | string[] | ⭐ Recommended | Specific node IDs to fetch — faster and avoids rate limits |
| `baseUrl` | string | ✅ | Your local dev server URL |
| `breakpoints` | number[] | optional | Viewport widths to test (default: `[1280]`) |
| `out` | string | optional | Output directory for reports (default: `./drift-reports`) |
| `threshold` | number | optional | Tolerance ratio for minor differences (default: `0.05`) |
| `mode` | `"manual"` \| `"auto-scan"` | optional | Element capture mode (default: `"manual"`) |
| `selector` | string | auto-scan only | CSS selector for the auto-scan container (e.g. `"main"`, `"#app"`) |
| `auth` | object | optional | Auth config for login-protected pages (see below) |

---

## Auth Config — Protected Pages

If your app requires login, add the `auth` block:

```json
{
  "auth": {
    "loginUrl":         "http://localhost:3000/login",
    "usernameSelector": "input[name='email']",
    "passwordSelector": "input[name='password']",
    "submitSelector":   "button[type='submit']",
    "username":         "test@example.com",
    "password":         "testPassword123",
    "waitAfterLogin":   3000
  }
}
```

Driftwatch will:
1. Navigate to `loginUrl`
2. Fill in credentials
3. Click the submit button
4. Wait `waitAfterLogin` ms for the redirect
5. **Verify the login succeeded** (if still on the login page, throws a clear error)
6. Then proceed to capture your target page using the authenticated session

> **Remove the `auth` block entirely** if your target page doesn't require login.

---

## Figma Node IDs — Avoid Rate Limits

The Figma `/files` endpoint is aggressively rate-limited. If you hit `429 Too Many Requests`, the fix is simple: add `figmaNodeIds` to your config.

**How to find node IDs:**
1. Open your Figma file
2. Right-click a frame or component → **Copy link**
3. The link looks like: `...?node-id=2216-6154`
4. Convert the dash to a colon: `2216:6154`

```json
{
  "figmaNodeIds": ["2216:6154", "737:9476"]
}
```

Driftwatch will batch all IDs into a **single API call** instead of fetching the entire file — much faster and far less likely to be rate-limited.

---

## CLI Reference

```bash
# Run drift check (uses ./driftwatch.config.json)
driftwatchjs check

# Skip Figma API — capture and report live styles only
driftwatchjs check --skip-figma

# Use a different config file
driftwatchjs check --config ./my-config.json

# Override the target URL
driftwatchjs check --url http://localhost:3001

# Override the output directory
driftwatchjs check --out ./reports

# Create a starter config
driftwatchjs init
```

---

## Report Output

After every run, two files are written to `./drift-reports/` (or your configured `out` dir):

### `drift-report.html`
A dark-themed, interactive HTML report with:
- 📊 Drift score (0–100%)
- 📸 Screenshots at each breakpoint
- 🔍 Per-component drift cards with property-level diffs
- 🔴 🟡 🔵 Severity badges (Critical / Warning / Info)

### `drift-report.json`
Machine-readable JSON — perfect for CI parsing:
```json
{
  "summary": {
    "totalComponents": 7,
    "driftedComponents": 2,
    "cleanComponents": 5,
    "driftScore": 71,
    "critical": 2,
    "warning": 1,
    "info": 0
  },
  "components": [...]
}
```

---

## CI/CD Integration

DriftwatchJS exits with **code `1`** when critical drift is detected, **code `0`** when clean. Drop it into any CI pipeline:

### GitHub Actions

```yaml
# .github/workflows/drift.yml
name: Design Drift Check

on:
  push:
    branches: [main, staging]
  pull_request:

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install DriftwatchJS
        run: npm install -g driftwatchjs

      - name: Start dev server
        run: npm run dev &
        # Wait for server to be ready
      - run: npx wait-on http://localhost:3000

      - name: Run drift check
        run: driftwatchjs check
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}

      - name: Upload drift report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: drift-report
          path: drift-reports/
```

> **Store your Figma token** as `FIGMA_TOKEN` in GitHub → Settings → Secrets.

### Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| `0` | ✅ No critical drift — pipeline continues |
| `1` | ❌ Critical drift detected — pipeline fails |

---

## Severity Levels

| Severity | Properties | Impact |
|----------|------------|--------|
| 🔴 **Critical** | `color`, `fontSize`, `fontFamily` | Visible to users immediately |
| 🟡 **Warning** | `borderRadius`, `padding*`, `fontWeight`, `gap` | Subtle layout differences |
| 🔵 **Info** | `letterSpacing`, `lineHeight`, `opacity`, `width`, `height`, `borderColor`, `borderWidth` | Minor variations |

Only **critical** drift causes a CI pipeline failure (`exit 1`).

---

## Troubleshooting

### `429 Too Many Requests`
Figma is rate-limiting your requests.
**Fix:** Add `figmaNodeIds` to your config to fetch only the nodes you need instead of the entire file.

```json
{ "figmaNodeIds": ["2216:6154", "737:9476"] }
```

### `Invalid Figma token`
Your `figmaToken` is wrong or expired.
**Fix:** Go to Figma → Settings → Personal access tokens → create a new token with `file_content:read` scope.

### `Login failed: still on login page`
Wrong credentials or the login form selector is incorrect.
**Fix:** Check `username`, `password`, `usernameSelector`, `passwordSelector` in your `auth` config. Test the selectors in your browser's DevTools.

### `net::ERR_CONNECTION_REFUSED`
Your dev server isn't running.
**Fix:** Start your dev server first (`npm run dev`), then run `driftwatchjs check`.

### `No data-driftwatch attributes found`
No tagged elements on the page.
**Fix:** Either add `data-driftwatch="Name"` attributes to your components, or switch to `"mode": "auto-scan"` in your config.

### `Failed to generate report`
Output directory can't be written.
**Fix:** Check write permissions on the `out` directory. Try `"out": "./drift-reports"`.

---

## Monorepo Structure

```
driftwatchjs/
├── packages/
│   ├── cli/
│   │   ├── bin/driftwatch.js   → CLI entry point (commander.js)
│   │   └── src/capture.js      → Playwright DOM capture (manual + auto-scan)
│   ├── core/
│   │   └── src/index.js        → Figma API + CSS comparator + report generator
│   ├── reporter/
│   │   └── src/                → HTML + JSON report templates
│   └── extension/              → Browser extension (coming soon)
├── scripts/
│   └── demo.js                 → End-to-end demo runner
├── driftwatch.config.example.json
└── README.md
```

---

## Roadmap

- [ ] 🔌 **Browser extension** — tag elements visually, no code changes needed
- [ ] 📱 **Mobile viewport testing** — test multiple breakpoints in parallel
- [ ] 🎨 **Color tolerance** — delta-E color comparison for near-match colors
- [ ] 🧩 **Storybook integration** — compare components directly against Storybook stories
- [ ] 📧 **Slack / Teams notifications** — drift alerts in your team chat
- [ ] 🌐 **Cloud hosted reports** — share drift reports via URL

---

## Contributing

Found a bug? Have an idea? PRs and issues are very welcome.

```bash
git clone https://github.com/vcyvox/driftwatch.git
cd driftwatch
npm install
npm run check   # runs the CLI against the example config
```

Please follow the existing code style (ESM, no TypeScript, JSDoc comments).

---

## License

MIT © [Vicky](https://github.com/vcyvox)
