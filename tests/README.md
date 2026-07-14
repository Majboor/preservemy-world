# Test suite

Automated tests for the preservemy.world landing site + 3D flight demo.
Two layers, both wired into CI (`.github/workflows/tests.yml`):

## Unit (`tests/unit/`) — no dependencies

Runs on the Node.js built-in test runner against the source files directly.

```bash
npm run test:unit          # node --test "tests/unit/*.test.mjs"
```

- **structure.test.mjs** — doctype/lang/charset, viewport, `<title>`, Open
  Graph + Twitter metadata, in-page anchors resolve to real ids, and the
  opportunity-form program set stays consistent across the buttons, the JS
  `formNames` map, and the default iframe.
- **assets.test.mjs** — every local `src`/`poster`/`href`/`data-full-*` and
  CSS `url(...)` reference (including `@font-face` fonts) points at a file that
  exists on disk; lite-mode videos have poster fallbacks.
- **config.test.mjs** — `places.json` and the PWA `manifest.webmanifest` are
  valid and their media exist; `demo-game/serve.py` sets the COOP/COEP headers
  SparkJS needs for `SharedArrayBuffer`.

## E2E smoke (`tests/e2e/`) — Playwright + Chromium

Serves the static site with `python3 -m http.server` (port 9066, configurable
via `PMW_PORT`) and drives it headless.

```bash
npm install
npm run test:e2e:install   # one-time: downloads the Chromium browser
npm run test:e2e           # playwright test
```

- **landing.spec.mjs** — page loads, the intro loader clears, hero + primary
  sections render, nav links resolve, footer social links are present and use
  `rel="noopener"`, and no uncaught page errors are thrown.
- **forms.spec.mjs** — selecting each program activates exactly that button and
  repoints the embedded Google Form iframe; the "Upload a memory" CTA jumps to
  the form and selects creator-access.
- **demo-game.spec.mjs** — boots `demo-game/serve.py` and asserts the flight
  demo is served with COOP/COEP cross-origin isolation headers and a reachable
  PWA manifest.

## Everything

```bash
npm test
```
