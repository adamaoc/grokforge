import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { GrokProjectManifest } from '../../main/manifest'
import { shouldIgnoreFsEntry } from '../../main/ignore-globs'
import { isPathWithinWorkspaceRoots } from '../../main/workspace-path-guard'
import { isLikelySensitivePath } from '../tools/workspace-tools'
import { projectDir } from '../../main/app-project-store'
import {
  AGENT_CONTEXT_MAX_PINS_PER_PROJECT,
  AGENT_CONTEXT_PINS_SCHEMA_VERSION,
  AgentContextPinsFileSchema,
  type AgentContextPin,
  type GetProjectContextPinsResult,
  type SetProjectContextPinsResult,
} from './context-pins-contract'

function pinsFilePath(projectId: string): string {
  return resolve(projectDir(projectId), 'context', 'pins.json')
}

function normalizePinPath(path: string): string {
  return resolve(path)
}

export function validateContextPinsForManifest(
  manifest: GrokProjectManifest,
  pins: AgentContextPin[],
): { ok: true; pins: AgentContextPin[] } | { ok: false; error: string } {
  if (pins.length > AGENT_CONTEXT_MAX_PINS_PER_PROJECT) {
    return { ok: false, error: `At most ${AGENT_CONTEXT_MAX_PINS_PER_PROJECT} pins allowed.` }
  }
  const seen = new Set<string>()
  const out: AgentContextPin[] = []
  const roots = manifest.roots
  const ignore = manifest.ignore ?? []

  for (const pin of pins) {
    const abs = normalizePinPath(pin.path)
    const key = abs.toLowerCase()
    if (seen.has(key)) continue
    if (!isPathWithinWorkspaceRoots(abs, roots)) {
      return { ok: false, error: `Pin path is outside workspace roots: ${pin.path}` }
    }
    if (shouldIgnoreFsEntry(abs, roots, ignore)) {
      return { ok: false, error: `Pin path matches ignore rules: ${pin.path}` }
    }
    if (isLikelySensitivePath(abs)) {
      return { ok: false, error: `Pin path looks sensitive: ${pin.path}` }
    }
    if (!existsSync(abs)) {
      return { ok: false, error: `Pinned path does not exist: ${pin.path}` }
    }
    let type: AgentContextPin['type'] = pin.type
    try {
      const st = statSync(abs)
      if (st.isDirectory()) type = 'folder'
      else if (st.isFile()) type = 'file'
      else {
        return { ok: false, error: `Pinned path is not a file or folder: ${pin.path}` }
      }
    } catch {
      return { ok: false, error: `Could not read pinned path: ${pin.path}` }
    }
    seen.add(key)
    out.push({ type, path: abs })
  }

  return { ok: true, pins: out }
}

export function loadProjectContextPins(projectId: string): GetProjectContextPinsResult {
  const filePath = pinsFilePath(projectId)
  if (!existsSync(filePath)) {
    return { ok: true, pins: [] }
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    const parsed = AgentContextPinsFileSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: true, pins: [] }
    }
    return { ok: true, pins: parsed.data.pins }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load context pins'
    return { ok: false, error: msg }
  }
}

export function saveProjectContextPins(
  projectId: string,
  manifest: GrokProjectManifest,
  pins: AgentContextPin[],
): SetProjectContextPinsResult {
  const validated = validateContextPinsForManifest(manifest, pins)
  if (!validated.ok) return validated

  const filePath = pinsFilePath(projectId)
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const payload = {
      schemaVersion: AGENT_CONTEXT_PINS_SCHEMA_VERSION,
      pins: validated.pins,
    }
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { ok: true, pins: validated.pins }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save context pins'
    return { ok: false, error: msg }
  }
}
