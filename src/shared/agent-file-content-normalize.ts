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

/** Insert line breaks before common statement and comment boundaries. */
export function expandCollapsedSourceLineBreaks(content: string): string {
  if (!content) return content
  let out = content
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

/** Break crushed interiors of HTML style/script blocks without shredding the whole file. */
export function reflowHtmlEmbeddedBlocks(content: string): string {
  if (!/<style[\s>]/i.test(content) && !/<script[\s>]/i.test(content)) {
    return content
  }
  return content.replace(HTML_EMBEDDED_BLOCK_RE, (full, tag, attrs, inner) => {
    const trimmed = inner.trim()
    if (!trimmed || !hasOverlongSourceLines(trimmed, AGENT_LAYOUT_MAX_LINE_CHARS)) {
      return full
    }
    const reflowed = reflowBlockInterior(trimmed)
    return `<${tag}${attrs ?? ''}>\n${reflowed}\n</${tag}>`
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

export function repairSourceLayout(content: string): string {
  if (!content) return content
  let out = content
  if (hasDominantLiteralEscapedNewlines(out)) {
    out = unescapeLiteralNewlines(out)
  }
  if (needsSourceLayoutRepair(out)) {
    const lineCount = out.split(/\r?\n/).length
    if (isCollapsedMultiStatementSource(out) || lineCount <= 4) {
      out = expandCollapsedSourceLineBreaks(out)
    }
    if (hasOverlongSourceLines(out)) {
      out = reflowCrushedJsxAndBlocks(out)
    }
    if (hasOverlongSourceLines(out)) {
      out = softWrapOverlongLines(out)
    }
  }
  if (/<style[\s>]/i.test(out) || /<script[\s>]/i.test(out)) {
    out = reflowHtmlEmbeddedBlocks(out)
  }
  return out
}

export function normalizeAgentWriteFileContent(content: string): string {
  return repairSourceLayout(content)
}
