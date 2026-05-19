# 082 — Agent edits: require `read_file` before `write_file`

**Status:** Done (2026-05-18).

**Design skill:** N/A (main/agent loop; renderer only if surfacing “file not read” errors in chat).

## Why this story exists

V1 `propose_file_edits` / `write_file` uses **full-file replacement**. Models often propose edits **without** calling `read_file`, reconstructing content from memory and producing broken or whole-file rewrites. This is the highest-impact reliability fix after shipping **060**.

## Goals

1. For **existing** files, the agent must **`read_file`** (same path, current turn) before `propose_file_edits` may include a `write_file` for that path.
2. **New** files (path not on disk) may skip read.
3. Clear tool error when write is attempted without read: e.g. “Call `read_file` on this path before proposing changes.”

## Scope

### Main (`agent-runner.ts`, `agent-edit-proposals.ts`)

- Track **paths read this turn** (normalized absolute under roots) in the agent tool loop scratch state.
- On `read_file` success, record path.
- On `propose_file_edits` / fenced batch validation, reject `write_file` ops whose target exists on disk but was not read this turn.
- Optional: allow read in a **previous** turn only if we also pass content hash (see **086**); v1 = **same turn only**.

### Prompts (`agent-context.ts`, `agent-runner.ts` final contract)

- Add explicit rule: **MUST** `read_file` before modifying any existing file; never guess content.

### Tests

- Unit: proposal with write to existing file without prior read → rejected.
- Unit: read then write same path → allowed.
- Unit: write to new path without read → allowed.

## Acceptance criteria

- [ ] Existing files cannot be proposed via `write_file` until `read_file` succeeded for that path in the same agent turn.
- [ ] Tool/proposal error messages are actionable for the model and visible in chat activity.
- [ ] `npm run typecheck` and targeted Vitest pass.

## Related stories

- **[060](../060-agent-first-class-edit-proposals.md)** — proposal pipeline.
- **[083](083-agent-edit-prompting-minimal-change.md)** — complementary prompt guidance.
- **[086](086-agent-write-stale-content-hash.md)** — cross-turn staleness.

## Completion bookkeeping

When implemented: mark **082** done, update [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
