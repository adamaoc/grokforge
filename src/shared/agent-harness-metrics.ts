/**
 * Turn trace harness metrics (story 137, S&R failure diagnostics 140).
 * Compact observability for iterative Work edits and mid-turn nudges.
 */

import { z } from 'zod'
import { ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON } from './agent-edit-cascade-guard'
import type { IterativeEditScopeKind } from './iterative-edit-scope'
import type { IterativeThrashNudgeKind } from './iterative-work-edit-guards'

export const HARNESS_METRICS_MAX_NUDGES = 12 as const
export const HARNESS_METRICS_MAX_SR_PATHS = 8 as const
export const HARNESS_METRICS_MAX_SR_FAILURE_REASONS = 4 as const

/** Stable nudge ids persisted on turn traces. */
export const HARNESS_NUDGE_DISCOVERY_SATURATION = 'discovery_saturation' as const
export const HARNESS_NUDGE_ITERATIVE_SR_CONSOLIDATION = 'iterative_sr_consolidation' as const
export const HARNESS_NUDGE_ITERATIVE_REREAD_LOOP = 'iterative_reread_loop' as const
export const HARNESS_NUDGE_ITERATIVE_ONE_PROPOSAL = 'iterative_one_proposal' as const
export const HARNESS_NUDGE_ITERATIVE_DISCOVERY_AFTER_EDIT = 'iterative_discovery_after_edit' as const
export const HARNESS_NUDGE_ITERATIVE_EDIT_SCOPE = 'iterative_edit_scope' as const
export const HARNESS_NUDGE_SEARCH_REPLACE_ESCALATION = 'search_replace_escalation' as const
export const HARNESS_NUDGE_LOCALIZED_UI_EDIT_PRE_SAMPLE = 'localized_ui_edit_pre_sample' as const

export type HarnessNudgeId =
  | typeof HARNESS_NUDGE_DISCOVERY_SATURATION
  | typeof HARNESS_NUDGE_ITERATIVE_SR_CONSOLIDATION
  | typeof HARNESS_NUDGE_ITERATIVE_REREAD_LOOP
  | typeof HARNESS_NUDGE_ITERATIVE_ONE_PROPOSAL
  | typeof HARNESS_NUDGE_ITERATIVE_DISCOVERY_AFTER_EDIT
  | typeof HARNESS_NUDGE_ITERATIVE_EDIT_SCOPE
  | typeof HARNESS_NUDGE_SEARCH_REPLACE_ESCALATION
  | typeof HARNESS_NUDGE_LOCALIZED_UI_EDIT_PRE_SAMPLE

export const MaxIterationsReasonSchema = z.enum([
  'search_replace_loop',
  'discovery_stall',
  'post_escalation_stall',
  'generic',
])

export type MaxIterationsReason = z.infer<typeof MaxIterationsReasonSchema>

export const HarnessMetricsSearchReplaceSchema = z.object({
  failuresByPath: z.record(z.string(), z.number().int().nonnegative()).optional(),
  totalFailures: z.number().int().nonnegative().optional(),
  escalationIssued: z.boolean().optional(),
  escalationAtFailureCount: z.number().int().nonnegative().optional(),
  blockedAfterEscalationCount: z.number().int().nonnegative().optional(),
  lastFailureReasons: z.array(z.string()).max(HARNESS_METRICS_MAX_SR_FAILURE_REASONS).optional(),
})

export type HarnessMetricsSearchReplace = z.infer<typeof HarnessMetricsSearchReplaceSchema>

export const AgentTurnHarnessMetricsSchema = z.object({
  iterativeWorkEdit: z.boolean().optional(),
  postPlanIncremental: z.boolean().optional(),
  toolRoundCount: z.number().int().nonnegative().optional(),
  readOnlyRounds: z.number().int().nonnegative().optional(),
  searchReplaceCountByPath: z.record(z.string(), z.number().int().nonnegative()).optional(),
  nudgesIssued: z.array(z.string()).max(HARNESS_METRICS_MAX_NUDGES).optional(),
  editProposalAtRound: z.number().int().positive().optional(),
  stoppedAfterProposal: z.boolean().optional(),
  resolvedEditScope: z.enum(['single_file', 'few_files', 'broad']).optional(),
  rereadLoopDetected: z.boolean().optional(),
  searchReplace: HarnessMetricsSearchReplaceSchema.optional(),
  maxIterationsReason: MaxIterationsReasonSchema.optional(),
})

export type AgentTurnHarnessMetrics = z.infer<typeof AgentTurnHarnessMetricsSchema>

export type HarnessMetricsScratch = {
  iterativeWorkEdit: boolean
  postPlanIncremental: boolean
  resolvedEditScope?: IterativeEditScopeKind
  toolRoundCount: number
  readOnlyRounds: number
  searchReplaceCountByPath: Map<string, number>
  searchReplaceFailuresByPath: Map<string, number>
  searchReplaceEscalationIssued: boolean
  searchReplaceEscalationAtFailureCount?: number
  searchReplaceBlockedAfterEscalationCount: number
  searchReplaceLastFailureReasons: string[]
  maxIterationsReason?: MaxIterationsReason
  nudgesIssued: HarnessNudgeId[]
  editProposalAtRound?: number
  stoppedAfterProposal: boolean
  rereadLoopDetected: boolean
}

export type FinalizeHarnessMetricsInput = {
  iterativeWorkEdit: boolean
  postPlanIncremental: boolean
  resolvedEditScope?: IterativeEditScopeKind
  toolRoundCount: number
  readOnlyRounds: number
  searchReplaceCountByPath: ReadonlyMap<string, number>
  searchReplaceFailuresByPath: ReadonlyMap<string, number>
  searchReplaceEscalationIssued: boolean
  searchReplaceEscalationAtFailureCount?: number
  searchReplaceBlockedAfterEscalationCount: number
  searchReplaceLastFailureReasons: readonly string[]
  maxIterationsReason?: MaxIterationsReason
  nudgesIssued: readonly HarnessNudgeId[]
  editProposalAtRound?: number
  stoppedAfterProposal: boolean
  rereadLoopDetected: boolean
}

export function createHarnessMetricsScratch(seed: {
  iterativeWorkEdit: boolean
  postPlanIncremental: boolean
  resolvedEditScope?: IterativeEditScopeKind
}): HarnessMetricsScratch {
  return {
    iterativeWorkEdit: seed.iterativeWorkEdit,
    postPlanIncremental: seed.postPlanIncremental,
    resolvedEditScope: seed.resolvedEditScope,
    toolRoundCount: 0,
    readOnlyRounds: 0,
    searchReplaceCountByPath: new Map(),
    searchReplaceFailuresByPath: new Map(),
    searchReplaceEscalationIssued: false,
    searchReplaceBlockedAfterEscalationCount: 0,
    searchReplaceLastFailureReasons: [],
    nudgesIssued: [],
    stoppedAfterProposal: false,
    rereadLoopDetected: false,
  }
}

export function recordHarnessNudge(scratch: HarnessMetricsScratch, id: HarnessNudgeId): void {
  if (scratch.nudgesIssued.includes(id)) return
  if (scratch.nudgesIssued.length >= HARNESS_METRICS_MAX_NUDGES) return
  scratch.nudgesIssued.push(id)
}

export function classifySearchReplaceFailureReason(detail?: string): string {
  if (!detail) return 'other'
  if (detail.includes(ITERATIVE_SEARCH_REPLACE_BLOCKED_REASON)) {
    return 'blocked_after_escalation'
  }
  const lower = detail.toLowerCase()
  if (lower.includes('not found') || lower.includes('0 exact matches')) {
    return 'not_found'
  }
  if (lower.includes('matched') && (lower.includes(' times') || lower.includes(' regions'))) {
    return 'multi_match'
  }
  return 'other'
}

export function recordSearchReplaceFailureReason(scratch: HarnessMetricsScratch, reason: string): void {
  scratch.searchReplaceLastFailureReasons.push(reason)
  if (scratch.searchReplaceLastFailureReasons.length > HARNESS_METRICS_MAX_SR_FAILURE_REASONS) {
    scratch.searchReplaceLastFailureReasons.shift()
  }
}

export type ResolveMaxIterationsReasonInput = {
  totalSearchReplaceFailures: number
  searchReplaceBlockedAfterEscalationCount: number
  searchReplaceEscalationNudgeIssued: boolean
  incompleteHtmlNudgeIssued: boolean
  postEscalationToolRounds: number
  postEscalationMaxToolRounds: number
  maxSearchReplaceFailuresPerTurn: number
  iterativeWorkEdit?: boolean
  blockedBeforeForceFinalThreshold: number
  discoverySaturationNudgeIssued?: boolean
  readOnlyRounds?: number
  maxToolIterationsHit?: boolean
  forceFinalFromEditFailures?: boolean
}

export function resolveMaxIterationsReason(
  input: ResolveMaxIterationsReasonInput,
): MaxIterationsReason | undefined {
  if (!input.forceFinalFromEditFailures && !input.maxToolIterationsHit) {
    return undefined
  }

  if (input.forceFinalFromEditFailures) {
    if (
      input.iterativeWorkEdit === true &&
      input.searchReplaceBlockedAfterEscalationCount >= input.blockedBeforeForceFinalThreshold
    ) {
      return 'search_replace_loop'
    }
    if (input.totalSearchReplaceFailures >= input.maxSearchReplaceFailuresPerTurn) {
      return 'search_replace_loop'
    }
    if (
      (input.searchReplaceEscalationNudgeIssued || input.incompleteHtmlNudgeIssued) &&
      input.postEscalationToolRounds >= input.postEscalationMaxToolRounds
    ) {
      return 'post_escalation_stall'
    }
    return 'search_replace_loop'
  }

  if (input.totalSearchReplaceFailures > 0) {
    return 'search_replace_loop'
  }
  if (input.discoverySaturationNudgeIssued && (input.readOnlyRounds ?? 0) >= 2) {
    return 'discovery_stall'
  }
  return 'generic'
}

export function iterativeThrashKindToHarnessNudgeId(kind: IterativeThrashNudgeKind): HarnessNudgeId {
  switch (kind) {
    case 'sr_consolidation':
      return HARNESS_NUDGE_ITERATIVE_SR_CONSOLIDATION
    case 'reread_loop':
      return HARNESS_NUDGE_ITERATIVE_REREAD_LOOP
    case 'one_proposal':
      return HARNESS_NUDGE_ITERATIVE_ONE_PROPOSAL
    case 'discovery_after_edit':
      return HARNESS_NUDGE_ITERATIVE_DISCOVERY_AFTER_EDIT
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function capSearchReplaceByPath(
  map: ReadonlyMap<string, number>,
  maxPaths = HARNESS_METRICS_MAX_SR_PATHS,
): Record<string, number> | undefined {
  if (map.size === 0) return undefined
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const capped = entries.slice(0, maxPaths)
  return Object.fromEntries(capped)
}

export function syncSearchReplaceCountsToScratch(
  scratch: HarnessMetricsScratch,
  source: ReadonlyMap<string, number>,
): void {
  for (const [path, count] of source) {
    if (count > 0) scratch.searchReplaceCountByPath.set(path, count)
  }
}

export function syncSearchReplaceFailuresToScratch(
  scratch: HarnessMetricsScratch,
  source: ReadonlyMap<string, number>,
): void {
  for (const [path, count] of source) {
    if (count > 0) scratch.searchReplaceFailuresByPath.set(path, count)
  }
}

export function topSearchReplaceFailurePathBasename(
  failuresByPath: ReadonlyMap<string, number>,
): string | undefined {
  if (failuresByPath.size === 0) return undefined
  const [topPath] = [...failuresByPath.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!
  const parts = topPath.split(/[\\/]/)
  return parts[parts.length - 1] || topPath
}

export function recordEditProposalAtRound(scratch: HarnessMetricsScratch, toolRoundCount: number): void {
  if (scratch.editProposalAtRound !== undefined) return
  if (toolRoundCount < 1) return
  scratch.editProposalAtRound = toolRoundCount
}

function buildSearchReplaceMetricsBlock(
  input: FinalizeHarnessMetricsInput,
  totalFailures: number,
): HarnessMetricsSearchReplace | undefined {
  const failuresByPath = capSearchReplaceByPath(input.searchReplaceFailuresByPath)
  const hasEscalation = input.searchReplaceEscalationIssued
  const hasBlocked = input.searchReplaceBlockedAfterEscalationCount > 0
  const hasReasons = input.searchReplaceLastFailureReasons.length > 0
  if (totalFailures === 0 && !hasEscalation && !hasBlocked && !hasReasons) {
    return undefined
  }
  return {
    failuresByPath,
    totalFailures: totalFailures > 0 ? totalFailures : undefined,
    escalationIssued: hasEscalation || undefined,
    escalationAtFailureCount: input.searchReplaceEscalationAtFailureCount,
    blockedAfterEscalationCount:
      hasBlocked ? input.searchReplaceBlockedAfterEscalationCount : undefined,
    lastFailureReasons:
      hasReasons ? [...input.searchReplaceLastFailureReasons] : undefined,
  }
}

export function finalizeHarnessMetrics(input: FinalizeHarnessMetricsInput): AgentTurnHarnessMetrics | undefined {
  const srByPath = capSearchReplaceByPath(input.searchReplaceCountByPath)
  const totalFailures = [...input.searchReplaceFailuresByPath.values()].reduce((n, c) => n + c, 0)
  const searchReplace = buildSearchReplaceMetricsBlock(input, totalFailures)
  const hasNudges = input.nudgesIssued.length > 0
  const hasActivity =
    input.toolRoundCount > 0 ||
    input.readOnlyRounds > 0 ||
    srByPath !== undefined ||
    searchReplace !== undefined ||
    input.maxIterationsReason !== undefined ||
    hasNudges ||
    input.editProposalAtRound !== undefined ||
    input.stoppedAfterProposal ||
    input.rereadLoopDetected

  if (!input.iterativeWorkEdit && !input.postPlanIncremental && !hasActivity) {
    return undefined
  }

  return {
    iterativeWorkEdit: input.iterativeWorkEdit || undefined,
    postPlanIncremental: input.postPlanIncremental || undefined,
    toolRoundCount: input.toolRoundCount > 0 ? input.toolRoundCount : undefined,
    readOnlyRounds: input.readOnlyRounds > 0 ? input.readOnlyRounds : undefined,
    searchReplaceCountByPath: srByPath,
    nudgesIssued: hasNudges ? [...input.nudgesIssued] : undefined,
    editProposalAtRound: input.editProposalAtRound,
    stoppedAfterProposal: input.stoppedAfterProposal || undefined,
    resolvedEditScope: input.resolvedEditScope,
    rereadLoopDetected: input.rereadLoopDetected || undefined,
    searchReplace,
    maxIterationsReason: input.maxIterationsReason,
  }
}

export function formatHarnessMetricsDevLogLine(metrics: AgentTurnHarnessMetrics | undefined): string | null {
  if (!metrics) return null
  const parts: string[] = ['[GrokForge] harnessMetrics']
  if (metrics.iterativeWorkEdit !== undefined) {
    parts.push(`iterativeWorkEdit=${metrics.iterativeWorkEdit}`)
  }
  if (metrics.toolRoundCount !== undefined) {
    parts.push(`rounds=${metrics.toolRoundCount}`)
  }
  if (metrics.editProposalAtRound !== undefined) {
    parts.push(`proposal@round=${metrics.editProposalAtRound}`)
  }
  if (metrics.nudgesIssued && metrics.nudgesIssued.length > 0) {
    parts.push(`nudges=[${metrics.nudgesIssued.join(',')}]`)
  }
  return parts.length > 1 ? parts.join(' ') : null
}

export function formatEditMetricsDevLogLine(metrics: AgentTurnHarnessMetrics | undefined): string | null {
  const sr = metrics?.searchReplace
  if (!sr && !metrics?.maxIterationsReason) return null
  const parts: string[] = ['[GrokForge] editMetrics']
  if (sr?.totalFailures !== undefined) {
    parts.push(`srFailures=${sr.totalFailures}`)
  }
  if (sr?.escalationIssued !== undefined) {
    parts.push(`escalation=${sr.escalationIssued}`)
  }
  if (metrics?.maxIterationsReason) {
    parts.push(`maxIterReason=${metrics.maxIterationsReason}`)
  }
  if (metrics?.iterativeWorkEdit !== undefined) {
    parts.push(`iterativeWorkEdit=${metrics.iterativeWorkEdit}`)
  }
  return parts.length > 1 ? parts.join(' ') : null
}

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development'
}

export function logHarnessMetricsIfDev(metrics: AgentTurnHarnessMetrics | undefined): void {
  if (!isDevMode()) return
  const line = formatHarnessMetricsDevLogLine(metrics)
  if (line) console.info(line)
  const editLine = formatEditMetricsDevLogLine(metrics)
  if (editLine) console.info(editLine)
}
