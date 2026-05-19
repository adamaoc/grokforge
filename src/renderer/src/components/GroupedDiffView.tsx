import { useMemo, type ReactNode } from 'react'
import type { DiffFileEntry, DiffFileStatus, DiffSession, GrokProjectManifest, Root } from '@/types'
import { DIFF_FILE_STATUS_LABELS } from '@/types'
import {
  computeDiffLineStatsForFile,
  diffStatsLabelForStatus,
  formatDiffSessionSummary,
  summarizeDiffSessionStats,
} from '../../../shared/diff-line-stats'
import { RootTypeDot } from '@/components/grokforge/RootTypeDot'
import { DiffEditorPane } from '@/components/DiffEditorPane'
import { getLanguageFromPath } from '@/lib/getLanguageFromPath'
import { cn } from '@/lib/utils'

function DiffLegend() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-zinc-800/90 px-1 py-2 text-[11px] text-zinc-500">
      <span>
        <span className="font-mono text-gf-accent">+</span> added
      </span>
      <span>
        <span className="font-mono text-red-400">-</span> removed
      </span>
      <span className="text-zinc-600">Unchanged regions collapsed · scroll to hunks</span>
    </div>
  )
}

function DiffLineStatsBadge({ file }: { file: DiffFileEntry }) {
  const stats = useMemo(() => computeDiffLineStatsForFile(file), [file])
  const label = diffStatsLabelForStatus(file.status, stats)
  if (label === '0 changes') {
    return (
      <span className="shrink-0 font-mono text-[10px] text-zinc-500" title="No line changes detected">
        0 Δ
      </span>
    )
  }
  return (
    <span className="shrink-0 font-mono text-[10px] tabular-nums" title="Line changes (approx.)">
      {file.status === 'deleted' ? (
        <span className="text-red-400">{label}</span>
      ) : file.status === 'created' ? (
        <span className="text-gf-accent">{label}</span>
      ) : (
        <>
          {stats.additions > 0 ? <span className="text-gf-accent">+{stats.additions}</span> : null}
          {stats.additions > 0 && stats.deletions > 0 ? <span className="text-zinc-600"> </span> : null}
          {stats.deletions > 0 ? <span className="text-red-400">-{stats.deletions}</span> : null}
        </>
      )}
    </span>
  )
}

const statusTone: Record<DiffFileStatus, string> = {
  created: 'border-gf-accent/30 bg-gf-accent/10 text-gf-accent',
  modified: 'border-blue-400/30 bg-blue-400/10 text-blue-300',
  deleted: 'border-red-400/30 bg-red-400/10 text-red-300',
  renamed: 'border-purple-400/30 bg-purple-400/10 text-purple-300',
}

function StatusPill({ status }: { status: DiffFileStatus }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        statusTone[status],
      )}
    >
      {DIFF_FILE_STATUS_LABELS[status]}
    </span>
  )
}

function RootDiffGroup({
  label,
  rootType,
  fileCount,
  expand,
  children,
}: {
  label: string
  rootType: Root['type']
  fileCount: number
  expand?: boolean
  children: ReactNode
}) {
  return (
    <section className={cn('flex min-h-0 flex-col gap-2', expand ? 'flex-1' : '')}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-1 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <RootTypeDot type={rootType} size="sm" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-zinc-500">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </span>
      </div>
      {children}
    </section>
  )
}

function displayPathForFile(file: DiffFileEntry, project: GrokProjectManifest): string {
  const root = project.roots.find((item) => item.id === file.rootId)
  if (!root) return file.path
  const norm = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootPath = norm(root.path)
  const filePath = norm(file.path)
  if (!rootPath || !filePath.startsWith(rootPath)) return file.path
  const rel = filePath === rootPath ? '.' : filePath.slice(rootPath.length + 1)
  return rel || file.path
}

function DiffFilePanel({
  file,
  project,
  single,
}: {
  file: DiffFileEntry
  project: GrokProjectManifest
  single?: boolean
}) {
  const language = file.language || getLanguageFromPath(file.path)
  const pathLabel = displayPathForFile(file, project)
  const oldPathLabel = file.oldPath ? displayPathForFile({ ...file, path: file.oldPath }, project) : undefined
  const visiblePathLabel = file.status === 'renamed' && oldPathLabel ? `${oldPathLabel} -> ${pathLabel}` : pathLabel

  return (
    <article
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50',
        single ? 'flex-1' : 'min-h-[28rem]',
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-zinc-200" title={file.path}>
            {visiblePathLabel}
          </div>
          {file.status === 'renamed' && file.oldPath ? (
            <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">Renamed from {oldPathLabel}</div>
          ) : null}
          {file.editSafety && file.editSafety.severity !== 'ok' ? (
            <div
              className={cn(
                'mt-1 text-[10px] leading-snug',
                file.editSafety.severity === 'severe' ? 'text-red-300' : 'text-amber-300',
              )}
            >
              {file.editSafety.issues[0]?.message ?? file.editSafety.statsLine}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DiffLineStatsBadge file={file} />
          <StatusPill status={file.status} />
        </div>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <DiffEditorPane original={file.original} modified={file.modified} language={language} status={file.status} />
      </div>
    </article>
  )
}

function groupFiles(files: DiffFileEntry[]) {
  const groups: Array<{ key: string; rootId: string; rootLabel: string; files: DiffFileEntry[] }> = []
  const indexByKey = new Map<string, number>()

  for (const file of files) {
    const key = `${file.rootId}\u0000${file.rootLabel}`
    const existing = indexByKey.get(key)
    if (existing === undefined) {
      indexByKey.set(key, groups.length)
      groups.push({ key, rootId: file.rootId, rootLabel: file.rootLabel, files: [file] })
      continue
    }
    groups[existing]!.files.push(file)
  }

  return groups
}

export function GroupedDiffView({ session, project }: { session: DiffSession; project: GrokProjectManifest }) {
  const groups = groupFiles(session.files)
  const rootTypeById = new Map(project.roots.map((root) => [root.id, root.type]))
  const singleFile = session.files.length === 1
  const sessionStats = useMemo(() => summarizeDiffSessionStats(session.files), [session.files])
  const sessionSummary = formatDiffSessionSummary(session.files.length, sessionStats)

  if (session.files.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center">
        <div>
          <div className="text-sm font-semibold text-white">No file diffs</div>
          <div className="mt-1 text-xs text-zinc-500">This diff session does not contain any file entries.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {session.warnings?.length ? (
        <div className="shrink-0 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
          <div className="mb-1 font-semibold text-amber-100">Some files were skipped</div>
          <ul className="space-y-1">
            {session.warnings.slice(0, 6).map((warning) => (
              <li key={warning} className="font-mono text-[11px] text-amber-200/80">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <DiffLegend />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-xs">
        <span className="font-medium text-zinc-300">Change summary</span>
        <span className="font-mono text-[11px] tabular-nums text-zinc-400">{sessionSummary}</span>
      </div>
      <div
        className={cn(
          'custom-scrollbar min-h-0 flex-1 overflow-y-auto',
          singleFile ? 'flex flex-col' : 'space-y-3',
        )}
      >
        {groups.map((group) => {
          const rootType = rootTypeById.get(group.rootId) ?? 'other'
          return (
            <RootDiffGroup
              key={group.key}
              label={group.rootLabel}
              rootType={rootType}
              fileCount={group.files.length}
              expand={singleFile}
            >
              <div className={cn(singleFile ? 'flex min-h-0 flex-1 flex-col' : 'space-y-3')}>
                {group.files.map((file) => (
                  <DiffFilePanel key={file.id} file={file} project={project} single={singleFile} />
                ))}
              </div>
            </RootDiffGroup>
          )
        })}
      </div>
    </div>
  )
}
