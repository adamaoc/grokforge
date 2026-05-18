# 037 — Playwright + Electron UI E2E harness

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing tested UI flows, focus behavior, or accessibility states.

## Why this story exists

Current E2E coverage is intentionally lightweight: `npm run test:e2e` builds the app and runs headless Vitest smoke tests over built artifacts and policy logic. That was a good early choice because it kept CI simple while the app was moving fast.

GrokForge is now crossing into workflows that need real UI confidence: project picker, file tree, Monaco tabs, chat streaming, pending writes, settings, voice permissions, terminal approval, and future tool activity. Those cannot be fully trusted through module tests alone.

## Summary

Add a Playwright-based Electron UI test harness that can launch the built or dev app, drive core flows, and capture screenshots/traces for debugging. Keep the current Vitest smoke tests; add UI E2E as a stronger layer rather than replacing fast tests.

## Goals

- Launch Electron reliably in CI/local test mode.
- Open a temporary workspace project.
- Interact with the actual renderer UI.
- Verify critical flows with realistic IPC/main-process behavior.
- Provide screenshot or trace artifacts for failures.
- Keep tests deterministic and independent of real user data.

## Non-goals

- Do not require a real xAI API key in UI E2E.
- Do not test Monaco internals exhaustively.
- Do not rely on the user’s actual recent projects or app `userData`.
- Do not automate OS microphone permission dialogs in the first pass.

## Harness approach

Recommended:

- Use Playwright’s Electron support or a maintained Electron launch pattern.
- Build app first, then launch `electron dist/main/main.js` or equivalent.
- Set a temporary `userData` location for tests.
- Set env flags for mocked chat/voice behavior.
- Use temporary filesystem roots generated per test.
- Run headed locally when requested, headless in CI.

## Required test fixtures

Create fixture workspaces with:

- small React/Vite-style app
- docs folder
- ignored `node_modules`
- files with distinctive contents for search/read assertions
- package scripts that are safe to run

Fixtures should be generated under temp directories, not committed as bulky sample apps unless needed.

## Initial UI flows

1. **Launch and first project**
   - App opens welcome/project picker.
   - User chooses a temp folder.
   - Shell shows root in sidebar.

2. **File tree and editor**
   - Expand folders.
   - Open a file.
   - Edit text.
   - Save.
   - Assert disk content changed.

3. **Search**
   - Open search panel.
   - Search a known term.
   - Click result.
   - Assert editor opens expected file.

4. **Chat mock**
   - Send message with mocked model response.
   - Assert streaming/thinking state appears and clears.
   - Assert chat message persists across reload/project reopen.

5. **Pending write batch**
   - Mock assistant response containing structured write block.
   - Assert pending updates panel appears.
   - Apply changes.
   - Assert file was written.

6. **Terminal policy UI**
   - Run harmless command.
   - Attempt soft-risk command.
   - Assert confirmation appears.
   - Attempt hard-denied command.
   - Assert denial appears.

7. **Settings/key status**
   - Open settings.
   - Verify API key status UI can render without real key.
   - Save/clear mock-safe key if using isolated test `userData`.

## Accessibility checks

For critical surfaces:

- icon-only buttons have labels
- focus order reaches sidebar, editor tabs, chat input, settings, terminal controls
- dialogs trap focus
- escape closes dialogs
- disabled controls expose disabled state
- small accent text has sufficient contrast

Optional later:

- add `axe-core` scan for stable pages/dialogs.

## CI considerations

- Keep the first suite short.
- Add a separate script, e.g. `npm run test:e2e:ui`.
- Preserve `npm run test:e2e` as the existing fast build smoke unless CI can handle both.
- Document local troubleshooting for display/server issues.

## Testing

The harness itself should be proven by:

- deterministic temp `userData`
- deterministic temp roots
- no dependence on real API keys
- clean shutdown of Electron between tests
- useful screenshots/traces on failure

## Acceptance criteria

- [ ] New Playwright/Electron UI E2E script exists.
- [ ] Test app launches against built renderer, not only Vite dev server.
- [ ] Core project open, file open/edit/save, chat mock, and pending-write flows are covered.
- [ ] Tests use isolated temporary app data and workspace folders.
- [ ] Documentation explains how to run and debug UI E2E locally.
- [ ] Existing fast smoke tests remain available.

