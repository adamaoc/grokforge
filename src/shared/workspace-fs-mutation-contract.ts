/**
 * Workspace filesystem mutations (create / move-to-trash / rename / reveal).
 * Main: `src/main/workspace-fs-mutate.ts`. Renderer uses preload only.
 */

export type WorkspaceFsMutateRequest =
  | { op: 'mkdir'; parentDir: string; name: string }
  | { op: 'touch'; parentDir: string; name: string }
  /** Main process moves the target to OS Trash/Recycle Bin; it never silently falls back to permanent delete. */
  | { op: 'remove'; path: string }
  | { op: 'rename'; path: string; newName: string }
  | { op: 'reveal'; path: string }

export type WorkspaceFsMutateOk = { ok: true }

export type WorkspaceFsMutateErr = { ok: false; error: string }

export type WorkspaceFsMutateResult = WorkspaceFsMutateOk | WorkspaceFsMutateErr

export type WorkspaceFsMutationEvent =
  | { op: 'create'; path: string; isDirectory: boolean; parentDir: string }
  | { op: 'rename'; oldPath: string; newPath: string; isDirectory: boolean }
  | { op: 'delete'; path: string; isDirectory: boolean }
