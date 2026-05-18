# 024 — Resizable layout panes (shadcn)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before adding or styling `ResizablePanelGroup`.

## Summary

Main workspace **panes** (e.g. sidebar vs editor vs chat / terminal) should be **user-resizable** with predictable drag handles. Prefer **shadcn/ui `Resizable`** (`react-resizable-panels` under the hood) if not already installed—align with **002** baseline.

## Scope

- Add shadcn Resizable primitives if missing; wire **default sizes** and **persistence** (optional: remember widths in `localStorage` per layout).
- Define which regions are resizable (likely: left sidebar | center | right assistant / terminal stack).
- Keyboard / a11y: verify focus and separator semantics per **019** patterns where applicable.

### Details:

We should be looking at a sidebar that is collapsable via a button in the header of the sidebar. It can be resizeable or collapsed. Next the chat pane and the editor pane should be resizeable as well.

## Acceptance criteria

- [x] User can drag between major panes to change **width** (sidebar | main, chat | editor).
- [ ] User can drag **vertical** splits (e.g. editor vs terminal) — deferred; see TODO in Implementation notes.
- [x] Layout stable across navigation (open file, run command) without resets unless intentional.
- [x] Optional: persisted sizes — `useDefaultLayout` + stable `id` / `panelIds` → `localStorage` (see Implementation notes).

## Implementation notes (shipped)

- **Library:** `react-resizable-panels` v4 (`Group` / `Panel` / `Separator`); shadcn-style wrapper in [`src/renderer/src/components/ui/resizable.tsx`](../src/renderer/src/components/ui/resizable.tsx) exports `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`.
- **Panel size units:** Numeric `defaultSize` / `minSize` / `maxSize` / `collapsedSize` on `Panel` are **pixels** in v4; use **strings with `%`** (e.g. `defaultSize="18%"`) for viewport-relative layout. `Group` `defaultLayout` uses **numbers as percentages** (0–100) per panel `id`.
- **Shell:** [`App.tsx`](../src/renderer/src/App.tsx) `ProjectWorkspaceShell` — outer `id="grokforge-shell-outer-v4"` (`sidebar` ~**17%** | `main` **83%**). Inner `id="grokforge-shell-chat-editor-v4"`: **chat 40%** / **editor 60%** of the main column (~**33%** / ~**50%** of full width), matching the reference layout. Persistence via `useDefaultLayout`; **v4** ids re-seed after the inverted 60/40 inner default under v3.
- **Sidebar:** Collapsible panel (`collapsedSize` 4%, `panelRef` + `PanelLeft` / `PanelLeftClose` in [`Sidebar.tsx`](../src/renderer/src/components/Sidebar.tsx)); resize handle has `aria-label` / `title`.
- **TODO (follow-up):** Vertical resize between editor stack and **Terminal** (fixed `h-52` today) — add a vertical `ResizablePanelGroup` when the terminal is open, or document in a later story.

## Key files

- `App.tsx`, layout shell components, `src/renderer/src/components/ui/*` (shadcn).
