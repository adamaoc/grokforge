# 121 — xAI model catalog and API sync (Grok Build 0.1, Grok 4.3, Voice)

**Status:** Post-MVP backlog.

**Design skill:** Read [`.cursor/skills/styleguide-design/SKILL.md`](../../.cursor/skills/styleguide-design/SKILL.md) for Settings → Models / Voice copy, TTS voice picker, and any model-id labels in chat chrome.

**Depends on:** Nothing (research + alignment story). Touches foundations from [**102**](102-dual-model-manifest-and-harness-foundation.md), [**103**](103-agent-harness-per-model-profiles.md), [**113**](113-voice-realtime-harness-profile-alignment.md).

**Blocks:** Optional follow-ups (reasoning effort UI, STT, multimodal chat attachments) — list as separate stories if scoped out here.

## Why this story exists

xAI refreshed their **Models** hub and per-model pages (May 2026). GrokForge still documents and defaults against a **May 15 retirement narrative** where `grok-code-fast-1` redirected to **`grok-4.3`**. The current [migration guide](https://docs.x.ai/developers/migration/may-15-retirement) now says **`grok-code-fast-1` → `grok-build-0.1`**, with **`grok-build-0.1`** as the dedicated agentic coding SKU (256k context, $1.00 / $2.00 per 1M tokens). That invalidates [`docs/harness-102-xai-investigation.md`](../../docs/harness-102-xai-investigation.md) and parts of **`AGENTS.md`** / **`docs/i-am-a-harness.md`** / **`docs/harness-roadmap.md`**.

We need one audited story to realign **manifest defaults**, **harness profile keys**, **chat-completions request params**, **voice realtime + TTS**, **Settings UX**, and **contributor docs** with the public catalog — without breaking existing projects that still store legacy slugs in `manifest.models`.

## Source of truth (reviewed 2026-05-26)

Primary links (read in full during implementation; do not rely on memory):

| Resource | URL | Notes |
| --- | --- | --- |
| Models hub | [docs.x.ai/developers/models](https://docs.x.ai/developers/models) | Pricing table, selection guide, alias rules, `logprobs` caveat |
| Grok 4.3 | [docs.x.ai/developers/models/grok-4.3](https://docs.x.ai/developers/models/grok-4.3) | 1M context; function calling + structured outputs; **configurable reasoning**; cached input $0.20 / 1M |
| Grok Build 0.1 | [docs.x.ai/developers/models/grok-build-0.1](https://docs.x.ai/developers/models/grok-build-0.1) | 256k context; **aliases include `grok-code-fast-1`**; higher-context pricing above 200k (per model page) |
| Voice overview | [docs.x.ai/developers/model-capabilities/audio/voice](https://docs.x.ai/developers/model-capabilities/audio/voice) | Realtime WebSocket, TTS, STT, custom voices, built-in voice names |
| May 15 retirement | [docs.x.ai/developers/migration/may-15-retirement](https://docs.x.ai/developers/migration/may-15-retirement) | Redirect matrix; explicit replacements |

### Catalog summary (for GrokForge)

**Text / agent chat**

| Model id | Context | Input / 1M | Output / 1M | Role in xAI docs |
| --- | --- | --- | --- | --- |
| `grok-4.3` | 1M | $1.25 | $2.50 | Flagship chat + agentic tool calling; reasoning **none / low / medium / high** |
| `grok-build-0.1` | 256k | $1.00 | $2.00 | Fast **agentic coding** (early access); aliases: `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825` |
| `grok-4.20-0309-reasoning` | 1M | $1.25 | $2.50 | Listed on models hub (alongside non-reasoning variant) |
| `grok-4.20-0309-non-reasoning` | 1M | $1.25 | $2.50 | Same pricing tier |
| `grok-4.20-multi-agent-0309` | 1M | $1.25 | $2.50 | Multi-agent SKU (evaluate fit vs `spawn_subagent`) |

**Docs tension to resolve in investigation:** the models hub “which model” blurb currently points **Coding → Grok 4.3**, while the retirement guide recommends **`grok-build-0.1`** for code workloads. GrokForge should follow **API redirect + migration guide** for defaults, and document the product copy discrepancy for users.

**Voice**

| Surface | Endpoint | Default / example model | Pricing (hub) |
| --- | --- | --- | --- |
| Voice Agent (realtime) | `wss://api.x.ai/v1/realtime?model=…` | Docs example: `grok-voice-latest` | $3.00 / hr ($0.05 / min) |
| TTS | `POST /v1/tts` | `voice_id`: `eve`, `ara`, `rex`, `sal`, `leo` | $15.00 / 1M characters |
| STT | `POST /v1/stt` (+ streaming WS) | Not integrated in GrokForge | $0.10 / hr REST; $0.20 / hr streaming |
| Custom voices | `POST /v1/custom-voices` | Clone → reuse `voice_id` in TTS + realtime | — |

**Other APIs (out of scope unless explicitly added)**

- **Imagine** (image/video) — separate product surface.
- **Ephemeral tokens** — for client-side voice without exposing API keys; GrokForge uses main-process Bearer auth (acceptable for desktop).

**Platform notes from models hub**

- `logprobs` / `top_logprobs` **silently ignored** on `grok-4.20` and newer — confirm we do not depend on them.
- Image input on text models: up to **20 MiB**, `jpg`/`png`, unlimited count — future multimodal story.
- Knowledge cutoff called out as **November 2024** for Grok 3 / 4 family (user-facing disclaimer if we add one).

## Current GrokForge state (gap analysis)

| Area | Today | Gap vs xAI May 2026 catalog |
| --- | --- | --- |
| **Defaults** (`DUAL_MODEL_FALLBACKS`) | `grok-code-fast-1` on default/execution; `grok-4.3` on planning; `grok-4.20-reasoning` on reasoning; `grok-voice-think-fast-1.0` on voice | Fast slug is an **alias** of `grok-build-0.1`, not “retired to 4.3”; voice default may not match `grok-voice-latest`; reasoning slug may need `grok-4.20-0309-reasoning` audit |
| **Harness profile map** | Only `grok-code-fast-1` → `grok_code_fast`, `grok-4.3` → `grok_4_3` | Missing explicit `grok-build-0.1` (and aliases) → same profile key; unknown ids fall through to `generic` |
| **Investigation doc** | [`harness-102-xai-investigation.md`](../../docs/harness-102-xai-investigation.md) says fast slug → `grok-4.3` | **Wrong** per updated migration guide → `grok-build-0.1` |
| **Chat transport** | No `reasoning_effort` (or equivalent) on completions body | Cannot exploit Grok 4.3 **none/low/medium/high**; cannot mirror redirect defaults intentionally |
| **Context budgets** | Conservative char caps in `AGENT_CONTEXT_BUDGETS` (~28k system, etc.) | Not wrong, but document relationship to **1M** (4.3) vs **256k** (build) windows; optional tiered budgets per resolved model family |
| **TTS presets** | `TTS_VOICE_PRESETS` mixes `eve` + legacy hash ids (Daniel, James, …) | Docs emphasize five built-ins **`eve` / `ara` / `rex` / `sal` / `leo`**; verify old hash ids still valid or migrate UI |
| **Voice realtime** | Uses manifest `models.voice`; session `voice` field defaults to `eve` | Confirm realtime model id; align docs example `grok-voice-latest`; optional manifest default change + migration note for existing projects |
| **Settings** | Free-text per intent slot (`default`, `planning`, `execution`, `reasoning`, `voice`) | Add curated presets / doc links; optional “reset to recommended defaults” |
| **Subagent** | `spawn_subagent` allows `planning` \| `reasoning` intents | Reconcile with `grok-4.20-*` skus if reasoning default changes |

## Investigation checklist (required in PR notes)

- [ ] Live API smoke: `grok-code-fast-1`, `grok-build-0.1`, and `grok-4.3` each return expected model behavior (tool loop sample + logged billing id if visible).
- [ ] Confirm **redirect target** for `grok-code-fast-1` is `grok-build-0.1` (not `grok-4.3`) and document pricing ($1/$2 vs $1.25/$2.50).
- [ ] Voice: `grok-voice-think-fast-1.0` vs `grok-voice-latest` — which is recommended; does old id redirect?
- [ ] TTS: verify each built-in voice id; test one legacy hash preset still works or drop from UI.
- [ ] Reasoning: request shape for `reasoning_effort` on `grok-4.3` (and whether `grok-build-0.1` accepts effort or fixed internal reasoning).
- [ ] Search repo for stale strings: `retired`, `redirect.*grok-4.3`, `grok-4.20-reasoning` (non-dated), voice model names.
- [ ] Decide **product default** for new projects: keep dual-id experiment (`grok-build-0.1` + `grok-4.3`) vs explicit canonical ids vs all-4.3 with effort flags.

## Goals

### 1. Correct the documentation trail

- Rewrite [`docs/harness-102-xai-investigation.md`](../../docs/harness-102-xai-investigation.md) with the **May 2026** redirect matrix (`grok-code-fast-1` → `grok-build-0.1`).
- Update **`AGENTS.md`**, **`docs/i-am-a-harness.md`**, **`docs/harness-roadmap.md`** §2 dual-model table (redirect target, pricing, when to use build vs 4.3).
- Add a short **“xAI model catalog”** subsection linking to official docs (or extend `README.md` dev setup) — no duplicate pricing tables in repo unless we snapshot “last reviewed” date.

### 2. Manifest defaults and profile resolution

- **`src/shared/model-router.ts`** — decide and implement defaults:
  - **Recommended:** `chat_default` + `execution` → `grok-build-0.1` (or keep `grok-code-fast-1` as alias with comment that API resolves to build).
  - Keep `planning` → `grok-4.3`.
  - Audit `reasoning` → `grok-4.20-0309-reasoning` vs keep `grok-4.20-reasoning` (verify alias/redirect).
  - Audit `voice` → `grok-voice-latest` (or document why legacy id is kept).
- **`src/shared/agent-harness-profile-contract.ts`** — map `grok-build-0.1` and aliases (`grok-code-fast-1`, `grok-code-fast`, …) → `grok_code_fast`; consider renaming profile key to `grok_build` in a follow-up if copy confuses contributors.
- **`src/main/app-project-store.ts`**, **`example.grokproject.json`** — same defaults as router.
- **Existing projects:** no forced rewrite; optional one-time dev toast if manifest uses ids known to redirect with different pricing (investigation outcome).

### 3. Chat completions: reasoning effort (minimal v1)

- Extend provider request builder / transport (`agent-chat-model-transport.ts`, turn snapshot) to pass **`reasoning_effort`** when profile + model support it, e.g.:
  - Plan / planner turns on `grok-4.3`: `low` or `medium` (product choice).
  - Fast / executor on `grok-build-0.1`: per API docs (possibly omit or `low`).
  - Approve-and-run execution: align with executor policy.
- Store chosen effort in turn trace metadata (`turn_started.routing` or provider round metadata) for debugging.
- Add eval or unit coverage that request JSON includes effort when expected (recording transport).

### 4. Voice + TTS alignment

- **`voice-realtime.ts`**: default manifest voice model per investigation; keep main-process Bearer auth (ephemeral tokens non-goal).
- **`tts-read-aloud-contract.ts` + Settings**: align preset list with **`eve` / `ara` / `rex` / `sal` / `leo`**; retain custom `voice_id` from manifest; document deprecated hash presets.
- Manual smoke: voice session start, read-aloud on two voices, handoff to agent chat (**113**).

### 5. Settings and in-app labels

- Settings → model slots: short helper text per slot (which xAI model, context size, link to docs).
- Optional: “Restore recommended defaults” button (writes manifest via existing save path).
- Chat chrome (**065** / turn context UI): show resolved id; in dev, show `harnessProfileKey` + `reasoning_effort` when present.

### 6. Tests and eval

- Update fixtures that hardcode model ids across `src/**/*.test.ts`.
- Extend **`agent-runner-evaluation.test.ts`** tag for build vs 4.3 routing if defaults change.
- Run **`npm run test:agent-eval`** and **`npm run typecheck`**.

## Non-goals

- **Imagine** image/video generation.
- **STT** ingestion (new feature — separate story if wanted).
- **Ephemeral voice tokens** (desktop app uses main-process key).
- **Multimodal** image attachments in agent chat (separate story; only document limits).
- **Web Search / X Search** server tools (xAI-hosted; not GrokForge workspace tools).
- Renaming harness profile keys (`grok_code_fast` → `grok_build`) unless zero churn — optional follow-up.
- Changing planner vs executor routing logic (**097**) or post-plan heuristics (**120**).

## Architecture notes

```
manifest.models.* → getModelForIntent → modelId
       → resolveHarnessProfileKey(modelId)   // include grok-build-0.1 aliases
       → harness profile + optional reasoning_effort
       → AgentProviderRequest → chat completions / voice WS
```

Dual-model **product** intent unchanged: **fast coding harness** vs **capable planning harness** — only the **canonical xAI ids and API params** catch up to the catalog.

## Key files

| Area | Files |
| --- | --- |
| Defaults | `src/shared/model-router.ts`, `src/main/app-project-store.ts`, `example.grokproject.json` |
| Profile keys | `src/shared/agent-harness-profile-contract.ts`, `src/shared/agent-harness-profile.ts` |
| Provider | `src/main/agent-chat-model-transport.ts`, `src/shared/agent-turn-snapshot.ts`, `src/main/agent-turn-snapshot-builder.ts` |
| Voice / TTS | `src/main/voice-realtime.ts`, `src/main/tts-read-aloud.ts`, `src/shared/tts-read-aloud-contract.ts` |
| UI | `src/renderer/src/components/SettingsPage.tsx`, `ChatTurnContextUi.tsx` |
| Docs | `AGENTS.md`, `docs/i-am-a-harness.md`, `docs/harness-roadmap.md`, `docs/harness-102-xai-investigation.md` |
| Tests | `src/main/model-router.test.ts`, `src/main/app-project-store.test.ts`, `src/shared/agent-harness-profile-contract.test.ts`, `src/main/agent-runner-evaluation.test.ts` |

## Acceptance criteria

- [ ] Investigation section in PR describes redirect behavior for `grok-code-fast-1`, voice model id, and reasoning slugs (dated 2026-05-26 or later).
- [ ] Contributor docs no longer claim fast slug redirects to `grok-4.3`.
- [ ] New projects get defaults consistent with investigation (build + 4.3 dual-model or documented alternative).
- [ ] `resolveHarnessProfileKey('grok-build-0.1')` (and `grok-code-fast-1`) maps to fast coding profile, not `generic`.
- [ ] At least one agent turn on 4.3 sends `reasoning_effort` when harness policy says so (verified in test or eval recording).
- [ ] TTS UI lists the five documented built-in voices; custom manifest voice still works.
- [ ] Voice realtime starts with updated default model id (if changed) without regression on handoff (**113**).
- [ ] `npm run typecheck` and targeted tests pass.

## Related

- [**102**](102-dual-model-manifest-and-harness-foundation.md), [**103**](103-agent-harness-per-model-profiles.md), [**113**](113-voice-realtime-harness-profile-alignment.md)
- [**122**](122-dynamic-xai-model-catalog-and-settings-picker.md) — long-term: fetch models from xAI API + user pickers (no app release per new model id); **out of scope for 121**
- [**018**](018-handoff-grok-build-and-grok-computer.md) (closed — revisit only if xAI ships deep links)
- Future: multimodal chat, STT, reasoning effort user override in composer

**Product note (2026-05-26):** For coding slots, prefer **`grok-build-0.1`** (or `grok-code-fast-1` alias) over treating fast slug as “retired to 4.3” — Build is xAI’s dedicated agentic coding SKU.

## Completion bookkeeping

When shipped: update **Status**, [`README.md`](../README.md) post-MVP table, [`docs/harness-roadmap.md`](../../docs/harness-roadmap.md) §2, run **`npm run stories:html`**.
