# 055 — Retire command runner or reframe it as task runner

**Status:** Done (Option A shipped).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` if changing terminal/task UI, command forms, or panel placement.

## Shipped (Option A)

- **Human UI:** The terminal surface is **PTY + xterm.js** only (`TerminalPanel.tsx`, `terminal-session-*` IPC). There is **no** dedicated one-shot “run command” form for users.
- **Agent path:** Model-requested commands use the **`run_command`** tool with in-chat approval (**059**). Execution is **`runCommandInRootForAgent`** in **`src/main/run-command.ts`** (main process only). **No** renderer `run-command` IPC, **`runCommand` / `onRunCommandChunk` / `onRunCommandStarted`** preload APIs, or `ipcMain.handle('run-command')`.
- **Policy & tests:** **`run-command-policy.ts`** and **`e2e/terminal-policy.test.ts`** (direct policy import) remain the safety net for the agent spawn path.
- **Docs:** **`AGENTS.md`**, root **`README.md`**, **`run-command-contract.ts`** header, **`terminal-session-contract.ts`**, **`.cursor/rules/electron-main-preload.mdc`**, and **017** status note updated to describe the split.

**Deferred:** Option B (“Tasks” panel with presets) — not planned unless product revisits; would be a new story.

## Why this story existed

The early “terminal” was a one-shot command runner. After **050–052**, a real terminal shipped; this story closed the loop by **retiring the human IPC path** and documenting that **`run_command`** is **agent infrastructure**, not a second terminal.

## Acceptance criteria

- [x] Product UI no longer presents one-shot command runner as “the terminal.”
- [x] `run-command` is **hidden main infrastructure** for the approved agent tool only (not a task runner UI).
- [x] Docs explain the distinction between **PTY (human)** and **guarded spawn (agent)**.
- [x] Policy tests remain on the agent command path.
- [x] No duplicate terminal surfaces for the same human workflow.

## Key files (reference)

- `src/main/run-command.ts`, `src/main/run-command-policy.ts`, `src/main/agent-runner.ts`
- `src/main/main.ts` (no `run-command` handler)
- `src/preload/preload.ts`, `src/shared/preload-api-contract.ts`
- `AGENTS.md`, `README.md`

## Completion bookkeeping

Marked **055** done in this file; **`project_tasks/README.md`** and **`npm run stories:html`** updated with this closure.
