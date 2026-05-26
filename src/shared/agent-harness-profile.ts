/**
 * Per-model harness profiles (story 103). Keys from agent-harness-profile-contract.
 */

import type { AgentChatToolName } from './agent-chat-contract'
import type { HarnessProfileKey } from './agent-harness-profile-contract'
import { resolveHarnessProfileKey } from './agent-harness-profile-contract'
import {
  POST_PLAN_INCREMENTAL_MARKER,
  SINGLE_FILE_EDIT_BIAS_MARKER,
} from './post-plan-incremental'
import { GREENFIELD_HARNESS_MARKER } from './workspace-greenfield'

export type HarnessPromptTurnContext = {
  greenfieldWorkspace?: boolean
  executeFromApprovedPlan?: boolean
  /** Story 120: incremental Work follow-up after approved/superseded plan. */
  postPlanIncremental?: boolean
  /** Story 120: workspace index shows one primary non-trivial file. */
  singleFilePrimary?: boolean
  /** Basename of primary file when singleFilePrimary (e.g. index.html). */
  singleFilePrimaryBasename?: string
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

/** Final-answer pointer; detailed edit/search rules live in AGENT_TOOL_LOOP_SHARED. */
export const EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER =
  'Follow the approved `gf-plan` step order from thread context. Do not replan from scratch. Apply **Agent tool loop** rules above for read-before-edit, `search_replace` vs `propose_file_edits`, and `run_command` approval.'

const EXECUTOR_FROM_PLAN_SECTIONS: readonly string[] = [
  '## Execute approved plan (harness 101)',
  'Follow the **approved `gf-plan` step order** from thread context. Do not replan from scratch or invent a new architecture unless a step is blocked.',
  'Use **Agent tool loop** rules above for discovery, read-before-edit, localized `search_replace`, and `propose_file_edits` for new or multi-file work.',
  'When the approved plan lists **multiple concrete paths** (e.g. `index.html`, `styles.css`, `script.js`), bootstrap **every named file** — do not collapse all JavaScript into a crushed inline `<script>` in HTML unless the plan explicitly specifies a single-file app.',
  'For **new HTML files**, send one **complete** document in a single `write_file` (valid `<!DOCTYPE html>`, `<head>`, `<body>`, closing tags). Prefer `<script src="script.js">` when the plan lists a separate JS path — never a one-line stub or truncated opener.',
  'Use **clean UTF-8** in HTML/CSS/JS: real ASCII quotes in attributes (not &#34;, &quot;, or backslash-u escape sequences), include `<meta charset="UTF-8">` in new HTML, and avoid mojibake or special control characters.',
  'Respect plan file paths and verification commands; run `run_command` only when the plan or user intent requires it (user approval required).',
]

/** Greenfield execute — multi-file bootstrap is allowed; completeness is enforced by validation, not arbitrary file-count limits. */
const POST_PLAN_INCREMENTAL_SECTIONS: readonly string[] = [
  POST_PLAN_INCREMENTAL_MARKER,
  'An **approved or superseded plan** already exists for this project. This turn is a **small incremental change** in Work mode — do **not** emit a new `gf-plan` or replan from scratch.',
  'Use read/search tools only as needed, then **`propose_file_edits`** or localized **`search_replace`** for the requested change. Follow the approved plan artifact in context when paths or steps are unclear.',
]

const SINGLE_FILE_EDIT_BIAS_SECTIONS: readonly string[] = [
  SINGLE_FILE_EDIT_BIAS_MARKER,
  'This workspace has **one primary file** for app code. After **one** `read_file` on that file, prefer **one** `propose_file_edits` with the **full** file from `rawContent` (minimal edits to unchanged sections).',
  'Do **not** chain three or more `search_replace` calls on the same path in one turn — use a single full-file proposal instead (GrokForge merges in-order S&R, but full-file proposals are more reliable for HTML/JS).',
]

export const GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS: readonly string[] = [
  '## Greenfield execute (bootstrap)',
  'Workspace is empty or near-empty: prefer **one `propose_file_edits`** with every new file the approved plan lists (`index.html`, `styles.css`, `script.js`, etc.) when the combined payload is reasonably small.',
  'When the plan names **`script.js`** (or another JS path), use **external** `<script src="script.js">` in HTML — do **not** put all application logic in a crushed inline `<script>` block.',
  'Each `write_file` must be a **complete**, **multi-line** file (HTML with `</body></html>`, valid CSS, valid JS). Use real line breaks — not one-line stubs.',
  'HTML must use **plain UTF-8 text** in attributes and body copy — no HTML entity encoding (&#34;, &quot;) or JSON-style backslash-u escapes in the file body.',
  'For vanilla todo apps prefer **index.html + styles.css + script.js** (linked with `<script src="script.js">`) instead of a huge inline `<script>` block.',
  'In JavaScript: **one statement per line**; no decorative `//` comments; never glue `}function`, `}););//`, or executable code on the same line after `//`.',
  'If GrokForge rejects one path in a multi-file proposal, retry with **complete bodies for the failed paths only** — other accepted files are already in the pending review.',
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

/** Proactive exploration rules — included in AGENT_TOOL_LOOP_SHARED and voice handoff. */
export const AGENT_TOOL_LOOP_EXPLORE_RULES: readonly string[] = [
  'When the user names a feature, page, or area without a path, use `search_workspace`, `list_directory`, and `read_file` under workspace roots — do not ask for an absolute path unless search is ambiguous.',
  'Prefer acting with tools over clarifying questions. On edit, fix, or implement intents, run discovery tools before proposing file changes or drafting plans.',
]

/** Shared tool-loop rules (all profiles). */
export const AGENT_TOOL_LOOP_SHARED: readonly string[] = [
  'You may use the provided read/search tools to inspect this workspace before answering. Use tools when exact file contents or paths matter. You may request one-shot commands with run_command for tests, typecheck, git inspection, or diagnostics, but GrokForge will always ask the user before running model-requested commands. Do not claim a command ran unless the tool result says it ran. During tool planning, prefer tool calls over drafting the full answer; GrokForge will ask for the final response after tool use finishes.',
  'For localized edits on existing files, prefer `search_replace` with an exact old_string that appears once, or `propose_file_edits` with minimal full-file content. Both create a GrokForge diff review without writing disk until the user applies. Use full `write_file` only for new files or intentional whole-file rewrites.',
  'Multiple `search_replace` calls on the **same file in one turn** are applied **in order** on the in-memory proposal (each patch builds on the prior). For many unrelated regions (e.g. restyle + markup + script), prefer one larger `search_replace` with a unique `old_string`, or a single `propose_file_edits` with the full file.',
  'For any **existing** file you modify, you MUST call `read_file` on that path earlier in this same turn before `propose_file_edits` or a write fence. New files do not require a prior read.',
  'Copy `contentHash` from `read_file` into `expectedContentHash` on `search_replace` and `propose_file_edits` write ops for existing files. Re-read if the file may have changed on disk.',
  'Each `write_file` must contain complete file text with **real line breaks** (never one semicolon-separated line for the whole file). Base proposals on `read_file` `rawContent` (not the line-numbered `content` field): preserve indentation and line breaks for unchanged sections. Use `startLine` / `maxLines` when reading large files before editing.',
  'When creating **multiple new files** in one task (e.g. bootstrap), prefer **one** `propose_file_edits` call with several `write_file` operations (up to 32), not separate calls per file.',
  'When the user reports **syntax errors** or broken formatting in an existing file, call `read_file`, then one `propose_file_edits` with the **full** file from `rawContent` — do not loop on `search_replace` against crushed one-line scripts.',
  'Large tool results may be replaced with an offload pointer (`offloaded: true`); use `read_file` on `offloadPath` to load the full text.',
  ...AGENT_TOOL_LOOP_EXPLORE_RULES,
]

const GROK_CODE_FAST: AgentHarnessProfile = {
  key: 'grok_code_fast',
  displayName: 'Grok Fast (code)',
  modelIds: ['grok-build-0.1', 'grok-code-fast-1', 'grok-code-fast', 'grok-code-fast-1-0825'],
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
    '**Tool-use bias (fast):** Prefer acting with tools over long explanations. Keep the final answer short unless the user asked for a deep explanation.',
  toolLoopSections: [
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
    '**Tool-use bias (capable):** Prefer **evidence from tools** over assumptions. In Plan mode, do not propose file edits on this turn — output `gf-plan` only.',
  toolLoopSections: [
    'Gather enough workspace evidence before drafting plans or edit proposals.',
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
  toolLoopSections: [],
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
  if (
    ctx.executeFromApprovedPlan &&
    (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')
  ) {
    sections.push(...EXECUTOR_FROM_PLAN_SECTIONS)
    if (ctx.greenfieldWorkspace && profile.key === 'grok_code_fast') {
      sections.push(...GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS)
    }
  }
  if (
    ctx.postPlanIncremental &&
    !ctx.executeFromApprovedPlan &&
    (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')
  ) {
    sections.push(...POST_PLAN_INCREMENTAL_SECTIONS)
  }
  if (ctx.singleFilePrimary && (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')) {
    const primaryHint = ctx.singleFilePrimaryBasename
      ? `Primary file: **${ctx.singleFilePrimaryBasename}**.`
      : ''
    sections.push(primaryHint, ...SINGLE_FILE_EDIT_BIAS_SECTIONS)
  }
  return sections.filter((s) => s.trim().length > 0)
}

/** Build the profile-specific portion of the Agent tool loop block. */
export function buildAgentToolLoopProfileSections(
  profile: Readonly<AgentHarnessProfile>,
  ctx: HarnessPromptTurnContext = {},
): string[] {
  return [...profile.toolLoopSections, ...buildHarnessTurnPromptSections(profile, ctx)]
}

/** Cross-surface proactive exploration rules (story 091 / 113). Voice uses third-person phrasing on line 1. */
export const HARNESS_CROSS_SURFACE_EXPLORE_RULES: readonly string[] = [
  'When the user names a feature, page, or area without a path, typed agent chat should locate files with `search_workspace`, `list_directory`, and `read_file` under workspace roots — do not ask for an absolute path unless search is ambiguous.',
  AGENT_TOOL_LOOP_EXPLORE_RULES[1]!,
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
