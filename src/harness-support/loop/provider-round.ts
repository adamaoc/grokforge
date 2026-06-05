import type { AgentProviderRequest } from '../compaction/turn-snapshot'
import type {
  AgentChatModelTransport,
  AgentChatSampleResult,
} from '../agent/chat-model-transport'

export type ProviderRoundKind = 'tool_sample' | 'final_stream'

export type ProviderRoundServices = {
  transport: AgentChatModelTransport
}

export async function sampleProviderRound(
  services: ProviderRoundServices,
  request: AgentProviderRequest,
  signal: AbortSignal,
): Promise<AgentChatSampleResult> {
  return services.transport.sampleChatCompletion(request, signal)
}

export async function streamProviderFinalAnswer(
  services: ProviderRoundServices,
  request: AgentProviderRequest,
  signal: AbortSignal,
  emitChunk: (delta: string) => void,
): Promise<void> {
  await services.transport.streamFinalAnswer(request, signal, emitChunk)
}
