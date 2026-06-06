/**
 * Recent projects persistence + IPC payload shapes (no Node/Electron imports).
 * Main implementation: `src/main/project/recent-store.ts`.
 */

/** Max entries kept on disk and returned to the renderer. */
export const RECENT_PROJECTS_MAX = 15

/** Max length for display name on the recent picker and in app project storage. */
export const RECENT_PROJECT_DISPLAY_NAME_MAX_LEN = 256

/** Max characters stored per root label on recent picker rows (avoid huge JSON). */
export const RECENT_ROOT_LABEL_MAX_CHARS = 128

/** Max length for `primaryRootPath` persisted on recent entries (absolute path). */
export const RECENT_PROJECT_PRIMARY_ROOT_PATH_MAX_LEN = 2048

export type RecentProjectEntry = {
  /** Stable GrokForge project id (`userData/workspace-projects/<id>/`). */
  projectId: string
  /** Human name (editable); mirrored in workspace manifest when loaded. */
  displayName: string
  rootsCount: number
  /** Root labels for the picker subtitle (from manifest); optional for legacy rows until next open. */
  rootLabels?: string[]
  /**
   * Resolved absolute path of the **first** manifest root (disambiguation on the dashboard).
   * Optional for legacy `recent-projects.json` rows until the project is opened again.
   */
  primaryRootPath?: string
  lastOpenedAt: string
}

export type RecentProjectsChangedPayload = RecentProjectEntry[]

/** Returned from `open-project-by-id` when the id is invalid or load fails. */
export type OpenProjectByIdFailure = { ok: false; error: string }

export type RemoveRecentProjectResult = { ok: true } | { ok: false; error: string }

export type UpdateRecentPickerNameResult = RemoveRecentProjectResult

/** Deletes app-side project storage and MRU row; does not delete user workspace folders. */
export type DeleteProjectResult = RemoveRecentProjectResult
