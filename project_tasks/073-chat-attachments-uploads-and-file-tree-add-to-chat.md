# 073 — Chat attachments: uploads and file tree “Add to chat”

**Status:** Done (v1: staging IPC, composer attach + drag-drop, tree “Add to chat”, caps + allowlist; images path-only / no vision).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing file tree menus, composer chips, or drag-drop (`@styleguide-design`).

## Why this story exists

Users need to ground the model on **binary and document context** (screenshots, PDFs, logs) and on **specific workspace paths** without typing absolute paths. Cursor-style **“Add to chat”** from the file tree and an **explicit attachment** flow reduce friction and errors.

## Goals

1. **Upload** at least **images** and common **documents** (pdf, txt, md — exact list TBD) into the chat **context** for the next message (and agent turns where applicable).
2. **File tree context menu** entry **“Add to chat”** (or equivalent) for files and folders, appending to the same **`activeContext.attachments`** (or extended contract) used by `agent-chat-start`.
3. **Composer UI:** show removable **chips** for each attachment (path, type icon, optional thumbnail for images).
4. **Limits:** max count, max **total** bytes, and **MIME allowlist**; graceful errors surfaced via toasts, never silent drops.

## Scope

### Contract

- **`AgentChatActiveContext.attachments`** in `src/shared/agent-chat-contract.ts` today supports `{ type: 'file' | 'folder'; path }`.
- Extend only if required (e.g. `source: 'workspace' | 'upload'`, `mediaType`, `displayName`, `tempId`). Prefer **absolute paths under roots** for workspace items; uploads may need **`userData`** staging + IPC that reads bytes in **main** only.

### Main process

- New or extended IPC: e.g. **`save-chat-attachment`** returning a **sandboxed path** under app `userData` the agent is allowed to read; or base64 for small images (watch payload size vs IPC limits—prefer **path + main read** for agent ingestion).
- **`agent-context.ts` / retrieval:** define how uploaded files participate in lexical retrieval vs **message-only** attachment blocks (product decision).

### Renderer

- **`ChatThread.tsx`**: wire **file input** (hidden) + drag-drop onto composer (optional v1.1).
- **File tree** component(s): context menu item calling into shared **`setChatAttachments`** state in `App.tsx` (or context provider).
- **Security:** never send arbitrary paths from renderer without main validating against **`manifest.roots`**.

## UX direction

- Chips truncate middle of long paths; full path in tooltip.
- **Folder** attachment semantics: document whether the agent gets a directory listing hint or “folder path only” in v1.

## Open questions

- Do **images** go through **vision** model path (future) or as **extracted text / OCR** stub in v1? **→ v1: path reference + read_file for text; no vision/OCR (noted in active context block).**
- Max attachment size per file and total per message aligned with **`AGENT_CHAT_MAX_ATTACHMENTS`** (already in contract). **→ See `src/shared/chat-attachment-contract.ts` (15 MiB/file, 40 MiB total per turn, 8 MiB max base64 staging).**

## Testing

- Manual: add file from tree → appears in composer → send → agent payload includes attachment (verify in devtools / logging, not secrets).
- Manual: upload png → chip shows → remove → not sent.
- **`npm run typecheck`**; add Zod tests if new IPC DTOs.

## Acceptance criteria

- [x] User can **upload** at least one **image** and one **document** type into chat context with clear size/type errors when rejected.
- [x] File tree **“Add to chat”** adds **file** or **folder** to the same attachment model used for sends.
- [x] Attachments render as **chips** in the composer and can be **removed** before send.
- [x] Main process validates workspace paths; uploaded files are **scoped** and never executable surprises.
- [x] `npm run typecheck` passes.

## Implemented (v1)

- **Shared:** `src/shared/chat-attachment-contract.ts` — caps, extension allowlist, Zod `stage-chat-attachment` payload (`path` copy vs `bytes` base64).
- **Main:** `src/main/chat-attachment-staging.ts` — `userData/chat-attachments-staging/<projectId>/…`; `stageChatAttachment`; `sanitizeAttachmentsForTurn`; `toolPathLabelForAgent`; staging path checks. IPC **`stage-chat-attachment`** in `main.ts`.
- **Agent:** `AgentChatAttachment` extended with optional `source`, `displayName`, `mediaType`, `byteSize`. `agent-runner` sanitizes attachments; Zod allows new fields. `agent-workspace-tools` resolves **workspace or staging** paths for `read_file` and lexical attachment handling; staged reads allow up to **4 MiB** per file for excerpt; **active context** text explains folder v1 + image path-only.
- **Renderer:** `ChatThread` — hidden multi `input`, **Paperclip** attach, **drag/drop** on composer with ring affordance; `onAddChatAttachments` from `App` (`mergeChatAttachments`). `src/vite-env.d.ts` — `File.path` for Electron. Sidebar tree passes **`source: 'workspace'`**. Persisted chat lines allow attachment type **`folder`** (`chat-store.ts`).

## Related stories

- **[058](058-agent-context-attachments-and-selection-workflow.md)** — prior attachment + selection work; extend rather than fork.
- **[072](072-chat-composer-auto-grow-and-word-wrap.md)** — layout of chips + growing textarea.

## Completion bookkeeping

When done: mark **073** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
