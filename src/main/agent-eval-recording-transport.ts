import type { AgentChatModelTransport } from './agent-chat-model-transport'
import type { AgentProviderRequest } from '../shared/agent-turn-snapshot'

export type AgentEvalProviderCallPhase = 'sample' | 'final'

export type AgentEvalProviderCall = {
  phase: AgentEvalProviderCallPhase
  model: string
  snapshotId: string
  toolNames: string[]
  systemText: string
  reasoningEffort?: AgentProviderRequest['reasoningEffort']
}

function systemTextFromRequest(request: AgentProviderRequest): string {
  const parts: string[] = []
  for (const m of request.messages) {
    if (m.role === 'system' && typeof m.content === 'string' && m.content.length > 0) {
      parts.push(m.content)
    }
  }
  return parts.join('\n---\n')
}

function recordFromRequest(
  phase: AgentEvalProviderCallPhase,
  request: AgentProviderRequest,
): AgentEvalProviderCall {
  return {
    phase,
    model: request.model,
    snapshotId: request.snapshotId,
    toolNames: request.tools.map((t) => t.function.name),
    systemText: systemTextFromRequest(request),
    reasoningEffort: request.reasoningEffort,
  }
}

export function createRecordingTransport(inner: AgentChatModelTransport): {
  transport: AgentChatModelTransport
  records: AgentEvalProviderCall[]
  getRecords: () => readonly AgentEvalProviderCall[]
} {
  const records: AgentEvalProviderCall[] = []

  const transport: AgentChatModelTransport = {
    async sampleChatCompletion(request, signal) {
      records.push(recordFromRequest('sample', request))
      return inner.sampleChatCompletion(request, signal)
    },
    async streamFinalAnswer(request, signal, emitChunk) {
      records.push(recordFromRequest('final', request))
      return inner.streamFinalAnswer(request, signal, emitChunk)
    },
  }

  return {
    transport,
    records,
    getRecords: () => records,
  }
}
