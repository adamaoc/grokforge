/** True when running in Electron on macOS (inset traffic lights + hidden title bar). */
export function isMacElectron(): boolean {
  return window.electron?.platform === 'darwin'
}
