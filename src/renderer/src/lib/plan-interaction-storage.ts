import { parseGfPlanFromAssistantContent } from '../../../shared/gf-plan-contract'

export type PlanInteractionStatus = 'pending' | 'approved' | 'cancelled' | 'superseded'

export type PlanInteractionState = {
  status: PlanInteractionStatus
  stepDone: boolean[]
}

const storageKey = (projectId: string) => `grokforge.planInteraction.v1:${projectId}`

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
  if (cur && Array.isArray(cur.stepDone) && cur.stepDone.length === stepCount) {
    return cur
  }
  if (cur && Array.isArray(cur.stepDone)) {
    const stepDone = [...cur.stepDone]
    while (stepDone.length < stepCount) stepDone.push(false)
    return { status: cur.status, stepDone: stepDone.slice(0, stepCount) }
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
    }
  }
  const map = { ...readPlanInteractionMap(projectId) }
  const prev = getPlanInteraction(projectId, messageId, stepCount)
  const next: PlanInteractionState = {
    status: patch.status ?? prev.status,
    stepDone: patch.stepDone ?? prev.stepDone,
  }
  map[messageId] = next
  writeMap(projectId, map)
  return next
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
}
