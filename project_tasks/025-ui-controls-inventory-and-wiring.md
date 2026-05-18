# 025 — UI controls inventory: wire, hide, or disable

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` for disabled states, tooltips, and menu patterns.

## Summary

There are **many controls and labels that do nothing** today. Do a pass across the shell: **remove**, **wire up**, or **explicitly disable + tooltip** (“Coming soon”) so the product feels intentional. Goal: **integrated** UX—every visible control has a clear outcome.

## Scope

- Inventory: header menus, sidebar actions, chat toolbar, voice UI, status chips, placeholder buttons.
- For each: implement minimal real behavior, remove from UI, or disable with copy/tooltip (pick one; avoid silent no-ops).
- Document any deferred items in story notes or a short inline `TODO` linked to a future task ID.

- workspace roots area, there's a refresh button and an add (+) button. 
- switch project should go back to the project dashboard that should be implemented. 
- collaberate button at the top. Opens file system and changes the directory in the sidebar. I don't understand the point of this button. 

## Acceptance criteria

- [ ] No mystery clicks: primary chrome controls either work or explain why they do not.
- [ ] Stubs that remain are visually and textually **obvious** (not fake-enabled).
- [ ] Brief note in `AGENTS.md` or story appendix listing what was deferred vs shipped (optional if README table updated instead).

## Key files

- Cross-cutting: `ProjectHeader.tsx`, `Sidebar.tsx`, chat-related components, voice UI components.

## Notes

- May depend on **024** / **021** if layout changes hide old clutter.

## Appendix — shipped vs deferred (2026-05)

### Shipped in this story

- **Header "Collaborate" button**: removed. It was a duplicate of "Switch Project" wearing a mislabel; no collaboration feature exists.
- **Sidebar "Switch Project" button**: now returns to the Project Dashboard (`ProjectWelcome`) so the user sees recents + "Open Project or Create New", instead of jumping straight to the OS folder picker. Unsaved-changes guard still fires.
- **Sidebar "+" Add root button**: wired to a new IPC `add-workspace-root` (main-process folder picker → validate → append `manifest.roots` → persist). Rejects same/parent/child of existing roots; detects `.git` and sets `git: true` on the new root. Renderer toasts success/error and selects the new root.
- **Sidebar git-status RefreshCw button**: removed. Auto-fetch on mount + on `project.roots` change still runs. A successor story (**031**) will design a clearer per-root refresh affordance.
- **Sidebar Settings gear** (bottom right): now visibly disabled + `Tooltip "Settings — coming soon"`. Will be wired in **029**.
- **Chat composer "Voice input" button**: removed. The bottom voice bar is the real entry point; the duplicate was a stub that hinted at a non-existent in-composer voice action.
- **VoiceControls "Speakers" button**: removed. Speaker selection is platform-level; the button was a silent disabled stub.

### Already in good shape (kept as-is)

- ⋯ menu "Settings (soon)" and "Keyboard shortcuts (soon)" — visibly disabled stubs, clear copy.
- Chat composer "Attach file" — `disabled` + `Tooltip "Coming soon"`.
- Header search / terminal / preview-agent-context / open-diff-demo — all wired.

### Deferred to new follow-up stories

- **031** — Git status: refresh, errors, discoverability. Decide on per-root manual refresh affordance and how `git_unavailable` is surfaced.
- **032** — "About GrokForge" menu item: investigate intent (version modal vs remove) and ship or drop.
