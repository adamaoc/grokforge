/// <reference types="vite/client" />

/** Electron exposes the absolute path for native file inputs and OS drag-drop. */
interface File {
  path?: string
}
