# 058 — Agent context attachments and editor selection workflow

**Status:** Done — file/folder attachments, removable composer chips, capped automatic editor-selection context, attachment-aware retrieval, and safety validation shipped.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing file tree context menus, chat composer attachments, editor selection UI, or agent activity UI.

## Why this story exists

Story **034** sends active root, active file, and open tabs into each agent turn. That makes “this project” and “this file” more meaningful, but users still need a deliberate way to point the agent at specific files, folders, symbols, or editor selections.

The file tree already has an “Add to chat” placeholder. Monaco has selection state that is not yet part of active context. This story turns those into a clear workflow: users can attach context intentionally, and the agent can retrieve contents through its read/search tools instead of dumping unbounded text into the prompt.

## Goals

- Let users attach files/folders from the tree to the next chat turn.
- Include current editor selection metadata and capped selected text when useful.
- Make attached context visible, removable, and bounded.
- Avoid using attachments as a backdoor for huge prompt dumps.
- Keep agent retrieval responsible for reading full contents when needed.

## UX requirements

- File tree context menu:
  - “Add to chat” becomes real for files and folders.
  - Attached folders mean “the agent should inspect this folder”, not “paste everything”.
- Chat composer:
  - show attachment chips above or inside the composer
  - allow removing individual attachments
  - show file/folder icons and truncated path labels
  - clear attachments after successful send unless pinned behavior is explicitly added later
- Editor:
  - if text is selected, include a small “selection available” context item on send
  - optionally expose an “Add selection to chat” command once selection plumbing exists

## Data model

Extend `AgentChatActiveContext` or add a sibling field for:

- `attachments: Array<{ type: 'file' | 'folder'; path: string }>`
- `editorSelection?: { path: string; startLine: number; endLine: number; text?: string; truncated: boolean }`

Rules:

- attached paths must be under `manifest.roots`
- attached paths still honor ignore and sensitive-file rules
- selected text has a strict character cap
- folder attachments should boost retrieval/listing for that folder

## Agent behavior

- The system/dynamic context should describe attachments as user-intended focus.
- The runner should boost attached paths in retrieval.
- The model should use `read_file` / `list_directory` to inspect attachments when exact content matters.
- If an attachment is ignored/sensitive/unreadable, show that in activity/debug UI.

## Testing

- Unit tests for attachment validation and root/ignore/sensitive rejection.
- Retrieval tests proving attached files outrank unrelated matches.
- Renderer tests/manual QA:
  - attach file, send prompt, attachment clears
  - remove attachment before send
  - attach folder and ask “what is in here?”
  - selected text is included only within caps

## Acceptance criteria

- [x] “Add to chat” in the file tree attaches real context to the next agent turn.
- [x] Chat composer displays removable attachment chips.
- [x] Editor selection context can be sent safely with caps.
- [x] Attachments influence retrieval/tool use without dumping whole folders into the prompt.
- [x] Invalid/sensitive attachments are rejected or clearly reported.

## Implementation notes

- File tree “Add to chat” now creates pending file/folder context for the next chat turn.
- Chat composer shows removable file, folder, and editor-selection chips; file/folder attachments clear after a successful send.
- Monaco selection state is captured automatically, capped by `AGENT_CHAT_SELECTION_MAX_CHARS`, and can be removed from the next turn without clearing the editor selection.
- `AgentChatActiveContext` now carries `attachments` and `editorSelection`; main-process parsing caps and validates those fields.
- Retrieval boosts attached files/folders, reports rejected attachments in activity details, and keeps folder attachments as focus hints rather than prompt dumps.
- Verification: `npm run typecheck`, `npm run test -- --run`, and `npm run build` passed.
