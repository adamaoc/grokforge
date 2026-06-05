/**
 * In-memory + JSONL session for one stream.
 *
 * Used by {@link loop.ts} for API history and by {@link compaction.ts} to hide
 * old messages. Persists under `minimal/sessions/<streamId>.jsonl` in app project dir.
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentModelChatMessage, AgentModelToolCall } from '../shared/agent-model-message'

export type HarnessSessionMessage = AgentModelChatMessage & {
  timestamp: string
  /** Compaction marks middle turns hidden; stripped in {@link toApiMessages}. */
  hidden?: boolean
  /** Tool message metadata for logs. */
  name?: string
}

export class HarnessSession {
  readonly streamId: string
  private readonly filePath: string
  private messages: HarnessSessionMessage[] = []

  constructor(streamId: string, sessionsDir: string) {
    this.streamId = streamId
    this.filePath = join(sessionsDir, `${streamId}.jsonl`)
  }

  async loadFromDisk(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8')
      this.messages = data
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as HarnessSessionMessage)
    } catch {
      this.messages = []
    }
  }

  getHistory(): readonly HarnessSessionMessage[] {
    return this.messages
  }

  async addMessage(
    role: HarnessSessionMessage['role'],
    content: string,
    meta: Partial<HarnessSessionMessage> = {},
  ): Promise<void> {
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...meta,
    } as HarnessSessionMessage
    this.messages.push(msg)
    await mkdir(dirname(this.filePath), { recursive: true })
    await appendFile(this.filePath, `${JSON.stringify(msg)}\n`, 'utf-8')
  }

  async addAssistantWithToolCalls(
    content: string | null,
    toolCalls: AgentModelToolCall[],
  ): Promise<void> {
    await this.addMessage('assistant', content ?? '', { tool_calls: toolCalls })
  }

  markHidden(index: number): void {
    const m = this.messages[index]
    if (m) m.hidden = true
  }

  async rewriteDisk(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const body = this.messages.map((m) => JSON.stringify(m)).join('\n')
    await writeFile(this.filePath, body ? `${body}\n` : '', 'utf-8')
  }

  /** Seed thread from UI snapshot (user/assistant only). */
  async seedFromThread(
    lines: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<void> {
    for (const line of lines) {
      if (line.role === 'system') continue
      if (line.role !== 'user' && line.role !== 'assistant') continue
      await this.addMessage(line.role, line.content)
    }
  }
}

/** Strip harness-only fields before xAI request. */
export function toApiMessages(messages: readonly HarnessSessionMessage[]): AgentModelChatMessage[] {
  return messages
    .filter((m) => !m.hidden)
    .map(({ timestamp: _ts, hidden: _h, name: _n, ...rest }) => rest as AgentModelChatMessage)
}
