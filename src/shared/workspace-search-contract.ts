/**
 * Workspace search IPC contract + limits (no Node/Electron imports).
 * Main implementation lives in `src/main/workspace-search.ts`; renderer must only import from here
 * or re-exports in `types.ts` — never import the main module in the Vite bundle.
 */

/** Hard cap on bytes read per file (UTF-8 text search). */
export const SEARCH_MAX_FILE_BYTES = 512 * 1024

/** Stop collecting matches after this many rows (UI + IPC size). */
export const SEARCH_MAX_RESULTS = 500

/** Safety valve so a huge tree cannot run unbounded. */
export const SEARCH_MAX_FILES_SCANNED = 100_000

/** Prevents oversized / abusive patterns (regex safety). */
export const SEARCH_MAX_QUERY_LEN = 200

export type SearchWorkspaceRow = {
  path: string
  rootId: string
  line: number
  preview: string
}

export type SearchWorkspaceRequest = {
  query: string
  caseSensitive?: boolean
  regex?: boolean
}

export type SearchWorkspaceProgressPayload = {
  filesScanned: number
  matchCount: number
  currentRootId?: string
}

export type SearchWorkspaceOkResult = {
  ok: true
  results: SearchWorkspaceRow[]
  truncated: boolean
  filesScanned: number
  cancelled?: boolean
}

export type SearchWorkspaceErrorResult = {
  ok: false
  error: string
}

export type SearchWorkspaceResult = SearchWorkspaceOkResult | SearchWorkspaceErrorResult
