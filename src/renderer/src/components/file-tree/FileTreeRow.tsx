import type { KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, File, FileCode, FileCog, FileJson, FileText, Folder, Loader2 } from 'lucide-react'
import type { DirectoryEntry } from '@/types'
import { basenamePath } from '@/lib/workspace-paths'
import { cn } from '@/lib/utils'

function fileIconForPath(path: string) {
  const fileName = basenamePath(path).toLowerCase()
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : ''

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'kt', 'swift'].includes(ext)) {
    return FileCode
  }
  if (['json', 'jsonc'].includes(ext) || fileName === 'package-lock.json') return FileJson
  if (['md', 'mdx', 'txt', 'rst'].includes(ext) || fileName === 'readme') return FileText
  if (
    ['yml', 'yaml', 'toml', 'ini', 'env', 'config'].includes(ext) ||
    ['package.json', 'tsconfig.json', 'vite.config.ts', 'electron.vite.config.ts'].includes(fileName)
  ) {
    return FileCog
  }
  return File
}

interface FileTreeRowProps {
  entry: DirectoryEntry
  depth: number
  expanded: Record<string, boolean>
  childrenByPath: Record<string, DirectoryEntry[]>
  loading: Record<string, boolean>
  errors: Record<string, string | undefined>
  activeFile: string | null
  openFileSet: ReadonlySet<string>
  onFileOpen: (path: string) => void
  onToggleDir: (path: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, entry: DirectoryEntry, isOpen: boolean) => void
}

export function FileTreeRow({
  entry,
  depth,
  expanded,
  childrenByPath,
  loading,
  errors,
  activeFile,
  openFileSet,
  onFileOpen,
  onToggleDir,
  onKeyDown,
}: FileTreeRowProps) {
  const isOpen = expanded[entry.path] ?? false
  const kids = childrenByPath[entry.path]
  const err = errors[entry.path]
  const busy = loading[entry.path]
  const isActiveFile = !entry.isDirectory && activeFile === entry.path
  const isOpenFile = !entry.isDirectory && openFileSet.has(entry.path)

  if (!entry.isDirectory) {
    const FileIcon = fileIconForPath(entry.path)
    return (
      <div key={entry.path} style={{ paddingLeft: depth * 12 }} data-file-tree-row data-path={entry.path} data-dir="0">
        <button
          type="button"
          onClick={() => onFileOpen(entry.path)}
          onKeyDown={(event) => onKeyDown(event, entry, false)}
          data-treeitem="1"
          data-path={entry.path}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={isActiveFile}
          aria-current={isActiveFile ? 'page' : undefined}
          className={cn(
            'group relative flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/80',
            isActiveFile
              ? 'bg-zinc-800 text-white before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-gf-accent'
              : isOpenFile
                ? 'text-zinc-200 hover:bg-zinc-900'
                : 'text-zinc-300 hover:bg-zinc-900',
          )}
        >
          <FileIcon size={14} className={cn('shrink-0', isActiveFile ? 'text-gf-accent' : 'text-zinc-400')} />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {isOpenFile && !isActiveFile ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" aria-label="Open in editor" />
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <div key={entry.path}>
      <div style={{ paddingLeft: depth * 12 }} data-file-tree-row data-path={entry.path} data-dir="1">
        <button
          type="button"
          onClick={() => onToggleDir(entry.path)}
          onKeyDown={(event) => onKeyDown(event, entry, isOpen)}
          data-treeitem="1"
          data-path={entry.path}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isOpen}
          aria-selected={false}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm text-zinc-300 outline-none transition-colors hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-primary/80"
        >
          {isOpen ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          <Folder size={14} className="shrink-0 text-zinc-400" />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {busy && <Loader2 size={14} className="shrink-0 animate-spin text-zinc-500" aria-hidden />}
        </button>
      </div>
      {isOpen && err && <div className="px-2 py-1 text-xs text-red-400/90">{err}</div>}
      {isOpen && !err && kids && kids.length === 0 && !busy && (
        <div
          className="px-3 py-1 text-xs text-zinc-500"
          style={{ paddingLeft: depth * 12 + 12 }}
          data-file-tree-folder-empty
          data-path={entry.path}
        >
          Empty folder
        </div>
      )}
      {isOpen && !err && kids && (
        <div role="group">
          {kids.map((child) => (
            <FileTreeRow
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              childrenByPath={childrenByPath}
              loading={loading}
              errors={errors}
              activeFile={activeFile}
              openFileSet={openFileSet}
              onFileOpen={onFileOpen}
              onToggleDir={onToggleDir}
              onKeyDown={onKeyDown}
            />
          ))}
        </div>
      )}
    </div>
  )
}
