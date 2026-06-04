import { describe, expect, it } from 'vitest'
import { analyzeAgentEditSafety, mergeAgentEditSafetyResults } from '../harness/policy/edit/safety-warnings'

const DALLAS_ADMIN_ORIGINAL = `import Link from 'next/link';

export default function AdminPage() {
  return (
    <motion.div className="flex min-h-screen">
      <aside className="w-64 border-r border-zinc-800 p-4">
        <ul>
          <li>
            <Link href="/admin/media">Media</Link>
          </li>
        </ul>
      </aside>
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-zinc-500">Published</div>
            <motion.div className="text-2xl font-semibold">12</motion.div>
          </div>
          <motion.div className="rounded-lg border p-4">
            <div className="text-sm text-zinc-500">Total C</div>
            <div className="text-2xl font-semibold">48</div>
          </motion.div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-zinc-500">Page Vi</motion.div>
            <div className="text-2xl font-semibold">1.2k</motion.div>
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}
`

const DALLAS_BAD_PROPOSED = "import Link from 'next/link';\n"

describe('analyzeAgentEditSafety', () => {
  it('flags 15MinDallas-style destructive shrink to a single import', () => {
    const result = analyzeAgentEditSafety({
      original: DALLAS_ADMIN_ORIGINAL,
      modified: DALLAS_BAD_PROPOSED,
      status: 'modified',
      userMessageHint: "let's add a few more widgets to the admin area",
    })

    expect(result.severity).toBe('severe')
    expect(result.issues.some((i) => i.code === 'dramatic_shrink')).toBe(true)
    expect(result.issues.some((i) => i.code === 'single_line_blob')).toBe(true)
    expect(result.issues.some((i) => i.code === 'intent_mostly_deletions')).toBe(true)
    expect(result.statsLine).toContain('→')
  })

  it('allows moderate shrink without severe flags', () => {
    const original = `${'line\n'.repeat(100)}`
    const modified = `${'line\n'.repeat(60)}`
    const result = analyzeAgentEditSafety({
      original,
      modified,
      status: 'modified',
    })
    expect(result.severity).not.toBe('severe')
  })

  it('does not flag dramatic shrink for new files', () => {
    const result = analyzeAgentEditSafety({
      original: null,
      modified: 'export const x = 1\n',
      status: 'created',
    })
    expect(result.issues.some((i) => i.code === 'dramatic_shrink')).toBe(false)
    expect(result.severity).toBe('ok')
  })

  it('does not flag one-line new stylesheets as crushed JS', () => {
    const css =
      'body{margin:0;font-family:sans-serif}.container{max-width:480px;margin:0 auto;padding:1rem;}ul{list-style:none;padding:0;}'
    const result = analyzeAgentEditSafety({
      original: null,
      modified: css,
      status: 'created',
      resolvedPath: '/proj/styles.css',
    })
    expect(result.hasCollapsedSingleLineSource).toBe(false)
    expect(result.severity).not.toBe('severe')
  })

  it('flags glued multi-line todo script as caution or severe', () => {
    const crushed = `let todos = [] function loadTodos() {
const list = document.getElementById('todo-list') list.innerHTML = '' todos.forEach((todo) => {
`
    const result = analyzeAgentEditSafety({
      original: null,
      modified: crushed,
      status: 'created',
      resolvedPath: '/proj/script.js',
    })
    expect(result.severity).not.toBe('ok')
    expect(
      result.hasCollapsedSingleLineSource ||
        result.hasMessySourceLayout ||
        result.issues.length > 0,
    ).toBe(true)
  })

  it('does not flag vanilla bootstrap app.js as crushed', () => {
    const js =
      "const STORAGE_KEY='todos';function loadTodos(){return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');}function saveTodos(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));}document.addEventListener('DOMContentLoaded',()=>{const form=document.querySelector('#todo-form');form.addEventListener('submit',(e)=>{e.preventDefault();});});"
    const result = analyzeAgentEditSafety({
      original: null,
      modified: js,
      status: 'created',
      resolvedPath: '/proj/app.js',
    })
    expect(result.hasCollapsedSingleLineSource).toBe(false)
    expect(result.severity).not.toBe('severe')
  })

  it('does not flag normalized new HTML bootstrap as crushed', () => {
    const html = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body><p>ok</p></body></html>`
    const result = analyzeAgentEditSafety({
      original: null,
      modified: html,
      status: 'created',
      resolvedPath: '/proj/index.html',
    })
    expect(result.hasCollapsedSingleLineSource).toBe(false)
    expect(result.severity).not.toBe('severe')
  })

  it('flags literal escaped newlines', () => {
    const result = analyzeAgentEditSafety({
      original: 'a\nb\nc\n',
      modified: '# Hello\\n\\n## Section\\nBody',
      status: 'modified',
    })
    expect(result.hasLiteralEscapedNewlines).toBe(true)
    expect(result.issues.some((i) => i.code === 'literal_escaped_newlines')).toBe(true)
  })

  it('flags collapsed single-line source proposals', () => {
    const collapsed =
      "import Link from 'next/link'; import { getAllPosts } from '@/lib/content'; import type { PostFrontmatter } from '@/types/content'; export const dynamic = 'error'; export default async function AdminPostsPage() { const posts = await getAllPosts(); // Note: getAllPosts filters drafts; const published = posts.length; return ( <motion.div /> ); }"
    const result = analyzeAgentEditSafety({
      original: collapsed,
      modified: collapsed,
      status: 'modified',
    })
    expect(result.hasCollapsedSingleLineSource).toBe(true)
    expect(result.severity).toBe('severe')
    expect(result.issues.some((i) => i.code === 'collapsed_single_line_source')).toBe(true)
  })

  it('does not flag normal markdown docs with long prose lines', () => {
    const original = `# TaskBoard Overview  

This is a task manager application built with a Kanban-style interface. Users can create new tasks and move them through swim lanes representing different stages of progress (e.g., To Do, In Progress, Done).  

## Key Features 

- Create, edit, and delete tasks 

## Tech Stack (planned) 

- Frontend: Likely React 
- Backend: TBD  
`
    const modified = original
      .replace('## Tech Stack (planned)', '## Tech Stack')
      .replace('Likely React', 'React + TypeScript')
      .replace('TBD', 'Node.js + TypeScript\n- Served with Vite')
    const result = analyzeAgentEditSafety({
      original,
      modified,
      status: 'modified',
      resolvedPath: '/proj/docs/overview.md',
    })
    expect(result.hasMessySourceLayout).toBe(false)
    expect(result.issues.some((i) => i.code === 'messy_source_layout')).toBe(false)
    expect(result.severity).toBe('ok')
  })

  it('flags partially crushed proposals with very long lines', () => {
    const messy = `import x from 'y';\n${' '.repeat(4)}return ( ${'<div className="a">'.repeat(40)} </motion.div> );}\n`
    const result = analyzeAgentEditSafety({
      original: `${'line\n'.repeat(30)}`,
      modified: messy,
      status: 'modified',
    })
    expect(result.hasMessySourceLayout).toBe(true)
    expect(result.issues.some((i) => i.code === 'messy_source_layout')).toBe(true)
  })
})

describe('mergeAgentEditSafetyResults', () => {
  it('uses the worst severity across files', () => {
    const merged = mergeAgentEditSafetyResults([
      analyzeAgentEditSafety({ original: 'a\nb\nc\n', modified: 'a\nb\nc\n', status: 'modified' }),
      analyzeAgentEditSafety({
        original: DALLAS_ADMIN_ORIGINAL,
        modified: DALLAS_BAD_PROPOSED,
        status: 'modified',
      }),
    ])
    expect(merged.severity).toBe('severe')
  })
})
