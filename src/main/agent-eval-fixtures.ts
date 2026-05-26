import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AgentChatEventPayload, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { StoredPlanArtifact } from '../shared/agent-plan-artifact'
import type { GrokProjectManifest } from './manifest'
import { planJsonPath } from './agent-plan-store'
import { workspaceIndexPathForProject, type StoredWorkspaceIndex } from './agent-index-store'
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
      default: 'grok-build-0.1',
      planning: 'grok-4.3',
      execution: 'grok-build-0.1',
      reasoning: 'grok-4.20-0309-reasoning',
      voice: 'grok-voice-latest',
    },
    voice: { enabled: true, defaultVoiceMode: 'off', autoListen: false, speakResponses: false },
    context: { alwaysInclude: [] },
    metadata: { createdAt: 'now', lastOpened: 'now', tags: [] },
  }
}

const defaultEvalPlan = {
  schemaVersion: 1 as const,
  summary: 'Build a vanilla todo app',
  filesLikelyTouched: ['index.html'],
  risksUnknowns: [] as string[],
  steps: [{ id: '1', title: 'Create index.html' }],
  verification: 'Open index.html in browser',
}

/** Seed an approved plan artifact under eval project storage (story 109 / 120). */
export function seedApprovedPlanArtifact(
  projectId: string,
  overrides: Partial<StoredPlanArtifact> = {},
): { planId: string; artifact: StoredPlanArtifact } {
  const planId = overrides.planId ?? randomUUID()
  const artifact: StoredPlanArtifact = {
    schemaVersion: 1,
    planId,
    threadMessageId: overrides.threadMessageId ?? 'eval-plan-msg',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    status: overrides.status ?? 'approved',
    approvedAt: overrides.approvedAt ?? new Date().toISOString(),
    plan: overrides.plan ?? defaultEvalPlan,
    ...overrides,
  }
  const planFile = planJsonPath(projectId, planId)
  mkdirSync(dirname(planFile), { recursive: true })
  writeFileSync(planFile, JSON.stringify(artifact, null, 2), 'utf8')
  return { planId, artifact }
}

/** Minimal workspace index with one non-trivial file (story 120 single-file bias). */
export function seedSingleFileWorkspaceIndex(projectId: string, rootPath: string): void {
  const indexPath = workspaceIndexPathForProject(projectId)
  const stored: StoredWorkspaceIndex = {
    version: 2,
    updatedAt: new Date().toISOString(),
    rootPaths: [rootPath],
    ignorePatterns: ['**/node_modules', '**/.git'],
    summary: {
      roots: [
        {
          rootId: 'root',
          label: 'Root',
          path: rootPath,
          entries: ['index.html'],
          importantFiles: ['index.html'],
          packageHints: [],
          truncated: false,
        },
      ],
      warnings: [],
    },
    intelligence: {
      version: 1,
      files: [
        {
          rootId: 'root',
          path: `${rootPath}/index.html`,
          relativePath: 'index.html',
          basename: 'index.html',
          ext: '.html',
          kinds: ['entrypoint'],
          symbols: [],
          size: 512,
        },
      ],
      packages: [],
      stats: {
        fileCountScanned: 1,
        skippedIgnored: 0,
        skippedGenerated: 0,
        skippedBinary: 0,
        skippedSensitive: 0,
        skippedLarge: 0,
        errors: [],
      },
    },
    truncated: false,
    warnings: [],
  }
  mkdirSync(dirname(indexPath), { recursive: true })
  writeFileSync(indexPath, JSON.stringify(stored, null, 2), 'utf8')
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
