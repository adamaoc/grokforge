/** Hostnames allowed for http:// opens (local dev servers in terminal, chat, etc.). */
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLocalHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (LOCAL_HTTP_HOSTS.has(host)) return true
  if (host.endsWith('.localhost')) return true
  return false
}

/** Whether GrokForge may pass this URL to the OS default browser via shell.openExternal. */
export function isAllowedExternalOpenUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:' && isLocalHttpHost(url.hostname)) return true
  return false
}

export function parseAllowedExternalOpenUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    return isAllowedExternalOpenUrl(parsed) ? parsed : null
  } catch {
    return null
  }
}
