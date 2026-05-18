# 007 — Editor polish: keyboard shortcuts, dirty tabs, close guard

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for tab strip and dialog styling (use shadcn `Dialog` if available).

## Summary

Improve **EditorPane** UX: Cmd/Ctrl+S save, visible dirty indicator on tabs, optional confirm before close when dirty, consistent empty state using shared components from **003**.

## Scope

- Wire keyboard shortcut listener (attach at pane level; avoid Monaco swallowing when appropriate).
- Tab UI: dirty dot or italic label per existing accent rules.
- On tab close or project switch: prompt if dirty (shadcn AlertDialog).
- Ensure `write-file` failure surfaces via `sonner`.

## Acceptance criteria

- [x] Save shortcut works on macOS and Windows/Linux keymaps.
- [x] Dirty state clears only after successful save.
- [x] No regression opening/switching files.

## Key files

- `src/renderer/src/components/EditorPane.tsx`, shared UI from **002–003**.
