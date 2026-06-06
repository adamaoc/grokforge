import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import type { GrokProjectManifest } from '../../main/project/manifest'
import { projectDir } from '../../main/project/store'
import { buildWorkspaceIndexSummary, type WorkspaceIndexSummary } from './context'
import { shouldIgnoreFsEntry } from '../../main/workspace/ignore-globs'

const INDEX_DIR_NAME = 'index'
const WORKSPACE_INDEX_FILE = 'workspace-index.json'
const INTELLIGENCE_MAX_FILES = 4_000
const INTELLIGENCE_MAX_FILE_BYTES = 512 * 1024
const SYMBOL_SCAN_MAX_BYTES = 96 * 1024
const SYMBOLS_PER_FILE = 24

export type ProjectIntelligenceFileKind =
  | 'source'
  | 'component'
  | 'route'
  | 'test'
  | 'config'
  | 'package'
  | 'docs'
  | 'entrypoint'

export type ProjectIntelligenceFile = {
  rootId: string
  path: string
  relativePath: string
  basename: string
  ext: string
  kinds: ProjectIntelligenceFileKind[]
  symbols: string[]
  likelySubject?: string
  size: number
}

export type ProjectIntelligencePackage = {
  rootId: string
  path: string
  name?: string
  scripts: string[]
  dependenciesOfInterest: string[]
  frameworkHints: string[]
  entrypoints: string[]
}

export type ProjectIntelligenceStats = {
  fileCountScanned: number
  skippedIgnored: number
  skippedGenerated: number
  skippedBinary: number
  skippedSensitive: number
  skippedLarge: number
  errors: string[]
}

export type ProjectIntelligence = {
  version: 1
  files: ProjectIntelligenceFile[]
  packages: ProjectIntelligencePackage[]
  stats: ProjectIntelligenceStats
}

export type StoredWorkspaceIndex = {
  version: 2
  updatedAt: string
  rootPaths: string[]
  ignorePatterns: string[]
  summary: WorkspaceIndexSummary
  intelligence: ProjectIntelligence
  truncated: boolean
  warnings: string[]
}

export function workspaceIndexPathForProject(projectId: string): string {
  return join(projectDir(projectId), INDEX_DIR_NAME, WORKSPACE_INDEX_FILE)
}

function toPosixPath(p: string): string {
  return p.split(/[\\/]/).join('/')
}

function isLikelySensitivePath(path: string): boolean {
  const name = basename(path).toLowerCase()
  if (name === '.env' || name === '.npmrc' || name === '.pypirc' || name === '.netrc') return true
  if (name.startsWith('.env.')) return true
  if (['.pem', '.key', '.p12', '.pfx', '.crt'].includes(extname(name))) return true
  return /(secret|token|api[_-]?key|private[_-]?key|credential|password)/i.test(name)
}

function fileHeadHasNul(absPath: string, size: number): boolean {
  const fd = openSync(absPath, 'r')
  try {
    const toRead = Math.min(8192, size)
    const buf = Buffer.alloc(toRead)
    const bytesRead = readSync(fd, buf, 0, toRead, 0)
    return buf.subarray(0, bytesRead).includes(0)
  } finally {
    closeSync(fd)
  }
}

function extractSymbols(absPath: string, size: number): string[] {
  const ext = extname(absPath).toLowerCase()
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return []
  const text = readFileSync(absPath, 'utf-8').slice(0, Math.min(size, SYMBOL_SCAN_MAX_BYTES))
  const symbols = new Set<string>()
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:default\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+const\s+([A-Za-z_$][\w$]*)/g,
    /\bfunction\s+([A-Z][A-Za-z0-9_$]*)\s*\(/g,
    /\bconst\s+([A-Z][A-Za-z0-9_$]*)\s*=\s*(?:memo\()?[\w.]*\(?\s*\(?[^=]*\)?\s*=>/g,
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) && symbols.size < SYMBOLS_PER_FILE) {
      symbols.add(match[1])
    }
  }
  return [...symbols]
}

function classifyFile(relPath: string): ProjectIntelligenceFileKind[] {
  const kinds = new Set<ProjectIntelligenceFileKind>()
  const name = basename(relPath)
  const lower = relPath.toLowerCase()
  const ext = extname(name).toLowerCase()
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html'].includes(ext)) kinds.add('source')
  if (ext === '.tsx' || /(^|\/)components?\//i.test(relPath) || /^[A-Z]/.test(name)) kinds.add('component')
  if (/\b(route|router|routes|page|layout)\b/i.test(relPath) || /(^|\/)(pages|app|routes)\//i.test(relPath)) kinds.add('route')
  if (/\.(test|spec)\.[cm]?[tj]sx?$/i.test(name) || /(^|\/)(__tests__|test|tests|e2e)\//i.test(relPath)) kinds.add('test')
  if (/\.(md|mdx|txt|rst)$/i.test(name) || /(^|\/)docs?\//i.test(relPath)) kinds.add('docs')
  if (
    name === 'package.json' ||
    /(^|\/)(vite|vitest|playwright|electron\.vite|tailwind|tsconfig|components|eslint)\.config\./i.test(relPath) ||
    /(^|\/)(tsconfig|components)\.json$/i.test(lower)
  ) {
    kinds.add(name === 'package.json' ? 'package' : 'config')
  }
  if (/(^|\/)(main|index|app|renderer|preload)\.[cm]?[tj]sx?$/i.test(relPath)) kinds.add('entrypoint')
  return [...kinds]
}

function likelyTestSubject(relPath: string): string | undefined {
  const name = basename(relPath)
  if (!/\.(test|spec)\.[cm]?[tj]sx?$/i.test(name)) return undefined
  return name.replace(/\.(test|spec)\.[cm]?[tj]sx?$/i, '')
}

function parsePackage(absPath: string, rootId: string): ProjectIntelligencePackage | null {
  try {
    const parsed = JSON.parse(readFileSync(absPath, 'utf-8')) as {
      name?: unknown
      scripts?: unknown
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
      main?: unknown
      module?: unknown
      browser?: unknown
    }
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) }
    const dependenciesOfInterest = Object.keys(deps)
      .filter((name) =>
        [
          'electron',
          'electron-vite',
          'react',
          'next',
          'vite',
          'typescript',
          'tailwindcss',
          'vitest',
          'playwright',
          'monaco-editor',
          'zod',
          'ws',
        ].includes(name),
      )
      .sort()
    return {
      rootId,
      path: absPath,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      scripts: parsed.scripts && typeof parsed.scripts === 'object' ? Object.keys(parsed.scripts).sort() : [],
      dependenciesOfInterest,
      frameworkHints: dependenciesOfInterest,
      entrypoints: [parsed.main, parsed.module, parsed.browser].filter((x): x is string => typeof x === 'string'),
    }
  } catch {
    return null
  }
}

function buildProjectIntelligence(manifest: GrokProjectManifest): ProjectIntelligence {
  const stats: ProjectIntelligenceStats = {
    fileCountScanned: 0,
    skippedIgnored: 0,
    skippedGenerated: 0,
    skippedBinary: 0,
    skippedSensitive: 0,
    skippedLarge: 0,
    errors: [],
  }
  const files: ProjectIntelligenceFile[] = []
  const packages: ProjectIntelligencePackage[] = []
  const ignore = manifest.ignore ?? []

  for (const root of manifest.roots) {
    const rootPath = resolve(root.path)
    const stack = [rootPath]
    while (stack.length > 0 && stats.fileCountScanned < INTELLIGENCE_MAX_FILES) {
      const dir = stack.pop()
      if (!dir) continue
      if (shouldIgnoreFsEntry(dir, manifest.roots, ignore)) {
        stats.skippedIgnored += 1
        continue
      }
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch (e) {
        stats.errors.push(`${dir}: ${e instanceof Error ? e.message : 'read failed'}`)
        continue
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const ent of entries) {
        if (stats.fileCountScanned >= INTELLIGENCE_MAX_FILES) break
        const abs = resolve(dir, ent.name)
        if (shouldIgnoreFsEntry(abs, manifest.roots, ignore)) {
          stats.skippedIgnored += 1
          continue
        }
        const rel = toPosixPath(relative(rootPath, abs))
        if (ent.isDirectory()) {
          if (/^(dist|build|coverage|\.next|\.turbo|\.vite|out)$/i.test(ent.name)) {
            stats.skippedGenerated += 1
          } else {
            stack.push(abs)
          }
          continue
        }
        if (!ent.isFile()) continue
        if (isLikelySensitivePath(abs)) {
          stats.skippedSensitive += 1
          continue
        }
        let st
        try {
          st = statSync(abs)
        } catch {
          continue
        }
        if (st.size > INTELLIGENCE_MAX_FILE_BYTES) {
          stats.skippedLarge += 1
          continue
        }
        if (fileHeadHasNul(abs, st.size)) {
          stats.skippedBinary += 1
          continue
        }
        const kinds = classifyFile(rel)
        if (kinds.length === 0) continue
        stats.fileCountScanned += 1
        const item: ProjectIntelligenceFile = {
          rootId: root.id,
          path: abs,
          relativePath: rel,
          basename: basename(abs),
          ext: extname(abs).toLowerCase(),
          kinds,
          symbols: extractSymbols(abs, st.size),
          likelySubject: likelyTestSubject(rel),
          size: st.size,
        }
        files.push(item)
        if (item.kinds.includes('package')) {
          const pkg = parsePackage(abs, root.id)
          if (pkg) packages.push(pkg)
        }
      }
    }
  }

  return { version: 1, files, packages, stats }
}

export function refreshWorkspaceIndex(projectId: string, manifest: GrokProjectManifest): StoredWorkspaceIndex {
  const summary = buildWorkspaceIndexSummary(manifest)
  const intelligence = buildProjectIntelligence(manifest)
  const record: StoredWorkspaceIndex = {
    version: 2,
    updatedAt: new Date().toISOString(),
    rootPaths: manifest.roots.map((r) => resolve(r.path)),
    ignorePatterns: manifest.ignore ?? [],
    summary,
    intelligence,
    truncated: summary.roots.some((r) => r.truncated) || intelligence.stats.fileCountScanned >= INTELLIGENCE_MAX_FILES,
    warnings: [...summary.warnings, ...intelligence.stats.errors.slice(0, 12)],
  }
  const path = workspaceIndexPathForProject(projectId)
  mkdirSync(join(projectDir(projectId), INDEX_DIR_NAME), { recursive: true })
  writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8')
  return record
}

export function loadWorkspaceIndex(projectId: string): StoredWorkspaceIndex | null {
  const path = workspaceIndexPathForProject(projectId)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!raw || typeof raw !== 'object') return null
    const r = raw as StoredWorkspaceIndex
    if (r.version !== 2 || typeof r.updatedAt !== 'string' || !r.summary || !r.intelligence) return null
    return r
  } catch {
    return null
  }
}

export function getOrRefreshWorkspaceIndex(projectId: string, manifest: GrokProjectManifest): StoredWorkspaceIndex {
  return loadWorkspaceIndex(projectId) ?? refreshWorkspaceIndex(projectId, manifest)
}
