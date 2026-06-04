import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AgentChatEventPayload, AgentChatStartPayload } from '../shared/agent-chat-contract'
import type { StoredPlanArtifact } from '../harness/plan/contracts/plan-artifact'
import type { GfPlanV1 } from '../harness/plan/contracts/gf-plan-contract'
import type { AgentToolWriteOp } from '../harness/tools/contracts/tool-contract'
import type { GrokProjectManifest } from './manifest'
import { planJsonPath } from '../harness/plan/store/plan-store'
import { workspaceIndexPathForProject, type StoredWorkspaceIndex } from '../harness/context/index-store'
import type { AgentChatModelTransport } from '../harness/agent/chat-model-transport'
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

/** Canonical static Todo plan body for greenfield Plan → Execute evals (133). */
export const staticTodoPlanV1: GfPlanV1 = {
  schemaVersion: 1,
  summary: 'Vanilla static todo app',
  filesLikelyTouched: ['index.html', 'styles.css', 'script.js'],
  risksUnknowns: [],
  steps: [{ id: '1', title: 'Create index.html, styles.css, script.js' }],
  verification: 'Open index.html in browser and test the todo app',
}

/** Multi-line static Todo file bodies — external script.js, not crushed inline JS (133 / 124). */
export function staticTodoValidFiles(): { html: string; css: string; js: string } {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Todo</title><link rel="stylesheet" href="styles.css"></head>
<body><h1>Todo</h1><ul id="todo-list"></ul><script src="script.js"></script></body></html>`
  const css = `body {
  font-family: sans-serif;
  margin: 0;
  padding: 1rem;
}
`
  const js = `const STORAGE_KEY = 'todos';

function init() {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('ready');
  });
}

init();
`
  return { html, css, js }
}

export function staticTodoWriteFileOperations(root: string): AgentToolWriteOp[] {
  const { html, css, js } = staticTodoValidFiles()
  return [
    { op: 'write_file', path: join(root, 'index.html'), content: html },
    { op: 'write_file', path: join(root, 'styles.css'), content: css },
    { op: 'write_file', path: join(root, 'script.js'), content: js },
  ]
}

/**
 * Dogfood repro (156): empty workspace, approve-and-run TaskBoard HTML prototype.
 * Original user intent: single-file `index.html` kanban-style prototype.
 */
export const TASKBOARD_PROTOTYPE_USER_PROMPT = 'TaskBoard HTML prototype' as const

/**
 * Dogfood repro (163): empty workspace, direct Work (fast) TaskBoard single-file HTML.
 * Repro 2026-05-30 — mode=Work, empty root. Verbatim user text (field report):
 * "I want to get a design prototype for a taskboard … Keep this all as 1 single html file"
 * Eval constant uses **create** (not *get*) so `isLikelyEditIntent` matches — same intent as dogfood.
 */
export const TASKBOARD_WORK_DIRECT_USER_PROMPT =
  'I want to create a design prototype for a taskboard with columns and cards. Keep this all as 1 single html file.' as const

/** Script-free minimal shell for single-file HTML creation recovery (162 / 163). */
export function taskBoardMinimalShellIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TaskBoard</title>
</head>
<body>
<div id="board"></div>
</body>
</html>`
}

/** Approved gf-plan body for TaskBoard single-file HTML evals (153 / 156). */
export function taskBoardPrototypePlan(): GfPlanV1 {
  return {
    schemaVersion: 1,
    summary: 'TaskBoard HTML prototype',
    filesLikelyTouched: ['index.html'],
    risksUnknowns: [],
    steps: [{ id: '1', title: 'Create index.html' }],
    verification: 'Open in browser',
  }
}

/** Oversized bootstrap HTML — triggers minimal-scaffold rejection after creation recovery (153 / 156). */
export function taskBoardOversizedBootstrapHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>TaskBoard</title></head>
<body>
${'<div class="task">item</div>\n'.repeat(50)}
</body>
</html>`
}

/** One-line HTML with jammed inline script — expect corrupt-content reject (133). */
export function staticTodoCrushedIndexHtml(): string {
  return `<!DOCTYPE html><html><head><title>T</title></head><body>
<script>
const todos=[];function save(){}function init(){}updateCount();})// xfunction setup(){}
</script>
</body></html>`
}

/**
 * Repairable one-line TaskBoard HTML (>1800 chars) — story 160 fixture.
 * Raw: triggers 146 pre-validation (`detectObviousCrushedRawContent` crushed: true).
 * After normalize: passes `assessProposalWriteContent` (accepted on propose path).
 */
export function taskBoardCrushedOneLineIndexHtml(): string {
  const scriptBody =
    'const todos=[];function save(){localStorage.setItem("t",JSON.stringify(todos));}function init(){render();}function render(){const el=document.getElementById("app");el.innerHTML=todos.map(t=>"<li>"+t+"</li>").join("");}document.addEventListener("DOMContentLoaded",init);'.repeat(
      8,
    )
  return `<!DOCTYPE html><html><head><title>TaskBoard</title><meta charset="UTF-8"></head><body><div id="app"></div><script>${scriptBody}</script></body></html>`
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

/** Populated workspace index — non-greenfield mature repo (story 127 routing guard). */
export function seedPopulatedWorkspaceIndex(projectId: string, rootPath: string): void {
  const indexPath = workspaceIndexPathForProject(projectId)
  const relativePaths = ['src/app.ts', 'src/utils.ts', 'src/components/Button.tsx', 'package.json']
  const files = relativePaths.map((relativePath) => ({
    rootId: 'root',
    path: `${rootPath}/${relativePath}`,
    relativePath,
    basename: relativePath.split('/').pop() ?? relativePath,
    ext: relativePath.includes('.') ? `.${relativePath.split('.').pop()}` : '',
    kinds: (relativePath.endsWith('app.ts') ? ['entrypoint', 'source'] : ['source']) as Array<
      'entrypoint' | 'source'
    >,
    symbols: [] as string[],
    size: 256,
  }))
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
          entries: relativePaths,
          importantFiles: ['src/app.ts', 'package.json'],
          packageHints: ['package.json'],
          truncated: false,
        },
      ],
      warnings: [],
    },
    intelligence: {
      version: 1,
      files,
      packages: [
        {
          rootId: 'root',
          path: `${rootPath}/package.json`,
          name: 'eval-app',
          scripts: ['test', 'build'],
          dependenciesOfInterest: [],
          frameworkHints: [],
          entrypoints: [],
        },
      ],
      stats: {
        fileCountScanned: files.length,
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

/** Small non-greenfield vanilla repo — no package.json, 6+ non-trivial files (story 130). */
export function seedSmallVanillaWorkspaceIndex(projectId: string, rootPath: string): void {
  const indexPath = workspaceIndexPathForProject(projectId)
  const relativePaths = [
    'index.html',
    'styles.css',
    'script.js',
    'app.js',
    'utils.js',
    'config.js',
  ]
  const files = relativePaths.map((relativePath) => ({
    rootId: 'root',
    path: `${rootPath}/${relativePath}`,
    relativePath,
    basename: relativePath.split('/').pop() ?? relativePath,
    ext: relativePath.includes('.') ? `.${relativePath.split('.').pop()}` : '',
    kinds: (relativePath === 'index.html' ? ['entrypoint'] : ['source']) as Array<
      'entrypoint' | 'source'
    >,
    symbols: [] as string[],
    size: 128,
  }))
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
          entries: relativePaths,
          importantFiles: ['index.html', 'script.js'],
          packageHints: [],
          truncated: false,
        },
      ],
      warnings: [],
    },
    intelligence: {
      version: 1,
      files,
      packages: [],
      stats: {
        fileCountScanned: files.length,
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
