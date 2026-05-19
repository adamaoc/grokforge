---
name: update-project-tasks
description: >-
  Updates GrokForge story status in project_tasks: edits the story markdown
  Status line, syncs project_tasks/README.md progress or post-MVP table, and
  runs npm run stories:html. Use when the user or chat says a story is done,
  finished, shipped, closed, not started, pending, post-MVP backlog, or asks
  to mark/update story status, user stories, or project_tasks bookkeeping.
---

# GrokForge — update `project_tasks` status

Do this **immediately** when the user says a story is done/finished/shipped, asks to **mark the story**, or you just completed work tied to a numbered story. No extra commentary, no drive-by README rewrites.

## Three steps (always, in order)

1. **Story file** — `project_tasks/NNN-*.md` or `project_tasks/post-mvp/NNN-*.md`
2. **`project_tasks/README.md`** — the matching table row (and at most a short *Last progress update* line if you already touched the README)
3. **Regenerate viewer** — from repo root:

```bash
npm run stories:html
```

Do **not** hand-edit `project_tasks/stories.html`.

## Status vocabulary (use exactly)

| Intent | Story file `**Status:**` | MVP table (`## Progress`) column 3 | Post-MVP table story title |
|--------|---------------------------|-------------------------------------|----------------------------|
| Shipped | `Done` (+ optional date/note) | `**Done**` | append ` **(done)**` |
| Abandoned / out of scope | `Closed` (+ brief why) | `**Closed**` | append ` **(closed)**` (strikethrough title optional); remove `**(done)**` if present |
| Not started / pending | `Not started` | `**Not started**` | no `**(done)**` |
| Backlog (post-MVP only) | `Post-MVP backlog.` | *(N/A — not in MVP table)* | no `**(done)**` |

- User says **pending** → treat as **`Not started`** in the MVP table.
- Optional detail after status is fine: `Done (2026-05-18).`, `Done (v1: …).`
- `npm run stories:html` reads MVP **`| ID | Story | Status |`** rows, post-MVP **`**(done)**`** in the README table, and falls back to each story file’s **`**Status:**`** line for HTML badges.

## Find the story

- MVP: `project_tasks/NNN-*.md` (three-digit id).
- Post-MVP: `project_tasks/post-mvp/NNN-*.md`.
- Index: `project_tasks/README.md` (progress table **001–080**, post-MVP table **018+**).

## README edits (minimal)

**MVP row** — only change column 3 unless the title changed:

```markdown
| 042 | File tree and editor state synchronization | **Done** |
```

**Post-MVP row** — mark done on the **Story** column, not a separate status column:

```markdown
| 086 | Agent edits: stale content hash **(done)** | [`post-mvp/086-...`](post-mvp/086-....md) |
```

When marking post-MVP **done**, also strike the id in **Suggested backlog order** if it appears (e.g. `~~**086**~~`). Touch **Next up** / **Last progress update** only when closing a story the README already tracks there—one short dated line is enough.

## Story file edit (minimal)

Change only the leading metadata (usually line 3):

```markdown
**Status:** Done (2026-05-18).
```

Leave **Design skill:** and the rest of the spec unless the user asked for more. Do not delete **## Completion bookkeeping**; you are doing it.

## Do not

- Rewrite unrelated README rows or reorder tables.
- Change application code for status bookkeeping alone.
- Run `stories:html` before README + story file match (generator reads README statuses).
- Commit unless the user asked to commit.
- Invent statuses (`Complete`, `In progress`, `Pending`) — they break the HTML parser.

## Quick examples

**“Mark 086 done”**

1. `post-mvp/086-agent-write-stale-content-hash.md` → `**Status:** Done (YYYY-MM-DD).`
2. README post-MVP row → `…hash **(done)** |`; backlog line → `~~**086**~~` if listed; one-line *Last progress update* if needed.
3. `npm run stories:html`

**“Close story 068”**

1. Story → `**Status:** Closed (reason).`
2. MVP table → `**Closed**`
3. `npm run stories:html`

**“082 is finished”** — same as done; post-MVP uses `**(done)**` in README.

## Related

- Conventions: `project_tasks/README.md` § Story file convention
- UI work on a story: also `@styleguide-design`
- Invoke this skill: `@update-project-tasks`
