# 075 — Files pane collapse defaults and file tree default open

**Status:** Done (v1: collapsible editor + context bubble + empty state shortcuts).

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing `ResizablePanelGroup` defaults, handles, or sidebar (`@styleguide-design`).

## Why this story exists

Two related layout asks came from product review—**they apply to different regions** and must not contradict each other in implementation:

1. **Files / editor split (“files pane”):** the **right-hand** area (open files + editor + optional terminal host) should be **fully collapsible** and should start **collapsed by default** so the chat column gets maximum space on first open.
2. **File tree (sidebar):** the **left** workspace tree should be **open / visible by default** when entering a project so users immediately see the repo structure.

## Shipped (v1)

- **Inner layout storage:** `useDefaultLayout` id `grokforge-shell-chat-editor-v5:<projectId>` so each project has its own saved chat/editor split; **default** `{ chat: 100, editor: 0 }` (editor **collapsible**, `collapsedSize` 0%).
- **Discoverability:** resize handle tooltip; **⌥⌘E** / **Alt+Ctrl+E** toggles editor; **⌘⇧F** / **Ctrl+Shift+F** opens workspace search (expands editor if it was collapsed so `SearchPanel` has width); **⌘J** / **Ctrl+J** toggles terminal; **⌘B** / **Ctrl+B** toggles sidebar.
- **Context bubble (Codex-style):** when the editor panel is collapsed, a floating **Context** card (top-right of the chat+editor stack) summarizes **chat attachments**, **open tab count**, and **terminal** state, with **Open editor** and optional **Show terminal**.
- **Empty state (Cursor-style):** `EditorEmptyState` uses muted **`GrokForgeWordmark`**, a **Shortcuts** table (aligned with the handlers above + **⌘S** save), and actions: **Search workspace**, **Focus chat**.

## Goals

1. **Right stack:** User can collapse the **editor + tabs** (and associated “files” region) to **zero or near-zero** width via a **clear control** (drag handle double-click, chevron, or shadcn pattern). Persist preference per **project** or **globally** (pick one; default **per projectId** in `localStorage` is consistent with other GrokForge prefs).
2. **Default on first visit:** that region starts **collapsed** (or minimal) per product sign-off.
3. **Left tree:** On project open, the **sidebar file tree** is **expanded** (not collapsed behind a rail-only icon) unless the user had previously collapsed it (respect saved UI state if it already exists).

## Scope

### Renderer

- **`App.tsx`** — `ResizablePanelGroup` ids such as `grokforge-shell-chat-editor-v5:…` and inner layout state (`innerDefaultLayout`, layout persistence hooks).
- **Sidebar** component controlling tree visibility vs icon-only mode.
- Ensure **minimum usable widths** still allow **uncollapse** (no dead-end 0px splitter).

## UX direction

- Collapsed state should show a **prominent “Open editor”** or expand affordance on the split edge.
- Keyboard/accessibility: collapsing must not trap focus; **Escape** or focus order documented.

## Open questions

- Does “files pane collapsed” include **hiding the tab bar** entirely, or only the editor surface? **v1:** entire editor `Panel` including tab bar collapses to 0%.
- Should terminal (post-MVP **[081](post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md)**) influence default widths?

## Testing

- Manual: fresh profile (or cleared keys) → project open → **tree visible**, **editor region collapsed** per spec.
- Manual: expand/collapse → reload app → state restores.
- **`npm run typecheck`**.

## Acceptance criteria

- [x] **Right-hand** editor/files region can be **fully collapsed** with a discoverable expand path.
- [x] **Default first-open** behavior matches spec: **editor/files region starts collapsed** (or documented alternative after stakeholder sign-off).
- [x] **Left file tree** is **open by default** on project entry for new users; returning users get **saved** preference.
- [x] `npm run typecheck` passes.

## Related stories

- **[081](post-mvp/081-terminal-dock-files-pane-or-bottom-drawer.md)** (post-MVP; formerly MVP **076**) — shares the right-hand layout.
- **[066](066-launch-loading-and-project-transition-states.md)** — avoid layout flash during project load.

## Completion bookkeeping

When done: mark **075** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
