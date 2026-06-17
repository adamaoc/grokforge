---
name: update-task-manager
description: >-
  Updates GrokForge story status in TheTaskManager API. Use when the user or
  chat says a story is done, finished, shipped, in progress, backlog, or asks
  to mark/update task manager status for GFAPP stories.
---

# GrokForge — update Task Manager story status

Do this when the user says work is complete, a story should start, or you need
to move a GFAPP task through the workflow.

## API

- Base: `http://localhost:8080/api`
- Project: `grokforge` (prefix `GFAPP`)
- Discovery: `GET /api/docs` or `GET /api/openapi.yaml`

## List stories

```bash
curl -s "http://localhost:8080/api/stories?projectId=grokforge"
```

## Bot-writable statuses

Only: `backlog`, `in_progress`, `done`.

- User says **pending / not started** → `backlog`
- User says **working on it** → `in_progress`
- User says **done / shipped / complete** → `done`
- **Never** set `closed` via API — that is manual human review in the UI.

## Update status

```bash
curl -s -X PATCH "http://localhost:8080/api/stories/GFAPP-007/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'
```

## Update description or title

```bash
curl -s -X PATCH "http://localhost:8080/api/stories/GFAPP-007" \
  -H "Content-Type: application/json" \
  -d '{"title":"...", "description":"..."}'
```

Descriptions are **Markdown**. Include repo file paths, doc links, and
acceptance criteria in the body when creating or expanding stories.

## Titles

- Use a plain descriptive title only (e.g. `Harness v2 — Plan mode authoring`).
- **Do not** prefix titles with legacy in-repo story numbers (`171:`, `170:`, etc.).
- The canonical id is Task Manager’s `GFAPP-###` (returned on create; used in API paths).

## Create a story

```bash
curl -s -X POST "http://localhost:8080/api/stories" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"grokforge","title":"...","description":"...","status":"backlog"}'
```

## Do not

- Recreate in-repo `project_tasks/` markdown (removed; Task Manager is canonical).
- Set status to `closed` via API.
- Invent statuses outside `backlog` / `in_progress` / `done`.

## Related

- Task tracking rules: `AGENTS.md` § Task Manager
- UI work on a story: `@styleguide-design`