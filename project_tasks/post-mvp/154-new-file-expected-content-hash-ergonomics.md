# 154 — New-file expectedContentHash ergonomics

**Status:** Done (2026-05-30).

**Priority:** High — removes a needless schema footgun from file-creation proposals.

**Design skill:** N/A (tool schema, validation, and model-facing tool docs).

**Depends on:** **[086](086-agent-write-stale-content-hash.md)**, **[146](146-pre-validation-for-edit-proposals.md)**, **[151](151-stop-repeated-same-path-proposal-failures.md)**.

## Why this story exists

The first failed TaskBoard proposal was rejected before content validation because `expectedContentHash` was malformed. For a new file, the model should not have to invent a 64-character hash. If the operation is a create, the tool contract should be explicit and ergonomic.

This matters because schema-level failures consume a tool round and can push the model into worse retries before it even receives content-quality feedback.

## Goal

Make new-file creation proposals unambiguous: either relax the schema for create operations or document and normalize a single expected sentinel value. The model should get immediate, actionable feedback if it uses the wrong form.

## Acceptance criteria

- [x] The proposal schema/tool docs clearly distinguish create vs update expectations for `expectedContentHash`.
- [x] New-file creation does not require the model to fabricate an arbitrary 64-character hash.
- [x] Malformed hash errors for create operations are converted into a short model-facing repair message.
- [x] Existing stale-content protection for updates remains strict.
- [x] Tests cover create, update, malformed create hash, and stale update hash cases.

## Suggested implementation notes

- Prefer the smallest compatible schema change that preserves existing proposal storage and review behavior.
- If a sentinel is used, make it shared and named, not copied as a string literal across files.
- Update xAI tool descriptions so the model sees the rule before its first proposal.

## Completion bookkeeping

When shipped or closed: update **Status**, [`README.md`](../README.md) post-MVP table, run **`npm run stories:html`**.
