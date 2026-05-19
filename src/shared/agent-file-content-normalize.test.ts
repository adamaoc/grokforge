import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  expandCollapsedSourceLineBreaks,
  hasOverlongSourceLines,
  isCollapsedMultiStatementSource,
  needsSourceLayoutRepair,
  normalizeAgentWriteFileContent,
  repairSourceLayout,
  reflowCrushedJsxAndBlocks,
} from './agent-file-content-normalize'

describe('normalizeAgentWriteFileContent', () => {
  it('returns unchanged when there are no literal backslash-n sequences', () => {
    expect(normalizeAgentWriteFileContent('a\nb\nc')).toBe('a\nb\nc')
  })

  it('returns unchanged when literal \\n count is below threshold', () => {
    expect(normalizeAgentWriteFileContent('see \\n in prose')).toBe('see \\n in prose')
  })

  it('returns unchanged when real newlines already dominate', () => {
    const ok = '# Title\n\nBody line 1\nBody line 2\n'
    expect(normalizeAgentWriteFileContent(ok)).toBe(ok)
  })

  it('unescapes literal \\n when they dominate (model mistake)', () => {
    const broken = '# Hello\\n\\n## Section\\nBody line.'
    expect(normalizeAgentWriteFileContent(broken)).toBe('# Hello\n\n## Section\nBody line.')
  })

  it('handles \\r\\n before bare \\n', () => {
    expect(normalizeAgentWriteFileContent('a\\r\\nb\\nc')).toBe('a\nb\nc')
  })

  it('unescapes \\t when \\n dominance triggers', () => {
    expect(normalizeAgentWriteFileContent('a\\nb\\tc\\nd')).toBe('a\nb\tc\nd')
  })

  it('expands collapsed TS/JS source with semicolons and line comments', () => {
    const collapsed =
      "import Link from 'next/link'; import { getAllPosts } from '@/lib/content'; export default async function AdminPostsPage() { const posts = await getAllPosts(); // Note: filters drafts; const published = posts.length; return ( <motion.div /> ); }"
    expect(isCollapsedMultiStatementSource(collapsed)).toBe(true)
    const normalized = normalizeAgentWriteFileContent(collapsed)
    expect(normalized.split('\n').length).toBeGreaterThan(4)
    expect(normalized).toContain("import Link from 'next/link';\n")
    expect(normalized).toMatch(/getAllPosts\(\);\n\s*\/\/ Note: filters drafts/)
    expect(normalized).not.toMatch(/getAllPosts\(\); \/\/ Note/)
  })
})

describe('needsSourceLayoutRepair', () => {
  it('is false for short or normally formatted files', () => {
    expect(isCollapsedMultiStatementSource('export const x = 1\n')).toBe(false)
    expect(needsSourceLayoutRepair(`${'line\n'.repeat(20)}`)).toBe(false)
  })

  it('is true when any line is very long', () => {
    expect(hasOverlongSourceLines('short\n' + 'x'.repeat(200))).toBe(true)
    expect(needsSourceLayoutRepair('short\n' + 'x'.repeat(200))).toBe(true)
  })
})

describe('expandCollapsedSourceLineBreaks', () => {
  it('does not split semicolons inside for-loop headers', () => {
    const loop = 'for (let i = 0; i < n; i++) { doWork(i) }'
    expect(expandCollapsedSourceLineBreaks(loop)).toBe(loop)
  })
})

describe('repairSourceLayout on multi-line files with one long line', () => {
  it('does not shred normal multi-line JS when only one line exceeds max length', () => {
    const normalLines = Array.from(
      { length: 48 },
      (_, i) => `function fn${i}() { return ${i}; }`,
    ).join('\n')
    const longLine = `const data = ${'"x"'.repeat(180)};`
    const input = `${normalLines}\n${longLine}\n`
    expect(needsSourceLayoutRepair(input)).toBe(true)
    const repaired = repairSourceLayout(input)
    const lines = repaired.split('\n')
    expect(lines.length).toBeGreaterThan(40)
    const singleBraceLines = lines.filter((l) => l.trim() === '}').length
    expect(singleBraceLines).toBeLessThan(10)
    expect(repaired).toContain('function fn0()')
  })
})

describe('reflowHtmlEmbeddedBlocks via repairSourceLayout', () => {
  it('breaks one-line style and script blocks in HTML todo scaffold', () => {
    const html = `<!DOCTYPE html>
<html><head><title>Todo</title><style>body { font-family: sans-serif; margin: 0; padding: 1rem; } #todo-input { width: 70%; }</style></head>
<body><h1>Todo</h1><input id="todo-input" /><button>Add</button><ul id="list"></ul>
<script>function addTodo() { const v = document.getElementById('todo-input').value; if (!v) return; const li = document.createElement('li'); li.textContent = v; document.getElementById('list').appendChild(li); }</script>
</body></html>`
    const out = normalizeAgentWriteFileContent(html)
    const maxLen = Math.max(...out.split('\n').map((l) => l.length))
    expect(maxLen).toBeLessThan(200)
    expect(out).toContain('function addTodo')
    expect(out).toContain('<style>')
  })
})

describe('reflowCrushedJsxAndBlocks', () => {
  it('splits adjacent JSX tags onto separate lines', () => {
    const crushed = "return ( <motion.div><span>a</span></motion.div> );"
    const out = reflowCrushedJsxAndBlocks(crushed)
    expect(out).toContain('>\n<')
    expect(hasOverlongSourceLines(out)).toBe(false)
  })
})

describe('repairSourceLayout on real crushed admin posts fixture', () => {
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../15MinDallas/15-min-dallas-www/src/app/(admin)/admin/posts/page.tsx',
  )

  it('reduces max line length for the known broken posts page', () => {
    let raw: string
    try {
      raw = readFileSync(fixturePath, 'utf-8')
    } catch {
      return
    }
    if (!needsSourceLayoutRepair(raw)) return

    const repaired = repairSourceLayout(raw)
    const maxLen = Math.max(...repaired.split(/\r?\n/).map((l) => l.length))
    expect(maxLen).toBeLessThan(200)
    expect(repaired.split(/\r?\n/).length).toBeGreaterThan(20)
  })
})
