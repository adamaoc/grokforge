/**
 * Per-model harness profiles (story 103). Keys from agent-harness-profile-contract.
 */

import type { AgentChatToolName } from '../../shared/agent/chat-contract'
import type { HarnessProfileKey } from './contracts/harness-profile-key'
import { resolveHarnessProfileKey } from './contracts/harness-profile-key'
import {
  buildIncrementalEditHarnessSections,
  POST_PLAN_INCREMENTAL_ENFORCEMENT_LINE,
} from '../policy/incremental/work-edit-policy'
import {
  POST_PLAN_INCREMENTAL_MARKER,
  SINGLE_FILE_EDIT_BIAS_MARKER,
} from '../plan/routing/post-plan-incremental'
import type { IterativeEditScope } from '../routing/iterative-edit-scope'
import {
  INCREMENTAL_EDIT_CONSERVATIVE_LINES,
  INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES,
} from '../routing/iterative-work-edit'
import { GREENFIELD_HARNESS_MARKER } from '../context/workspace-greenfield'
import { GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER } from '../plan/verification/plan-verification'
import { GREENFIELD_SCAFFOLD_MANIFEST_MARKER } from '../context/bootstrap-manifest'
import {
  SCAFFOLD_STRATEGY_ROUTING_MARKER,
  type ScaffoldStrategy,
} from '../routing/scaffold-strategy'
import { getCodeQualityContractBlock } from '../policy/quality/code-quality-contract'
import {
  buildNpmCreateViteCommand,
  SCAFFOLD_COMMAND_EXAMPLES,
  SCAFFOLD_COMMAND_GUIDANCE_MARKER,
  type ViteTemplateId,
} from '../tools/helpers/scaffold-command'

export type HarnessPromptTurnContext = {
  greenfieldWorkspace?: boolean
  executeFromApprovedPlan?: boolean
  /** Story 120: incremental Work follow-up after approved/superseded plan. */
  postPlanIncremental?: boolean
  /** Story 120: workspace index shows one primary non-trivial file. */
  singleFilePrimary?: boolean
  /** Basename of primary file when singleFilePrimary (e.g. index.html). */
  singleFilePrimaryBasename?: string
  /** Story 128: resolved greenfield scaffold strategy for execute turns. */
  scaffoldStrategy?: ScaffoldStrategy | null
  /** Inferred Vite template for scaffold command examples (follow-up). */
  viteTemplateHint?: ViteTemplateId | null
  /** Story 130: non-greenfield workspace + edit-intent Work turn (no replan). */
  iterativeWorkEdit?: boolean
  /** npm/Vite-style populated repo — stack-specific hints when iterativeWorkEdit. */
  populatedWorkspace?: boolean
  /** Active editor file path when iterativeWorkEdit (for harness focus hint). */
  activeFilePath?: string | null
  /** Story 136: resolved edit scope for iterative Work turns. */
  iterativeEditScope?: IterativeEditScope
  /** Story 161: greenfield Work turn with create/edit intent, no approve-and-run. */
  greenfieldWorkBootstrap?: boolean
}

const GREENFIELD_PLAN_SECTIONS: readonly string[] = [
  GREENFIELD_HARNESS_MARKER,
  GREENFIELD_SCAFFOLD_MANIFEST_MARKER,
  GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER,
  'This workspace is **empty or nearly empty**. Plan a concrete bootstrap the executor can run without guessing paths.',
  '**Project shape:** Pick one and state it explicitly in the plan summary and steps:',
  '- **Vite + React + TS (or similar):** list `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`; include **`npm create`** / **`npm install`** steps for the executor (**126** `run_command` after approval).',
  '- **Static site (vanilla):** list `index.html`, `styles.css`, `script.js` with external `<script src="script.js">` — no `package.json` unless the user asked for a build tool.',
  '**File list:** Every `filesLikelyTouched` entry and each step title must name **concrete paths** under workspace roots (e.g. `src/App.tsx`, `package.json`, `index.html`) — no vague “add components” without paths.',
  '**Dependencies:** When the app needs npm, include `package.json` in `filesLikelyTouched`, an install step, and name verification commands (`npm install`, `npm run typecheck`, `npm test`) in `verification` and in step titles where appropriate.',
  '**Verification:** Prefer concrete commands where useful, but for simple single-file or small vanilla static sites (just index.html + small CSS/JS, no package.json), "Open the generated index.html directly in a browser and verify the UI" is valid and preferred verification — it avoids unnecessary serve processes, approvals, and timeouts.',
  '- **Simple static (`file_bootstrap` with 1-3 files):** browser-only or "files created and look correct" verification is encouraged. Optional lightweight serve only if the site is larger or live preview adds value.',
  '- **Larger static or framework (`cli_scaffold` etc.):** name a serve / `npm run dev` / typecheck / build in `verification` and step titles as appropriate.',
  'Do **not** force a dev server run for trivial single-file static HTML/CSS/JS apps.',
  '**Formatting:** Require real line breaks in HTML/CSS/JS — never one-line minified markup in the plan.',
  '**Tool budget:** Call `list_directory` once (plus retrieval if needed), then **stop discovery** and emit the `gf-plan` fence in your final answer — do not loop on more listing/search tools.',
]

/** Final-answer pointer; detailed edit/search rules live in AGENT_TOOL_LOOP_SHARED. */
export const EXECUTOR_FROM_PLAN_FINAL_ANSWER_POINTER =
  'Follow the approved `gf-plan` step order from thread context. Do not replan from scratch. Apply **Agent tool loop** rules: use the primary `edit` tool for modifications to existing files (precise edits[] against snapshot); use propose_file_edits write_file for new files or explicit large rewrites. On bootstrap, every planned path must have complete runnable content.'

const EXECUTOR_FROM_PLAN_SECTIONS: readonly string[] = [
  '## Execute approved plan (harness 101)',
  'Follow the **approved `gf-plan` step order** from thread context. Do not replan from scratch or invent a new architecture unless a step is blocked.',
  'Use **Agent tool loop** rules: `edit` (primary for modifications to existing files) and propose_file_edits (new files or explicit large refactors).',
  'When the plan lists **install, scaffold, git init, or verification** steps (`npm install`, `npm create`, `git init`, `npm run typecheck` / `test` / `build`), call **`run_command`** with a clear `purpose` tied to the plan step — do **not** hand-roll `package.json` or skip CLI steps because file edits are available.',
  'When the approved plan lists **multiple concrete paths** (e.g. `index.html`, `styles.css`, `script.js`), bootstrap **every named file** — do not collapse all JavaScript into a crushed inline `<script>` in HTML unless the plan explicitly specifies a single-file app.',
  '**`script.js` (and app `.js`) on bootstrap:** never **empty**, placeholder-only, or missing core logic — include **runnable** code the plan describes (state, DOM/render helpers, event listeners, init on `DOMContentLoaded` or equivalent).',
  'For **new HTML files**, send one **complete** document in a single `write_file` (valid `<!DOCTYPE html>`, `<head>`, `<body>`, closing tags). Prefer `<script src="script.js">` when the plan lists a separate JS path — never a one-line stub or truncated opener.',
  'Use **clean UTF-8** in HTML/CSS/JS: real ASCII quotes in attributes (not &#34;, &quot;, or backslash-u escape sequences), include `<meta charset="UTF-8">` in new HTML, and avoid mojibake or special control characters.',
  'Respect plan file paths and verification commands; run `run_command` when the plan or user intent requires install/scaffold/verify (user approval required). Do not claim a command ran without tool result.',
]

/** Greenfield execute — multi-file bootstrap is allowed; completeness is enforced by validation, not arbitrary file-count limits. */
function buildPostPlanIncrementalSections(): readonly string[] {
  return [
    POST_PLAN_INCREMENTAL_MARKER,
    'An **approved or superseded plan** already exists for this project. This turn is a **small incremental change** in Work mode — do **not** emit a new `gf-plan` or replan from scratch.',
    ...INCREMENTAL_EDIT_CONSERVATIVE_LINES,
    ...INCREMENTAL_EDIT_STRUCTURAL_CHANGE_LINES,
    getCodeQualityContractBlock(),
    'Use read/search tools only as needed, then the **`edit`** tool (structured precise replacements) for modifications to existing files. For post-plan incremental Work, **strongly prefer** the `edit` tool for small/localized changes. Reserve `propose_file_edits` for new files or when the user explicitly wants a large refactor/rewrite. Follow the approved plan artifact in context when paths or steps are unclear.',
    POST_PLAN_INCREMENTAL_ENFORCEMENT_LINE,
  ]
}

const SINGLE_FILE_EDIT_BIAS_SECTIONS: readonly string[] = [
  SINGLE_FILE_EDIT_BIAS_MARKER,
  'This workspace has **one primary file** for app code. After **one** `read_file`, prefer the **`edit`** tool (with one or more precise entries in the edits[] array drawn from rawContent) for modifications. This yields cleaner results than full-file proposals.',
  'Reserve `propose_file_edits` write_file for new files or when the user explicitly wants a deliberate full rewrite of the primary file.',
]

const POPULATED_STACK_HINT_SECTIONS: readonly string[] = [
  'For Vite/React feature work on existing files, prefer the **`edit`** tool (precise oldText/newText from a prior read_file) for **`src/App.tsx`** and co-located CSS. One call can contain multiple disjoint edits when changes are related.',
]

export const GREENFIELD_EXECUTE_CLI_MARKER = 'Harness: greenfield execute CLI'

/** Shared static-file formatting and bootstrap quality rules (161 DRY slice). */
export const GREENFIELD_STATIC_FILE_RULES: readonly string[] = [
  'When the user or plan names **`script.js`** (or another JS path), use **external** `<script src="script.js">` in HTML — do **not** put all application logic in a crushed inline `<script>` block.',
  'For modifications to existing files, strongly prefer the **`edit`** tool (precise `edits[]` array) over full `propose_file_edits`. This produces much cleaner, higher-quality results.',
  'For **package.json** / **tsconfig.json** / **vite.config.***: emit **valid JSON** (double-quoted keys). Minified one-line JSON is acceptable if parseable; invalid JSON is rejected — prefer **`run_command`** (`npm create`, `npm init`) when the user asked for a framework CLI.',
  'Each `write_file` (in propose_file_edits) must be a **complete**, **multi-line** file. Use real line breaks.',
  'HTML must use **plain UTF-8 text** in attributes and body copy — no HTML entity encoding (&#34;, &quot;) or JSON-style backslash-u escapes in the file body.',
  'In JavaScript (`script.js`, inline `<script>`, etc.): **one statement per line** with real line breaks — not a one-line stub. No glued `}function` / `}););`, no code after `//` on the same line, no orphan `)` lines; comments on their own lines only.',
  '**First-proposal code must be runnable on the first write:** Before emitting `propose_file_edits`, mentally review: (1) every DOM selector matches an element you created in the HTML, (2) event listeners attach after the DOM exists (DOMContentLoaded, defer, or script after elements), (3) no reference errors at runtime, (4) controls trigger the intended logic. Never an empty file, a lone `// TODO`, or logic deferred to HTML when a separate JS path was requested.',
  'If GrokForge rejects one path in a multi-file proposal, retry with **complete bodies for the failed paths only** — other accepted files are already in the pending review.',
]

export const GREENFIELD_WORK_BOOTSTRAP_MARKER = 'Harness: greenfield Work bootstrap 161'

export const GREENFIELD_WORK_BOOTSTRAP_SECTIONS: readonly string[] = [
  '## Greenfield Work bootstrap (direct creation)',
  GREENFIELD_WORK_BOOTSTRAP_MARKER,
  'This workspace is **empty or nearly empty**. The user wants you to **create** files in Work mode — use **`propose_file_edits`** for new paths unless a separate **`edit`** target already exists on disk.',
  ...GREENFIELD_STATIC_FILE_RULES,
  'When the user explicitly requests **one HTML file** (single-file app), inline `<script>` is allowed — but the script must still be **multi-line** formatted (one statement per line), never minified on one physical line.',
  'For trivial **static single-file** HTML/CSS/JS (no `package.json`, no build step), verify by **opening the file in a browser** — do **not** run `npm run dev`, `npx serve`, or other dev-server commands unless the user asked for a server or the app needs one.',
  'Do **not** run `npm create`, `npm init`, or other scaffold CLI unless the user explicitly asked for a framework or npm-based stack.',
]

export const GREENFIELD_EXECUTE_BOOTSTRAP_SECTIONS: readonly string[] = [
  '## Greenfield execute (bootstrap)',
  GREENFIELD_EXECUTE_CLI_MARKER,
  GREENFIELD_SCAFFOLD_MANIFEST_MARKER,
  'When the approved plan mentions **npm**, **install**, **scaffold**, or **git init**, prefer **`run_command`** first (`npm create`, `npm install`, `git init`) — then **`read_file`** / **`propose_file_edits`** only for customization. Do not invent a full template tree by hand when a CLI scaffold exists.',
  'For **vanilla static** plans without a build step, prefer **one `propose_file_edits`** with every new file the plan lists (`index.html`, `styles.css`, `script.js`, etc.) when the combined payload is reasonably small.',
  ...GREENFIELD_STATIC_FILE_RULES,
  'After install/scaffold commands succeed, **`read_file`** new paths before editing; GrokForge refreshes the workspace index when commands create files.',
  SCAFFOLD_COMMAND_GUIDANCE_MARKER,
  ...SCAFFOLD_COMMAND_EXAMPLES,
  'After a successful scaffold command, **`read_file`** `package.json`, vite config, and entry files — do not rely on `list_directory` alone to confirm React/TypeScript (or the requested stack).',
]

export const SCAFFOLD_STRATEGY_ROUTING_SECTIONS: readonly string[] = [
  '## Greenfield scaffold strategy (128)',
  SCAFFOLD_STRATEGY_ROUTING_MARKER,
  'Pick **one strategy** per execute turn. **Never** mix CLI scaffold and hand-written template files in the **same tool round**.',
  '| Strategy | When | This turn / phase | After success |',
  '|----------|------|-------------------|---------------|',
  '| **`cli_scaffold`** | Plan/user asks for Vite/React/npm template, `npm create`, or `npm init` | **`run_command` only** for create/install/init — **no** edit tools on template paths until CLI succeeds | `read_file` generated files; `edit` (preferred) or `propose_file_edits` only for customization of existing |',
  '| **`file_bootstrap`** | Static multi-file site (HTML/CSS/JS) with **no** package manager / build step | **`propose_file_edits`** for all new paths — **no** `npm create` / `npm init` unless user explicitly asked | Optional **`run_command`** only for verify when plan names a command |',
  '| **`cli_then_customize`** | Plan lists CLI step **then** customization files | **Phase 1:** command(s) only. **Phase 2** (after CLI success + index refresh): use `edit` tool for targeted modifications to generated files | Never interleave command + full write in one round |',
]

function scaffoldStrategyDetailLine(strategy: ScaffoldStrategy): string {
  switch (strategy) {
    case 'cli_scaffold':
      return '**Resolved strategy: `cli_scaffold`.** Run **`run_command`** (`npm create`, `npm install`, `git init`) first — do **not** hand-write `package.json`, `vite.config.*`, or template entry files this turn.'
    case 'file_bootstrap':
      return '**Resolved strategy: `file_bootstrap`.** Use **`propose_file_edits`** for every new path the user or plan needs — do **not** call `npm create` / `npm init` unless the user explicitly asked for CLI.'
    case 'cli_then_customize':
      return '**Resolved strategy: `cli_then_customize`.** Phase 1: CLI commands only. After success, `read_file` generated paths and propose **customization** edits only — not a full template rewrite.'
    case 'ambiguous':
      return '**Resolved strategy: ambiguous.** Pick either CLI scaffold **or** static file bootstrap based on the approved plan summary — do not combine both in one tool round.'
  }
}

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

/** Proactive exploration rules — default (non-iterative) tool loop. */
export const AGENT_TOOL_LOOP_EXPLORE_RULES: readonly string[] = [
  'When the user names a feature, page, or area without a path, use `search_workspace`, `list_directory`, and `read_file` under workspace roots — do not ask for an absolute path unless search is ambiguous.',
  'Prefer acting with tools over clarifying questions. On edit, fix, or implement intents, run discovery tools before proposing file changes or drafting plans.',
]

/** Bounded discovery for iterative Work edits on existing projects (story 130). */
export const AGENT_TOOL_LOOP_EXPLORE_RULES_ITERATIVE: readonly string[] = [
  'When the user names a feature without a path, use `search_workspace` once if needed — then `read_file` the target file. Do not ask for an absolute path unless search is ambiguous.',
  'On edit intents in an existing project: spend at most **two** read-only tool rounds before using the `edit` tool (preferred for modifications) — do not loop on broad discovery.',
]

/** Shared tool-loop rules excluding explore (assembled per turn via buildAgentToolLoopSharedSections). */
export const AGENT_TOOL_LOOP_CORE: readonly string[] = [
  'You may use the provided read/search tools to inspect this workspace before answering. Use tools when exact file contents or paths matter. You may request one-shot commands with run_command for tests, typecheck, git inspection, or diagnostics, but GrokForge will always ask the user before running model-requested commands. Do not claim a command ran unless the tool result says it ran. During tool planning, prefer tool calls over drafting the full answer; GrokForge will ask for the final response after tool use finishes.',
  'PRIMARY edit primitive for **existing files**: the **`edit`** tool (structured { path, edits: [{ oldText, newText }, ...], expectedContentHash }). Every oldText is matched against the original snapshot from read_file (Pi-style, not incremental). Use one call with multiple entries in edits[] for several closely-related changes in the same file. This is the reliable, high-quality path for virtually all modifications.',
  'For any **existing** file you modify with `edit` or propose write_file, you MUST have called `read_file` on that path earlier in the same turn and pass its `contentHash` as expectedContentHash. New files (write_file via propose_file_edits) do not require a prior read — omit expectedContentHash or use the `new` sentinel; never fabricate a hash.',
  'Copy `contentHash` from `read_file` into `expectedContentHash` when using `edit` or propose_file_edits write ops on **existing** files only.',
  '`edit` also accepts old_string/new_string for compatibility, but prefer the structured edits[] form for all new modification work.',
  'Each `write_file` (only via propose_file_edits, and only appropriate for new files or explicit large refactors) must contain complete file text with **real line breaks**. Base on `read_file` `rawContent`. Preserve indentation/comments for unchanged sections. Use startLine/maxLines for large files.',
  '**Code Quality (non-negotiable, strictly enforced on medium+ files):** All output must be clean, readable, professional source with **one statement per line** and real line breaks. On files > ~80 lines: zero tolerance for glued statements, minified output, or runs of lines without proper breaks — GrokForge will hard-reject and force re-read + clean rewrite. See the strengthened Code Quality Contract (injected below) for full rules.',
  'When creating **multiple new files**, prefer **one** `propose_file_edits` with several `write_file` ops (each body complete and multi-line).',
  'When syntax or formatting is broken in an existing file: `read_file` (full or relevant range), then use the **`edit`** tool with precise clean replacements for the broken regions. Only fall back to a full clean `propose_file_edits` write_file if the `edit` approach is impractical for the scope.',
  'Large tool results may be replaced with an offload pointer (`offloaded: true`); use `read_file` on `offloadPath` to load the full text.',
]

/** Shared tool-loop rules (all profiles) — default explore bias. */
export const AGENT_TOOL_LOOP_SHARED: readonly string[] = [
  ...AGENT_TOOL_LOOP_CORE,
  ...AGENT_TOOL_LOOP_EXPLORE_RULES,
]

/** Tool-loop shared rules with explore bias chosen for turn context (story 130). */
export function buildAgentToolLoopSharedSections(
  ctx: HarnessPromptTurnContext = {},
): readonly string[] {
  const explore = ctx.iterativeWorkEdit
    ? AGENT_TOOL_LOOP_EXPLORE_RULES_ITERATIVE
    : AGENT_TOOL_LOOP_EXPLORE_RULES
  return [...AGENT_TOOL_LOOP_CORE, ...explore]
}

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
    run_command:
      'Request a one-shot shell command from a workspace root cwd (install, scaffold, git, typecheck, test, build). For Vite: `npm create vite@latest . -- --template react-ts` (note the `--` before flags) or `npx -y create-vite@latest . --template react-ts`. Always include `--template` for create-vite — bare commands prompt interactively. Include a brief `purpose`. GrokForge requires user approval before running.',
  },
  finalAnswerContractVariant: 'fast_default',
  reasoningTracePolicy: 'preserve',
  toolUseBias:
    '**Tool-use bias (fast):** Prefer acting with tools over long explanations. Keep the final answer short unless the user asked for a deep explanation.',
  toolLoopSections: [
    'Bias toward **implementation**: if you have enough context from tools, proceed to `propose_file_edits` rather than extended planning prose.',
    'When the user or approved plan asks to **install**, **scaffold via CLI**, **init git**, or **verify** (typecheck/test/build), call **`run_command`** — not hand-written `package.json` alone.',
    'For **large** edits, ship **smaller, reviewable** proposals (one logical change per file) instead of one whole-file rewrite — GrokForge rejects crushed or glued statements before apply.',
    'Prefer the **smallest edit** that satisfies the request; escalate to full-file `propose_file_edits` only after `edit` match failures or explicit rewrite intent from the user.',
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
      'Read a capped line range from a text file under the workspace roots. **Read before large edits** — use startLine/maxLines on big files. The JSON result includes contentHash (SHA-256 of the full file on disk) — copy it into expectedContentHash on edit or propose_file_edits for existing files. Use rawContent (exact file text) as the source for edits.',
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
      if (ctx.scaffoldStrategy) {
        sections.push(...SCAFFOLD_STRATEGY_ROUTING_SECTIONS, scaffoldStrategyDetailLine(ctx.scaffoldStrategy))
        if (
          ctx.viteTemplateHint &&
          (ctx.scaffoldStrategy === 'cli_scaffold' || ctx.scaffoldStrategy === 'cli_then_customize')
        ) {
          sections.push(
            `Recommended non-interactive command: \`${buildNpmCreateViteCommand('.', ctx.viteTemplateHint)}\``,
          )
        }
      }
    }
  }
  if (
    ctx.greenfieldWorkBootstrap &&
    !ctx.executeFromApprovedPlan &&
    !ctx.iterativeWorkEdit &&
    (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')
  ) {
    sections.push(...GREENFIELD_WORK_BOOTSTRAP_SECTIONS)
    if (ctx.scaffoldStrategy) {
      sections.push(...SCAFFOLD_STRATEGY_ROUTING_SECTIONS, scaffoldStrategyDetailLine(ctx.scaffoldStrategy))
    }
  }
  if (
    ctx.postPlanIncremental &&
    !ctx.greenfieldWorkBootstrap &&
    !ctx.executeFromApprovedPlan &&
    (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')
  ) {
    sections.push(...buildPostPlanIncrementalSections())
  }
  if (ctx.singleFilePrimary && (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')) {
    const primaryHint = ctx.singleFilePrimaryBasename
      ? `Primary file: **${ctx.singleFilePrimaryBasename}**.`
      : ''
    sections.push(primaryHint, ...SINGLE_FILE_EDIT_BIAS_SECTIONS)
  }
  if (
    ctx.iterativeWorkEdit &&
    !ctx.postPlanIncremental &&
    !ctx.executeFromApprovedPlan &&
    (profile.key === 'grok_code_fast' || profile.key === 'grok_4_3')
  ) {
    sections.push(
      ...buildIncrementalEditHarnessSections({
        activeFilePath: ctx.activeFilePath,
        iterativeEditScope: ctx.iterativeEditScope,
      }),
    )
    if (ctx.populatedWorkspace) {
      sections.push(...POPULATED_STACK_HINT_SECTIONS)
    }
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
