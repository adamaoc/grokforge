/**
 * Per-model harness profiles (story 103). Keys from agent-harness-profile-contract.
 */

import type { AgentChatToolName } from './agent-chat-contract'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import { GREENFIELD_HARNESS_MARKER } from './workspace-greenfield'

export type HarnessPromptTurnContext = {
  greenfieldWorkspace?: boolean
  executeFromApprovedPlan?: boolean
}

const GREENFIELD_PLAN_SECTIONS: readonly string[] = [
  GREENFIELD_HARNESS_MARKER,
  'This workspace is **empty or nearly empty**. Plan a concrete bootstrap the executor can run without guessing paths.',
  '**Project shape:** Prefer a small multi-file app (HTML/CSS/JS or a framework scaffold with `package.json`) when the user asks to build an app. Use a single `index.html` only for a static demo with no build step.',
  '**File list:** Every `filesLikelyTouched` entry and each step title must name **concrete paths** under workspace roots (e.g. `src/App.tsx`, `package.json`, `index.html`) — no vague “add components” without paths.',
  '**Dependencies:** When the app needs npm, include `package.json` in `filesLikelyTouched`, an install step, and name verification commands (`npm install`, `npm run typecheck`, `npm test`) in `verification` and in step titles where appropriate.',
  '**Verification:** Include at least one step the executor can validate with an approvable `run_command` (install, typecheck, test, or dev server smoke).',
  '**Formatting:** Require real line breaks in HTML/CSS/JS — never one-line minified markup in the plan.',
  '**Tool budget:** Call `list_directory` once (plus retrieval if needed), then **stop discovery** and emit the `gf-plan` fence in your final answer — do not loop on more listing/search tools.',
]

const EXECUTOR_FROM_PLAN_SECTIONS: readonly string[] = [
  '## Execute approved plan (harness 101)',
  'Follow the **approved `gf-plan` step order** from thread context. Do not replan from scratch or invent a new architecture unless a step is blocked.',
  'Before editing any **existing** path, call `read_file` or `search_workspace` on that path in this turn.',
  'Prefer `search_replace` for localized edits on existing files; use `propose_file_edits` for new files or multi-file bootstrap.',
  'Respect plan file paths and verification commands; run `run_command` only when the plan or user intent requires it (user approval required).',
]

export type ReasoningTracePolicy = 'preserve' | 'strip' | 'provider_default'

export type FinalAnswerContractVariant = 'fast_default' | 'plan_capable' | 'generic_default'

export type AgentHarnessProfile = {
  key: HarnessProfileKey
  displayName: string
  modelIds: readonly string[]
  systemPromptSections: readonly string[]
  toolDescriptionOverrides: Partial<Record<AgentChatToolName, string>>
  finalAnswerContractVariant: FinalAnswerContractVariant
  reasoningTracePolicy: ReasoningTracePolicy
  toolUseBias: string
  /** Profile-specific lines inside the Agent tool loop system block. */
  toolLoopSections: readonly string[]
}

/** Shared tool-loop rules (all profiles). */
export const AGENT_TOOL_LOOP_SHARED: readonly string[] = [
  'You may use the provided read/search tools to inspect this workspace before answering. Use tools when exact file contents or paths matter. You may request one-shot commands with run_command for tests, typecheck, git inspection, or diagnostics, but GrokForge will always ask the user before running model-requested commands. Do not claim a command ran unless the tool result says it ran. During tool planning, prefer tool calls over drafting the full answer; GrokForge will ask for the final response after tool use finishes.',
  'For localized edits on existing files, prefer `search_replace` with an exact old_string that appears once, or `propose_file_edits` with minimal full-file content. Both create a GrokForge diff review without writing disk until the user applies. Use full `write_file` only for new files or intentional whole-file rewrites.',
  'For any **existing** file you modify, you MUST call `read_file` on that path earlier in this same turn before `propose_file_edits` or a write fence. New files do not require a prior read.',
  'Copy `contentHash` from `read_file` into `expectedContentHash` on `search_replace` and `propose_file_edits` write ops for existing files. Re-read if the file may have changed on disk.',
  'Each `write_file` must contain complete file text with **real line breaks** (never one semicolon-separated line for the whole file). Base proposals on `read_file` `rawContent` (not the line-numbered `content` field): preserve indentation and line breaks for unchanged sections. Use `startLine` / `maxLines` when reading large files before editing.',
  'When creating **multiple new files** in one task (e.g. bootstrap), prefer **one** `propose_file_edits` call with several `write_file` operations (up to 32), not separate calls per file.',
  'Large tool results may be replaced with an offload pointer (`offloaded: true`); use `read_file` on `offloadPath` to load the full text.',
]

const GROK_CODE_FAST: AgentHarnessProfile = {
  key: 'grok_code_fast',
  displayName: 'Grok Fast (code)',
  modelIds: ['grok-code-fast-1'],
  systemPromptSections: [
    '## Harness profile (fast execution)',
    'You are tuned for **fast, tool-first execution**: call read/search tools early, keep reasoning brief, and deliver concise final answers.',
  ],
  toolDescriptionOverrides: {
    search_workspace:
      'Ripgrep-style text search across all workspace roots (respects ignore rules). Use this like `rg` when the user names a feature or symbol without a path — do not ask for a path until search is ambiguous.',
  },
  finalAnswerContractVariant: 'fast_default',
  reasoningTracePolicy: 'preserve',
  toolUseBias:
    '**Tool-use bias (fast):** Prefer acting with tools over long explanations. On edit/fix/implement intents, run `search_workspace` and/or `list_directory` immediately, then `read_file` before proposing changes. Keep the final answer short unless the user asked for a deep explanation.',
  toolLoopSections: [
    'When the user names a feature or area without a path, use `search_workspace` (like ripgrep) and/or `list_directory` first—do not ask for an absolute path unless search is ambiguous.',
    'Prefer tool calls over clarifying questions. On edit/fix/implement intents, run discovery tools in the first tool round before proposing file changes.',
    'Bias toward **implementation**: if you have enough context from tools, proceed to `propose_file_edits` rather than extended planning prose.',
  ],
}

const GROK_4_3: AgentHarnessProfile = {
  key: 'grok_4_3',
  displayName: 'Grok 4.3',
  modelIds: ['grok-4.3'],
  systemPromptSections: [
    '## Harness profile (capable planning)',
    'You are tuned for **thorough investigation and structured planning**: read and search before concluding; in Plan mode, produce a high-quality `gf-plan` with explicit files, risks, and verification.',
  ],
  toolDescriptionOverrides: {
    read_file:
      'Read a capped line range from a text file under the workspace roots. **Read before large edits** — use startLine/maxLines on big files. The JSON result includes contentHash (SHA-256 of the full file on disk) — copy it into expectedContentHash on write_file, search_replace, or propose_file_edits for existing files. Use rawContent (exact file text) as the source for edits.',
    search_workspace:
      'Search text files under all workspace roots with strict result caps. Use proactively when the user names a feature, page, or symbol without a path — combine with `list_directory` and `read_file` before answering or planning.',
  },
  finalAnswerContractVariant: 'plan_capable',
  reasoningTracePolicy: 'preserve',
  toolUseBias:
    '**Tool-use bias (capable):** Prefer **evidence from tools** over assumptions. Run `search_workspace` and `read_file` before large `propose_file_edits`. In Plan mode, do not propose file edits on this turn — output `gf-plan` only.',
  toolLoopSections: [
    'When the user names a feature or area without a path, proactively use `search_workspace` and/or `list_directory`, then `read_file` on the best matches — do not ask for a path unless search results are ambiguous.',
    'Prefer **acting with tools** over clarifying questions. Gather enough workspace evidence before drafting plans or edit proposals.',
    'In Plan mode, investigation tools are allowed; **do not** call `propose_file_edits` or append edit fences — the user approves the plan before execution.',
  ],
}

const GENERIC: AgentHarnessProfile = {
  key: 'generic',
  displayName: 'Generic',
  modelIds: [],
  systemPromptSections: [],
  toolDescriptionOverrides: {},
  finalAnswerContractVariant: 'generic_default',
  reasoningTracePolicy: 'preserve',
  toolUseBias: '',
  toolLoopSections: [
    'When the user names a feature or area without a path, use `search_workspace` and/or `list_directory` first—do not ask for an absolute path unless search is ambiguous.',
    'Prefer tool use over clarifying questions. On edit/fix/implement intents, run discovery tools early before proposing file changes.',
  ],
}

const HARNESS_PROFILES: Record<HarnessProfileKey, AgentHarnessProfile> = {
  grok_code_fast: GROK_CODE_FAST,
  grok_4_3: GROK_4_3,
  generic: GENERIC,
}

export function getHarnessProfile(key: HarnessProfileKey): Readonly<AgentHarnessProfile> {
  return HARNESS_PROFILES[key] ?? HARNESS_PROFILES.generic
}

export function getHarnessProfileForModelId(modelId: string): Readonly<AgentHarnessProfile> {
  return getHarnessProfile(resolveHarnessProfileKey(modelId))
}

/** Merge profile harness sections into a system prompt body (after manifest context). */
export function appendHarnessProfileToSystemPrompt(
  systemPrompt: string,
  profile: Readonly<AgentHarnessProfile>,
  ctx?: HarnessPromptTurnContext,
): string {
  const greenfieldSummary =
    ctx?.greenfieldWorkspace && profile.key === 'grok_4_3'
      ? '**Greenfield workspace:** keep the plan concrete — name file paths, dependencies, and verification commands the executor can run after approval.'
      : ''
  const extra = [...profile.systemPromptSections, profile.toolUseBias, greenfieldSummary].filter(
    (s) => s.trim().length > 0,
  )
  if (extra.length === 0) return systemPrompt
  return `${systemPrompt}\n\n${extra.join('\n\n')}`
}

/** Turn-conditional harness sections (greenfield plan, execute-from-plan). */
export function buildHarnessTurnPromptSections(
  profile: Readonly<AgentHarnessProfile>,
  ctx: HarnessPromptTurnContext,
): readonly string[] {
  const sections: string[] = []
  if (ctx.greenfieldWorkspace && profile.key === 'grok_4_3') {
    sections.push(...GREENFIELD_PLAN_SECTIONS)
  }
  if (ctx.executeFromApprovedPlan && profile.key === 'grok_code_fast') {
    sections.push(...EXECUTOR_FROM_PLAN_SECTIONS)
  }
  return sections
}

/** Build the profile-specific portion of the Agent tool loop block. */
export function buildAgentToolLoopProfileSections(
  profile: Readonly<AgentHarnessProfile>,
  ctx: HarnessPromptTurnContext = {},
): string[] {
  return [...profile.toolLoopSections, ...buildHarnessTurnPromptSections(profile, ctx)]
}

/** Cross-surface proactive exploration rules (story 091 / 113). */
export const HARNESS_CROSS_SURFACE_EXPLORE_RULES: readonly string[] = [
  'When the user names a feature, page, or area without a path, typed agent chat should locate files with `search_workspace`, `list_directory`, and `read_file` under workspace roots — do not ask for an absolute path unless search is ambiguous.',
  'Prefer acting with tools over clarifying questions. On edit, fix, or implement intents, run discovery tools before proposing file changes.',
]

/** Voice realtime cannot run the text tool loop — handoff honesty (story 113). */
export const VOICE_REALTIME_ADAPTER_RULES: readonly string[] = [
  'Realtime voice does not run the full typed agent tool loop. For file inspection, edits, or multi-step implementation, offer to continue in **typed agent chat**; the user can tap **Continue in agent chat** in the voice bar to hand off the thread to tools.',
  'Do **not** ask the user to paste absolute file paths for implementation work. After handoff, typed agent chat will locate files with workspace search and read tools under the workspace roots.',
]

/** Profile-tuned voice instruction appendix (voice-safe, no heavy tool API detail). */
export const VOICE_PROFILE_APPENDIX: Record<HarnessProfileKey, readonly string[]> = {
  grok_code_fast: [
    'Keep spoken answers concise and action-oriented.',
    'When the user wants code changes or file work, encourage **Continue in agent chat** so the fast execution harness can search, read, and propose edits with tools.',
  ],
  grok_4_3: [
    'You may reason aloud in more depth, but still cannot edit files or run workspace tools in voice.',
    'For structured plans, multi-file work, or careful investigation, hand off to typed agent chat — the capable planning harness will search and read before proposing changes.',
  ],
  generic: [
    'Stay concise. Voice is for conversation and discovery; implementation belongs in typed agent chat with workspace tools.',
    'Offer **Continue in agent chat** when the user needs file reads, edits, tests, or multi-step implementation.',
  ],
}

/** Instruction block appended after manifest system prompt in voice session.update (story 113). */
export function buildVoiceHarnessAppendix(harnessProfileKey: HarnessProfileKey): string {
  const profile = getHarnessProfile(harnessProfileKey)
  const sections = [
    '## Voice adapter note',
    ...VOICE_REALTIME_ADAPTER_RULES,
    `Voice harness profile: ${profile.displayName} (${profile.key}).`,
    ...VOICE_PROFILE_APPENDIX[profile.key],
    ...HARNESS_CROSS_SURFACE_EXPLORE_RULES,
  ]
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const line of sections) {
    const trimmed = line.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    deduped.push(trimmed)
  }
  return deduped.join('\n')
}
