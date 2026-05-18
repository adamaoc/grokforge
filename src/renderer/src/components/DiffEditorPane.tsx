import { DiffEditor } from '@monaco-editor/react'

interface DiffEditorPaneProps {
  original: string
  modified: string
  /** Language id for both sides unless split languages are needed later. */
  language?: string
  status?: 'created' | 'modified' | 'deleted' | 'renamed'
}

/**
 * Read-only Monaco diff (side-by-side). Parent should be a flex column with `min-h-0` + `flex-1`
 * so `height="100%"` resolves.
 */
export function DiffEditorPane({ original, modified, language = 'typescript', status = 'modified' }: DiffEditorPaneProps) {
  const originalText = original.length > 0 ? original : status === 'created' ? '// New file' : ''
  const modifiedText = modified.length > 0 ? modified : status === 'deleted' ? '// File will be deleted' : ''
  return (
    <div className="h-full min-h-[12rem] w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <DiffEditor
        height="100%"
        original={originalText}
        modified={modifiedText}
        language={language}
        theme="vs-dark"
        options={{
          readOnly: true,
          renderSideBySide: true,
          automaticLayout: true,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
          lineHeight: 1.55,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderOverviewRuler: false,
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  )
}
