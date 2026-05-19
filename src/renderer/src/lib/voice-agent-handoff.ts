import type { ChatMessage } from '@/types'
import { AGENT_CHAT_MAX_USER_TEXT_CHARS } from '@/types'

const HANDOFF_PREFIX = [
  'Continue from our mixed voice/text conversation. Use workspace tools to implement what we discussed.',
  'Before asking for file paths: run `search_workspace` and/or `list_directory` under the workspace roots, then `read_file` on the best match. Use `propose_file_edits` for disk changes after you have read any existing files you modify.',
  '',
  'Recent thread:',
].join('\n')

const HANDOFF_SUFFIX = [
  '',
  'If a feature, page, or file was mentioned by name but not as an absolute path, locate it with search/list tools under the active workspace roots—do not ask the user for a path unless search is ambiguous.',
].join('\n')

/** Build user text for `agent-chat-start` after voice → agent handoff. */
export function buildVoiceAgentHandoffUserText(messages: ChatMessage[], tailCount = 10): string {
  const tail = messages.filter((m) => m.id !== 'welcome').slice(-tailCount)
  const lines = tail.map((m) => {
    const voiceTag = m.turnContext?.source === 'voice' ? ' [voice]' : ''
    const role = m.role === 'user' ? 'User' : 'Assistant'
    return `${role}${voiceTag}: ${m.content.trim()}`
  })
  let body = [HANDOFF_PREFIX, lines.join('\n\n'), HANDOFF_SUFFIX].join('\n')
  if (body.length > AGENT_CHAT_MAX_USER_TEXT_CHARS) {
    body = body.slice(0, AGENT_CHAT_MAX_USER_TEXT_CHARS)
  }
  return body.trim()
}
