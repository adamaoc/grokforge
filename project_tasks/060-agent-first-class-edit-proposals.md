# 060 — Agent first-class edit proposals

**Status:** Done — V1 uses a first-class `propose_file_edits` chat tool for full-file `write_file` replacements and single-file `delete_file` operations. The tool emits app-owned pending proposal state and routes into the real diff review/apply flow from stories **045–047**. The fenced `grokforge-agent-tools` protocol remains as a compatibility fallback.

**Design skill (required):** Read `.cursor/skills/styleguide-design/SKILL.md` before changing chat pending-write UI, diff review UI, approval controls, or editor integration.

## Why this story exists

Today the agent proposes writes by hiding a `grokforge-agent-tools` fenced JSON block at the end of the assistant message. That works, and story **034** preserved it. But it is not the workflow we ultimately want: a smart coding agent should produce explicit edit proposals that the UI can diff, group, apply, discard, and recover from.

This story should coordinate with stories **045–047**. It is the agent-side bridge into the real diff/review system.

## Goals

- Replace hidden JSON write proposals as the primary UX with a first-class `propose_file_edits` tool.
- Keep the existing fenced write protocol as a compatibility fallback until the new flow is stable.
- Route proposals into the real diff model/review UI.
- Preserve root guards, ignore checks, undo snapshots, and user confirmation/auto-apply settings.
- Make conflicts and stale base content visible before applying.

## Proposed flow

1. Model calls `propose_file_edits` with full-file replacements or structured patch data, depending on the diff-system decision.
2. Main validates paths and stores an in-memory proposal session.
3. Renderer receives a pending proposal event/card.
4. User opens diff review, applies all/some, or discards.
5. Apply uses existing `agent-tool-batch` semantics or a successor with conflict checks.
6. Chat receives a concise status message; raw proposal JSON is never shown.

## Required decisions before implementation

- Tool payload is full-file replacement only in V1, plus single-file deletes. Patch/hunk data is deferred.
- Partial apply remains deferred; V1 applies the reviewed batch through existing `agent-tool-batch` semantics.
- Proposal sessions are in-memory renderer/main turn state only and do not survive reloads.
- Dirty/stale disk interaction uses the story **047** reviewed-original conflict checks when the user opens Review diff.

## UX requirements

- Pending proposal card shows:
  - files changed
  - created/modified/deleted if supported
  - under-root/ignored/sensitive validation status
  - “Review diff” primary action
- Diff review should make full-file replacement risk clear.
- Applying should refresh editor tabs, file tree, git status, and workspace index.

## Testing

- Tool schema validation for path/content caps.
- Root/ignore/sensitive rejection tests.
- Conflict detection tests once story **047** exists.
- UI/manual tests:
  - proposed edit opens diff review
  - apply refreshes open editor tab
  - discard removes proposal
  - stale/dirty file warns before apply

## Acceptance criteria

- [x] Agent edit proposals are represented as first-class app state, not only hidden chat JSON.
- [x] Users can inspect a real diff before applying.
- [x] Existing apply/undo safety is preserved or improved.
- [x] Fenced write blocks remain supported as a temporary compatibility path.
- [x] Editor, tree, git status, and index refresh after applied proposals.
