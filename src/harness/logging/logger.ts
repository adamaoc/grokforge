/**
 * JSONL trace per stream under `minimal/logs/`.
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export function preview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}

export class HarnessLogger {
  private readonly logPath: string

  constructor(logsDir: string, streamId: string) {
    this.logPath = join(logsDir, `${streamId}.jsonl`)
  }

  async event(kind: string, fields: Record<string, unknown> = {}): Promise<void> {
    const record = { ts: new Date().toISOString(), kind, ...fields }
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatConsole(record))
    }
    await mkdir(dirname(this.logPath), { recursive: true })
    await appendFile(this.logPath, `${JSON.stringify(record)}\n`, 'utf-8')
  }

  private formatConsole(record: Record<string, unknown>): string {
    const { ts: _ts, kind, ...rest } = record
    const parts = Object.entries(rest).map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
    )
    return `[harness] ${kind}${parts.length ? ` ${parts.join(' ')}` : ''}`
  }
}

export function summarizeMessagesForLog(
  messages: ReadonlyArray<{ role: string; content?: string | null; tool_calls?: unknown[] }>,
): Array<{ role: string; chars: number; toolCalls?: number }> {
  return messages.map((m) => ({
    role: m.role,
    chars:
      typeof m.content === 'string'
        ? m.content.length
        : m.tool_calls
          ? JSON.stringify(m.tool_calls).length
          : 0,
    ...(m.tool_calls?.length ? { toolCalls: m.tool_calls.length } : {}),
  }))
}
