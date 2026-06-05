import { z } from 'zod'
import type { AgentProfileId } from '../../profiles/agent-profile'
import type { HarnessProfileKey } from '../../profiles/contracts/harness-profile-key'
import { GREENFIELD_HARNESS_MARKER } from '../../context/workspace-greenfield'
import { GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER } from '../verification/plan-verification'

/** Fenced markdown language tag — must not collide with `grokforge-agent-tools`. */
export const GF_PLAN_FENCE = 'gf-plan'

export const GF_PLAN_SCHEMA_VERSION = 1 as const

/** Human-readable JSON field list — single source for tool-loop and final-answer prompts. */
export const GF_PLAN_SCHEMA_FIELDS_DESCRIPTION =
  '`schemaVersion` 1, `summary` (string), `filesLikelyTouched` (string array), `risksUnknowns` (string array), `steps` (array of { `id`, `title` } with at least one step), `verification` (string)'

/** Fence requirement; optional legacy fence tag exclusion (tool-loop block). */
export function gfPlanFenceRequirementLine(options?: { forbiddenLegacyFenceTag?: string }): string {
  const forbidden = options?.forbiddenLegacyFenceTag?.trim()
    ? ` (not \`${options.forbiddenLegacyFenceTag}\`)`
    : ''
  return `Your final answer must include **exactly one** fenced JSON block with the markdown language tag \`${GF_PLAN_FENCE}\`${forbidden}.`
}

export const GF_PLAN_SCHEMA_BODY_LINE = `The fence body must be one JSON object with: ${GF_PLAN_SCHEMA_FIELDS_DESCRIPTION}.`

const GF_PLAN_OUTPUT_CONTRACT_TAIL: readonly string[] = [
  'You may include short readable prose before or after the fence. The JSON must parse as-is.',
  'Do **not** call `propose_file_edits` or propose file writes on this turn — execution happens after the user approves the plan.',
  'Do not put file-write payloads inside the plan JSON; use `propose_file_edits` after approval.',
  'For install/scaffold/verify steps, name **concrete shell commands** in `verification` and step titles — the executor will call **`run_command`** after user approval.',
  '**Static HTML/CSS/JS (simple single-file or small vanilla Todo-like):** verification may be "Open index.html directly in the browser and confirm the UI works" — no serve command required. For larger static sites or when a live preview is useful, a lightweight serve (`npx --yes serve . -l 3000` or `python3 -m http.server 3000`) is acceptable but optional.',
  '**npm / Vite / React:** include `npm install`, `npm run dev`, `npm run typecheck`, or `npm run build` as appropriate.',
  'In `filesLikelyTouched` and steps, be explicit about single-file vs multi-file layout. Mention code quality expectations (readable formatting, **one statement per line**, real line breaks, **no glued or minified output** — especially on medium+ files). GrokForge now strictly rejects crushed proposals.',
]

/**
 * Canonical gf-plan output requirements (fence tag, schema, prose rule, no edits this turn).
 * Import from here for planner tool-loop blocks and Plan-mode final-answer contracts.
 */
export function gfPlanOutputContractLines(options?: {
  forbiddenLegacyFenceTag?: string
}): string[] {
  return [gfPlanFenceRequirementLine(options), GF_PLAN_SCHEMA_BODY_LINE, ...GF_PLAN_OUTPUT_CONTRACT_TAIL]
}

/** Default contract lines (final answer; no legacy-fence exclusion). */
export const GF_PLAN_OUTPUT_CONTRACT: readonly string[] = gfPlanOutputContractLines()

/** Phrase for plan-mode iteration nudges (agent-runner). */
export const GF_PLAN_FENCE_NUDGE_PHRASE = `exactly one \`\`\`${GF_PLAN_FENCE}\`\`\` fenced JSON block`

function planModeProfileQualityLines(
  profileKey?: HarnessProfileKey,
  greenfieldWorkspace?: boolean,
): string[] {
  if (profileKey !== 'grok_4_3') return []
  const greenfieldNote = greenfieldWorkspace
    ? `If the greenfield harness appendix (${GREENFIELD_HARNESS_MARKER}) applied above, keep concrete file paths, dependencies, and verification commands in the plan JSON.`
    : ''
  return [
    '',
    '### Plan quality (Grok 4.3 harness)',
    'Make `filesLikelyTouched` concrete paths or clear relative paths under workspace roots.',
    'In `risksUnknowns`, list assumptions, missing context, and blockers — not generic filler.',
    'Each `steps` entry should be an actionable engineering step with a clear outcome; include at least one verification-oriented step.',
    '`verification` should name **concrete commands** or manual checks the executor runs via **`run_command`** after approval.',
    '**Static (simple single-file vanilla):** browser-only verification ("open index.html locally") is acceptable and preferred to avoid unnecessary server steps. For larger static sites: optional lightweight serve + browser check.',
    '**npm/Vite:** `npm install`, `npm run dev`, `npm run typecheck`, or `npm run build`.',
    'Avoid forcing dev server runs for trivial static HTML/JS apps — only suggest serve when the plan involves multiple files or the user wants a live reload preview.',
    `When the greenfield harness appendix (${GREENFIELD_HARNESS_MARKER}) applied, follow ${GREENFIELD_PLAN_VERIFY_COMMANDS_MARKER} for verification shape.`,
    'State **project shape** in the plan summary when obvious: **Vite+React+TS** (npm CLI + `package.json` tree) vs **static HTML/CSS/JS** (no build step).',
    'When obvious, state **scaffold strategy** in the summary: **`cli`** (npm/Vite CLI first) vs **`static_files`** (HTML/CSS/JS only) — do not mix both in one execute turn.',
    'Do not propose file edits in this turn; structured plan only.',
    greenfieldNote,
  ].filter(Boolean)
}

/** Plan-mode final-answer system block (agent-final-answer-contract). */
export function buildGfPlanFinalAnswerContract(input: {
  agentProfileId?: AgentProfileId
  profileKey?: HarnessProfileKey
  greenfieldWorkspace?: boolean
}): string {
  const plannerLine =
    input.agentProfileId === 'planner'
      ? 'Agent profile **planner**: edit tools and command tools are disabled for this turn — output the plan only.'
      : ''
  return [
    '## Final response contract (Plan mode)',
    'This turn is **Plan mode only**.',
    ...GF_PLAN_OUTPUT_CONTRACT,
    plannerLine,
    ...planModeProfileQualityLines(input.profileKey, input.greenfieldWorkspace),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Plan-mode section inside the Agent tool loop system block (agent-runner `buildInitialMessages`). */
export function buildGfPlanToolLoopBlock(options: { forbiddenLegacyFenceTag?: string }): string {
  const intro =
    'The user enabled **Plan mode** for this turn. After any necessary read/search tool calls,'
  const fenceLine = gfPlanFenceRequirementLine(options).replace(
    /^Your final answer must include/,
    'your final answer must include',
  )
  return [
    '## Plan mode (structured plan output)',
    `${intro} ${fenceLine}`,
    GF_PLAN_SCHEMA_BODY_LINE,
    ...GF_PLAN_OUTPUT_CONTRACT_TAIL,
  ].join('\n')
}

export const GfPlanV1Schema = z.object({
  schemaVersion: z.literal(GF_PLAN_SCHEMA_VERSION),
  summary: z.string().min(1).max(12_000),
  filesLikelyTouched: z.array(z.string().max(4096)).max(64),
  risksUnknowns: z.array(z.string().max(4000)).max(40),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        title: z.string().min(1).max(800),
      }),
    )
    .min(1)
    .max(48),
  verification: z.string().min(1).max(8000),
})

export type GfPlanV1 = z.infer<typeof GfPlanV1Schema>

const FENCE_BODY_RE = /```\s*gf-plan\s*\n([\s\S]*?)```/im
const FENCE_STRIP_RE = /```\s*gf-plan\s*\n[\s\S]*?```/gim
/** Streaming: closing ``` may be missing — hide partial fence + JSON tail. */
const FENCE_INCOMPLETE_TAIL_RE = /(?:^|\n)```\s*gf-plan\s*\n[\s\S]*$/i

export function parseGfPlanFromAssistantContent(content: string): GfPlanV1 | null {
  const m = content.match(FENCE_BODY_RE)
  if (!m?.[1]) return null
  try {
    const json = JSON.parse(m[1].trim()) as unknown
    const parsed = GfPlanV1Schema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Removes `gf-plan` fences from assistant markdown for display, copy, and read-aloud.
 * Does not mutate persisted thread lines.
 */
export function stripGfPlanFenceFromAssistantDisplay(text: string): string {
  let out = text.replace(FENCE_STRIP_RE, '')
  out = out.replace(FENCE_INCOMPLETE_TAIL_RE, '')
  return out.replace(/\n{3,}/g, '\n\n').trimEnd()
}
