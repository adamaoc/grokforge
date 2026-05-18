# E2E / smoke tests (019, 037)

Fast build smoke and policy tests:

```bash
npm run test:e2e
```

This runs **`npm run build`** then **Vitest** with `vitest.e2e.config.ts` (headless): checks **`dist/`** layout and **`run-command-policy`** (imported directly — agent spawn path, not renderer IPC). See also `project_tasks/019-qa-e2e-and-accessibility-pass.md`.

Electron UI E2E:

```bash
npm run test:e2e:ui
```

This runs **`npm run build`** then **Playwright** with `playwright.e2e.config.ts`. The suite launches `electron dist/main/main.js` against the built renderer, creates isolated temp `userData` and workspace folders, and uses env-gated test hooks for deterministic project picking and mocked agent replies.

Useful local debugging:

```bash
npm run test:e2e:ui:headed
```

Failure artifacts are written under `test-results/e2e-ui`; the HTML report is under `playwright-report/e2e-ui`.

For dependency/runtime upgrade checks, use the full compatibility checklist in [`../docs/dependency-runtime-watchlist.md`](../docs/dependency-runtime-watchlist.md).
