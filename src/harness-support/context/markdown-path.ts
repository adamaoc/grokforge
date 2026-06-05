/** Renderer-safe path helpers (no node: imports). */

const MARKDOWN_OR_PLAIN_TEXT_PATH_RE = /\.(md|mdx|txt|rst|adoc)$/i

export function isMarkdownOrPlainTextPath(resolvedOrRelativePath: string): boolean {
  return MARKDOWN_OR_PLAIN_TEXT_PATH_RE.test(resolvedOrRelativePath.trim())
}
