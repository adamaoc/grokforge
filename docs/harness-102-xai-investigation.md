# Story 102 — xAI dual-model investigation notes

**Date:** 2026-05-19  
**Story:** [102](../project_tasks/post-mvp/102-dual-model-manifest-and-harness-foundation.md)

## `grok-code-fast-1` after May 15, 2026 retirement

Per [xAI May 15 model retirement](https://docs.x.ai/developers/migration/may-15-retirement):

| Question | Finding |
| --- | --- |
| Hard API error on retired slug? | **No** — requests to `grok-code-fast-1` **redirect** to `grok-4.3` with **`low` reasoning effort**. |
| Pricing when using old slug? | Billed at **`grok-4.3`** rates ($1.25 / 1M input, $2.50 / 1M output), not legacy fast-code pricing. |
| Recommended explicit migration? | Use `grok-4.3` in the `model` field when you want to control reasoning effort and cost predictably. |

## Why GrokForge keeps dual model ids in manifest

- **Harness experiment:** compare **fast** vs **capable** harness profiles (**103**) under one app shell while manifest slots still name distinct ids.
- **Redirects do not break** the fast slug for API calls, but inference may effectively be `grok-4.3` until the user changes manifest defaults.
- **When to switch a project to all `grok-4.3`:** user choice via manifest / future Settings — no forced migration in **102**.

## `grok-4.3` for agentic coding

xAI recommends **`grok-4.3`** for agentic coding and tool use. GrokForge already defaults **`models.planning`** to `grok-4.3`. Chat-completions tool loop behavior is unchanged by **102** (metadata only).

## GrokForge action (102)

- **No** “retired model” toast on project load (redirect avoids hard failures).
- **`resolveHarnessProfileKey`** maps manifest **requested** id to profile keys; redirect happens at the API layer, not in GrokForge.
- **097** will make main the source of truth for `modelIntent` → `modelId` → `harnessProfileKey` on each turn.

## Manual smoke (developer)

With `XAI_API_KEY` configured:

1. New project → confirm `userData/.../project.json` has fast on `default`/`execution`, `grok-4.3` on `planning`.
2. Fast chat turn → dev log shows `harnessProfileKey: grok_code_fast` (for `grok-code-fast-1` manifest id).
3. Plan mode turn → dev log shows `harnessProfileKey: grok_4_3`.
