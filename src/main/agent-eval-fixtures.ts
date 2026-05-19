import type { BrowserWindow } from 'electron'
import type { AgentChatEventPayload, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { GrokProjectManifest } from './manifest'
import type { AgentChatModelTransport } from './agent-chat-model-transport'
import type { AgentEvalProviderCall } from './agent-eval-recording-transport'
import { createRecordingTransport } from './agent-eval-recording-transport'
import {
  primeActiveAgentTurn,
  runAgentTurnJobForEvaluation,
  setAgentChatModelTransportForTesting,
  setAgentChatTargetWindow,
  setGetCurrentProjectForTesting,
} from './agent-runner'

export function manifestForEvalRoot(root: string): GrokProjectManifest {
  return {
    version: '1.2',
    name: 'Eval Project',
    roots: [{ id: 'root', path: root, type: 'code', label: 'Root' }],
    ignore: ['**/node_modules', '**/.git', '**/ignored'],
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

export function baseEvalPayload(streamId: string, userText: string): AgentChatStartPayload {
  return {
    streamId,
    model: 'grok-test',
    userText,
    threadSnapshot: [],
    activeContext: {
      activeRootId: 'root',
      openTabs: [],
      chatMode: 'fast',
    },
  }
}

export function createEvalEventSink(): { win: BrowserWindow; payloads: AgentChatEventPayload[] } {
  const payloads: AgentChatEventPayload[] = []
  const win = {
    webContents: {
      send: (_channel: string, payload: AgentChatEventPayload) => {
        payloads.push(payload)
      },
    },
  } as unknown as BrowserWindow
  return { win, payloads }
}

export type SetupEvalTurnInput = {
  root: string
  innerTransport: AgentChatModelTransport
  projectId: string
  payload: AgentChatStartPayload
}

export type SetupEvalTurnResult = {
  payloads: AgentChatEventPayload[]
  records: AgentEvalProviderCall[]
  getRecords: () => readonly AgentEvalProviderCall[]
  restore: () => void
}

/**
 * Wire eval hooks, recording transport, and run one agent turn (story 108 fixtures).
 */
export async function setupEvalTurn(input: SetupEvalTurnInput): Promise<SetupEvalTurnResult> {
  const { win, payloads } = createEvalEventSink()
  setAgentChatTargetWindow(win)

  const { transport, records, getRecords } = createRecordingTransport(input.innerTransport)
  const restores: Array<() => void> = []
  restores.push(setAgentChatModelTransportForTesting(transport))
  restores.push(
    setGetCurrentProjectForTesting(() => ({
      projectId: input.projectId,
      manifest: manifestForEvalRoot(input.root),
    })),
  )

  primeActiveAgentTurn(input.payload.streamId)
  await runAgentTurnJobForEvaluation(input.payload)

  return {
    payloads,
    records,
    getRecords,
    restore: () => {
      while (restores.length) restores.pop()?.()
      setAgentChatTargetWindow(null)
    },
  }
}
