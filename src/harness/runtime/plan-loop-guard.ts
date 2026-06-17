/**
 * Plan-mode loop guard — detects tool thrashing and injects one-time nudges
 * toward emitting `gf-plan` instead of spinning on discovery.
 */

export type PlanToolInvocation = {
  name: string
  argsKey: string
  ok: boolean
  path?: string
}

export type PlanLoopGuardNudgeKind =
  | 'missing_file_creation'
  | 'repeated_identical_tool'
  | 'discovery_budget'

export type PlanLoopGuardState = {
  invocations: PlanToolInvocation[]
  sent: Set<PlanLoopGuardNudgeKind>
}

/** Tool rounds completed before the soft discovery-budget nudge (step index uses this as threshold). */
export const PLAN_DISCOVERY_BUDGET_TOOL_ROUNDS = 5

/** Failed `read_file` attempts on one path before missing-file nudge. */
export const PLAN_MISSING_FILE_FAILURE_THRESHOLD = 2

/** Identical tool+args invocations before repeated-tool nudge. */
export const PLAN_REPEATED_IDENTICAL_TOOL_THRESHOLD = 3

export function createPlanLoopGuardState(): PlanLoopGuardState {
  return { invocations: [], sent: new Set() }
}

function parseToolPath(argsJson: string): string | undefined {
  try {
    const args = JSON.parse(argsJson) as { path?: string }
    return typeof args.path === 'string' ? args.path : undefined
  } catch {
    return undefined
  }
}

export function toolInvocationArgsKey(name: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>
    if (name === 'read_file' || name === 'list_files') {
      return `${name}:${String(args.path ?? '')}`
    }
    return `${name}:${argsJson}`
  } catch {
    return `${name}:${argsJson}`
  }
}

export function recordPlanToolInvocation(
  state: { invocations: PlanToolInvocation[] },
  name: string,
  argsJson: string,
  ok: boolean,
): void {
  state.invocations.push({
    name,
    argsKey: toolInvocationArgsKey(name, argsJson),
    ok,
    path: parseToolPath(argsJson),
  })
}

function missingFileCreationNudge(state: PlanLoopGuardState): string | null {
  const failedReads = new Map<string, number>()
  for (const inv of state.invocations) {
    if (inv.name === 'read_file' && !inv.ok && inv.path) {
      failedReads.set(inv.path, (failedReads.get(inv.path) ?? 0) + 1)
    }
  }
  for (const [path, count] of failedReads) {
    if (count >= PLAN_MISSING_FILE_FAILURE_THRESHOLD) {
      return (
        `Harness: \`read_file\` on \`${path}\` failed ${count} times (file not on disk). ` +
        'In Plan mode, **missing files you plan to create are expected**. Stop probing that path. ' +
        `Output your **\`gf-plan\` now** with \`${path}\` in \`filesLikelyTouched\` and creation steps for the executor's \`write_file\` after approval.`
      )
    }
  }
  return null
}

function repeatedIdenticalToolNudge(state: PlanLoopGuardState): string | null {
  const counts = new Map<string, number>()
  for (const inv of state.invocations) {
    counts.set(inv.argsKey, (counts.get(inv.argsKey) ?? 0) + 1)
  }
  for (const [argsKey, count] of counts) {
    if (count >= PLAN_REPEATED_IDENTICAL_TOOL_THRESHOLD) {
      return (
        `Harness: you called the same tool with identical arguments **${count} times** (\`${argsKey}\`). ` +
        'That result is already in context. **Stop calling tools** and output your **\`gf-plan\` fence** now.'
      )
    }
  }
  return null
}

function discoveryBudgetNudge(step: number): string | null {
  if (step < PLAN_DISCOVERY_BUDGET_TOOL_ROUNDS) return null
  return (
    `Harness: Plan discovery budget reached (${PLAN_DISCOVERY_BUDGET_TOOL_ROUNDS}+ tool rounds without a final answer). ` +
    'You likely have enough context. **Output your structured `\`gf-plan\` JSON fence now** — ' +
    'use `risksUnknowns` for gaps instead of more `read_file` / `list_files`.'
  )
}

/**
 * Returns at most one nudge per loop iteration. Each kind fires once per turn.
 * Evaluated at the start of a tool-loop step, before the next model call.
 */
export function evaluatePlanLoopNudge(
  state: PlanLoopGuardState,
  step: number,
): { kind: PlanLoopGuardNudgeKind; message: string } | null {
  if (!state.sent.has('missing_file_creation')) {
    const message = missingFileCreationNudge(state)
    if (message) return { kind: 'missing_file_creation', message }
  }

  if (!state.sent.has('repeated_identical_tool')) {
    const message = repeatedIdenticalToolNudge(state)
    if (message) return { kind: 'repeated_identical_tool', message }
  }

  if (!state.sent.has('discovery_budget')) {
    const message = discoveryBudgetNudge(step)
    if (message) return { kind: 'discovery_budget', message }
  }

  return null
}

export function markPlanLoopNudgeSent(
  state: PlanLoopGuardState,
  kind: PlanLoopGuardNudgeKind,
): void {
  state.sent.add(kind)
}