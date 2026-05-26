import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { realpathSync } from 'node:fs'
import { parseGfPlanFromAssistantContent } from '../shared/gf-plan-contract'
import {
  renderPlanMarkdown,
  StoredPlanArtifactSchema,
  type PlanArtifactStatus,
  type StoredPlanArtifact,
} from '../shared/agent-plan-artifact'
import { projectDir } from './app-project-store'

const PLANS_SEGMENT = 'plans'
const MAX_PLANS_SCAN = 64

export function planArtifactDir(projectId: string, planId: string): string {
  return resolve(join(projectDir(projectId), PLANS_SEGMENT, planId))
}

export function planJsonPath(projectId: string, planId: string): string {
  return resolve(join(planArtifactDir(projectId, planId), 'plan.json'))
}

export function planMdPath(projectId: string, planId: string): string {
  return resolve(join(planArtifactDir(projectId, planId), 'plan.md'))
}

export function plansRootForProject(projectId: string): string {
  return resolve(join(projectDir(projectId), PLANS_SEGMENT))
}

export function isPathUnderProjectAgentPlans(candidateAbs: string, projectId: string): boolean {
  try {
    let baseReal = resolve(plansRootForProject(projectId))
    try {
      baseReal = resolve(realpathSync(baseReal))
    } catch {
      /* use resolved path */
    }
    let abs: string
    try {
      abs = resolve(realpathSync(candidateAbs))
    } catch {
      abs = resolve(candidateAbs)
    }
    const rel = relative(baseReal, abs)
    return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

function writeArtifactFiles(projectId: string, artifact: StoredPlanArtifact): void {
  const dir = planArtifactDir(projectId, artifact.planId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(planJsonPath(projectId, artifact.planId), JSON.stringify(artifact, null, 2), 'utf8')
  writeFileSync(planMdPath(projectId, artifact.planId), renderPlanMarkdown(artifact), 'utf8')
}

export function loadPlanArtifact(projectId: string, planId: string): StoredPlanArtifact | null {
  try {
    const raw = readFileSync(planJsonPath(projectId, planId), 'utf8')
    const parsed = StoredPlanArtifactSchema.safeParse(JSON.parse(raw) as unknown)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function completedPlanSortKey(artifact: StoredPlanArtifact): string {
  return artifact.approvedAt ?? artifact.createdAt
}

/** Latest approved or superseded plan artifact for post-plan incremental routing (120). */
export function findLatestCompletedPlanArtifact(projectId: string): StoredPlanArtifact | null {
  const root = plansRootForProject(projectId)
  let entries: string[]
  try {
    if (!statSync(root).isDirectory()) return null
    entries = readdirSync(root)
  } catch {
    return null
  }
  let latest: StoredPlanArtifact | null = null
  let latestKey = ''
  let scanned = 0
  for (const planId of entries) {
    if (scanned >= MAX_PLANS_SCAN) break
    scanned += 1
    const artifact = loadPlanArtifact(projectId, planId)
    if (!artifact) continue
    if (artifact.status !== 'approved' && artifact.status !== 'superseded') continue
    const key = completedPlanSortKey(artifact)
    if (!latest || key > latestKey) {
      latest = artifact
      latestKey = key
    }
  }
  return latest
}

export function findPlanByThreadMessageId(
  projectId: string,
  threadMessageId: string,
): StoredPlanArtifact | null {
  const root = plansRootForProject(projectId)
  let entries: string[]
  try {
    if (!statSync(root).isDirectory()) return null
    entries = readdirSync(root)
  } catch {
    return null
  }
  let scanned = 0
  for (const planId of entries) {
    if (scanned >= MAX_PLANS_SCAN) break
    scanned += 1
    const artifact = loadPlanArtifact(projectId, planId)
    if (artifact?.threadMessageId === threadMessageId) return artifact
  }
  return null
}

export function upsertPlanArtifactFromAssistantMessage(
  projectId: string,
  threadMessageId: string,
  content: string,
): { planId: string } | null {
  const plan = parseGfPlanFromAssistantContent(content)
  if (!plan) return null

  const existing = findPlanByThreadMessageId(projectId, threadMessageId)
  const planId = existing?.planId ?? randomUUID()
  const artifact: StoredPlanArtifact = {
    schemaVersion: 1,
    planId,
    threadMessageId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    status: existing?.status === 'approved' ? 'approved' : 'pending',
    ...(existing?.approvedAt ? { approvedAt: existing.approvedAt } : {}),
    plan,
  }
  writeArtifactFiles(projectId, artifact)
  return { planId }
}

export function setPlanArtifactStatus(
  projectId: string,
  planId: string,
  status: PlanArtifactStatus,
  extras?: { supersededBy?: string },
): boolean {
  const artifact = loadPlanArtifact(projectId, planId)
  if (!artifact) return false
  const next: StoredPlanArtifact = {
    ...artifact,
    status,
    ...(status === 'approved'
      ? { approvedAt: artifact.approvedAt ?? new Date().toISOString() }
      : {}),
    ...(extras?.supersededBy ? { supersededBy: extras.supersededBy } : {}),
  }
  writeArtifactFiles(projectId, next)
  return true
}

export function markPlansSupersededForMessageIds(
  projectId: string,
  messageIds: readonly string[],
  supersededByPlanId?: string,
): number {
  if (messageIds.length === 0) return 0
  const idSet = new Set(messageIds)
  const root = plansRootForProject(projectId)
  let entries: string[]
  try {
    if (!statSync(root).isDirectory()) return 0
    entries = readdirSync(root)
  } catch {
    return 0
  }
  let updated = 0
  let scanned = 0
  for (const planId of entries) {
    if (scanned >= MAX_PLANS_SCAN) break
    scanned += 1
    const artifact = loadPlanArtifact(projectId, planId)
    if (!artifact || !idSet.has(artifact.threadMessageId)) continue
    if (artifact.status === 'superseded') continue
    if (setPlanArtifactStatus(projectId, planId, 'superseded', { supersededBy: supersededByPlanId })) {
      updated += 1
    }
  }
  return updated
}
