import { basename, isAbsolute, resolve } from 'node:path'
import type { GrokProjectManifest } from './manifest'
import type { StoredWorkspaceIndex, ProjectIntelligenceFile } from './agent-index-store'
import type { AgentChatActiveContext } from '../shared/agent-chat-contract'

export type RetrievalScoreBucket =
  | 'attachment'
  | 'exact_path'
  | 'active'
  | 'symbol'
  | 'test'
  | 'docs'
  | 'config'
  | 'package'
  | 'lexical'

export type RankedRetrievalCandidate = {
  path: string
  score: number
  bucket: RetrievalScoreBucket
  reasons: string[]
  dirty: boolean
}

export type RetrievalRankingResult = {
  candidates: RankedRetrievalCandidate[]
  stale: boolean
  staleReason?: string
  skipped: {
    ignored: number
    generated: number
    binary: number
    sensitive: number
    large: number
  }
}

const INDEX_STALE_MS = 15 * 60 * 1000
const MAX_TERMS = 24
const BUCKET_PRIORITY: Record<RetrievalScoreBucket, number> = {
  attachment: 8,
  exact_path: 7,
  active: 6,
  symbol: 5,
  test: 4,
  docs: 3,
  config: 3,
  package: 3,
  lexical: 1,
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'agent',
  'anything',
  'change',
  'could',
  'does',
  'file',
  'from',
  'grok',
  'grokforge',
  'have',
  'into',
  'make',
  'need',
  'please',
  'project',
  'should',
  'that',
  'this',
  'update',
  'what',
  'where',
  'with',
])

function pathTerms(text: string): string[] {
  return text.match(/(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.-]+|[A-Za-z0-9_@.-]+\.[A-Za-z0-9]+/g) ?? []
}

function termsFromText(text: string): string[] {
  const terms = new Set<string>()
  for (const p of pathTerms(text)) terms.add(p)
  for (const word of text.match(/[A-Za-z_][A-Za-z0-9_-]{2,}/g) ?? []) {
    const lowered = word.toLowerCase()
    if (STOP_WORDS.has(lowered)) continue
    terms.add(word)
    if (terms.size >= MAX_TERMS) break
  }
  return [...terms]
}

function normalize(text: string): string {
  return text.toLowerCase()
}

function mentionsAny(text: string, words: string[]): boolean {
  const lowered = normalize(text)
  return words.some((w) => lowered.includes(w))
}

function looksLikeExactPathMention(userText: string, file: ProjectIntelligenceFile): boolean {
  const lowered = normalize(userText)
  return pathTerms(userText).some((term) => {
    const t = normalize(term)
    return normalize(file.path).endsWith(t) || normalize(file.relativePath).endsWith(t) || normalize(file.basename) === t
  }) || lowered.includes(normalize(file.path))
}

function resolveActivePath(path: string, manifest: GrokProjectManifest): string {
  if (isAbsolute(path)) return resolve(path)
  const root = manifest.roots[0]
  return root ? resolve(root.path, path) : resolve(path)
}

function pathIsUnder(path: string, maybeParent: string): boolean {
  const p = resolve(path)
  const parent = resolve(maybeParent)
  return p === parent || p.startsWith(`${parent}/`)
}

function freshness(index: StoredWorkspaceIndex): { stale: boolean; staleReason?: string } {
  const time = Date.parse(index.updatedAt)
  if (!Number.isFinite(time)) return { stale: true, staleReason: 'index timestamp is invalid' }
  const age = Date.now() - time
  if (age > INDEX_STALE_MS) return { stale: true, staleReason: 'project intelligence is older than 15 minutes' }
  return { stale: false }
}

export function rankRetrievalCandidates(options: {
  manifest: GrokProjectManifest
  index: StoredWorkspaceIndex
  activeContext: AgentChatActiveContext
  userText: string
  limit?: number
}): RetrievalRankingResult {
  const { manifest, index, activeContext, userText } = options
  const limit = options.limit ?? 7
  const terms = termsFromText(userText)
  const candidateMap = new Map<string, RankedRetrievalCandidate>()
  const activePath = activeContext.activeFilePath ? resolveActivePath(activeContext.activeFilePath, manifest) : null
  const openTabs = new Map(activeContext.openTabs.map((tab) => [resolveActivePath(tab.path, manifest), tab.dirty]))
  const attachments = (activeContext.attachments ?? []).map((attachment) => ({
    ...attachment,
    path: resolveActivePath(attachment.path, manifest),
  }))

  const add = (path: string, score: number, bucket: RetrievalScoreBucket, reason: string, dirty = false) => {
    const existing = candidateMap.get(path)
    if (existing) {
      existing.score += score
      existing.dirty ||= dirty
      existing.reasons.push(reason)
      if (BUCKET_PRIORITY[bucket] > BUCKET_PRIORITY[existing.bucket]) existing.bucket = bucket
      return
    }
    candidateMap.set(path, { path, score, bucket, reasons: [reason], dirty })
  }

  for (const file of index.intelligence.files) {
    for (const attachment of attachments) {
      if (attachment.type === 'file' && file.path === attachment.path) {
        add(file.path, 220, 'attachment', 'attached file')
      }
      if (attachment.type === 'folder' && pathIsUnder(file.path, attachment.path)) {
        const directBoost = file.path.split(/[\\/]/).length - attachment.path.split(/[\\/]/).length <= 2 ? 150 : 80
        add(file.path, directBoost, 'attachment', 'inside attached folder')
      }
    }

    if (activePath && file.path === activePath) add(file.path, 130, 'active', 'active file')
    if (openTabs.has(file.path)) add(file.path, openTabs.get(file.path) ? 95 : 70, 'active', 'open tab', openTabs.get(file.path))

    if (looksLikeExactPathMention(userText, file)) add(file.path, 180, 'exact_path', `exact path/name mention: ${basename(file.path)}`)

    const haystack = normalize(`${file.relativePath} ${file.basename}`)
    for (const term of terms) {
      const needle = normalize(term)
      if (!needle || needle.length < 3) continue
      if (haystack.includes(needle)) add(file.path, needle.includes('/') || needle.includes('.') ? 95 : 30, 'lexical', `path matched "${term}"`)
      if (file.symbols.some((symbol) => normalize(symbol).includes(needle))) {
        add(file.path, 85, 'symbol', `symbol matched "${term}"`)
      }
      if (file.likelySubject && normalize(file.likelySubject).includes(needle)) {
        add(file.path, 55, 'test', `test subject matched "${term}"`)
      }
    }

    if (file.kinds.includes('test') && mentionsAny(userText, ['test', 'tests', 'failing', 'regression', 'bug', 'spec'])) {
      add(file.path, 45, 'test', 'test/bug question')
    }
    if (file.kinds.includes('docs') && mentionsAny(userText, ['docs', 'documentation', 'spec', 'story', 'architecture', 'product', 'copy'])) {
      add(file.path, 40, 'docs', 'docs/spec question')
    }
    if (file.kinds.includes('config') && mentionsAny(userText, ['build', 'config', 'setup', 'lint', 'typescript', 'vite', 'electron', 'tailwind'])) {
      add(file.path, 50, 'config', 'build/config question')
    }
    if (file.kinds.includes('package') && mentionsAny(userText, ['dependency', 'dependencies', 'script', 'npm', 'build', 'test', 'run'])) {
      add(file.path, 55, 'package', 'package/script question')
    }
    if (file.kinds.includes('entrypoint') && mentionsAny(userText, ['entrypoint', 'entry point', 'startup', 'boot', 'launch', 'loads'])) {
      add(file.path, 60, 'config', 'entrypoint question')
    }
  }

  const fresh = freshness(index)
  return {
    candidates: [...candidateMap.values()]
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit),
    ...fresh,
    skipped: {
      ignored: index.intelligence.stats.skippedIgnored,
      generated: index.intelligence.stats.skippedGenerated,
      binary: index.intelligence.stats.skippedBinary,
      sensitive: index.intelligence.stats.skippedSensitive,
      large: index.intelligence.stats.skippedLarge,
    },
  }
}
