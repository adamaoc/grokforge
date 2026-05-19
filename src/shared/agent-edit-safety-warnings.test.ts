import { describe, expect, it } from 'vitest'
import { analyzeAgentEditSafety, mergeAgentEditSafetyResults } from './agent-edit-safety-warnings'

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
