/**
 * Voice → agent chat handoff: turns the recent mixed voice/text thread into one request for
 * the coding agent.
 */

import { AGENT_CHAT_MAX_USER_TEXT_CHARS } from '../agent/chat-contract'

export type VoiceHandoffLine = {
  role: 'user' | 'assistant'
  content: string
  /** When set, line is tagged as voice-sourced in the thread excerpt. */
  source?: 'voice' | 'text'
}

export type BuildVoiceHandoffUserTextInput = {
  lines: VoiceHandoffLine[]
  tailCount?: number
}

const HEADER = [
  'Continue from our voice conversation and do the work we discussed.',
  'The voice assistant could not read or change files, so check the code yourself before acting. If a file or feature was named without a path, find it in the workspace rather than asking.',
  '',
  'Recent conversation:',
].join('\n')

/** Build user text for `agent-chat-start` after a voice → agent handoff. */
export function buildVoiceHandoffUserText(input: BuildVoiceHandoffUserTextInput): string {
  const tail = input.lines.slice(-(input.tailCount ?? 10))
  const threadLines = tail
    .filter((m) => m.content.trim())
    .map((m) => {
      const voiceTag = m.source === 'voice' ? ' [voice]' : ''
      const role = m.role === 'user' ? 'User' : 'Assistant'
      return `${role}${voiceTag}: ${m.content.trim()}`
    })
  if (threadLines.length === 0) return ''
  return [HEADER, threadLines.join('\n\n')].join('\n').slice(0, AGENT_CHAT_MAX_USER_TEXT_CHARS).trim()
}
