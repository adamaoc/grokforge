# 064 — Launch polish: welcome empty state and command affordances

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing welcome, editor-empty, header, command, or shortcut UI.

## Why this story exists

The app already feels polished in normal project flow, but the “No files open” state is a launch-critical first impression. It should help users move immediately into a useful action without feeling like an unfinished placeholder.

This story turns the empty editor/welcome surface into a compact, inviting control surface for opening files, using commands, and understanding the fastest path through the app.

## Goals

- Make the empty editor state feel intentional and useful.
- Add one clear primary action, such as **Open File**, that fits the existing project context.
- Surface a small number of useful next actions without turning the screen into onboarding copy.
- Add a keyboard shortcut hint for the command palette or equivalent command entry point.
- Preserve the current premium dark UI and avoid a marketing-style landing page inside the app shell.

## Scope

- Empty editor / “No files open” surface.
- Project welcome state if it shares components or copy with the empty editor.
- Command entry affordance in header, empty state, or both.
- Keyboard shortcut hint treatment.

## UX direction

- Use a restrained layout that feels like a working tool, not a web landing page.
- Prefer one primary action and two to four secondary quick actions.
- Possible quick actions:
  - open a file
  - search workspace
  - ask the agent about the project
  - open command palette
- Keep copy short and concrete.

## Open questions

- Should the primary action open the native file picker, focus the file tree, or open a command palette action?
- Is **Cmd+K** the command palette shortcut, or should GrokForge reserve a different shortcut?
- Should quick actions be dynamic based on whether a project has files, recent tabs, search support, or agent key availability?
- Should the empty state appear per editor tab group in the future, or only when no editor is active?

## Open questions Answered

- primary action should focus on the file tree. 
- Cmd+K is fine for now 
- I'm open to suggestions. Maybe dynamic is good. 
- only when no editor is active. 


## Testing

- Verify keyboard shortcut hints do not overlap or truncate at narrow widths.
- Verify the empty state works with multiple roots and no open file.
- Verify actions are disabled or hidden gracefully if their backing IPC/API is unavailable.
- Run `npm run typecheck`.

## Acceptance criteria

- [ ] Empty editor state has a clear primary action.
- [ ] Empty editor state includes compact quick actions or suggestions.
- [ ] Command palette or command-entry shortcut is discoverable.
- [ ] UI remains consistent with GrokForge spacing, dark palette, and component style.
- [ ] Responsive layout avoids text overlap on narrow windows.

## Completion bookkeeping

Once this story is done, mark story **064** as done in this file, update `project_tasks/README.md`, and regenerate/update `project_tasks/stories.html` so the story appears as done there too.
