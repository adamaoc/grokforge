# Story 102 / 121 — xAI dual-model investigation notes

**Last reviewed:** 2026-05-26  
**Stories:** 102, 121

Primary xAI references:

- [Models hub](https://docs.x.ai/developers/models)
- [Grok Build 0.1](https://docs.x.ai/developers/models/grok-build-0.1)
- [Grok 4.3](https://docs.x.ai/developers/models/grok-4.3)
- [May 15 retirement / migration](https://docs.x.ai/developers/migration/may-15-retirement)

## `grok-code-fast-1` after May 15, 2026 retirement

| Question | Finding (live API smoke 2026-05-26) |
| --- | --- |
| Hard API error on retired slug? | **No** — requests to `grok-code-fast-1` **redirect** to **`grok-build-0.1`**. Response `model` field is `grok-build-0.1`. |
| Pricing when using old slug? | Billed at **Grok Build 0.1** rates ($1.00 / 1M input, $2.00 / 1M output per model page), not legacy fast-code pricing and **not** Grok 4.3 pricing. |
| Recommended explicit migration? | Use **`grok-build-0.1`** (or keep `grok-code-fast-1` as alias) for agentic coding slots; use **`grok-4.3`** when you want 1M context and configurable reasoning effort. |

**Correction (121):** An earlier investigation (2026-05-19) recorded redirect to `grok-4.3`. The updated [May 15 migration guide](https://docs.x.ai/developers/migration/may-15-retirement) and live API now show redirect to **`grok-build-0.1`**.

## GrokForge dual-model defaults (121)

| Manifest slot | Default id | Harness profile | Notes |
| --- | --- | --- | --- |
| `default` / `execution` | `grok-build-0.1` | `grok_code_fast` | Dedicated agentic coding SKU (256k context) |
| `planning` | `grok-4.3` | `grok_4_3` | 1M context; supports `reasoning_effort` |
| `reasoning` | `grok-4.20-0309-reasoning` | `generic` | `grok-4.20-reasoning` redirects to dated slug |
| `voice` | `grok-voice-latest` | `generic` | `grok-voice-think-fast-1.0` still connects; legacy projects may keep old id |

Aliases mapped to **`grok_code_fast`**: `grok-build-0.1`, `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825`.

Existing projects are **not** forced to rewrite stored manifest ids; only new projects and fallbacks use the table above.

## `reasoning_effort` (chat completions)

| Model | `reasoning_effort` support |
| --- | --- |
| `grok-4.3` | **Yes** — `none` / `low` / `medium` / `high` (verified with `medium`) |
| `grok-build-0.1` | **No** — API returns 400 if `reasoningEffort` is sent; GrokForge omits the field for build / fast profile turns |

GrokForge policy (121):

- Planner turns on `grok-4.3` → `medium`
- Approve-and-run execute turns use `grok-build-0.1` (`models.execution`) — omit `reasoning_effort`
- Other non-planner `grok-4.3` turns (if manifest slot is 4.3) → `low`
- `grok_code_fast` / build aliases → omit

## Voice and TTS (2026-05-26)

| Surface | Result |
| --- | --- |
| Voice realtime `grok-voice-latest` | WebSocket connects |
| Voice realtime `grok-voice-think-fast-1.0` | WebSocket connects (legacy id still valid) |
| TTS built-ins `eve`, `ara`, `rex`, `sal`, `leo` | All return 200 with `language: auto` |
| Legacy hash voice `96819d0bd28d` (Daniel) | Still valid |

## Docs tension (product copy)

xAI models hub “which model” blurb may still point **Coding → Grok 4.3**, while the retirement guide recommends **`grok-build-0.1`** for code workloads. GrokForge follows **API redirect + migration guide** for defaults and documents this discrepancy for contributors.

## Why GrokForge keeps dual model ids in manifest

- **Harness experiment:** compare **fast coding** vs **capable planning** harness profiles (**103**) under one app shell.
- **Redirects do not break** legacy slugs for API calls; profile mapping uses the **requested** manifest id.
- **When to switch a project to all `grok-4.3`:** user choice via manifest / future Settings (**122**) — no forced migration in **121**.

## Manual smoke (developer)

With `XAI_API_KEY` configured:

1. New project → confirm `userData/.../project.json` has `grok-build-0.1` on `default`/`execution`, `grok-4.3` on `planning`.
2. Fast chat turn → dev log shows `harnessProfileKey: grok_code_fast`.
3. Plan mode turn → dev log shows `harnessProfileKey: grok_4_3` and `reasoningEffort: medium` on provider request.
4. Voice session start with default `grok-voice-latest`; read-aloud on `eve` and `ara`.
