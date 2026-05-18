# 057 — Agent retrieval and project intelligence V2

**Status:** Done — shipped deterministic V2 project intelligence metadata, dedicated retrieval ranking, explainable retrieval activity, manual refresh, and Fast vs `grok-4.3` labeling cleanup.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing context preview, index status, agent activity, or settings UI.

## Why this story exists

Story **034** gave the agent a real read/search tool loop and compact app-side workspace index metadata. That is the right V1 foundation, but the retrieval pass is intentionally simple: lexical filename/path matching, active/open-file boosts, and small file excerpts.

To make GrokForge feel genuinely smart in larger projects, the agent needs a better sense of “what matters” before it starts reading files. The goal is not to dump more content into prompts. The goal is to improve the app-side map so the agent finds the right files faster, explains why it chose them, and avoids expensive or stale context.

## Goals

- Improve retrieval quality beyond basic filename/path matching.
- Persist richer, compact project intelligence under app `userData`, never inside workspace folders.
- Track freshness/staleness clearly so the agent does not overtrust old index data.
- Keep retrieval explainable in debug/activity UI.
- Preserve strict secret/ignore filtering from story **034**.

## Proposed V2 index contents

Extend `userData/workspace-projects/<projectId>/index/` with compact, deterministic metadata:

- `workspace-index.json` remains the high-level map.
- Add a symbol-ish file inventory:
  - exported function/component/class names for TS/JS where cheaply detectable
  - route-ish files and entrypoints
  - test files and their likely subjects
  - config/package/build files
- Add package/app summaries derived from deterministic parsing, not model generation:
  - package name, scripts, dependencies of interest
  - framework hints
  - known entrypoints
- Add freshness metadata:
  - indexed root paths
  - ignore patterns used
  - file count scanned
  - skipped/generated/binary/sensitive counts
  - updatedAt
  - errors and truncation status

## Retrieval improvements

Add a ranking module separate from the tool runner:

- Score exact path mentions highest.
- Score active file and open tabs high, but mark dirty files as “possibly unsaved”.
- Score symbol-ish terms against the inventory.
- Boost tests for prompts containing “test”, “bug”, “regression”, or failing output.
- Boost docs/markdown for product/spec/architecture questions.
- Boost package/config files for dependency/setup/build questions.
- Down-rank generated/large files and never auto-include sensitive files.
- Return a compact explanation for each chosen context item.

## UX/debugging

- Extend the agent activity transcript or context preview to show:
  - retrieved files
  - reason/score bucket
  - stale index warning when relevant
  - skipped sensitive/ignored file counts
- Add a manual “Refresh project intelligence” action somewhere discoverable.
- Do not make project open wait on deep indexing; stale-but-usable is acceptable.

## Testing

- Unit tests for ranking exact paths, active files, symbols, docs, tests, and package/config questions.
- Unit tests that sensitive/ignored files cannot enter retrieval even when they score highly.
- Tests for stale index metadata representation.
- Integration prompt fixtures:
  - “Where is the app entrypoint?”
  - “What tests cover git status?”
  - “Why does the terminal command fail?”
  - “Update the settings UI copy” should retrieve settings-related files.

## Acceptance criteria

- [x] Retrieval uses a dedicated ranking module, not ad hoc logic inside the runner.
- [x] App-side index persists richer deterministic metadata under `userData`.
- [x] Agent activity/debug UI can explain why files were retrieved.
- [x] Sensitive and ignored files remain excluded from automatic context.
- [x] Large projects get better file candidates without stuffing the system prompt.

## Implementation notes

- Added `src/main/agent-retrieval.ts` as the dedicated ranking module.
- Extended `workspace-index.json` to version 2 with deterministic file intelligence, package hints, freshness metadata, and skipped-file counts under app `userData`.
- Retrieval activity now reports selected files, score buckets/reasons, stale index warnings, and sensitive-file exclusions.
- Added a thread-menu action to manually refresh project intelligence.
- Kept `grok-code-fast-1` as the default workhorse and renamed the visible alternate mode from “Plan” to the resolved `models.planning` id (`grok-4.3` by default) until story 062 makes planning a real workflow.
- Verification: `npm run typecheck`, `npm run test -- --run`, and `npm run build` passed.

## Completion bookkeeping

When this story ships: update its **Status** line, the progress table in [`README.md`](README.md), and run **`npm run stories:html`** at the repo root so [`stories.html`](stories.html) stays in sync.
