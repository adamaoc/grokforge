/**
 * History compaction when visible messages grow large.
 * Invoked from {@link loop.ts} before each turn's tool loop (after user message added).
 */

import type { HarnessLogger } from './logger'
import { modelChat } from './model-client'
import type { HarnessSession } from './session'
import { toApiMessages } from './session'

const COMPACT_WHEN_VISIBLE_OVER = 30
const KEEP_RECENT_VISIBLE = 12

export async function maybeCompactHarnessSession(
  session: HarnessSession,
  modelId: string,
  logger: HarnessLogger,
  signal: AbortSignal,
): Promise<void> {
  const visible = session.getHistory().filter((m) => !m.hidden)
  if (visible.length <= COMPACT_WHEN_VISIBLE_OVER) return

  const middle = visible.slice(1, visible.length - KEEP_RECENT_VISIBLE)
  if (middle.length === 0) return

  const transcript = middle
    .map((m) => `[${m.role}] ${typeof m.content === 'string' ? m.content : ''}`.slice(0, 500))
    .join('\n')

  const summarizePrompt =
    'Summarize this agent conversation for future turns. ' +
    'Keep: user goals, files touched, decisions, errors, open tasks. ' +
    'Drop: pleasantries and repeated tool output. Under 400 words.\n\n' +
    transcript

  const started = Date.now()
  const response = await modelChat(
    modelId,
    [{ role: 'user', content: summarizePrompt }],
    [],
    signal,
    { disableTools: true, maxTokens: 1024 },
  )

  const summary = response.content.trim() || '(empty summary)'

  await logger.event('compaction', {
    hiddenCount: middle.length,
    keptRecent: KEEP_RECENT_VISIBLE,
    durationMs: Date.now() - started,
    summaryChars: summary.length,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  })

  const history = session.getHistory()
  for (const msg of middle) {
    const idx = history.indexOf(msg)
    if (idx >= 0) session.markHidden(idx)
  }

  await session.addMessage(
    'system',
    `COMPACTED HISTORY (${middle.length} messages summarized):\n${summary}`,
  )
  await session.rewriteDisk()
}

/** Approximate chars sent on next API call (for turn_start logging). */
export function estimateVisibleContextChars(session: HarnessSession): number {
  return toApiMessages(session.getHistory()).reduce((n, m) => {
    if (m.role === 'tool') return n + m.content.length
    if (m.role === 'assistant') {
      const base = m.content?.length ?? 0
      const tools =
        m.tool_calls?.reduce(
          (total: number, toolCall) =>
            total + toolCall.function.arguments.length + toolCall.function.name.length,
          0,
        ) ??
        0
      return n + base + tools
    }
    return n + (m.content?.length ?? 0)
  }, 0)
}
