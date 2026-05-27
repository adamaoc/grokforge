import { isJammedJavaScriptSource, looksLikeHtmlDocument } from './agent-edit-corrupt-content'
import { isBootstrapManifestPath, normalizeJsonManifestContent } from './agent-bootstrap-manifest'

/**
 * Some models return `write_file` / propose_file_edits `content` with JSON-style
 * escapes still literal (U+005C + `n`) instead of real newlines (U+000A). After
 * JSON.parse those stay as two-character sequences, so diffs look like a single
 * endless line. When literal `\\n` clearly dominates real newlines, unescape.
 *
 * Other models emit real newlines nowhere — the whole file is one physical line
 * with semicolon-separated statements. A `//` comment on that line comments out
 * the rest of the file. `repairSourceLayout` inserts breaks at statement/JSX edges.
 */

const STMT_START =
  '(?:import|export|const|let|var|async\\s+function|function|class|return|if|for|while|switch|try|catch|finally|type|interface|enum|declare)\\b'

/** Lines longer than this usually mean JSX or statements are still crushed together. */
export const AGENT_LAYOUT_MAX_LINE_CHARS = 160

const HTML_ENTITY_TOKEN_RE = /&#(?:\d+|x[0-9a-f]+);|&(?:quot|apos|lt|gt|amp);/gi

/** Models sometimes emit `lang=&#34;en&#34;` instead of real quotes in tool JSON. */
export function hasDominantHtmlEntities(content: string): boolean {
  const matches = content.match(HTML_ENTITY_TOKEN_RE) ?? []
  return matches.length >= 2
}

function htmlEntityCount(content: string): number {
  return (content.match(HTML_ENTITY_TOKEN_RE) ?? []).length
}

function looksLikeHtmlPath(resolvedPath?: string): boolean {
  return Boolean(resolvedPath && /\.html?$/i.test(resolvedPath.replace(/\\/g, '/')))
}

/** Strip UTF-8 BOM if models prepend it in tool JSON. */
export function stripUtf8Bom(content: string): string {
  if (!content) return content
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
}

/** Remove C0/C1 control chars except tab, LF, CR — they break browsers and diffs. */
export function stripDisallowedControlCharacters(content: string): string {
  if (!content) return content
  return content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

const JSON_UNICODE_ESCAPE_RE = /\\u([0-9a-fA-F]{4})/g

export function hasDominantJsonUnicodeEscapes(content: string): boolean {
  const matches = content.match(JSON_UNICODE_ESCAPE_RE) ?? []
  return matches.length >= 2
}

/** Unescape literal `\\uXXXX` sequences left in tool args after JSON.parse. */
export function unescapeJsonUnicodeEscapes(content: string): string {
  if (!hasDominantJsonUnicodeEscapes(content)) return content
  return content.replace(JSON_UNICODE_ESCAPE_RE, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
}

const MOJIBAKE_REPAIRS: readonly [RegExp, string][] = [
  [/\u00E2\u20AC\u2122/g, "'"],
  [/\u00E2\u20AC\u02DC/g, "'"],
  [/\u00E2\u20AC\u0153/g, '"'],
  [/\u00E2\u20AC\u009D/g, '"'],
  [/\u00E2\u20AC\u201C/g, '"'],
  [/\u00E2\u20AC\u201D/g, '"'],
  [/\u00E2\u20AC\u2014/g, '—'],
  [/\u00E2\u20AC\u2013/g, '–'],
  [/\u00C3\u00A9/g, 'é'],
  [/\u00C3\u00A8/g, 'è'],
  [/\u00C3\u00A0/g, 'à'],
]

/** Repair common UTF-8-as-Latin-1 mojibake when patterns are unambiguous. */
export function repairCommonMojibake(content: string): string {
  if (!content || !/\u00E2|\u00C3/.test(content)) return content
  let out = content
  for (const [pattern, replacement] of MOJIBAKE_REPAIRS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

export function decodeHtmlEntitiesInAgentContent(
  content: string,
  resolvedPath?: string,
): string {
  if (!content) return content
  const isHtml = looksLikeHtmlDocument(content) || looksLikeHtmlPath(resolvedPath)
  const entityCount = htmlEntityCount(content)
  const shouldDecode = isHtml ? entityCount >= 1 : hasDominantHtmlEntities(content)
  if (!shouldDecode) return content
  let out = content
  out = out.replace(/&#(\d+);/g, (_, digits: string) => {
    const code = Number(digits)
    return Number.isFinite(code) ? String.fromCharCode(code) : _
  })
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
  out = out
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return out
}

export function hasDominantLiteralEscapedNewlines(content: string): boolean {
  if (!content) return false
  const realNewlines = content.includes('\n') ? content.split('\n').length - 1 : 0
  const literalSlashN = (content.match(/\\n/g) ?? []).length
  return literalSlashN >= 2 && realNewlines < literalSlashN
}

/** True when source looks like multiple statements crushed onto one or two lines. */
export function isCollapsedMultiStatementSource(content: string): boolean {
  if (!content || content.length < 200) return false
  const lineCount = content.split(/\r?\n/).length
  if (lineCount > 4) return false
  const semicolons = (content.match(/;/g) ?? []).length
  if (semicolons < 6) return false
  const imports = (content.match(/\bimport\s+/g) ?? []).length
  const exports = (content.match(/\bexport\s+/g) ?? []).length
  const functions = (content.match(/\bfunction\s+|\)\s*=>\s*\{/g) ?? []).length
  const returns = (content.match(/\breturn\s*\(/g) ?? []).length
  const statementSignals = imports + exports + functions + (returns > 0 ? 1 : 0)
  return statementSignals >= 2 || (semicolons >= 10 && lineCount <= 2)
}

export function hasOverlongSourceLines(
  content: string,
  maxLineChars: number = AGENT_LAYOUT_MAX_LINE_CHARS,
): boolean {
  return content.split(/\r?\n/).some((line) => line.length > maxLineChars)
}

/** True for TSX/JSX sources — not plain HTML or vanilla JS in `<script>`. */
export function looksLikeJsxOrTsxSource(content: string): boolean {
  if (!content) return false
  if (/\breturn\s*\(\s*</.test(content)) return true
  if (/<[A-Z][A-Za-z0-9]*[\s/>]/.test(content)) return true
  if (/<\/[A-Z][A-Za-z0-9]*>/.test(content)) return true
  return false
}

/** Collapsed one-liner or partial repair with very long lines / too few breaks. */
export function needsSourceLayoutRepair(content: string): boolean {
  if (!content || content.length < 200) return false
  if (isCollapsedMultiStatementSource(content)) return true
  if (hasOverlongSourceLines(content)) return true
  const lines = content.split(/\r?\n/)
  if (content.length > 600 && lines.length < Math.max(12, Math.floor(content.length / 100))) {
    return true
  }
  return false
}

function unescapeLiteralNewlines(content: string): string {
  return content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
}

/** Unescape literal \\n sequences when models send JSON-style escapes in tool args. */
export function unescapeLiteralNewlinesWhenDominant(content: string): string {
  if (!hasDominantLiteralEscapedNewlines(content)) return content
  return unescapeLiteralNewlines(content)
}

const COMMENT_SWALLOWED_CODE =
  /(^|[;{}]\s*|^\s*)\/\/([^\n]*?)(\s+)((?:document\.|window\.|function\s|const\s|let\s|var\s|export\s|import\s|class\s))/gm

/**
 * Models put live code on the same line as a `//` comment (`// ready document.addEventListener…`),
 * which comments out the rest of the line and breaks bootstrapping.
 */
export function repairCommentSwallowedTrailingCode(content: string): string {
  if (!content || !/\/\//.test(content)) return content
  return content.replace(COMMENT_SWALLOWED_CODE, '$1//$2\n$4')
}

/** True when statements are glued without semicolons/newlines (`'react'import`, `[] function`). */
export function hasGluedJavaScriptStatements(content: string): boolean {
  if (!content || content.length < 20) return false
  if (/\)[ \t]{2,}\breturn\b/.test(content)) return true
  if (/['"]\)[ \t]{2,}\breturn\b/.test(content)) return true
  if (/;[ \t]{2,}\b(?:return|const|let|var|function)\b/.test(content)) return true
  if (/\bfrom\s+['"][^'"]+['"][^\S\n]*(?:import|export)\b/.test(content)) return true
  if (/['"][^'"]*['"](?:import|export|type|interface)\b/.test(content)) return true
  if (/\[\]\s+(?:function|const|let|var)\b/.test(content)) return true
  if (/\]\s+(?:function|const|let|var)\b/.test(content)) return true
  for (const line of content.split(/\r?\n/)) {
    if (/\)[ \t]{2,}\breturn\b/.test(line)) return true
    if (/['"][ \t]{2,}\breturn\b/.test(line)) return true
    if (line.length < 80) continue
    if (/\]\s+(?:function|const|let|var)\b/.test(line)) return true
    if (/\bfrom\s+['"][^'"]+['"][^\S\n]*(?:import|export)\b/.test(line)) return true
    if (/['"][^'"]*['"](?:import|export|type|interface)\b/.test(line)) return true
    if (/\)\s+(?:document\.|window\.|[a-z_$][\w$]*\s*\.|[a-z_$][\w$]*\s*=)/i.test(line)) {
      return true
    }
  }
  return false
}

function expandGluedJavaScriptTokensOnce(content: string): string {
  let out = content
  out = out.replace(/\b(from\s+['"][^'"]+['"])([^\S\n]*)(?=import\s)/g, '$1\n')
  out = out.replace(/\b(from\s+['"][^'"]+['"])([^\S\n]*)(?=export\s)/g, '$1\n')
  out = out.replace(/(['"][^'"]*['"])(?=(?:import|export|type|interface)\b)/g, '$1\n')
  out = out.replace(/(\[\])(\s+)(?=function\s|const\s|let\s|var\s)/g, '$1;\n')
  out = out.replace(/(\])(\s+)(?=function\s|const\s|let\s|var\s)/g, '$1;\n')
  out = out.replace(/\)\s+(?=document\.|window\.|[a-z_$][\w$]*\s*\.|[a-z_$][\w$]*\s*=)/gi, ')\n')
  return out
}

/** Break common glued-token patterns before generic statement expansion. */
export function expandGluedJavaScriptTokens(content: string): string {
  if (!content) return content
  let out = content
  for (let pass = 0; pass < 6; pass += 1) {
    const next = expandGluedJavaScriptTokensOnce(out)
    if (next === out) break
    out = next
  }
  return out
}

/** Insert line breaks before common statement and comment boundaries. */
export function expandCollapsedSourceLineBreaks(content: string): string {
  if (!content) return content
  let out = expandGluedJavaScriptTokens(content)
  out = out.replace(new RegExp(`;(\\s*)(?=//)`, 'g'), ';\n$1')
  out = out.replace(new RegExp(`;(\\s*)(?=${STMT_START})`, 'g'), ';\n$1')
  out = out.replace(
    /\{(\s*)(?=(?:const|let|var|return|if|for|while|switch|try|\/\/)\b)/g,
    '{\n$1',
  )
  out = out.replace(/\}(\s*)(?=(?:return|else|catch|finally|\/\/)\b)/g, '}\n$1')
  out = out.replace(/\)(\s*)(?=<[A-Za-z/])/g, ')\n$1')
  return out
}

/** Split crushed JSX / return blocks onto separate lines (not full pretty-print). */
export function reflowCrushedJsxAndBlocks(content: string): string {
  if (!content) return content
  let out = content
  for (let pass = 0; pass < 12; pass += 1) {
    const prev = out
    out = out.replace(/\breturn\s*\(\s*</g, 'return (\n<')
    out = out.replace(/>\s*</g, '>\n<')
    out = out.replace(/\)\s*;\s*\}/g, ')\n  );\n}')
    out = out.replace(/\)\s*:\s*\(/g, ')\n          : (')
    out = out.replace(/\)\s*\)\s*}/g, ')\n          )\n        }')
    if (out === prev || !hasOverlongSourceLines(out)) break
  }
  return out
}

const HTML_EMBEDDED_BLOCK_RE = /<(style|script)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi

function reflowBlockInterior(text: string, maxLineChars: number = AGENT_LAYOUT_MAX_LINE_CHARS): string {
  if (!text || text.length <= maxLineChars) return text
  let out = text.replace(/;(\s*)/g, ';\n$1')
  out = out.replace(/\{(\s*)/g, '{\n$1')
  out = out.replace(/\}(\s*)/g, '}\n$1')
  out = out.replace(/\)(\s*)(?=\{)/g, ')\n$1')
  if (hasOverlongSourceLines(out, maxLineChars)) {
    out = softWrapOverlongLines(out, maxLineChars)
  }
  return out
}

/** True when content looks like markdown (ATX headings or glued ` ## ` sections). */
export function looksLikeMarkdownDocument(content: string): boolean {
  const t = content.trim()
  if (!t) return false
  if (/^#{1,6}\s/m.test(t)) return true
  if (/\s#{1,6}\s/.test(t)) return true
  if (/^-\s/m.test(t)) return true
  if (/\s-\s+\S/.test(t) && /#{1,6}\s/.test(t)) return true
  return false
}

/**
 * Models often glue markdown onto one line (`# Title ## Section - bullet`).
 * Inserts breaks before headings and list items without shredding well-formed files.
 */
export function reflowMarkdownDocumentLineBreaks(content: string): string {
  if (!content?.trim()) return content
  const lineCount = content.split(/\r?\n/).length
  if (lineCount > 10 && !hasOverlongSourceLines(content, 240)) return content
  if (!looksLikeMarkdownDocument(content)) return content

  const hadTrailingNewline = content.endsWith('\n')
  let out = content.trim()
  out = out.replace(/([^\n#])\s*(#{1,6}\s+)/g, '$1\n\n$2')
  out = out.replace(/([^\n])\s+(-\s+\S)/g, '$1\n$2')
  out = out.replace(/\n{3,}/g, '\n\n')
  if (hadTrailingNewline && !out.endsWith('\n')) out += '\n'
  return out
}

/** Insert line breaks between HTML tags (models often emit one-line documents). */
export function reflowHtmlDocumentLineBreaks(content: string): string {
  if (!looksLikeHtmlDocument(content)) return content
  let out = content.trim()
  if (out.split(/\r?\n/).length > 8 && !hasOverlongSourceLines(out, 240)) {
    return content
  }
  out = out.replace(/<!DOCTYPE\s+html>/gi, (m) => `${m}\n`)
  out = out.replace(/>\s*</g, '>\n<')
  return out
}

/** Expand one-line stylesheets for readable diffs (models often minify CSS). */
export function reflowCssStylesheet(content: string): string {
  if (!content?.trim()) return content
  const lines = content.split(/\r?\n/)
  if (lines.length > 4 && !hasOverlongSourceLines(content, 240)) return content
  if (!/[{};]/.test(content) || /<[a-z!/]/i.test(content.trimStart())) return content
  let out = content.trim()
  out = out.replace(/\}\s*/g, '}\n')
  out = out.replace(/;\s*(?=[.#\w[@:])/g, ';\n')
  return out
}

/** Break crushed interiors of HTML style/script blocks without shredding the whole file. */
export function reflowHtmlEmbeddedBlocks(content: string): string {
  if (!/<style[\s>]/i.test(content) && !/<script[\s>]/i.test(content)) {
    return content
  }
  return content.replace(HTML_EMBEDDED_BLOCK_RE, (full, tag, attrs, inner) => {
    const trimmed = inner.trim()
    if (!trimmed) return full
    if (/^script$/i.test(String(tag)) && isJammedJavaScriptSource(trimmed)) {
      const repaired = repairJammedHtmlScriptInner(inner)
      return repaired === inner ? full : `<${tag}${attrs ?? ''}>${repaired}</${tag}>`
    }
    if (!hasOverlongSourceLines(trimmed, AGENT_LAYOUT_MAX_LINE_CHARS)) {
      return full
    }
    const reflowed = reflowBlockInterior(trimmed)
    return `<${tag}${attrs ?? ''}>\n${reflowed}\n</${tag}>`
  })
}

/** Repair crushed JavaScript source (standalone `.js` or inline `<script>` body). */
export function repairJammedJavaScriptSource(source: string): string {
  if (!source?.trim()) return source
  let out = expandGluedJavaScriptTokens(source)
  out = repairCommentSwallowedTrailingCode(out)
  out = out.replace(/\}\)\s*;\s*\)/g, '});')
  out = out.replace(/\}\)\s*\/\//g, '});\n//')
  out = out.replace(/;\}\)\s*\/\//g, ';\n});\n//')
  out = out.replace(/([a-z0-9])(function\s+\w+\s*\()/gi, '$1\n$2')
  out = out.replace(/([^\s;}])(function\s+\w+\s*\()/g, '$1\n$2')
  out = out.replace(/\}(function\s+\w+\s*\()/g, '}\n$1')
  out = out.replace(
    /(\}\);\s*)(\/\/[^\n]*?)(\s*)(function\s+)/g,
    '$1\n$2\n$4',
  )
  out = out.replace(/(\}\);\s*)(\/\/[^\n]*?)(function\s+)/g, '$1\n$2\n$3')
  if (isCollapsedMultiStatementSource(out) || isJammedJavaScriptSource(out)) {
    out = expandCollapsedSourceLineBreaks(out)
  }
  if (hasOverlongSourceLines(out)) {
    out = reflowBlockInterior(out)
  }
  return out
}

/** Repair crushed interiors of inline `<script>` blocks (todo-app one-liner scripts). */
export function repairJammedHtmlScriptInner(inner: string): string {
  return repairJammedJavaScriptSource(inner)
}

/** True when content looks like standalone JS (not HTML/CSS/markdown). */
export function looksLikeJavaScriptSource(content: string, resolvedPath?: string): boolean {
  if (!content?.trim()) return false
  if (looksLikeHtmlDocument(content) || looksLikeMarkdownDocument(content)) return false
  if (resolvedPath && /\.(m?js|cjs)$/i.test(resolvedPath.replace(/\\/g, '/'))) return true
  const t = content.trimStart()
  if (/^(import|export)\s/m.test(t)) return true
  if (/\b(function|const|let|var|class)\s/.test(content) && /\b(document\.|window\.|addEventListener)\b/.test(content)) {
    return true
  }
  if (/\bfunction\s+\w+\s*\(/.test(content) && !/<[a-z!/]/i.test(t)) return true
  return false
}

/**
 * Models glue `function init()` onto the same line as `}); // comment…` inside inline scripts.
 * Example: `}); // … initial renderfunction init() {` → breaks `init` reference at DOMContentLoaded.
 */
export function repairCrushedHtmlScriptBlocks(content: string): string {
  if (!/<script[\s>]/i.test(content)) return content
  return content.replace(HTML_EMBEDDED_BLOCK_RE, (full, tag, attrs, inner) => {
    if (!/^script$/i.test(String(tag))) return full
    const trimmed = inner.trim()
    if (!trimmed) return full
    if (!isJammedJavaScriptSource(trimmed) && !hasOverlongSourceLines(trimmed, AGENT_LAYOUT_MAX_LINE_CHARS)) {
      return full
    }
    const out = repairJammedHtmlScriptInner(inner)
    return out === inner ? full : `<${tag}${attrs ?? ''}>${out}</${tag}>`
  })
}

function softWrapOverlongLines(
  content: string,
  maxLineChars: number = AGENT_LAYOUT_MAX_LINE_CHARS,
): string {
  return content
    .split('\n')
    .flatMap((line) => {
      if (line.length <= maxLineChars) return [line]
      let wrapped = line.replace(/\s{4,}/g, '\n')
      for (let pass = 0; pass < 6; pass += 1) {
        if (!wrapped.split('\n').some((part) => part.length > maxLineChars)) break
        const next = wrapped.replace(/\s{2,}(?=[<{(/])/g, '\n')
        if (next === wrapped) break
        wrapped = next
      }
      return wrapped.split('\n')
    })
    .join('\n')
}

export function repairSourceLayout(content: string, resolvedPath?: string): string {
  if (!content) return content
  let out = content
  if (hasDominantLiteralEscapedNewlines(out)) {
    out = unescapeLiteralNewlines(out)
  }
  if (hasGluedJavaScriptStatements(out)) {
    out = expandGluedJavaScriptTokens(out)
  }
  out = repairCommentSwallowedTrailingCode(out)
  if (
    looksLikeJavaScriptSource(out, resolvedPath) &&
    (isJammedJavaScriptSource(out) || isCollapsedMultiStatementSource(out))
  ) {
    out = repairJammedJavaScriptSource(out)
  }
  if (needsSourceLayoutRepair(out)) {
    const lineCount = out.split(/\r?\n/).length
    if (isCollapsedMultiStatementSource(out) || lineCount <= 4) {
      out = expandCollapsedSourceLineBreaks(out)
    }
    if (hasOverlongSourceLines(out) && looksLikeJsxOrTsxSource(out)) {
      out = reflowCrushedJsxAndBlocks(out)
    }
    if (hasOverlongSourceLines(out)) {
      out = softWrapOverlongLines(out)
    }
  }
  if (looksLikeMarkdownDocument(out)) {
    const mdLines = out.split(/\r?\n/).length
    if (mdLines <= 3 || hasOverlongSourceLines(out)) {
      out = reflowMarkdownDocumentLineBreaks(out)
    }
  }
  if (looksLikeHtmlDocument(out)) {
    out = reflowHtmlDocumentLineBreaks(out)
  } else {
    out = reflowCssStylesheet(out)
  }
  if (/<style[\s>]/i.test(out) || /<script[\s>]/i.test(out)) {
    out = reflowHtmlEmbeddedBlocks(out)
    out = repairCrushedHtmlScriptBlocks(out)
  }
  return out
}

export function normalizeAgentWriteFileContent(content: string, resolvedPath?: string): string {
  let out = stripUtf8Bom(content)
  out = stripDisallowedControlCharacters(out)
  out = unescapeJsonUnicodeEscapes(out)
  out = repairCommonMojibake(out)
  out = decodeHtmlEntitiesInAgentContent(out, resolvedPath)
  if (isBootstrapManifestPath(resolvedPath)) {
    out = normalizeJsonManifestContent(out, resolvedPath)
    return out
  }
  return repairSourceLayout(out, resolvedPath)
}
