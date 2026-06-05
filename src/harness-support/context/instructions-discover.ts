import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { shouldIgnoreFsEntry } from '../../main/ignore-globs'

/** Basenames (case-insensitive) looked for at each workspace root and under immediate child folders only. */
const AGENT_INSTRUCTION_BASENAMES_LOWER = new Set([
  'agents.md',
  'agent.md',
  '.cursorrules',
  'claude.md',
  'gemini.md',
  'copilot-instructions.md',
  'windsurf.md',
])

function toPosixPath(p: string): string {
  return p.split(sep).join('/')
}

function isAgentInstructionBasename(name: string): boolean {
  return AGENT_INSTRUCTION_BASENAMES_LOWER.has(name.toLowerCase())
}

/**
 * Finds manifest-relative paths to common agent instruction files under each workspace root:
 * the root directory and one level of subdirectories only (same depth rule as repo-ignore).
 * Respects `ignorePatterns` via `shouldIgnoreFsEntry` for immediate child folders and files.
 */
export function discoverAgentInstructionRelativePaths(
  roots: readonly { path: string }[],
  ignorePatterns: readonly string[],
): string[] {
  const found = new Set<string>()

  for (const r of roots) {
    const rootAbs = resolve(r.path)
    if (!existsSync(rootAbs)) continue
    try {
      if (!statSync(rootAbs).isDirectory()) continue
    } catch {
      continue
    }

    const rootsForEntry = roots.map((x) => ({ path: resolve(x.path) }))

    let top
    try {
      top = readdirSync(rootAbs, { withFileTypes: true })
    } catch {
      continue
    }

    for (const d of top) {
      const abs = join(rootAbs, d.name)
      if (d.isFile()) {
        if (!isAgentInstructionBasename(d.name)) continue
        if (shouldIgnoreFsEntry(abs, rootsForEntry, ignorePatterns)) continue
        found.add(toPosixPath(d.name))
      }
    }

    for (const d of top) {
      if (!d.isDirectory()) continue
      const subAbs = join(rootAbs, d.name)
      if (shouldIgnoreFsEntry(subAbs, rootsForEntry, ignorePatterns)) continue

      let inner
      try {
        inner = readdirSync(subAbs, { withFileTypes: true })
      } catch {
        continue
      }

      for (const f of inner) {
        if (!f.isFile()) continue
        if (!isAgentInstructionBasename(f.name)) continue
        const fileAbs = join(subAbs, f.name)
        if (shouldIgnoreFsEntry(fileAbs, rootsForEntry, ignorePatterns)) continue
        const rel = toPosixPath(relative(rootAbs, fileAbs))
        if (rel && !rel.startsWith('..') && !rel.includes('..')) found.add(rel)
      }
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b))
}

export function mergeDiscoveredAgentInstructions(
  existing: readonly string[],
  roots: readonly { path: string }[],
  ignorePatterns: readonly string[],
): string[] {
  const discovered = discoverAgentInstructionRelativePaths(roots, ignorePatterns)
  const merged = new Set<string>()
  for (const s of existing) {
    const t = s.trim()
    if (t) merged.add(t)
  }
  for (const s of discovered) merged.add(s)
  return [...merged].sort((a, b) => a.localeCompare(b))
}
