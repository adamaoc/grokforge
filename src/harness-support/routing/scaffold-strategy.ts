/**
 * Greenfield scaffold strategy routing (story 128).
 * Chooses CLI-first vs file-bootstrap and detects hybrid same-turn conflicts.
 */

import { impliesCommandExecution } from './command-intent'
import {
  planImpliesNpmScaffold,
  planImpliesStaticFileBootstrap,
  type GreenfieldScaffoldPlanHint,
} from '../context/workspace-greenfield'

export type ScaffoldStrategy =
  | 'cli_scaffold'
  | 'file_bootstrap'
  | 'cli_then_customize'
  | 'ambiguous'

export const SCAFFOLD_STRATEGY_ROUTING_MARKER =
  'Harness: greenfield scaffold strategy routing 128'

export const SCAFFOLD_STRATEGY_NUDGE_MARKER = 'Harness: scaffold strategy conflict'

const CLI_USER_RE =
  /\b(npm\s+create|npm\s+init|new\s+(vite|react|next(\.js)?)\s+app|scaffold|initialize\s+(project|repo|app)|create-vite|create-react-app)\b/i

const STATIC_USER_RE =
  /\b(static\s+(site|html|page|todo|prototype)|vanilla(?:\s+(js|todo|web|html?))?|html\/css\/js|no\s+build\s+step|(?:single|one)\s+html\s+file|(?:design\s+)?prototype)\b/i

const CLI_SCAFFOLD_CMD_RE =
  /\b(npm\s+(create|init)|pnpm\s+(create|dlx)|yarn\s+create|bun\s+create|npx\s+create)\b/i

const EDIT_TOOL_NAMES = new Set(['propose_file_edits', 'search_replace'])

/** Shared static/file-bootstrap user intent (128, 162). */
export function userMatchesStaticFileBootstrapIntent(userText: string): boolean {
  return STATIC_USER_RE.test(userText.trim())
}

export type ResolveScaffoldStrategyInput = {
  greenfieldWorkspace: boolean
  executeFromApprovedPlan?: boolean
  postPlanIncremental?: boolean
  plan?: GreenfieldScaffoldPlanHint | null
  userText?: string
}

/** Re-export narrow plan heuristics (128 naming). */
export const planImpliesCliScaffold = planImpliesNpmScaffold
export const planImpliesFileBootstrap = planImpliesStaticFileBootstrap

export function resolveScaffoldStrategy(
  input: ResolveScaffoldStrategyInput,
): ScaffoldStrategy | null {
  if (!input.greenfieldWorkspace) return null
  if (input.postPlanIncremental) return null

  const plan = input.plan ?? null
  const userText = (input.userText ?? '').trim()

  const cliFromPlan = plan ? planImpliesCliScaffold(plan) : false
  const fileFromPlan = plan ? planImpliesFileBootstrap(plan) : false
  const cliFromUser = CLI_USER_RE.test(userText)
  const fileFromUser = userMatchesStaticFileBootstrapIntent(userText)

  const hasCli = cliFromPlan || cliFromUser
  const hasFile = fileFromPlan || fileFromUser

  if (hasCli && hasFile) return 'ambiguous'
  if (hasCli) {
    const hasCliStep = (plan?.steps ?? []).some((s) =>
      impliesCommandExecution(s.title ?? ''),
    )
    const hasCustomizationPaths = (plan?.filesLikelyTouched ?? []).some((p) =>
      /src\/|components|App\.tsx|README/i.test(p.replace(/\\/g, '/')),
    )
    if (hasCliStep && hasCustomizationPaths) return 'cli_then_customize'
    return 'cli_scaffold'
  }
  if (hasFile) return 'file_bootstrap'

  if (input.executeFromApprovedPlan && plan) {
    if (cliFromPlan) return 'cli_scaffold'
    if (fileFromPlan) return 'file_bootstrap'
  }

  return null
}

export type ScaffoldToolCallLike = {
  function: { name: string; arguments?: string }
}

export function toolSampleHasEditTools(toolCalls: readonly ScaffoldToolCallLike[]): boolean {
  return toolCalls.some((c) => EDIT_TOOL_NAMES.has(c.function.name))
}

export function toolSampleHasRunCommand(toolCalls: readonly ScaffoldToolCallLike[]): boolean {
  return toolCalls.some((c) => c.function.name === 'run_command')
}

export function parseRunCommandFromToolCall(call: ScaffoldToolCallLike): string {
  if (call.function.name !== 'run_command') return ''
  try {
    const args = JSON.parse(call.function.arguments ?? '{}') as { command?: string }
    return typeof args.command === 'string' ? args.command : ''
  } catch {
    return ''
  }
}

export function isCliScaffoldCommand(command: string): boolean {
  return CLI_SCAFFOLD_CMD_RE.test(command.trim())
}

export function toolSampleHasCliScaffoldCommand(
  toolCalls: readonly ScaffoldToolCallLike[],
): boolean {
  return toolCalls.some((c) => {
    if (c.function.name !== 'run_command') return false
    return isCliScaffoldCommand(parseRunCommandFromToolCall(c))
  })
}

export type ScaffoldConflictKind =
  | 'hybrid_same_round'
  | 'edits_before_cli'
  | 'cli_on_static'

/** Collapse ambiguous strategy using plan shape for conflict checks only (story 131). */
export function effectiveScaffoldStrategyForConflict(
  strategy: ScaffoldStrategy | null,
  plan?: GreenfieldScaffoldPlanHint | null,
): ScaffoldStrategy | null {
  if (!strategy || strategy !== 'ambiguous' || !plan) return strategy

  const staticOnly =
    planImpliesStaticFileBootstrap(plan) && !planImpliesNpmScaffold(plan)
  const cliOnly = planImpliesNpmScaffold(plan) && !planImpliesStaticFileBootstrap(plan)

  if (staticOnly) return 'file_bootstrap'
  if (cliOnly) return 'cli_scaffold'
  return 'ambiguous'
}

export function detectScaffoldConflict(
  strategy: ScaffoldStrategy | null,
  toolCalls: readonly ScaffoldToolCallLike[],
  options: {
    scaffoldCliSucceededThisTurn: boolean
    plan?: GreenfieldScaffoldPlanHint | null
  },
): ScaffoldConflictKind | null {
  const effectiveStrategy = effectiveScaffoldStrategyForConflict(strategy, options.plan)
  if (!effectiveStrategy) return null

  const hasEdit = toolSampleHasEditTools(toolCalls)
  const hasCliScaffold = toolSampleHasCliScaffoldCommand(toolCalls)

  if (hasEdit && hasCliScaffold) return 'hybrid_same_round'

  if (
    (effectiveStrategy === 'cli_scaffold' ||
      effectiveStrategy === 'cli_then_customize' ||
      effectiveStrategy === 'ambiguous') &&
    hasEdit &&
    !options.scaffoldCliSucceededThisTurn
  ) {
    return 'edits_before_cli'
  }

  if (effectiveStrategy === 'file_bootstrap' && hasCliScaffold) {
    return 'cli_on_static'
  }

  return null
}

/** True when a tool sample no longer triggers scaffold conflict detection (story 134). */
export function isScaffoldSampleCompliant(
  strategy: ScaffoldStrategy | null,
  toolCalls: readonly ScaffoldToolCallLike[],
  options: {
    scaffoldCliSucceededThisTurn: boolean
    plan?: GreenfieldScaffoldPlanHint | null
  },
): boolean {
  return detectScaffoldConflict(strategy, toolCalls, options) === null
}

export function shouldInjectScaffoldStrategyNudge(input: {
  strategy: ScaffoldStrategy | null
  greenfieldWorkspace: boolean
  executeFromApprovedPlan: boolean
  postPlanIncremental: boolean
  alreadyIssued: boolean
  conflict: ScaffoldConflictKind | null
}): boolean {
  if (input.alreadyIssued) return false
  if (!input.greenfieldWorkspace || !input.executeFromApprovedPlan) return false
  if (input.postPlanIncremental) return false
  if (!input.strategy || !input.conflict) return false
  return true
}
