import { app } from 'electron'
import { basename, join, resolve } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { GrokProjectManifest } from './manifest'
import { isStoredProjectPresent } from './app-project-store'
import { primaryRootPathFromManifest } from './recent-project-primary-path'
import {
  RECENT_PROJECTS_MAX,
  RECENT_PROJECT_DISPLAY_NAME_MAX_LEN,
  RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN,
  RECENT_ROOT_LABEL_MAX_CHARS,
  type RecentProjectEntry,
} from '../shared/recent-projects-contract'

const STORE_VERSION = 2 as const
const FILE_NAME = 'recent-projects.json'

type PersistedShape = {
  version: typeof STORE_VERSION
  entries: RecentProjectEntry[]
}

function storePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function readRaw(): RecentProjectEntry[] {
  const path = storePath()
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const v = (parsed as PersistedShape).version
    if (v !== STORE_VERSION) return []
    const entries = (parsed as PersistedShape).entries
    if (!Array.isArray(entries)) return []
    return entries.filter(isValidEntry)
  } catch {
    return []
  }
}

function isValidEntry(e: unknown): e is RecentProjectEntry {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  if (
    typeof o.projectId !== 'string' ||
    o.projectId.length === 0 ||
    typeof o.displayName !== 'string' ||
    typeof o.rootsCount !== 'number' ||
    !Number.isFinite(o.rootsCount) ||
    typeof o.lastOpenedAt !== 'string'
  ) {
    return false
  }
  if (o.rootLabels !== undefined) {
    if (!Array.isArray(o.rootLabels)) return false
    if (!o.rootLabels.every((x) => typeof x === 'string')) return false
  }
  if (o.primaryRootPath !== undefined) {
    if (typeof o.primaryRootPath !== 'string') return false
    if (o.primaryRootPath.length > RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN) return false
  }
  return true
}

function buildRootLabels(manifest: GrokProjectManifest): string[] {
  return manifest.roots.map((r) => {
    const lab = r.label.trim()
    if (lab) return lab.slice(0, RECENT_ROOT_LABEL_MAX_CHARS)
    return basename(resolve(r.path)).slice(0, RECENT_ROOT_LABEL_MAX_CHARS)
  })
}

function writeRaw(entries: RecentProjectEntry[]): void {
  const payload: PersistedShape = { version: STORE_VERSION, entries }
  writeFileSync(storePath(), JSON.stringify(payload, null, 2), 'utf-8')
}

/** Merge entry at front (MRU), dedupe by project id, cap length. */
export function recordRecentProject(projectId: string, manifest: GrokProjectManifest): RecentProjectEntry[] {
  const id = projectId.trim()
  const now = new Date().toISOString()
  const prevAll = readRaw()
  const existing = prevAll.find((e) => e.projectId === id)
  const prev = prevAll.filter((e) => e.projectId !== id)
  const rootLabels = buildRootLabels(manifest)
  const primaryRootPath = primaryRootPathFromManifest(manifest)
  const next: RecentProjectEntry = {
    projectId: id,
    displayName: existing?.displayName ?? manifest.name,
    rootsCount: manifest.roots.length,
    rootLabels,
    ...(primaryRootPath ? { primaryRootPath } : {}),
    lastOpenedAt: now,
  }

  const merged = [next, ...prev].slice(0, RECENT_PROJECTS_MAX)
  writeRaw(merged)
  return merged
}

function entryStillValid(e: RecentProjectEntry): boolean {
  return isStoredProjectPresent(e.projectId)
}

/** Returns valid entries only; rewrites disk if any row was pruned. */
export function getRecentProjectsSanitized(): RecentProjectEntry[] {
  const raw = readRaw()
  const kept = raw.filter(entryStillValid)
  if (kept.length !== raw.length) {
    writeRaw(kept)
  }
  return kept
}

/** Drop one MRU row by project id (does not delete app project storage). */
export function removeRecentProject(projectId: string): RecentProjectEntry[] {
  const target = projectId.trim()
  const prev = readRaw()
  const next = prev.filter((e) => e.projectId !== target)
  if (next.length !== prev.length) {
    writeRaw(next)
  }
  return getRecentProjectsSanitized()
}

/** Update picker label in MRU only; caller should persist canonical name via app project store. */
export function updateRecentProjectDisplayName(projectId: string, displayName: string): RecentProjectEntry[] {
  const target = projectId.trim()
  const trimmed = displayName.trim()
  if (!trimmed || trimmed.length > RECENT_PROJECT_DISPLAY_NAME_MAX_LEN) {
    return getRecentProjectsSanitized()
  }
  const prev = readRaw()
  let found = false
  const next = prev.map((e) => {
    if (e.projectId === target) {
      found = true
      return { ...e, displayName: trimmed }
    }
    return e
  })
  if (found) {
    writeRaw(next)
  }
  return getRecentProjectsSanitized()
}
