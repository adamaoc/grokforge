import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  expandCollapsedSourceLineBreaks,
  expandGluedJavaScriptTokens,
  hasGluedJavaScriptStatements,
  hasOverlongSourceLines,
  isCollapsedMultiStatementSource,
  looksLikeJsxOrTsxSource,
  needsSourceLayoutRepair,
  normalizeAgentWriteFileContent,
  repairSourceLayout,
  reflowCrushedJsxAndBlocks,
  reflowMarkdownDocumentLineBreaks,
  looksLikeMarkdownDocument,
  repairJammedJavaScriptSource,
  looksLikeJavaScriptSource,
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

  it('reflows glued one-line markdown onto separate lines', () => {
    const crushed =
      '# TaskBoard Overview ## Key Features - Create tasks - Drag ## Tech Stack (planned) - Frontend: Likely React - Backend: TBD'
    expect(looksLikeMarkdownDocument(crushed)).toBe(true)
    const out = reflowMarkdownDocumentLineBreaks(crushed)
    expect(out.split('\n').length).toBeGreaterThan(4)
    expect(out).toContain('# TaskBoard Overview')
    expect(out).toContain('## Key Features')
    expect(out).toContain('## Tech Stack')
    expect(normalizeAgentWriteFileContent(crushed).split('\n').length).toBeGreaterThan(4)
  })

  it('handles \\r\\n before bare \\n', () => {
    expect(normalizeAgentWriteFileContent('a\\r\\nb\\nc')).toBe('a\nb\nc')
  })

  it('unescapes \\t when \\n dominance triggers', () => {
    expect(normalizeAgentWriteFileContent('a\\nb\\tc\\nd')).toBe('a\nb\tc\nd')
  })

  it('decodes HTML entities in .html paths even when count is low', () => {
    const entities = '<html lang=&quot;en&quot;><body>Hi</body></html>'
    const normalized = normalizeAgentWriteFileContent(entities, '/proj/index.html')
    expect(normalized).toContain('lang="en"')
    expect(normalized).not.toContain('&quot;')
  })

  it('strips UTF-8 BOM and disallowed control characters', () => {
    const dirty = `\uFEFF<!DOCTYPE html>\n<html>\u0007<body>Hi</body></html>`
    const normalized = normalizeAgentWriteFileContent(dirty, '/proj/index.html')
    expect(normalized.startsWith('\uFEFF')).toBe(false)
    expect(normalized).not.toContain('\u0007')
    expect(normalized).toContain('<body>Hi</body>')
  })

  it('unescapes dominant JSON unicode escapes in HTML tool payloads', () => {
    const escaped =
      '<!DOCTYPE html>\\u003chtml lang=\\u0022en\\u0022\\u003e\\u003cbody\\u003eTodo\\u003c/body\\u003e\\u003c/html\\u003e'
    const normalized = normalizeAgentWriteFileContent(escaped, '/proj/index.html')
    expect(normalized).toContain('<html lang="en">')
    expect(normalized).not.toMatch(/\\u[0-9a-fA-F]{4}/)
  })

  it('repairs common mojibake in HTML text nodes', () => {
    const mojibake = '<!DOCTYPE html><html><body><p>Don\u00E2\u20AC\u2122t break</p></body></html>'
    const normalized = normalizeAgentWriteFileContent(mojibake)
    expect(normalized).toContain("Don't break")
    expect(normalized).not.toContain('\u00E2\u20AC\u2122')
  })

  it('decodes dominant HTML entities before reflow', () => {
    const entities =
      '<!DOCTYPE html><html lang=&#34;en&#34;><head><title>Todo</title></head><body><h1>Hi</h1></body></html>'
    const normalized = normalizeAgentWriteFileContent(entities)
    expect(normalized).toContain('lang="en"')
    expect(normalized).not.toContain('&#34;')
    expect(normalized.split('\n').length).toBeGreaterThan(3)
  })

  it('expands one-line stylesheets for review', () => {
    const oneLine =
      '*{box-sizing:border-box;}body{margin:0;font-family:sans-serif;}.container{max-width:480px;margin:0 auto;}'
    const normalized = normalizeAgentWriteFileContent(oneLine)
    expect(normalized.split('\n').length).toBeGreaterThan(2)
  })

  it('repairs jammed inline script with }function and }););', () => {
    const crushed = `<!DOCTYPE html><html><body><script>
const todos=[];function save(){localStorage.setItem('t',JSON.stringify(todos));}function init(){render();}updateCount();})// listenersfunction setup(){form.addEventListener('submit',onSubmit);}</script></body></html>`
    const normalized = normalizeAgentWriteFileContent(crushed)
    expect(normalized).not.toMatch(/\}\)\s*;\s*\)/)
    expect(normalized).not.toMatch(/listenersfunction/)
    expect(normalized).toMatch(/listeners\nfunction setup/)
  })

  it('splits function init glued after inline script comment', () => {
    const crushed = `<!DOCTYPE html><html><body><script>
items.forEach((item) => { listElement.appendChild(li); }); // Set up listeners and initial renderfunction init() {
  addEventListener('DOMContentLoaded', init);
}</script></body></html>`
    const normalized = normalizeAgentWriteFileContent(crushed)
    expect(normalized).toMatch(/render\nfunction init\s*\(/)
    expect(normalized).not.toMatch(/renderfunction init/)
  })

  it('reflows one-line HTML documents onto separate lines', () => {
    const oneLine =
      "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Todo</title></head><body><h1>Hi</h1></body></html>"
    const normalized = normalizeAgentWriteFileContent(oneLine)
    expect(normalized.split('\n').length).toBeGreaterThan(4)
    expect(normalized).toContain('<!DOCTYPE html>\n')
    expect(normalized).toContain('>\n<')
  })

  it('splits live code glued after a line comment on the same line', () => {
    const crushed =
      "const STORAGE_KEY='todos';// Boot the app when DOM is ready document.addEventListener('DOMContentLoaded', init);"
    const normalized = normalizeAgentWriteFileContent(crushed)
    expect(normalized).toMatch(/ready\n\s*document\.addEventListener/)
    expect(normalized).not.toMatch(/ready document\.addEventListener/)
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

describe('expandGluedJavaScriptTokens', () => {
  it('splits glued import lines in crushed App.tsx', () => {
    const crushed =
      "import { useState } from 'react'import './App.css'type Status = 'backlog'"
    expect(hasGluedJavaScriptStatements(crushed)).toBe(true)
    const out = expandGluedJavaScriptTokens(crushed)
    expect(out).toContain("from 'react'\nimport")
    expect(out).toContain("./App.css'\ntype")
    expect(hasGluedJavaScriptStatements(out)).toBe(false)
  })

  it('splits array literal glued before function', () => {
    const crushed = 'let todos = [] function loadTodos() { return [] }'
    expect(hasGluedJavaScriptStatements(crushed)).toBe(true)
    const out = normalizeAgentWriteFileContent(crushed, '/proj/script.js')
    expect(out).toMatch(/\[\]\s*;\s*\n\s*function loadTodos/)
    expect(hasGluedJavaScriptStatements(out)).toBe(false)
  })
})

describe('normalizeAgentWriteFileContent — vanilla HTML/JS', () => {
  it('does not insert orphan closing-paren lines into crushed todo script', () => {
    const crushed = `<!DOCTYPE html><html><body><script>function renderTodos() { todos.forEach((todo, index) => { const cb = () => { renderTodos(); }; list.appendChild(cb); }); }</script></body></html>`
    const out = normalizeAgentWriteFileContent(crushed)
    const orphanCloseParens = out.split('\n').filter((l) => /^\s*\)\s*;?\s*$/.test(l)).length
    expect(orphanCloseParens).toBe(0)
    expect(out).toContain('function renderTodos')
    expect(out).not.toMatch(/\n\s*\)\s*\n\s*\)\s*\n/)
  })

  it('does not treat vanilla HTML script as JSX for reflow gating', () => {
    expect(looksLikeJsxOrTsxSource('<html><script>function f() { return 1; }</script></html>')).toBe(
      false,
    )
    expect(looksLikeJsxOrTsxSource('export function X() { return ( <Card /> ); }')).toBe(true)
  })

  it('repairs jammed standalone script.js source', () => {
    const crushed =
      "const todos=[];function save(){}function init(){render();}updateCount();})// listenersfunction setup(){form.addEventListener('submit',onSubmit);}"
    expect(looksLikeJavaScriptSource(crushed, '/proj/script.js')).toBe(true)
    const out = normalizeAgentWriteFileContent(crushed, '/proj/script.js')
    expect(out).not.toMatch(/listenersfunction/)
    expect(out.split('\n').length).toBeGreaterThan(3)
    const orphanCloseParens = out.split('\n').filter((l) => /^\s*\)\s*;?\s*$/.test(l)).length
    expect(orphanCloseParens).toBe(0)
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
