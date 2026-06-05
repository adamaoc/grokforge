import type { DiffFileEntry, DiffFileStatus } from '../../shared/diff-session-contract'

export type DiffLineStats = {
  additions: number
  deletions: number
}

const MAX_LINES_FOR_LCS = 8_000

function splitContentLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Line-based LCS diff stats (git-style +/- counts). */
export function computeDiffLineStats(original: string, modified: string): DiffLineStats {
  const a = splitContentLines(original)
  const b = splitContentLines(modified)
  if (a.length > MAX_LINES_FOR_LCS || b.length > MAX_LINES_FOR_LCS) {
    return {
      additions: Math.max(0, b.length - a.length),
      deletions: Math.max(0, a.length - b.length),
    }
  }

  const lcs = lcsLength(a, b)
  return {
    additions: b.length - lcs,
    deletions: a.length - lcs,
  }
}

function lcsLength(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  const prev = new Uint32Array(n + 1)
  const curr = new Uint32Array(n + 1)

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = prev[j] > curr[j - 1] ? prev[j] : curr[j - 1]
      }
    }
    prev.set(curr)
    curr.fill(0)
  }

  return prev[n] ?? 0
}

export function computeDiffLineStatsForFile(file: Pick<DiffFileEntry, 'original' | 'modified' | 'status'>): DiffLineStats {
  if (file.status === 'created') {
    return { additions: splitContentLines(file.modified).length, deletions: 0 }
  }
  if (file.status === 'deleted') {
    return { additions: 0, deletions: splitContentLines(file.original).length }
  }
  return computeDiffLineStats(file.original, file.modified)
}

export function summarizeDiffSessionStats(files: readonly Pick<DiffFileEntry, 'original' | 'modified' | 'status'>[]): DiffLineStats {
  return files.reduce<DiffLineStats>(
    (acc, file) => {
      const stats = computeDiffLineStatsForFile(file)
      return { additions: acc.additions + stats.additions, deletions: acc.deletions + stats.deletions }
    },
    { additions: 0, deletions: 0 },
  )
}

export function formatDiffLineStats(stats: DiffLineStats): string {
  if (stats.additions === 0 && stats.deletions === 0) return '0 changes'
  const parts: string[] = []
  if (stats.additions > 0) parts.push(`+${stats.additions}`)
  if (stats.deletions > 0) parts.push(`-${stats.deletions}`)
  return parts.join(' ')
}

export function formatDiffSessionSummary(
  fileCount: number,
  stats: DiffLineStats,
): string {
  const filesLabel = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
  const delta = formatDiffLineStats(stats)
  return delta === '0 changes' ? filesLabel : `${filesLabel} · ${delta}`
}

export function hasDiffChanges(stats: DiffLineStats): boolean {
  return stats.additions > 0 || stats.deletions > 0
}

export function diffStatsLabelForStatus(status: DiffFileStatus, stats: DiffLineStats): string {
  if (status === 'created') return `+${stats.additions}`
  if (status === 'deleted') return `-${stats.deletions}`
  return formatDiffLineStats(stats)
}
