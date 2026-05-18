# Open source readiness review — 2026-05-18

Lightweight checklist for story **079** (pre-public OSS). **Reviewer:** Adam Moore (self-review). **Repository intent:** `https://github.com/adamaoc/grokforge`

## README & contributor path

- [x] README documents clone → install → dev, prerequisites (Node 22, xAI API key), and links to `AGENTS.md` and `project_tasks/README.md`.
- [x] `npm run` scripts documented align with `package.json`.

## Security & threat model (vs `AGENTS.md`)

- [x] **API keys:** Resolved in the **main** process only; renderer sees masked status via IPC; Settings uses `safeStorage` when saving in-app (see `AGENTS.md` / `xai-key-store.ts`).
- [x] **Renderer isolation:** `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false` (`src/main/main.ts`).
- [x] **IPC:** Privileged work stays in main; renderer uses preload `window.electron` only (see `AGENTS.md`).
- [x] **Terminal / shell:** Human PTY sessions vs agent **guarded** `run_command` after approval — framed as **trusted-developer tooling**, not containment (`AGENTS.md`, story **053**).

## Secrets & repo hygiene

- [x] `.gitignore` includes `.env` and common local env variants; spot-check for tracked secrets (none expected).
- [x] No API keys or tokens committed in this review pass.

## Dependencies

- [x] **`npm audit`** (2026-05-18): **0** reported vulnerabilities at audit time. Re-run before releases; Electron stacks often fluctuate — triage and document any future accepted risk in this file if needed.

## Legal / licensing

- [x] Root **`LICENSE`**: MIT, Copyright (c) 2026 Adam Moore.

## Follow-ups (optional)

- GitHub Actions CI (not required for initial public push).
- Enable **Private vulnerability reporting** in the GitHub repo settings when the repository is created.

## Story **080** — `project_tasks` hygiene (same review pass)

- [x] [`project_tasks/README.md`](../project_tasks/README.md): progress table, **Next up** / last-progress lines, story-file convention block, note on skipped **076**.
- [x] Every `NNN-*.md` and `post-mvp/*.md` story includes **`## Completion bookkeeping`** pointing at `README.md` + `stories.html` regeneration.
- [x] Root [`CONTRIBUTING.md`](../CONTRIBUTING.md): “How we use `project_tasks`” section.
- [x] [`project_tasks/stories.html`](../project_tasks/stories.html) regenerated via `npm run stories:html`.
