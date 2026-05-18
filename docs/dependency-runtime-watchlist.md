# Dependency and Runtime Watchlist

This note is the lightweight maintenance checklist for GrokForge dependencies and runtime compatibility. It is meant to make upgrades deliberate, boring, and easy to verify across Electron main, preload, and renderer boundaries.

## Runtime Assumptions

- **Node.js:** develop and CI against Node **22 LTS**. Newer local Node versions may work, but dependency or Electron tooling issues should be reproduced on Node 22 before changing code.
- **npm:** use the npm version bundled with Node 22 unless a project-level tooling change says otherwise.
- **Package manager:** npm with `package-lock.json`. Dependency PRs should include lockfile changes.
- **Desktop OS:** macOS is the primary development target today. Windows and Linux should remain build-conscious, but platform-specific behavior such as mic permissions, shell commands, paths, and secure key storage need explicit smoke testing before claiming support.
- **Electron runtime:** renderer code runs inside Electron/Chromium, not a generic browser. Main/preload code run in Electron's Node context.
- **Production target:** `npm run start` expects built output under `dist/`; the main process loads `dist/renderer/index.html` unless `ELECTRON_RENDERER_URL` is set by electron-vite dev.
- **App data:** project storage, recents, indexes, chat logs, and saved keys live under Electron `userData`; tests that touch these paths must isolate `userData`.

## Watchlist Packages

High-attention packages:

- `electron`
- `electron-vite`
- `vite`
- `react`
- `react-dom`
- `@monaco-editor/react`
- `monaco-editor`
- `framer-motion`
- `@radix-ui/*`
- `tailwindcss`
- `typescript`
- `vitest`
- `@playwright/test`
- `ws`
- `zod`
- `react-markdown`
- `rehype-sanitize`
- `remark-*`

Why these need attention:

- **Electron:** affects security defaults, permissions, packaged behavior, `safeStorage`, preload isolation, native dialogs, and process APIs.
- **electron-vite / Vite:** affects build output shape for `dist/main`, `dist/preload`, and `dist/renderer`, plus renderer aliases and asset loading.
- **React:** affects rendering semantics and third-party UI wrappers.
- **Monaco:** affects editor workers, bundling, focus behavior, and large renderer chunks.
- **Radix / shadcn-style primitives:** affects dialogs, focus traps, aria behavior, menus, and keyboard interaction.
- **Tailwind:** affects generated class output and design tokens.
- **Markdown / sanitize:** affects chat rendering safety.
- **ws:** affects xAI realtime voice WebSocket behavior.
- **Zod / TypeScript:** affects manifest validation, shared contracts, and strict type boundaries.
- **Vitest / Playwright:** affects confidence in build smoke, policy tests, and Electron UI harnesses.

## Upgrade Policy

- **Patch updates:** okay opportunistically after the checklist passes.
- **Minor updates:** prefer grouped maintenance PRs with a short note about watchlist packages touched.
- **Major updates:** create a focused story/task and read changelogs first.
- **Electron major updates:** always treat as a security and packaging review. Check preload isolation, permission prompts, `safeStorage`, app `userData`, and production startup.
- **React major/minor updates:** verify Radix primitives, Monaco editor behavior, Framer Motion animations, markdown rendering, and settings/dialog focus.
- **Monaco updates:** verify open/edit/save, layout resize, search-result line jumping, and production renderer asset loading.
- **xAI API behavior:** API/model changes should be documented near the relevant main-process integration; do not expose API keys to the renderer to work around incompatibilities.

Avoid upgrading dependency clusters while doing unrelated product work unless the change is required for that story.

## Compatibility Checklist

Before merging dependency/runtime changes, run:

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run test:e2e:ui
```

Manual smoke:

- `npm run dev`
- `npm run start` after `npm run build`
- open a temporary project
- reopen a recent project
- expand the file tree
- open a Monaco file
- edit and save a file
- search for known text and open a result
- send a mocked or real chat message
- apply a structured pending-write batch if touched code affects chat/file writes
- preview agent context
- run a harmless terminal command
- open Settings and verify API key status renders without a real key
- verify voice controls render; only test real mic/realtime behavior when the change touches media, permissions, `ws`, or xAI realtime

For UI or interaction-library upgrades, also check:

- icon-only buttons have accessible names
- dialogs trap focus and close with Escape
- menus are keyboard reachable
- disabled controls expose disabled state
- text still fits in compact controls

## Security and Audit Notes

- `npm audit` findings are actionable when they affect shipped Electron main/preload/renderer code or build-time tooling with realistic developer impact.
- Document exceptions when a finding is in unused transitive tooling, requires an unavailable attack path, or needs a breaking upgrade scheduled for a separate story.
- Do not weaken Electron security settings to make an upgrade pass. Preserve `contextIsolation: true`, `nodeIntegration: false`, and the preload IPC boundary unless a dedicated security-reviewed story says otherwise.

## Done Definition for Dependency Work

A dependency/runtime maintenance change is done when:

- lockfile and package changes are intentional
- watchlist package changes are called out in the PR/story notes
- typecheck, unit tests, build smoke, and UI E2E pass or exceptions are documented
- dev and built app launch paths are considered
- any runtime assumption changes are reflected in this document
