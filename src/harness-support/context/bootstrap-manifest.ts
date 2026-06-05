/**
 * Bootstrap manifest validation/normalize (story 127).
 * Scoped to new-file proposals for package.json, tsconfig, vite.config.*.
 */

export const AGENT_EDIT_INVALID_JSON_MANIFEST_REASON =
  'Bootstrap manifest is not valid JSON. Emit parseable JSON with real double quotes — or use run_command for npm create / npm init instead of hand-rolling a broken package.json.'

export const AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON =
  'Bootstrap manifest looks truncated or incomplete (unclosed braces). Send the **complete** file body in one write_file — or use run_command for npm create / npm init.'

export const GREENFIELD_SCAFFOLD_MANIFEST_MARKER = 'Harness: greenfield scaffold manifest 127'

const PACKAGE_JSON_BASENAME = 'package.json'

export function isBootstrapManifestPath(resolvedPath: string | undefined): boolean {
  if (!resolvedPath) return false
  const base = resolvedPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  if (base === PACKAGE_JSON_BASENAME) return true
  if (base === 'tsconfig.json' || base.startsWith('tsconfig.')) return true
  if (/^vite\.config\.(ts|js|mts|mjs|cjs)$/.test(base)) return true
  return false
}

export function isPackageJsonPath(resolvedPath: string | undefined): boolean {
  if (!resolvedPath) return false
  const base = resolvedPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  return base === PACKAGE_JSON_BASENAME
}

function tryParseJson(content: string): { ok: true; parsed: unknown } | { ok: false } {
  const trimmed = content.trim()
  if (!trimmed) return { ok: false }
  try {
    return { ok: true, parsed: JSON.parse(trimmed) as unknown }
  } catch {
    return { ok: false }
  }
}

/** Pretty-print valid minified JSON manifests for readable diffs. */
export function normalizeJsonManifestContent(content: string, resolvedPath?: string): string {
  if (!isBootstrapManifestPath(resolvedPath)) return content
  const parsed = tryParseJson(content)
  if (!parsed.ok) return content
  if (parsed.parsed === null || typeof parsed.parsed !== 'object') return content
  return `${JSON.stringify(parsed.parsed, null, 2)}\n`
}

export function assessJsonManifestContent(
  content: string,
  options?: { resolvedPath?: string; isNewFile?: boolean },
): { ok: boolean; reason?: string } {
  if (!isBootstrapManifestPath(options?.resolvedPath)) return { ok: true }
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, reason: AGENT_EDIT_INVALID_JSON_MANIFEST_REASON }
  }

  const parsed = tryParseJson(trimmed)
  if (parsed.ok) {
    if (isPackageJsonPath(options?.resolvedPath)) {
      const obj = parsed.parsed
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return { ok: false, reason: AGENT_EDIT_INVALID_JSON_MANIFEST_REASON }
      }
    }
    return { ok: true }
  }

  // Only enforce strict bootstrap JSON rules on **new** manifest files (127 scoping).
  if (options?.isNewFile !== true) return { ok: true }

  const looksTruncated =
    (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && !trimmed.endsWith(']')) ||
    trimmed.length < 12

  if (looksTruncated) {
    return { ok: false, reason: AGENT_EDIT_INCOMPLETE_JSON_MANIFEST_REASON }
  }

  return { ok: false, reason: AGENT_EDIT_INVALID_JSON_MANIFEST_REASON }
}
