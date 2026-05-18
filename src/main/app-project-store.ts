import { app } from 'electron'
import { join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { GrokProjectManifest } from './manifest'
import { validateManifest } from './manifest'
import { discoverAgentInstructionRelativePaths } from './agent-instructions-discover'

const DIR_NAME = 'workspace-projects'
const PROJECT_JSON = 'project.json'
const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules',
  '**/.git',
  '**/dist',
  '**/build',
  // Next.js / static export trees (workspace index, search, listings)
  '**/.next',
  '**/out',
  // electron-builder output; Node fs on app.asar paths often ENOENT
  '**/release',
  '**/.DS_Store',
] as const

export type StoredWorkspaceProject = {
  version: 1
  id: string
  /** Human label; persisted only in app storage. Kept in sync with `manifest.name` for the renderer. */
  displayName: string
  manifest: GrokProjectManifest
}

export function workspaceProjectsBaseDir(): string {
  return join(app.getPath('userData'), DIR_NAME)
}

export function projectDir(id: string): string {
  return join(workspaceProjectsBaseDir(), id)
}

export function projectRecordPath(id: string): string {
  return join(projectDir(id), PROJECT_JSON)
}

export function chatThreadPathForProject(id: string): string {
  return join(projectDir(id), 'chat', 'thread.jsonl')
}

export function isStoredProjectPresent(id: string): boolean {
  return existsSync(projectRecordPath(id))
}

function normalizeIgnorePatterns(ignore: readonly string[] | undefined): string[] {
  return Array.from(new Set([...(ignore ?? []), ...DEFAULT_IGNORE_PATTERNS]))
}

function normalizeManifestRoots(manifest: GrokProjectManifest): GrokProjectManifest {
  return {
    ...manifest,
    roots: manifest.roots.map((r) => ({ ...r, path: resolve(r.path) })),
    ignore: normalizeIgnorePatterns(manifest.ignore),
  }
}

export function defaultManifestForFirstRoot(rootAbs: string, displayName: string): GrokProjectManifest {
  const resolved = resolve(rootAbs)
  const initialRootLabel = resolved.split(/[\\/]/).filter(Boolean).pop() ?? 'Workspace'
  const initialRootHasGit = existsSync(join(resolved, '.git'))
  const now = new Date().toISOString()
  const defaultIgnore = [...DEFAULT_IGNORE_PATTERNS]
  return {
    $schema: 'https://grok.dev/schemas/grokproject-v1.2.json',
    version: '1.2',
    name: displayName,
    description: 'A new multi-root project powered by Grok',
    roots: [
      {
        id: 'root',
        path: resolved,
        type: 'code',
        label: initialRootLabel,
        ...(initialRootHasGit ? { git: true, defaultBranch: 'main' } : {}),
      },
    ],
    ignore: defaultIgnore,
    models: {
      default: 'grok-code-fast-1',
      planning: 'grok-4.3',
      execution: 'grok-code-fast-1',
      reasoning: 'grok-4.20-reasoning',
      voice: 'grok-voice-think-fast-1.0',
    },
    voice: {
      enabled: true,
      defaultVoiceMode: 'full-duplex',
      autoListen: false,
      speakResponses: true,
    },
    context: {
      alwaysInclude: discoverAgentInstructionRelativePaths([{ path: resolved }], defaultIgnore),
      customInstructions:
        "You are GrokForge's coding agent. Act as a senior engineer in this multi-root workspace: base conclusions on the repository and GrokForge's workspace tools (list, read, search), say when you lack evidence, and use the app's edit proposal / diff flow for file changes—not prose-only descriptions. Be concise and precise.",
    },
    metadata: {
      createdAt: now,
      lastOpened: now,
      tags: [],
    },
  }
}

export function createStoredProject(firstRootAbs: string): StoredWorkspaceProject {
  const resolved = resolve(firstRootAbs)
  if (!existsSync(resolved)) {
    throw new Error('Project path does not exist')
  }
  const id = randomUUID()
  const displayName = resolved.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'
  const manifest = defaultManifestForFirstRoot(resolved, displayName)
  mkdirSync(projectDir(id), { recursive: true })
  const record: StoredWorkspaceProject = { version: 1, id, displayName, manifest }
  writeFileSync(projectRecordPath(id), JSON.stringify(record, null, 2))
  return record
}

function parseStoredProject(raw: unknown): StoredWorkspaceProject | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1) return null
  if (typeof o.id !== 'string' || !o.id.trim()) return null
  if (typeof o.displayName !== 'string' || !o.displayName.trim()) return null
  if (!o.manifest || typeof o.manifest !== 'object') return null
  const validation = validateManifest(o.manifest)
  if (!validation.success) return null
  const displayName = o.displayName.trim()
  const manifest = normalizeManifestRoots({
    ...(validation.data as GrokProjectManifest),
    name: displayName,
  })
  return { version: 1, id: o.id.trim(), displayName, manifest }
}

export function loadStoredProject(id: string): StoredWorkspaceProject | null {
  const path = projectRecordPath(id)
  if (!existsSync(path)) return null
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown
  } catch {
    return null
  }
  return parseStoredProject(raw)
}

export function saveStoredProjectRecord(record: StoredWorkspaceProject): void {
  const displayName = record.displayName.trim()
  const manifest = normalizeManifestRoots({ ...record.manifest, name: displayName })
  const validation = validateManifest(manifest)
  if (!validation.success) {
    throw new Error(`Invalid manifest: ${validation.error}`)
  }
  const normalized: StoredWorkspaceProject = {
    version: 1,
    id: record.id,
    displayName,
    manifest: { ...(validation.data as GrokProjectManifest), name: displayName },
  }
  mkdirSync(projectDir(record.id), { recursive: true })
  writeFileSync(projectRecordPath(record.id), JSON.stringify(normalized, null, 2))
}

/** Persist manifest from UI; `manifest.name` becomes the display name. */
export function saveManifestForProject(id: string, manifest: GrokProjectManifest): void {
  const cur = loadStoredProject(id)
  if (!cur) {
    throw new Error('Project not found')
  }
  const displayName = (manifest.name ?? cur.displayName).trim() || cur.displayName
  const nextManifest = normalizeManifestRoots({ ...manifest, name: displayName })
  saveStoredProjectRecord({ ...cur, displayName, manifest: nextManifest })
}

export function touchProjectLastOpened(id: string): void {
  const cur = loadStoredProject(id)
  if (!cur) return
  saveStoredProjectRecord({
    ...cur,
    manifest: {
      ...cur.manifest,
      metadata: { ...cur.manifest.metadata, lastOpened: new Date().toISOString() },
    },
  })
}

export function updateStoredProjectDisplayName(id: string, displayName: string): void {
  const cur = loadStoredProject(id)
  if (!cur) return
  const trimmed = displayName.trim()
  if (!trimmed) return
  saveStoredProjectRecord({
    ...cur,
    displayName: trimmed,
    manifest: {
      ...cur.manifest,
      name: trimmed,
      metadata: { ...cur.manifest.metadata, lastOpened: new Date().toISOString() },
    },
  })
}

export function deleteStoredProject(id: string): void {
  const dir = projectDir(id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
