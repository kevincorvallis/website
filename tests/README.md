# Dispatch / klee.page tests

A layered test pyramid: Playwright as executor, AI tooling on top for resilience, visual regression alongside.

```
tests/cli/      curl-based API smoke — fastest, no browser
tests/smoke/    Playwright DOM + interaction smoke — runs on every push
tests/visual/   Screenshot regression — can pipe to Percy/Applitools
tests/ai/       Stagehand AI-resilient tests — optional, needs OPENAI_API_KEY
```

## Running

```bash
npm install
npm run test:install            # one-time chromium download
npm test                        # full suite against https://klee.page
npm run test:smoke              # smoke + CLI only (no visual)
npm run test:visual             # visual regression
npm run test:ui                 # interactive Playwright UI
PW_BASE_URL=http://localhost:8080 npm test   # against local dev
```

## Adding Percy (visual regression at scale)

Free tier covers 5,000 snapshots/month:

```bash
npm i -D @percy/cli @percy/playwright
# Replace toHaveScreenshot calls in tests/visual/snapshots.spec.js with:
#   const percySnapshot = require('@percy/playwright');
#   await percySnapshot(page, 'name');
percy exec -- npm run test:visual
```

## Adding Stagehand (AI-resilient tests)

```bash
npm i -D @browserbasehq/stagehand
export OPENAI_API_KEY=...
# Enable tests/ai/stagehand.example.spec.js (remove .skip)
npm test tests/ai
```

Cost: ~$0.01 per test run. Run on schedule, not every push.
