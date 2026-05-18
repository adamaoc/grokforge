# 080 — Open source prep: stories and tasks hygiene

**Status:** Not started.

## Why this story exists

The **`project_tasks`** tree is the product roadmap for humans and Cursor agents. Before a **public** open source push, the index should be **accurate**, **navigable**, and free of **stale** “next up” guidance so external contributors do not start the wrong work.

## Goals

1. **`project_tasks/README.md`**
   - Progress table matches reality (**Done / Not started / Closed** only, per generator expectations in `scripts/generate-story-viewer.mjs`).
   - **Next up** paragraph reflects current priorities (not orphaned references to completed clusters unless intentional).
   - **Last progress update** line is current or replaced with a dated maintenance note.
2. **Story files**
   - Each **`NNN-*.md`** has consistent front matter: **Status**, **Design skill** line when UI applies, **Completion bookkeeping** pointing to README + `stories.html`.
   - Remove or archive **obsolete** draft docs (none left behind that duplicate numbered stories).
3. **`project_tasks/stories.html`**
   - Regenerated via **`npm run stories:html`** after README/story edits so the static viewer matches git.
4. **Optional:** Root **`CONTRIBUTING.md`** section “How we use `project_tasks`” linking to **`project_tasks/README.md`** and **`AGENTS.md`**.

## Scope

- **`project_tasks/`** only (plus optional root **`CONTRIBUTING.md`** per goal 4).
- Do **not** change application code unless a broken link requires a path rename (unlikely).

## Process suggestions

- Assign a **single editor** for the hygiene PR to avoid merge conflicts on `stories.html`.
- If any story is **abandoned**, mark **Closed** with one-line rationale in the story file rather than deleting history.

## Testing

- Run **`npm run stories:html`** and open **`project_tasks/stories.html`** locally; spot-check new stories **070–080** render.
- Verify README table parser: story viewer expects statuses **`Done`**, **`Closed`**, **`Not started`** (exact strings).

## Acceptance criteria

- [ ] **`README.md`** progress table is internally consistent with individual story **Status** lines for touched rows.
- [ ] **Next up / last progress** text is accurate or intentionally generic.
- [ ] **`stories.html`** regenerated and committed when story markdown or README table changes as part of this work.
- [ ] No duplicate **backlog** session files remain unless explicitly desired (this story may delete stragglers).

## Related stories

- **[079](079-open-source-prep-security-review-and-readme.md)** — contributor-facing docs at repo root.

## Completion bookkeeping

When done: mark **080** done in this file, update `project_tasks/README.md`, run **`npm run stories:html`**.
