import type { WorkspaceFsMutationEvent } from '@/types'

export interface FileTreeAddPathToChatPayload {
  path: string
  isDirectory: boolean
  rootPath: string
}

export interface FileTreeProps {
  rootPath: string
  onFileOpen: (path: string) => void
  activeFile?: string | null
  openFiles?: string[]
  dirtyFiles?: Record<string, boolean>
  workspaceFsEpoch?: number
  onWorkspaceFsMutation?: (event: WorkspaceFsMutationEvent, refreshPaths: string[]) => void
  onAddPathToChat?: (payload: FileTreeAddPathToChatPayload) => void
}

export type MenuTarget = { path: string; isDirectory: boolean }

export type NameModalState =
  | { kind: 'file'; parentDir: string }
  | { kind: 'folder'; parentDir: string }
  | { kind: 'rename'; path: string; parentDir: string; isDirectory: boolean }

export type DeleteTarget = {
  path: string
  label: string
  isDirectory: boolean
  dirtyOpenCount: number
}
