/**
 * Plan profile for harness v2 — read-only tools and Senior Staff planning prompt.
 */

import type { GrokProjectManifest } from '../../main/project/manifest'
import {
  buildGfPlanFinalAnswerContract,
  gfPlanFenceRequirementLine,
  GF_PLAN_SCHEMA_BODY_LINE,
} from '../../harness-support/plan/contracts/gf-plan-contract'
import { GREENFIELD_PLAN_SECTIONS } from '../../harness-support/context/greenfield-sections'
import type { PlanProjectSnapshot } from '../context/project-snapshot'
import { formatPlanProjectContextSection } from '../context/project-snapshot'
import { HARNESS_EXPLORE_TOOLS } from './work-profile'
import { formatWorkspaceRootsForPrompt } from '../workspace/paths'
import type { HarnessProfileKey } from './profile-key'

export const HARNESS_PLAN_TOOLS = [...HARNESS_EXPLORE_TOOLS, 'list_files', 'read_file'] as const

export type HarnessPlanToolName = (typeof HARNESS_PLAN_TOOLS)[number]

export type HarnessPlanProfile = {
  id: 'plan'
  allowedTools: readonly HarnessPlanToolName[]
}

export const PLAN_PROFILE: HarnessPlanProfile = {
  id: 'plan',
  allowedTools: HARNESS_PLAN_TOOLS,
}

const PLAN_V2_OUTPUT_TAIL: readonly string[] = [
  'You may include short readable prose before or after the fence. The JSON must parse as-is.',
  'Do **not** call `write_file`, `edit`, or `run_command` on this turn — execution happens after the user approves the plan in GrokForge.',
  'Do not embed file contents inside the plan JSON; the executor will use `write_file`, `edit`, and `run_command` (with user approval) after approval.',
  'For install/scaffold steps, name **concrete shell commands** in step titles — the executor will call **`run_command`** (approval required for install/scaffold).',
  'For **file/doc verification**, name **one** `read_file` on the workspace path (e.g. "One `read_file` on `root:styleguide.md` after write, then summarize") — not repeated reads or `cat`/`ls` shell commands.',
  'In `filesLikelyTouched` and steps, use **rootId:relative/path** in multi-root projects (never the root label as a folder prefix).',
  '**Static HTML/CSS/JS (simple single-file or small vanilla Todo-like):** verification may be "Open index.html directly in the browser and confirm the UI works".',
  '**npm / Vite / React:** include `npm install`, `npm run dev`, `npm run typecheck`, or `npm run build` as appropriate.',
  'In `filesLikelyTouched` and steps, be explicit about paths. Require readable formatting, **one statement per line**, real line breaks, **no glued or minified output**.',
]

export type BuildHarnessPlanSystemPromptInput = {
  manifest: GrokProjectManifest
  snapshot: PlanProjectSnapshot
  profileKey: HarnessProfileKey
}

/**
 * Plan-mode system prompt — explicit workflow, discovery, and `gf-plan` contract.
 */
export function buildHarnessPlanSystemPrompt(input: BuildHarnessPlanSystemPromptInput): string {
  const { manifest, snapshot, profileKey } = input
  const projectContext = formatPlanProjectContextSection(snapshot, manifest)

  const workflow = [
    '## GrokForge Plan mode (this turn)',
    'The user selected **Plan** in the composer. You are **not** implementing yet.',
    '',
    '**Workflow:**',
    '1. **Discover lightly** — use the workspace index in the system prompt; add **0–1** `read_file` calls on key existing docs when needed (see Project context below).',
    '2. **Plan** — produce one structured `gf-plan` JSON fence (Senior Staff quality; see bar below).',
    '3. **Stop** — no file writes and no shell commands on this turn.',
    '4. **After this turn** — the user reviews the plan and clicks **Approve & Run** (or continues in Work mode). GrokForge then runs a separate **Work/execute** turn with write tools and `run_command`.',
    '',
    'If the user later wants the **full** scope in one execute pass, they can approve the complete plan. If the scope is large, recommend a **phased** approach in `risksUnknowns` and put **Phase 1** steps first — but still output a complete plan they can approve in full when they choose.',
  ].join('\n')

  const discoveryLimits = [
    '## Plan discovery limits',
    '**Creating new files/docs:** When the user asks to **plan** a new document or file, `Path not found` on that path is **expected**. Do **not** call `read_file` on paths you plan to create. Put concrete paths in `filesLikelyTouched`, describe creation in `steps`, and let the executor use `write_file` after approval.',
    '**Stop thrashing:** Do **not** re-read the same file or re-list the same directory. If you already have a file in context, use it — do not call `read_file` on it again this turn.',
    '**Deliverable is `gf-plan`:** Prefer a complete plan with assumptions in `risksUnknowns` over more discovery tool calls.',
  ].join('\n')

  const seniorStaffBar = [
    '## Planning bar (Senior Staff engineer)',
    `Plan for project **"${manifest.name}"** using idioms and patterns appropriate to this codebase's stack.`,
    'Optimize for **clean, maintainable architecture**: clear module boundaries, sensible file layout, typed APIs where the stack supports it, and verification that matches the project (tests, typecheck, lint, or manual checks).',
    'Each step should state a **concrete outcome** (which paths, which behavior).',
    'In `risksUnknowns`, list real assumptions, missing context, and blockers — not filler.',
    'When scope is large, note a recommended **first slice** (MVP / Phase 1) in `risksUnknowns` and order `steps` so an executor can stop after Phase 1 or continue through the full list if the user approves the whole plan.',
  ].join('\n')

  const tools = [
    '## Tools (read-only this turn)',
    '- `workspace_index` — compact ignore-aware map of all roots (optional `refresh: true` after structural changes)',
    '- `search_workspace` — find files/lines by query across roots',
    '- `list_files` — list one directory level (`"."` lists every root in multi-root projects)',
    '- `read_file` — read exact file contents for **existing** paths only (README, AGENTS.md, CLAUDE.md, package manifests, key sources)',
    '',
    'Use tools to ground the plan in evidence when files **exist**. Do not guess stack or conventions when readable files are available. Missing targets the user wants **created** are not errors — plan them in `gf-plan`.',
  ].join('\n')

  const gfPlanContract = [
    '## Structured plan output (`gf-plan`)',
    '**Critical:** the fenced block language tag must be exactly `gf-plan` — never `json`, `JSON`, or plain triple backticks. GrokForge will not show the plan review card otherwise.',
    gfPlanFenceRequirementLine(),
    GF_PLAN_SCHEMA_BODY_LINE,
    ...PLAN_V2_OUTPUT_TAIL,
    '',
    buildGfPlanFinalAnswerContract({
      agentProfileId: 'planner',
      profileKey,
      greenfieldWorkspace: snapshot.greenfieldWorkspace,
    }),
  ].join('\n')

  const greenfield = snapshot.greenfieldWorkspace
    ? [
        '## Greenfield workspace',
        ...GREENFIELD_PLAN_SECTIONS.slice(1).map((line) =>
          line.replace(/\blist_directory\b/g, 'list_files'),
        ),
      ].join('\n')
    : ''

  const custom = manifest.context.customInstructions?.trim()
    ? `## Project instructions (manifest)\n${manifest.context.customInstructions.trim()}`
    : ''

  return [
    `You are GrokForge's **planning agent** for "${manifest.name}".`,
    formatWorkspaceRootsForPrompt(manifest),
    snapshot.workspaceIndexPromptSection,
    workflow,
    discoveryLimits,
    seniorStaffBar,
    projectContext,
    tools,
    gfPlanContract,
    greenfield,
    custom,
  ]
    .filter((s) => s.trim().length > 0)
    .join('\n\n')
}