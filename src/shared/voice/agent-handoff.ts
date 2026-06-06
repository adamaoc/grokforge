/**
 * Voice → typed agent chat handoff user text (story 077 / 091 / 113).
 */

import { AGENT_CHAT_MAX_USER_TEXT_CHARS } from '../agent/chat-contract'
import { HARNESS_CROSS_SURFACE_EXPLORE_RULES } from '../../harness-support/profiles/harness-profile'
import type { HarnessProfileKey } from '../../harness-support/profiles/contracts/harness-profile-key'

export type VoiceHandoffLine = {
  role: 'user' | 'assistant'
  content: string
  /** When set, line is tagged as voice-sourced in the thread excerpt. */
  source?: 'voice' | 'text'
}

export type BuildVoiceHandoffUserTextInput = {
  lines: VoiceHandoffLine[]
  voiceModelId: string
  harnessProfileKey: HarnessProfileKey
  harnessProfileDisplayName?: string
  tailCount?: number
}

function buildHandoffHeader(input: BuildVoiceHandoffUserTextInput): string {
  const profileLabel =
    input.harnessProfileDisplayName?.trim() ||
    input.harnessProfileKey
  return [
    'Continue from our mixed voice/text conversation. Use workspace tools to implement what we discussed.',
    `Voice session model: ${input.voiceModelId.trim()}. Harness profile for voice alignment: ${profileLabel} (${input.harnessProfileKey}).`,
    'Typed agent chat will use workspace tools (`search_workspace`, `list_directory`, `read_file`, `propose_file_edits`, `run_command` when appropriate) — voice cannot run those tools directly.',
    '',
    'Recent thread:',
  ].join('\n')
}

function buildHandoffFooter(): string {
  return [
    ...HARNESS_CROSS_SURFACE_EXPLORE_RULES,
    '',
    'If a feature, page, or file was mentioned by name but not as an absolute path, locate it with search/list tools under the active workspace roots—do not ask the user for a path unless search is ambiguous.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Build user text for `agent-chat-start` after voice → agent handoff. */
export function buildVoiceHandoffUserText(input: BuildVoiceHandoffUserTextInput): string {
  const tailCount = input.tailCount ?? 10
  const tail = input.lines.slice(-tailCount)
  const threadLines = tail.map((m) => {
    const voiceTag = m.source === 'voice' ? ' [voice]' : ''
    const role = m.role === 'user' ? 'User' : 'Assistant'
    return `${role}${voiceTag}: ${m.content.trim()}`
  })
  let body = [buildHandoffHeader(input), threadLines.join('\n\n'), buildHandoffFooter()].join('\n')
  if (body.length > AGENT_CHAT_MAX_USER_TEXT_CHARS) {
    body = body.slice(0, AGENT_CHAT_MAX_USER_TEXT_CHARS)
  }
  return body.trim()
}
