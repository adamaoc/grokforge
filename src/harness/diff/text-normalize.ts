/**
 * Small text normalization helpers used by the minimal edit tools.
 *
 * These helpers intentionally stay narrow: they only repair model arguments that
 * encode newlines as literal "\n" sequences more often than real line breaks.
 */

export function hasDominantLiteralEscapedNewlines(text: string): boolean {
  const escaped = (text.match(/\\n/g) ?? []).length
  const real = (text.match(/\n/g) ?? []).length
  return escaped >= 2 && escaped > real * 2
}

export function unescapeLiteralNewlinesWhenDominant(text: string): string {
  if (!hasDominantLiteralEscapedNewlines(text)) return text
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
}
