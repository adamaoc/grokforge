import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type {
  GrokProjectManifest,
  SearchWorkspaceProgressPayload,
  SearchWorkspaceResult,
  SearchWorkspaceRow,
} from '@/types'
import {
  SEARCH_MAX_FILE_BYTES,
  SEARCH_MAX_FILES_SCANNED,
  SEARCH_MAX_QUERY_LEN,
  SEARCH_MAX_RESULTS,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RootTypeDot } from '@/components/grokforge/RootTypeDot'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface SearchPanelProps {
  project: GrokProjectManifest
  open: boolean
  onClose: () => void
  onOpenResult: (path: string, line: number) => void
}

function PreviewWithHighlight({
  preview,
  query,
  caseSensitive,
  regex,
}: {
  preview: string
  query: string
  caseSensitive: boolean
  regex: boolean
}) {
  if (regex || !query.trim()) {
    return <span className="text-zinc-400">{preview}</span>
  }
  const q = query.trim()
  const hay = caseSensitive ? preview : preview.toLowerCase()
  const nd = caseSensitive ? q : q.toLowerCase()
  const idx = hay.indexOf(nd)
  if (idx < 0) {
    return <span className="text-zinc-400">{preview}</span>
  }
  return (
    <span className="text-zinc-400">
      {preview.slice(0, idx)}
      <span className="font-medium text-gf-accent">{preview.slice(idx, idx + q.length)}</span>
      {preview.slice(idx + q.length)}
    </span>
  )
}

export function SearchPanel({ project, open, onClose, onOpenResult }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SearchWorkspaceRow[]>([])
  const [meta, setMeta] = useState<{
    truncated: boolean
    filesScanned: number
    cancelled?: boolean
  } | null>(null)
  const [progress, setProgress] = useState<SearchWorkspaceProgressPayload | null>(null)

  const rootLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of project.roots) {
      m.set(r.id, r.label)
    }
    return m
  }, [project.roots])

  useEffect(() => {
    if (!open) return
    const api = window.electron?.onSearchWorkspaceProgress
    if (!api) return
    const unsub = api((p) => setProgress(p))
    return () => unsub()
  }, [open])

  useEffect(() => {
    if (!open) {
      void window.electron?.searchWorkspaceCancel?.()
    }
  }, [open])

  useEffect(() => {
    return () => {
      void window.electron?.searchWorkspaceCancel?.()
    }
  }, [])

  const resetForClose = useCallback(() => {
    setResults([])
    setMeta(null)
    setProgress(null)
    setBusy(false)
  }, [])

  const handleClose = useCallback(() => {
    void window.electron?.searchWorkspaceCancel?.()
    resetForClose()
    onClose()
  }, [onClose, resetForClose])

  const runSearch = useCallback(async () => {
    const api = window.electron?.searchWorkspace
    if (!api) {
      toast.error('Search requires the GrokForge desktop app.')
      return
    }
    setBusy(true)
    setResults([])
    setMeta(null)
    setProgress({ filesScanned: 0, matchCount: 0 })
    try {
      const res: SearchWorkspaceResult = await api({
        query,
        caseSensitive,
        regex,
      })
      setProgress(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setResults(res.results)
      setMeta({
        truncated: res.truncated,
        filesScanned: res.filesScanned,
        cancelled: res.cancelled,
      })
    } catch (e) {
      setProgress(null)
      const msg = e instanceof Error ? e.message : 'Search failed'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }, [query, caseSensitive, regex])

  const handleCancel = useCallback(() => {
    void window.electron?.searchWorkspaceCancel?.()
    setBusy(false)
    setProgress(null)
  }, [])

  if (!open) {
    return null
  }

  return (
    <div
      className="absolute inset-0 z-40 flex justify-end bg-black/50"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-search-title"
        className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Search size={18} className="shrink-0 text-zinc-500" aria-hidden />
            <h2 id="workspace-search-title" className="truncate text-sm font-semibold text-white">
              Search workspace
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl text-zinc-400 hover:text-white"
            aria-label="Close search"
            onClick={handleClose}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-zinc-800 p-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              maxLength={SEARCH_MAX_QUERY_LEN}
              className="rounded-xl border-zinc-700 bg-zinc-900 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void runSearch()
              }}
            />
            {busy ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-xl border-zinc-700"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            ) : (
              <Button type="button" className="shrink-0 rounded-xl" onClick={() => void runSearch()}>
                Search
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-900 accent-[var(--gf-accent)]"
              />
              Case sensitive
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={regex}
                onChange={(e) => setRegex(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-900 accent-[var(--gf-accent)]"
              />
              Regular expression
            </label>
          </div>

          <p className="text-[10px] leading-relaxed text-zinc-600 font-mono">
            Up to {Math.round(SEARCH_MAX_FILE_BYTES / 1024)} KiB per file · max {SEARCH_MAX_RESULTS} matches · max{' '}
            {SEARCH_MAX_FILES_SCANNED.toLocaleString()} files scanned · respects manifest ignore globs
          </p>

          {busy && progress && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Loader2 size={14} className="animate-spin text-zinc-400" aria-hidden />
              <span className="font-mono">
                Scanned {progress.filesScanned.toLocaleString()} files · {progress.matchCount} matches
              </span>
            </div>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1 custom-scrollbar">
          <div className="p-2 pb-6">
            {meta && (
              <div className="mb-2 px-2 font-mono text-[10px] text-zinc-500">
                {meta.filesScanned.toLocaleString()} files scanned
                {meta.truncated ? ' · capped (limits reached)' : ''}
                {meta.cancelled ? ' · cancelled' : ''}
              </div>
            )}
            {results.length === 0 && !busy && meta && (
              <div className="px-3 py-8 text-center text-sm text-zinc-500">No matches</div>
            )}
            <ul className="space-y-1">
              {results.map((row, i) => (
                <li key={`${row.path}:${row.line}:${i}`}>
                  <button
                    type="button"
                    onClick={() => onOpenResult(row.path, row.line)}
                    className={cn(
                      'w-full rounded-xl border border-transparent px-3 py-2 text-left transition-colors',
                      'hover:border-zinc-700 hover:bg-zinc-900/80',
                    )}
                  >
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                      <RootTypeDot type={project.roots.find((r) => r.id === row.rootId)?.type ?? 'other'} size="sm" />
                      <span className="truncate text-zinc-400">{rootLabelById.get(row.rootId) ?? row.rootId}</span>
                      <span className="shrink-0 text-gf-accent">:{row.line}</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-zinc-300">{row.path}</div>
                    <div className="mt-1 line-clamp-2 font-mono text-[11px] leading-snug">
                      <PreviewWithHighlight
                        preview={row.preview}
                        query={query}
                        caseSensitive={caseSensitive}
                        regex={regex}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
