import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chatThreadPathForProject } from './app-project-store'
import {
  AGENT_TURN_RECEIPT_MAX_LINES,
  AgentTurnReceiptSchema,
  resolveReceiptBoundaryStatus,
  type AgentTurnReceipt,
  type TurnReceiptStatus,
} from '../shared/agent-turn-receipt-contract'

export function turnReceiptsPath(projectId: string): string {
  return `${dirname(chatThreadPathForProject(projectId))}/turn-receipts.jsonl`
}

function ensureReceiptsDir(projectId: string): void {
  mkdirSync(dirname(turnReceiptsPath(projectId)), { recursive: true })
}

function pruneReceiptLinesIfNeeded(projectId: string): void {
  const path = turnReceiptsPath(projectId)
  if (!existsSync(path)) return
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length <= AGENT_TURN_RECEIPT_MAX_LINES) return
  const kept = lines.slice(-AGENT_TURN_RECEIPT_MAX_LINES)
  writeFileSync(path, `${kept.join('\n')}\n`, 'utf8')
}

export function appendTurnReceipt(projectId: string, receipt: AgentTurnReceipt): void {
  const parsed = AgentTurnReceiptSchema.safeParse(receipt)
  if (!parsed.success) return
  ensureReceiptsDir(projectId)
  appendFileSync(turnReceiptsPath(projectId), `${JSON.stringify(parsed.data)}\n`, 'utf8')
  pruneReceiptLinesIfNeeded(projectId)
}

export function readLastTurnReceipt(projectId: string): AgentTurnReceipt | null {
  const path = turnReceiptsPath(projectId)
  if (!existsSync(path)) return null
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = AgentTurnReceiptSchema.safeParse(JSON.parse(lines[i]!) as unknown)
      if (parsed.success) return parsed.data
    } catch {
      /* skip corrupt line */
    }
  }
  return null
}

export function readLastTurnReceiptBoundaryStatus(projectId: string): TurnReceiptStatus | null {
  const last = readLastTurnReceipt(projectId)
  if (!last) return null
  return resolveReceiptBoundaryStatus(last)
}
