# 079 — Open source prep: security review and README

**Status:** Done (2026-05-18).

**Design skill:** N/A (docs + process); UI changes only if README links to screenshots.

## Why this story exists

Before publishing GrokForge as an **open source** repository, contributors and users need a **trustworthy** README and the team needs confidence there are no **embarrassing** security footguns in the default configuration, IPC surface, and dependency stack.

## Goals

1. **README overhaul** aimed at **developers**, not marketing:
   - What GrokForge is in one paragraph.
   - **Prerequisites** (Node version, OS notes).
   - **Clone → install → dev → build → test** commands with correct links to **`AGENTS.md`** and **`project_tasks/README.md`**.
   - **Security & keys:** where API keys live (main process, `safeStorage`), what is **not** sent to the renderer, link to threat-model notes in **`AGENTS.md`**.
   - **License** block if applicable; **CoC / Contributing** pointers if adopted.
2. **Structured review pass** (checklist-driven, recorded in PR or `docs/` if you add a short `SECURITY.md`):
   - IPC allowlist / validation on privileged handlers (`src/main/main.ts` and friends).
   - **`contextIsolation` / `nodeIntegration`** settings unchanged unless documented exception.
   - **Shell / terminal** policy alignment with **053** / **`AGENTS.md`** (trusted-developer framing).
   - **Dependency audit:** `npm audit` triage; document accepted risks.
3. **No secrets** in repo: verify `.gitignore` for `.env`, keys, `userData` paths in fixtures.

## Scope

- **`README.md`** (repo root).
- Optionally **`CONTRIBUTING.md`**, **`SECURITY.md`** (contact / disclosure policy — can be minimal “open an issue” v1).
- **`AGENTS.md`** touch-up only if README references drift from reality.

## Deliverables

- Updated **`README.md`** merged as the default GitHub landing content.
- A **review log** (issue comment, PR description, or `docs/oss-review-2026.md`) listing reviewers, date, and checked boxes—lightweight accountability.

## Testing

- Run **`npm run build`**, **`npm run test`**, **`npm run typecheck`** after doc-affecting changes to scripts (if any).
- Validate all **relative links** in README from a fresh clone path.

## Acceptance criteria

- [x] README allows a new contributor to run the app **without** reading Discord/slack.
- [x] Security/threat notes for **keys**, **IPC**, and **terminal** are accurate vs code.
- [x] No plaintext secret patterns in tracked files (spot-check + `.gitignore` review).
- [x] Core CI commands documented match **`package.json`** scripts.

## Related stories

- **[080](080-open-source-prep-stories-and-tasks-hygiene.md)** — task index and contributor navigation.

## Completion bookkeeping

When done: mark **079** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
