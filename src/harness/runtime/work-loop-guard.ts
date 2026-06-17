/**
 * Work-mode loop guard — stops execute-turn thrashing (plan path retries, post-write verify loops).
 */

import { formatGfPlanArtifactReadPath } from '../../harness-support/plan/contracts/plan-artifact-read-path'
import { recordPlanToolInvocation, type PlanLoopGuardState } from './plan-loop-guard'

export type WorkLoopGuardNudgeKind =
  | 'outside_workspace_read'
  | 'repeated_identical_tool'
  | 'post_write_verify_thrash'

export type WorkLoopGuardState = {
  invocations: PlanLoopGuardState['invocations']
  sent: Set<WorkLoopGuardNudgeKind>
  writtenPaths: Set<string>
  outsideWorkspaceReadFailures: number
}

export const WORK_OUTSIDE_WORKSPACE_READ_THRESHOLD = 2
export const WORK_REPEATED_IDENTICAL_TOOL_THRESHOLD = 3
export const WORK_POST_WRITE_READ_THRESHOLD = 2

export function createWorkLoopGuardState(): WorkLoopGuardState {
  return {
    invocations: [],
    sent: new Set(),
    writtenPaths: new Set(),
    outsideWorkspaceReadFailures: 0,
  }
}

function parseToolPath(argsJson: string): string | undefined {
  try {
    const args = JSON.parse(argsJson) as { path?: string }
    return typeof args.path === 'string' ? args.path : undefined
  } catch {
    return undefined
  }
}

function normalizeWorkspacePath(path: string | undefined): string | undefined {
  if (!path) return undefined
  return path.trim().replace(/\\/g, '/')
}

export function recordWorkToolInvocation(
  state: WorkLoopGuardState,
  name: string,
  argsJson: string,
  ok: boolean,
  resultText?: string,
): void {
  recordPlanToolInvocation(state, name, argsJson, ok)
  if (name === 'write_file' && ok) {
    const path = normalizeWorkspacePath(parseToolPath(argsJson))
    if (path) state.writtenPaths.add(path)
  }
  if (name === 'read_file' && !ok && resultText?.includes('outside workspace roots')) {
    state.outsideWorkspaceReadFailures += 1
    const last = state.invocations[state.invocations.length - 1]
    if (last) last.path = parseToolPath(argsJson) ?? last.path
  }
}

function outsideWorkspaceReadNudge(
  state: WorkLoopGuardState,
  approvedPlanId?: string,
): string | null {
  if (state.outsideWorkspaceReadFailures < WORK_OUTSIDE_WORKSPACE_READ_THRESHOLD) return null
  const planHint = approvedPlanId
    ? `read_file on \`${formatGfPlanArtifactReadPath(approvedPlanId)}\``
    : 'the plan steps already in the system prompt'
  return (
    'Harness: `read_file` on absolute app-storage / plan.json paths fails — those locations are **outside workspace roots**. ' +
    `Use ${planHint} for full structured plan detail, or rely on the **Plan steps** section in the system prompt. ` +
    'Do **not** retry absolute userData paths.'
  )
}

function repeatedIdenticalToolNudge(state: WorkLoopGuardState): string | null {
  const counts = new Map<string, number>()
  for (const inv of state.invocations) {
    counts.set(inv.argsKey, (counts.get(inv.argsKey) ?? 0) + 1)
  }
  for (const [argsKey, count] of counts) {
    if (count >= WORK_REPEATED_IDENTICAL_TOOL_THRESHOLD) {
      return (
        `Harness: you called the same tool with identical arguments **${count} times** (\`${argsKey}\`). ` +
        'That result is already in context. **Stop calling tools** and reply with a concise summary of what was done.'
      )
    }
  }
  return null
}

function postWriteVerifyThrashNudge(state: WorkLoopGuardState): string | null {
  if (state.writtenPaths.size === 0) return null
  for (const writtenPath of state.writtenPaths) {
    const normalizedWritten = normalizeWorkspacePath(writtenPath)
    if (!normalizedWritten) continue
    let readCount = 0
    for (const inv of state.invocations) {
      if (inv.name !== 'read_file' || !inv.ok) continue
      const readPath = normalizeWorkspacePath(inv.path)
      if (!readPath) continue
      if (readPath === normalizedWritten || readPath.endsWith(normalizedWritten)) {
        readCount += 1
      }
    }
    if (readCount >= WORK_POST_WRITE_READ_THRESHOLD) {
      return (
        `Harness: you already wrote and re-read \`${normalizedWritten}\` ${readCount} times. ` +
        '**One** `read_file` after `write_file` is enough for doc verification. Stop tooling and reply with what was created and how you verified it.'
      )
    }
  }
  return null
}

export function evaluateWorkLoopNudge(
  state: WorkLoopGuardState,
  approvedPlanId?: string,
): { kind: WorkLoopGuardNudgeKind; message: string } | null {
  if (!state.sent.has('outside_workspace_read')) {
    const message = outsideWorkspaceReadNudge(state, approvedPlanId)
    if (message) return { kind: 'outside_workspace_read', message }
  }

  if (!state.sent.has('post_write_verify_thrash')) {
    const message = postWriteVerifyThrashNudge(state)
    if (message) return { kind: 'post_write_verify_thrash', message }
  }

  if (!state.sent.has('repeated_identical_tool')) {
    const message = repeatedIdenticalToolNudge(state)
    if (message) return { kind: 'repeated_identical_tool', message }
  }

  return null
}

export function markWorkLoopNudgeSent(
  state: WorkLoopGuardState,
  kind: WorkLoopGuardNudgeKind,
): void {
  state.sent.add(kind)
}