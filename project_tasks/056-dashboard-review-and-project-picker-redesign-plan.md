# 056 — Dashboard review and project picker redesign plan

**Status:** **Done** (chunks A–F shipped; welcome picker follow-ups such as collapsible filter with **⌘K** / **Ctrl+K**, and **Meta+1–9** quick-open hints, live in `src/renderer/src/components/welcome/`.)

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing the welcome/dashboard screen, recent project cards/list, dialogs, icon buttons, or page layout.

## Planning note

This story is intentionally **not** a direct implementation task. Before writing production code, review this spec, inspect the current dashboard again, and split the work into smaller implementation stories or PR-sized chunks. The likely split is:

- dashboard data/readability changes
- destructive action semantics
- project picker visual redesign
- performance/lightweight rendering pass
- component/code architecture cleanup
- keyboard/accessibility polish

Do not try to land all of this in one pass unless the app is still small enough and the changes are tightly scoped.

**Update:** Chunks were tracked **only in this file** (no child story files). All chunks **A–F** are checked off below; the story is **closed**.

**Implementation:** Delivered under `src/renderer/src/components/welcome/` with `ProjectWelcome.tsx` re-export. Post-056 follow-ups (e.g. **070** activity badge data, Playwright in **037**) remain separate stories.

## Stakeholder decisions

1. **Path column:** Show **primary (first) root path** only for now; richer multi-root paths can follow later.
2. **Layout preference:** Offer a **toggle** between **card grid** (default) and **dense table rows**; persist the user’s choice (e.g. `localStorage`, same pattern as other GrokForge prefs).
3. **Work order:** **Data + semantics** before large visual passes (payload and destructive-action clarity first).
4. **Activity badge (070):** **Table mode** must support the **same** project-card activity indicator as cards; a **placeholder** is acceptable until **070** lands.

## Work chunks (056 — completed in repo)

### Chunk A — Recent project payload + primary path on cards

- [x] Extend **`RecentProjectEntry`** with optional **`primaryRootPath`** (capped length); validate in **`recent-projects-store`**.
- [x] Populate path when **`recordRecentProject`** runs (resolved absolute first root).
- [x] **`ProjectWelcome`**: show primary path on cards when present; keep root labels as secondary line when path exists; legacy rows unchanged until next open.

### Chunk B — Separate “remove from recents” vs “delete project data”

- [x] Clarify **`X`** / trash vs **remove from MRU** only; wire **`remove-recent-project`** for non-destructive remove; keep **delete** behind explicit destructive affordance + copy.

### Chunk C — Layout toggle (cards vs table) + persistence

- [x] Segmented control or toggle; **cards default**; **table** = scannable rows with columns: name, **primary path**, roots/time metadata, **activity placeholder** (same slot as future **070** badge), actions.
- [x] `localStorage` key (document in code comment); restore on welcome mount.

### Chunk D — Picker polish (no new story)

- [x] Labeled **Open / create** when recents exist (not icon-only `+` alone).
- [x] Compact hero when recents exist; keep spacious empty state.
- [x] Lightweight **filter** input (name, labels, path) once payload is stable.

### Chunk E — Performance + file split

- [x] Trim card/list motion cost; precompute distance-to-now or memoize row props.
- [x] Split **`ProjectWelcome.tsx`** into `welcome/` subcomponents + hook per 056 plan.

### Chunk F — Accessibility

- [x] Tab order, row vs action keys, dialog focus, `aria` for destructive vs safe actions.

## Why this story exists

The current splash/dashboard screen is visually pleasant and functional, but it is more of a pretty welcome page than a fast, highly scannable project picker. The product goal is:

- super fast loading
- clean design
- easy to read and choose projects
- clear action semantics
- strong first impression

This page is one of GrokForge’s most important surfaces. It is the user’s first impression and the place they return to when switching workspaces. It should feel calm, immediate, and obvious.

## Current state

Main entry (re-exports):

- `src/renderer/src/components/ProjectWelcome.tsx` → `./welcome/ProjectWelcome`

Welcome implementation folder:

- `src/renderer/src/components/welcome/ProjectWelcome.tsx` — shell, IPC wiring, filter + view-model memo
- `src/renderer/src/components/welcome/useWelcomeRecents.ts` — fetch + `recent-projects-changed` + snapshot warm cache
- `src/renderer/src/components/welcome/WelcomeRecentPickerSection.tsx` — filter, layout toggle, loading row
- `src/renderer/src/components/welcome/WelcomeRecentCards.tsx` / `WelcomeRecentTable.tsx`
- `src/renderer/src/components/welcome/welcome-recent-row-view-model.ts` — precomputed `openedLabel` + subtitle strings
- `src/renderer/src/components/welcome/recent-entry-labels.ts` — shared label helpers (filter + view models)
- `src/renderer/src/components/welcome/GrokForgeWordmark.tsx`, `WelcomeRecentsActivityPlaceholder.tsx`, `RecentProjectActions.tsx`
- `src/renderer/src/components/welcome/WelcomeRemoveFromListDialog.tsx`, `WelcomeDeleteStoredDialog.tsx`, `WelcomeRenameRecentDialog.tsx`
- `src/renderer/src/components/welcome/welcome-constants.ts`

Related data:

- `src/main/recent-projects-store.ts`
- `src/shared/recent-projects-contract.ts`
- `src/main/app-project-store.ts`

Current behavior:

- Loads recent projects through `getRecentProjects`.
- Subscribes to `recent-projects-changed`.
- Shows the GrokForge wordmark and tagline (**compact** when recent projects are shown; **larger** on the empty welcome state).
- If recents exist, shows recent project **cards** (default) or a **table** via a layout toggle; choice persisted in **`localStorage`** (`grokforge.welcomeRecentsLayout.v1`, see `welcome-recents-layout.ts`).
- **`primaryRootPath`** on each row when the MRU entry includes it (after the project is opened again, or for new MRU writes); legacy rows unchanged until next open.
- If no recents exist, shows a primary “Open Project or Create New” button.
- Per recent project:
  - click opens project
  - pencil opens rename dialog
  - list-minus opens “remove from list” confirmation (**`remove-recent-project`**)
  - trash opens “delete GrokForge project data” confirmation (**`delete-project`**)
- Settings button is available.
- When recents are loaded and non-empty: **Open / create** is a labeled outline control (not icon-only); wordmark + tagline use a **compact** scale; **Recent projects** includes a **filter** field (name, primary path, root labels/lines) with a clear empty-filter state.
- **Keyboard / screen readers (Chunk F):** top chrome is a **`nav`** (“Welcome toolbar”); recents block has **`aria-labelledby`** on the section heading; filter **`aria-controls`** the results **`region`**; each project row uses an explicit **Open project …** control (card) or **`aria-label`** on the table row; per-row actions sit in a **`toolbar`** with a distinct name; destructive delete control is labeled separately; confirm dialogs use Radix **`AlertDialogCancel`** / **`AlertDialogAction`** for focus and dismiss semantics; rename field **`aria-describedby`** links to dialog copy; focus-visible rings on icon-only settings, empty-state CTA, and footer link.
- Footer includes creator/xAI disclaimer.

## Core review findings

### 1. Project cards are not scannable enough

The current cards show:

- display name
- joined root labels
- root count
- last opened time

This works when there are only a few projects with clearly different names. It becomes harder when several projects have similar names, similar root labels, or generated names. Users often identify projects by path/folder, not just display name.

Recommended direction:

- Show primary root folder/path in muted mono text.
- Keep root labels as secondary metadata.
- Make project name the strongest visual signal.
- Align root count and last opened consistently.
- Consider a compact list/table-like layout instead of cards.

Possible row layout:

```txt
Project Display Name                         [actions]
/Users/.../WEBPROJECTS/jobsboard-generic
3 roots · opened 2 hours ago
```

Why this matters:

- A dashboard should optimize recognition speed.
- Project names are editable and may not be unique.
- Paths disambiguate projects better than labels alone.

### 2. The destructive action is too easy to misread

The card has an `X` button. It currently calls `deleteProject`, which removes GrokForge app-side project storage and chat history, not just the recent-list row. The confirmation text explains this, but the icon on the card reads like a lightweight dismiss/remove-from-recents affordance.

Risk:

- User may interpret `X` as “remove from this list.”
- The actual operation is stronger: delete stored GrokForge project data.

Recommended direction:

- Replace `X` with a clear actions menu, or use a trash icon only for destructive delete.
- Separate these two operations:
  - Remove from recents
  - Delete GrokForge project data
- Default visible action should probably be non-destructive.
- Destructive delete should be tucked behind a menu and confirmed clearly.

Why this matters:

- Project data deletion includes chat history and app-side configuration.
- The UI should not rely on a confirmation dialog to correct misleading first-level affordance.

### 3. “Open Project” is too hidden when recents exist

When recent projects exist, the primary browse/create action becomes an icon-only `Plus` button in the top-right toolbar. It is clean, but less readable.

Recommended direction:

- Use a labeled button such as “Open Project” or “Open or Create.”
- Keep the icon if desired, but pair it with text.
- Make the primary action easy to find without hovering.

Why this matters:

- First-time or returning users should not need to infer that `+` means open/create project.
- The page should be usable at a glance.

### 4. The layout should favor fast project selection over hero presence

The wordmark/tagline are attractive, but once recents exist, the page’s main job is project picking. The hero should not consume attention or vertical space that makes recents harder to scan.

Recommended direction:

- Keep branding, but make it compact when recents exist.
- Put the recent list higher and denser.
- Use the empty state for the more spacious brand moment.
- Avoid large decorative motion or layout shifts.

Why this matters:

- Frequent users return to choose work, not reread the tagline.
- Dense but calm layout feels more like a professional desktop tool.

### 5. The recents view needs search/filter soon

The store caps recents at 15. At that size, cards are still manageable, but search/filter becomes valuable once projects have similar names.

Recommended direction:

- Add lightweight local filtering by:
  - display name
  - root label
  - root path, if added to payload
- Keep it instant and local.
- Do not block opening or require indexing.

Why this matters:

- It makes the dashboard feel fast and command-center-like.
- It reduces visual scanning burden.

### 6. Recent project payload may need richer display data

Current `RecentProjectEntry` includes:

- `projectId`
- `displayName`
- `rootsCount`
- optional `rootLabels`
- `lastOpenedAt`

It does not include root paths. To make project rows easier to identify, the renderer likely needs at least:

- primary root path
- maybe primary root basename
- possibly truncated root paths for tooltip/detail

Recommended direction:

- Extend recent project contract carefully.
- Store sanitized path display fields.
- Avoid exposing huge arrays or unnecessary data.
- Maintain compatibility for legacy recent entries.

Possible addition:

```ts
primaryRootPath?: string
rootPaths?: string[]
```

Or a smaller version:

```ts
primaryRootLabel?: string
primaryRootPath?: string
```

Why this matters:

- UI cannot show what the data contract does not provide.
- Paths are the best disambiguator for similar projects.

### 7. Loading should feel instant

The page already should be fast because recents are small and local. Still, the component can be made lighter and clearer.

Current avoidable weight/noise:

- `framer-motion` card hover/tap animations.
- `formatDistanceToNow` called per card during render.
- Large inline wordmark SVG inside `ProjectWelcome.tsx`.
- Large single component owning data, cards, modals, footer, and wordmark.

Recommended direction:

- Remove or reduce motion on recent rows.
- Precompute view models for recent rows.
- Move wordmark to a separate component file.
- Keep first paint simple: shell, title, recents skeleton/empty state.
- Avoid expensive work in render.

Why this matters:

- The picker should feel immediate even on app launch.
- Less rendering complexity makes future UI E2E easier.

### 8. Code should be split before more features are added

`ProjectWelcome.tsx` currently owns too many concerns:

- wordmark SVG
- recents fetch/subscription
- card rendering
- rename dialog
- delete dialog
- footer/disclaimer
- external link opening

Recommended split:

```txt
src/renderer/src/components/welcome/
  ProjectWelcome.tsx
  GrokForgeWordmark.tsx
  RecentProjectList.tsx
  RecentProjectRow.tsx
  RenameRecentProjectDialog.tsx
  DeleteProjectDialog.tsx
  useRecentProjects.ts
```

Keep public import stable if useful by re-exporting from the current component path.

Why this matters:

- The dashboard will otherwise become a large fragile file.
- Each future improvement becomes easier to review and test.

### 9. Accessibility and keyboard behavior should be reviewed

**Update (Chunk F):** Implemented in `welcome/*` — see Current behavior bullet on keyboard/screen readers.

The current cards are keyboard-openable via `role="button"` and `tabIndex`, which is good. But a dashboard/project picker should be reviewed as a whole.

Recommended checks:

- Tab order:
  - Open Project
  - Settings
  - project rows
  - row actions
- Row actions should not accidentally open the project.
- Dialog focus trap and Escape behavior.
- Clear labels for destructive vs non-destructive actions.
- Search/filter field should focus naturally if added.
- Cards/rows should have visible focus rings.

Why this matters:

- This page is a core navigation surface.
- Keyboard users should be able to open a recent project quickly.

## Non-goals

- Do not redesign the loaded workspace shell.
- Do not change how project manifests are stored.
- Do not add cloud sync or accounts.
- Do not add thumbnails/screenshots yet.
- Do not implement project pinning until the picker basics are cleaner.

## Testing

Manual QA:

- empty state with no recents
- recents list with 1, 5, and 15 projects
- long project names
- similar project names
- many roots
- missing/deleted app-side project entry
- rename from dashboard
- remove from recents
- delete GrokForge project data
- keyboard-only open project
- settings open from dashboard

Automated later:

- add UI E2E coverage under **037**
- isolated temp `userData`
- open project from recent row
- remove recent row without deleting workspace folder
- delete project data confirmation

## Acceptance criteria for the eventual implementation

- [x] Recent projects are easier to scan than the current card grid.
- [x] Primary root path or equivalent disambiguating location is visible.
- [x] “Open Project” / create action is clearly labeled when recents exist.
- [x] Remove-from-recents and delete-project-data are visually and semantically distinct.
- [x] Dashboard loads quickly with no unnecessary heavy render path.
- [x] `ProjectWelcome.tsx` is split into smaller focused units.
- [x] Keyboard navigation and dialog focus behavior are reviewed.
- [x] Empty state remains welcoming and clear.

## Key files

- `src/renderer/src/components/ProjectWelcome.tsx` (re-export) and `src/renderer/src/components/welcome/*`
- `src/main/recent-projects-store.ts`
- `src/main/recent-project-primary-path.ts`
- `src/shared/recent-projects-contract.ts`
- `src/main/main.ts`
- `src/renderer/src/App.tsx`
- `project_tasks/020-recent-projects-and-project-picker-cards.md`
- `project_tasks/030-remove-from-recent-projects.md`
- `project_tasks/033-rename-project-manifest-workspace.md`

