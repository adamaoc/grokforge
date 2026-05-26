import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { DiffEditor, type DiffOnMount, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { diffEditorMountOptions, shouldUseFullContentPreview } from '@/lib/diff-editor-mount-options'

interface DiffEditorPaneProps {
  original: string
  modified: string
  /** Language id for both sides unless split languages are needed later. */
  language?: string
  status?: 'created' | 'modified' | 'deleted' | 'renamed'
}

const READ_ONLY_EDITOR_OPTIONS = {
  readOnly: true,
  automaticLayout: true,
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 13,
  lineHeight: 1.55,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 8, bottom: 8 },
} as const

/**
 * Read-only diff preview. New/deleted files use a single full-content editor because
 * Monaco's diff view hides all lines when the original model is empty.
 */
export function DiffEditorPane({
  original,
  modified,
  language = 'typescript',
  status = 'modified',
}: DiffEditorPaneProps) {
  const mount = useMemo(
    () => diffEditorMountOptions(status, original.length),
    [status, original.length],
  )
  const originalText =
    status === 'deleted'
      ? original.length > 0
        ? original
        : modified
      : original.length > 0
        ? original
        : ''
  const modifiedText = status === 'deleted' ? '' : modified

  const fullPreview = shouldUseFullContentPreview(status, originalText, modifiedText)
  const previewValue = status === 'deleted' ? originalText : modifiedText
  const previewLabel =
    status === 'deleted'
      ? 'Deleted file — full previous content'
      : 'New file — full proposed content (all lines are additions)'

  const handleDiffMount: DiffOnMount = useCallback((diffEditor) => {
    queueMicrotask(() => {
      const candidate = diffEditor as editor.IStandaloneDiffEditor & { revealFirstDiff?: () => void }
      candidate.revealFirstDiff?.()
    })
  }, [])

  const handleEditorMount: OnMount = useCallback((monacoEditor) => {
    queueMicrotask(() => monacoEditor.revealLine(1))
  }, [])

  const editorHostRef = useRef<HTMLDivElement>(null)
  const [hostHeightPx, setHostHeightPx] = useState(288)

  useEffect(() => {
    const el = editorHostRef.current
    if (!el) return
    const measure = () => {
      const next = Math.max(192, el.clientHeight)
      setHostHeightPx((prev) => (prev === next ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(measure)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fullPreview, previewValue.length, modifiedText.length, originalText.length])

  const editorHost = (
    <div ref={editorHostRef} className="min-h-[10rem] min-w-0 flex-1">
      {fullPreview ? (
        <Editor
          key={`preview-${status}-${previewValue.length}-${previewValue.slice(0, 48)}`}
          height={hostHeightPx}
          value={previewValue}
          language={language}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={READ_ONLY_EDITOR_OPTIONS}
        />
      ) : (
        <DiffEditor
          key={`diff-${status}-${originalText.length}-${modifiedText.length}`}
          height={hostHeightPx}
          original={originalText}
          modified={modifiedText}
          language={language}
          theme="vs-dark"
          onMount={handleDiffMount}
          options={{
            ...READ_ONLY_EDITOR_OPTIONS,
            renderSideBySide: mount.renderSideBySide,
            renderOverviewRuler: true,
            hideUnchangedRegions: {
              enabled: mount.hideUnchangedRegionsEnabled,
              contextLineCount: 3,
              minimumLineCount: 3,
              revealLineCount: 4,
            },
          }}
        />
      )}
    </div>
  )

  if (fullPreview) {
    if (!previewValue.trim()) {
      return (
        <div className="flex h-full min-h-[12rem] w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-6 text-center">
          <p className="text-sm font-medium text-zinc-300">No proposed content</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            This file entry has no text in the proposal (often a truncated tool call). Ask the agent to
            propose again with the full file body.
          </p>
        </div>
      )
    }
    return (
      <div className="flex h-full min-h-[12rem] w-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-[11px] text-gf-accent">
          {previewLabel}
        </div>
        {editorHost}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[12rem] w-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      {editorHost}
    </div>
  )
}
