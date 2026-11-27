/**
 * Small line diff for inline review cards (no Node imports). Common prefix/suffix are
 * trimmed first; the changed middle uses LCS when small enough, otherwise it degrades to
 * "remove old block, add new block".
 */

export type LineDiffRow =
  | { type: 'context' | 'del' | 'add'; text: string; oldLine?: number; newLine?: number }
  | { type: 'gap'; hidden: number }

const MAX_LCS_CELLS = 4_000_000

function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

type Op = { type: 'context' | 'del' | 'add'; text: string }

function diffMiddle(a: string[], b: string[]): Op[] {
  if (a.length === 0) return b.map((text) => ({ type: 'add', text }))
  if (b.length === 0) return a.map((text) => ({ type: 'del', text }))
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))]
  }
  const n = a.length
  const m = b.length
  const table = new Uint32Array((n + 1) * (m + 1))
  const at = (i: number, j: number) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] =
        a[i] === b[j] ? table[at(i + 1, j + 1)]! + 1 : Math.max(table[at(i + 1, j)]!, table[at(i, j + 1)]!)
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'context', text: a[i]! })
      i++
      j++
    } else if (table[at(i + 1, j)]! >= table[at(i, j + 1)]!) {
      ops.push({ type: 'del', text: a[i++]! })
    } else {
      ops.push({ type: 'add', text: b[j++]! })
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++]! })
  while (j < m) ops.push({ type: 'add', text: b[j++]! })
  return ops
}

export function computeLineDiff(oldText: string | null, newText: string, context = 3): LineDiffRow[] {
  const a = splitLines(oldText ?? '')
  const b = splitLines(newText)

  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++
  }

  const ops: Op[] = [
    ...a.slice(0, prefix).map((text) => ({ type: 'context' as const, text })),
    ...diffMiddle(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)),
    ...a.slice(a.length - suffix).map((text) => ({ type: 'context' as const, text })),
  ]

  // Number lines, then collapse context far from any change.
  const numbered: Array<Op & { oldLine?: number; newLine?: number }> = []
  let oldNo = 1
  let newNo = 1
  for (const op of ops) {
    if (op.type === 'context') numbered.push({ ...op, oldLine: oldNo++, newLine: newNo++ })
    else if (op.type === 'del') numbered.push({ ...op, oldLine: oldNo++ })
    else numbered.push({ ...op, newLine: newNo++ })
  }

  const keep = new Array<boolean>(numbered.length).fill(false)
  numbered.forEach((op, idx) => {
    if (op.type === 'context') return
    for (let k = Math.max(0, idx - context); k <= Math.min(numbered.length - 1, idx + context); k++) keep[k] = true
  })

  const rows: LineDiffRow[] = []
  let hidden = 0
  numbered.forEach((op, idx) => {
    if (keep[idx]) {
      if (hidden) rows.push({ type: 'gap', hidden })
      hidden = 0
      rows.push(op)
    } else {
      hidden++
    }
  })
  if (hidden && rows.length) rows.push({ type: 'gap', hidden })
  return rows
}

export function countLineDiff(rows: readonly LineDiffRow[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const r of rows) {
    if (r.type === 'add') added++
    else if (r.type === 'del') removed++
  }
  return { added, removed }
}
