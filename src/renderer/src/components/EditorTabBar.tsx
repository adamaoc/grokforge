import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EditorTabBarProps {
  openFiles: string[]
  activeFile: string | null
  isDirty: Record<string, boolean>
  onSelectFile: (path: string) => void
  onCloseTab: (path: string) => void
}

export function EditorTabBar({
  openFiles,
  activeFile,
  isDirty,
  onSelectFile,
  onCloseTab,
}: EditorTabBarProps) {
  return (
    <div role="tablist" className="flex overflow-x-auto border-b border-zinc-800 bg-zinc-950 custom-scrollbar">
      {openFiles.map((filePath) => {
        const fileName = filePath.split('/').pop() || filePath
        const isActive = activeFile === filePath
        const dirty = !!isDirty[filePath]
        return (
          <div
            key={filePath}
            role="tab"
            aria-selected={isActive}
            tabIndex={-1}
            onClick={() => onSelectFile(filePath)}
            title={filePath}
            className={cn(
              'flex min-w-0 cursor-pointer items-center gap-2 border-r border-zinc-800 px-4 py-3 text-sm transition-colors',
              isActive
                ? 'border-b-2 border-gf-accent bg-zinc-900 text-white'
                : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200',
            )}
          >
            {dirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gf-accent" aria-hidden />
            )}
            <span className={cn('min-w-0 flex-1 truncate', dirty && 'italic text-zinc-200')}>{fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label={`Close ${fileName}`}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(filePath)
              }}
            >
              <X size={14} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
