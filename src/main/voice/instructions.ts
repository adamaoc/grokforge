import type { GrokProjectManifest } from '../project/manifest'
import { VOICE_THREAD_SUMMARY_EFFECTIVE_MAX } from '../../shared/voice/session-contract'

/**
 * System instructions for the Grok Voice session. Voice is a conversation layer: it cannot
 * read or change files. Real work happens in agent chat (Grok Build / Claude Code), which the
 * user reaches with "Continue in agent chat".
 */
export function buildVoiceInstructions(
  manifest: GrokProjectManifest,
  opts: { voiceModelId: string; threadSummary?: string },
): string {
  const roots = manifest.roots.map((r) => `- ${r.label || r.id} (${r.type}): ${r.path}`).join('\n')
  const parts = [
    `You are the voice companion inside GrokForge, a desktop workspace for the project "${manifest.name}".`,
    `Project folders:\n${roots}`,
    'A coding agent (Grok Build or Claude Code) does the actual file reading, editing, and command running in GrokForge agent chat. You cannot see or change files yourself, so never claim you did.',
    'Help the developer think out loud: clarify what they want, talk through approaches, and turn the idea into a clear request. When they are ready for code changes, tell them to say or press "Continue in agent chat" to hand the conversation to the coding agent.',
    'Keep replies short and conversational; this is spoken audio.',
  ]
  const summary = opts.threadSummary?.trim()
  if (summary) {
    parts.push(
      `Recent messages from this project's chat thread (for continuity):\n${summary.slice(0, VOICE_THREAD_SUMMARY_EFFECTIVE_MAX)}`,
    )
  }
  parts.push(`Voice model: ${opts.voiceModelId}.`)
  return parts.join('\n\n')
}
