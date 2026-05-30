# 159 — Editor empty state cleanup and honest global shortcuts

**Status:** Done (2026-05-30).

**Priority:** UI vertical-space wave **157–159** — third story; cleans the default **no file open** editor pane and fixes misleading shortcut copy.

**Design skill:** **Required** — [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) (`@styleguide-design`).

**Depends on:** **[007](../007-editor-polish-keyboard-dirty-state-close-guard.md)** (save shortcut), **[075](../075-files-pane-collapse-defaults-and-file-tree-default-open.md)** (editor pane collapse), **[143](143-context-panel-agent-companion.md)** (optional `agentContextHint` line).

## Why this story exists

When no editor tab is active, [`EditorEmptyState`](../../src/renderer/src/components/EditorEmptyState.tsx) shows:

- Wordmark + **No files open** + optional agent hint + **Active root** (duplicates header/sidebar)
- A always-visible **Shortcuts** card listing five bindings
- **Search workspace** / **Focus chat** buttons (duplicate header search and obvious chat column)
- **ModelBadge** row for execution model + project name (low value on empty editor)

The shortcuts card claims global behavior but the implementation is split:

| Shortcut | Handler location | Works from chat focus? |
|----------|------------------|-------------------------|
| ⌘⇧F search | [`App.tsx`](../../src/renderer/src/App.tsx) `window` capture | Yes (when not in input) |
| ⌘J terminal | `App.tsx` | Yes |
| ⌘B sidebar | `App.tsx` | Yes |
| ⌥⌘E editor pane | `App.tsx` | Yes |
| ⌘S save | [`EditorPane.tsx`](../../src/renderer/src/components/EditorPane.tsx) | Yes **only if** a file tab is active |

Footnote text partially explains save preconditions, but listing **Save active file** in the empty state implies an action the user **cannot** take with no tab open — visual noise without benefit.

**Goal:** a calmer empty pane; shortcuts panel stays **collapsible** (default collapsed after first visit optional); every **visible** binding works globally or is hidden with honest copy.

## Goals

### 1. Minimal empty state layout

- Reduce vertical stack: prefer **one** short headline (**No files open**) + optional **agentContextHint** (143) when present.
- Remove or relocate redundant chrome:
  - **Active root** line (header/sidebar already show root)
  - Duplicate **Search** / **Focus chat** buttons (or replace with single subtle text link if user testing wants one CTA — default **remove**)
  - Bottom **ModelBadge** / project name row
- Keep **Collapse editor pane** control in the pane toolbar when `onCollapseEditorPane` is provided.
- Wordmark: keep **compact/muted** variant or drop if still too tall — aim for ≤ **~40vh** total empty content on laptop.

### 2. Collapsible shortcuts panel

- Wrap shortcuts in a **disclosure** (chevron / “Keyboard shortcuts”) — collapsed by default.
- Persist user preference in `localStorage` (e.g. `grokforge.editor.emptyShortcutsExpanded`) optional; default **collapsed**.
- Collapsed: one line “Keyboard shortcuts” + chevron; expanded: current table layout (tightened spacing per styleguide).

### 3. Global shortcut honesty

- Single source of truth for labels + key caps: consolidate [`useShortcutRows`](../../src/renderer/src/components/EditorEmptyState.tsx) with [`workspace-global-shortcuts.ts`](../../src/renderer/src/lib/workspace-global-shortcuts.ts) (export shared `WORKSPACE_SHORTCUT_ROWS` + platform key labels).
- **Show only** shortcuts that work from anywhere in the workspace (respecting `workspaceGlobalShortcutTargetAllowsShortcut` — disabled while typing in inputs):
  - Workspace search, toggle terminal, toggle sidebar, toggle editor pane
- **Hide** “Save active file” from empty-state list **or** move to a secondary “When editing” subsection that only appears when `openFiles.length > 0` (if empty state receives that prop) — **do not** show save on pure empty state.
- Verify each listed shortcut fires from **chat composer focused** (click textarea, then key chord) in manual test checklist.
- If a shortcut cannot be made global without scope creep, **remove** it from the panel (do not show broken bindings).

### 4. No shortcuts system overhaul

- Do not add a global shortcuts modal (**ProjectHeader** “Keyboard shortcuts (soon)” stays disabled).
- Do not change Monaco keybindings or terminal PTY input handling.

## Scope

- [`src/renderer/src/components/EditorEmptyState.tsx`](../../src/renderer/src/components/EditorEmptyState.tsx) — layout, collapsible shortcuts, shared row import.
- [`src/renderer/src/lib/workspace-global-shortcuts.ts`](../../src/renderer/src/lib/workspace-global-shortcuts.ts) — export shared shortcut metadata; keep `workspaceGlobalShortcutTargetAllowsShortcut`.
- [`src/renderer/src/App.tsx`](../../src/renderer/src/App.tsx) — only if moving save handler to app level is required to honor a shown binding (prefer **hide save on empty state** over refactor).
- [`src/renderer/src/components/EditorPane.tsx`](../../src/renderer/src/components/EditorPane.tsx) — pass props if “When editing” subsection needs open-tab signal.
- Unit test: shared shortcut row list matches keys handled in `App.tsx` (new small test file acceptable).

## Non-goals

- Top bar strip (**157**) or voice bar (**158**).
- Welcome screen shortcuts.
- Implementing the header **Keyboard shortcuts (soon)** menu item.
- Changing editor tab UX or Monaco theme.

## Acceptance criteria

- [ ] Empty editor (no tabs): no **Active root**, **ModelBadge**, or duplicate Search/Focus chat button row unless explicitly kept with PR justification.
- [ ] Shortcuts section is **collapsible**; default state is **collapsed** on first load.
- [ ] Expanded shortcuts list contains **only** bindings verified global (search, terminal, sidebar, editor pane toggle) — **not** save when no file is open.
- [ ] From chat composer focus: ⌘⇧F, ⌘J, ⌘B, ⌥⌘E each perform expected action (manual checklist or Playwright smoke if cheap).
- [ ] Footnote copy matches behavior (inputs disable shortcuts; no claim that save works with no tab).
- [ ] Empty state visually calmer — fewer bordered cards and badges than today (screenshot before/after in PR).
- [ ] `npm run typecheck` + `npm run test` pass (including any new shortcut contract test).

## Related

- **[143](143-context-panel-agent-companion.md)** — keep `agentContextHint` when agent recently touched a path.
- **[157](157-compact-top-bar-context-strip.md)**, **[158](158-collapsible-voice-mode-bar.md)** — sibling vertical-space stories.
- **[025](../025-ui-controls-inventory-wire-hide-or-disable.md)** — inventory discipline for duplicate actions.

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table (add **159**), run **`npm run stories:html`**.
