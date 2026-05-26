import {
  GF_PLAN_FENCE,
  parseGfPlanFromAssistantContent,
  type GfPlanV1,
} from '../../../shared/gf-plan-contract'

export type PlanWorkflowMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** True when assistant content has an open `gf-plan` fence but JSON is not valid yet. */
export function isStreamingGfPlanFenceContent(content: string): boolean {
  if (!content.trim()) return false
  if (parseGfPlanFromAssistantContent(content)) return false
  return new RegExp('```\\s*' + GF_PLAN_FENCE + '\\s*\\n', 'i').test(content)
}

export function findLatestPlanInThread(
  messages: readonly PlanWorkflowMessage[],
): { messageId: string; plan: GfPlanV1; stepCount: number } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role !== 'assistant' || !m.content) continue
    const plan = parseGfPlanFromAssistantContent(m.content)
    if (!plan) continue
    return { messageId: m.id, plan, stepCount: plan.steps.length }
  }
  return null
}

export function threadHasPlanCard(messages: readonly PlanWorkflowMessage[] | null | undefined): boolean {
  return findLatestPlanInThread(messages ?? []) !== null
}

export type ResolvePlanWorkflowPhaseInput = {
  conversationMode: 'normal' | 'plan'
  busy: boolean
  liveChatMode?: 'fast' | 'plan'
  isStreamingPlanFence?: boolean
  executingPlanMessageId: string | null
  executingPlanStepCount?: number
  projectId: string | null | undefined
  messages: readonly PlanWorkflowMessage[]
}

/** Single source of truth for composer + plan card stepper phases (story 098). */
export function resolvePlanWorkflowPhase(input: ResolvePlanWorkflowPhaseInput): PlanUiPhase {
  // Execute lifecycle wins over stale plan-mode busy (approve-and-run gap before turn_started).
  if (input.executingPlanMessageId) {
    const stepCount = input.executingPlanStepCount ?? 1
    const st = getPlanInteraction(input.projectId, input.executingPlanMessageId, stepCount)
    if (
      st.runPhase === 'done' ||
      st.runPhase === 'failed' ||
      st.runPhase === 'needs_review'
    ) {
      return st.runPhase
    }
    if (input.busy) return 'executing'
    if (st.runPhase === 'executing') return 'needs_review'
    return derivePlanUiPhase(st, { isExecutingThisPlan: false })
  }

  if (input.busy && input.liveChatMode === 'plan') return 'planning'
  if (input.isStreamingPlanFence) return 'planning'

  const latest = findLatestPlanInThread(input.messages)
  if (latest) {
    const st = getPlanInteraction(input.projectId, latest.messageId, latest.stepCount)
    const derived = derivePlanUiPhase(st, { isExecutingThisPlan: false })
    if (input.conversationMode === 'plan') return derived
    if (derived === 'done' || derived === 'failed' || derived === 'needs_review') {
      return derived
    }
  }

  if (input.conversationMode === 'plan') {
    return latest ? derivePlanUiPhase(getPlanInteraction(input.projectId, latest.messageId, latest.stepCount), {}) : 'awaiting_plan'
  }

  return 'pending'
}

export type PlanInteractionStatus = 'pending' | 'approved' | 'cancelled' | 'superseded'

export type PlanRunPhase = 'executing' | 'done' | 'failed' | 'needs_review'

export type PlanInteractionState = {
  status: PlanInteractionStatus
  stepDone: boolean[]
  runPhase?: PlanRunPhase
  /** Story 109 — durable plan artifact id in app userData. */
  planId?: string
}

/** Derived UI phase for stepper + badges (story 098). */
export type PlanUiPhase =
  | 'awaiting_plan'
  | 'planning'
  | 'pending'
  | 'approved_idle'
  | 'executing'
  | 'done'
  | 'needs_review'
  | 'failed'
  | 'cancelled'
  | 'superseded'

const storageKey = (projectId: string) => `grokforge.planInteraction.v1:${projectId}`

function normalizeState(cur: PlanInteractionState, stepCount: number): PlanInteractionState {
  const stepDone = [...cur.stepDone]
  while (stepDone.length < stepCount) stepDone.push(false)
  return {
    status: cur.status,
    stepDone: stepDone.slice(0, stepCount),
    ...(cur.runPhase ? { runPhase: cur.runPhase } : {}),
  }
}

export function readPlanInteractionMap(projectId: string | null | undefined): Record<string, PlanInteractionState> {
  if (!projectId || typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, PlanInteractionState>
  } catch {
    return {}
  }
}

function writeMap(projectId: string, map: Record<string, PlanInteractionState>): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getPlanInteraction(
  projectId: string | null | undefined,
  messageId: string,
  stepCount: number,
): PlanInteractionState {
  const map = readPlanInteractionMap(projectId)
  const cur = map[messageId]
  if (cur && Array.isArray(cur.stepDone)) {
    return normalizeState(cur, stepCount)
  }
  return {
    status: 'pending',
    stepDone: Array.from({ length: stepCount }, () => false),
  }
}

export function patchPlanInteraction(
  projectId: string | null | undefined,
  messageId: string,
  patch: Partial<PlanInteractionState>,
  stepCount: number,
): PlanInteractionState {
  if (!projectId) {
    return {
      status: patch.status ?? 'pending',
      stepDone: patch.stepDone ?? Array.from({ length: stepCount }, () => false),
      ...(patch.runPhase ? { runPhase: patch.runPhase } : {}),
    }
  }
  const map = { ...readPlanInteractionMap(projectId) }
  const prev = getPlanInteraction(projectId, messageId, stepCount)
  const next: PlanInteractionState = {
    status: patch.status ?? prev.status,
    stepDone: patch.stepDone ?? prev.stepDone,
    runPhase: patch.runPhase !== undefined ? patch.runPhase : prev.runPhase,
    planId: patch.planId !== undefined ? patch.planId : prev.planId,
  }
  if (next.runPhase === undefined) {
    delete next.runPhase
  }
  if (next.planId === undefined) {
    delete next.planId
  }
  map[messageId] = next
  writeMap(projectId, map)
  return next
}

export function setPlanRunPhase(
  projectId: string | null | undefined,
  messageId: string,
  runPhase: PlanRunPhase | undefined,
  stepCount: number,
): PlanInteractionState {
  return patchPlanInteraction(projectId, messageId, { runPhase }, stepCount)
}

export function derivePlanUiPhase(
  state: PlanInteractionState,
  options: {
    globalPlanningTurn?: boolean
    isExecutingThisPlan?: boolean
    /** Story 125: stream ended but runPhase not yet patched after approve-and-run. */
    staleExecutingRunPhase?: boolean
  },
): PlanUiPhase {
  if (options.globalPlanningTurn) return 'planning'
  if (state.status === 'cancelled') return 'cancelled'
  if (state.status === 'superseded') return 'superseded'
  if (state.runPhase === 'failed') return 'failed'
  if (state.runPhase === 'needs_review') return 'needs_review'
  if (state.runPhase === 'done') return 'done'
  if (state.runPhase === 'executing') {
    if (options.isExecutingThisPlan) return 'executing'
    if (options.staleExecutingRunPhase) return 'needs_review'
    if (state.status === 'approved') return 'approved_idle'
  }
  if (options.isExecutingThisPlan) return 'executing'
  if (state.status === 'pending') return 'pending'
  if (state.status === 'approved') return 'approved_idle'
  return 'pending'
}

export function planUiPhaseLabel(phase: PlanUiPhase): string {
  switch (phase) {
    case 'awaiting_plan':
      return 'Ready to plan'
    case 'planning':
      return 'Planning'
    case 'pending':
      return 'Pending review'
    case 'approved_idle':
      return 'Ready to run'
    case 'executing':
      return 'Executing'
    case 'done':
      return 'Done'
    case 'needs_review':
      return 'Review changes'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'superseded':
      return 'Superseded'
    default:
      return 'Plan'
  }
}

export function markPendingPlansSuperseded(
  projectId: string | null | undefined,
  messageIdsWithPendingPlan: string[],
): void {
  if (!projectId || messageIdsWithPendingPlan.length === 0) return
  const map = { ...readPlanInteractionMap(projectId) }
  let changed = false
  for (const id of messageIdsWithPendingPlan) {
    const st = map[id]
    if (st?.status === 'pending') {
      map[id] = { ...st, status: 'superseded' }
      changed = true
    }
  }
  if (changed) writeMap(projectId, map)
}

/** Call when the user sends a new message so older pending plans are not left ambiguous. */
export function supersedePendingPlansBeforeNewUserMessage(
  projectId: string | null | undefined,
  thread: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string }>,
): void {
  if (!projectId) return
  const ids: string[] = []
  for (const m of thread) {
    if (m.role !== 'assistant' || !m.content) continue
    const plan = parseGfPlanFromAssistantContent(m.content)
    if (!plan) continue
    const st = getPlanInteraction(projectId, m.id, plan.steps.length)
    if (st.status === 'pending') ids.push(m.id)
  }
  markPendingPlansSuperseded(projectId, ids)
  if (ids.length > 0 && typeof window !== 'undefined' && window.electron?.markStoredPlansSuperseded) {
    void window.electron.markStoredPlansSuperseded({ projectId, threadMessageIds: ids })
  }
}
