#!/usr/bin/env node
/**
 * Rewrites imports from duplicate shared/main modules to harness sources, then deletes duplicates.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'src')

/** shared/foo or main/bar -> harness/baz (no .ts) */
const SHIM_MAP = {
  'main/agent-chat-model-transport': 'harness/agent/chat-model-transport',
  'main/agent-context': 'harness/context/context',
  'main/agent-context-pins-store': 'harness/context/context-pins-store',
  'main/agent-edit-proposals': 'harness/diff/edit-proposals',
  'main/agent-index-store': 'harness/context/index-store',
  'main/agent-instructions-discover': 'harness/context/instructions-discover',
  'main/agent-offload-store': 'harness/compaction/offload-store',
  'main/agent-plan-store': 'harness/plan/store/plan-store',
  'main/agent-retrieval': 'harness/context/retrieval',
  'main/agent-run-command-tool': 'harness/tools/run-command-tool',
  'main/agent-search-replace-tool': 'harness/diff/search-replace-tool',
  'main/agent-session-store': 'harness/subagent/session-store',
  'main/agent-subagent-runner': 'harness/subagent/runner',
  'main/agent-thread-memory-store': 'harness/compaction/thread-memory-store',
  'main/agent-tool-execution-context-builder': 'harness/tools/execution-context-builder',
  'main/agent-tool-executor': 'harness/tools/tool-executor',
  'main/agent-tool-result-offload': 'harness/compaction/tool-result-offload',
  'main/agent-tools': 'harness/tools/write-batch',
  'main/agent-turn-read-registry': 'harness/context/turn-read-registry',
  'main/agent-turn-receipt-store': 'harness/session/turn-receipt-store',
  'main/agent-turn-snapshot-builder': 'harness/compaction/turn-snapshot-builder',
  'main/agent-turn-trace-builder': 'harness/logger/turn-trace-builder',
  'main/agent-turn-trace-store': 'harness/logger/turn-trace-store',
  'main/agent-workspace-tools': 'harness/tools/workspace-tools',
  'main/agent-write-history-store': 'harness/session/write-history-store',
  'main/run-command': 'harness/tools/run-command',
  'main/run-command-policy': 'harness/policy/command/run-command-policy',
  'shared/agent-bootstrap-manifest': 'harness/context/bootstrap-manifest',
  'shared/agent-code-quality-contract': 'harness/policy/quality/code-quality-contract',
  'shared/agent-command-intent': 'harness/routing/command-intent',
  'shared/agent-context-budget-contract': 'harness/compaction/context-budget-contract',
  'shared/agent-context-offload': 'harness/compaction/context-offload',
  'shared/agent-context-pins-contract': 'harness/context/context-pins-contract',
  'shared/agent-creation-recovery-enforcement': 'harness/policy/edit/creation-recovery',
  'shared/agent-edit-cascade-guard': 'harness/policy/edit/cascade-guard',
  'shared/agent-edit-corrupt-content': 'harness/diff/edit-corrupt-content',
  'shared/agent-edit-failure-context': 'harness/diff/edit-failure-context',
  'shared/agent-edit-fuzzy': 'harness/diff/edit-fuzzy',
  'shared/agent-edit-proposal-merge': 'harness/diff/edit-proposal-merge',
  'shared/agent-edit-read-guard': 'harness/policy/edit/read-guard',
  'shared/agent-edit-safety-warnings': 'harness/policy/edit/safety-warnings',
  'shared/agent-file-content-normalize': 'harness/context/file-content-normalize',
  'shared/agent-final-answer-contract': 'harness/policy/final-answer/final-answer-contract',
  'shared/agent-greenfield-sections': 'harness/context/greenfield-sections',
  'shared/agent-harness-profile': 'harness/profiles/harness-profile',
  'shared/agent-harness-profile-contract': 'harness/profiles/contracts/harness-profile-key',
  'shared/agent-markdown-path': 'harness/context/markdown-path',
  'shared/agent-plan-artifact': 'harness/plan/contracts/plan-artifact',
  'shared/agent-plan-verification': 'harness/plan/verification/plan-verification',
  'shared/agent-post-edit-checks': 'harness/diff/post-edit-checks',
  'shared/agent-profile': 'harness/profiles/agent-profile',
  'shared/agent-proposal-quality': 'harness/diff/proposal-quality',
  'shared/agent-reasoning-effort': 'harness/profiles/reasoning-effort',
  'shared/agent-regenerate-proposal': 'harness/diff/regenerate-proposal',
  'shared/agent-scaffold-command': 'harness/tools/helpers/scaffold-command',
  'shared/agent-scaffold-strategy': 'harness/routing/scaffold-strategy',
  'shared/agent-search-replace': 'harness/diff/search-replace',
  'shared/agent-single-file-html-intent': 'harness/policy/edit/single-file-html-intent',
  'shared/agent-subagent-contract': 'harness/subagent/contracts/subagent-contract',
  'shared/agent-subagent-routing': 'harness/subagent/contracts/subagent-routing',
  'shared/agent-thread-memory': 'harness/compaction/thread-memory',
  'shared/agent-thread-memory-contract': 'harness/compaction/thread-memory-contract',
  'shared/agent-tool-contract': 'harness/tools/contracts/tool-contract',
  'shared/agent-tool-execution-context': 'harness/tools/contracts/execution-context',
  'shared/agent-tool-schema': 'harness/tools/contracts/tool-schema',
  'shared/agent-toolset': 'harness/profiles/contracts/toolset',
  'shared/agent-turn-routing': 'harness/routing/turn-routing',
  'shared/agent-turn-snapshot': 'harness/compaction/turn-snapshot',
  'shared/diff-line-stats': 'harness/diff/line-stats',
  'shared/gf-plan-contract': 'harness/plan/contracts/gf-plan-contract',
  'shared/incremental-work-edit-policy': 'harness/policy/incremental/work-edit-policy',
  'shared/iterative-edit-scope': 'harness/routing/iterative-edit-scope',
  'shared/iterative-work-edit': 'harness/routing/iterative-work-edit',
  'shared/iterative-work-edit-guards': 'harness/policy/incremental/work-edit-guards',
  'shared/model-router': 'harness/routing/model-router',
  'shared/populated-workspace-edit': 'harness/routing/populated-workspace-edit',
  'shared/post-plan-incremental': 'harness/plan/routing/post-plan-incremental',
  'shared/run-command-contract': 'harness/tools/contracts/run-command-contract',
  'shared/workspace-greenfield': 'harness/context/workspace-greenfield',
}

const moduleByBasename = new Map()
for (const [shimKey, harnessRel] of Object.entries(SHIM_MAP)) {
  const base = path.basename(shimKey)
  const folder = shimKey.startsWith('main/') ? 'main' : 'shared'
  moduleByBasename.set(base, { folder, harnessRel, shimKey })
}

function relativeHarness(fromFile, harnessRel) {
  const fromDir = path.dirname(fromFile)
  const target = path.join(srcRoot, harnessRel)
  let rel = path.relative(fromDir, target).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

const importRe = /from\s+(['"])((?:\.\.?\/)+)(?:(main|shared)\/([^'"]+)|([^/'"]+))\1/g

const files = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue
      walk(p)
    } else if (/\.(ts|tsx|mjs|html)$/.test(ent.name)) {
      files.push(p)
    }
  }
}
walk(srcRoot)
const storiesHtml = path.join(root, 'project_tasks', 'stories.html')
if (fs.existsSync(storiesHtml)) files.push(storiesHtml)

let totalReplacements = 0
const touched = new Set()

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const original = text
  const fileDir = path.dirname(file)
  const inMain = fileDir.endsWith(`${path.sep}main`)
  const inShared = fileDir.endsWith(`${path.sep}shared`)

  text = text.replace(importRe, (full, quote, prefix, folder, modulePath, dotModule) => {
    let entry
    if (dotModule) {
      if (prefix !== './') return full
      const base = dotModule.replace(/\/index$/, '').split('/').pop()
      entry = moduleByBasename.get(base)
      if (!entry) return full
      if (inMain && entry.folder !== 'main') return full
      if (inShared && entry.folder !== 'shared') return full
      if (!inMain && !inShared) return full
    } else if (folder === 'main' || folder === 'shared') {
      const base = modulePath.replace(/\/index$/, '').split('/').pop()
      entry = moduleByBasename.get(base)
      if (!entry || entry.folder !== folder) return full
    } else {
      return full
    }

    const newPath = relativeHarness(file, entry.harnessRel)
    totalReplacements++
    return `from ${quote}${newPath}${quote}`
  })

  if (text !== original) {
    fs.writeFileSync(file, text)
    touched.add(path.relative(root, file))
  }
}

const deleted = []
for (const shimKey of Object.keys(SHIM_MAP)) {
  const f = path.join(srcRoot, `${shimKey}.ts`)
  if (fs.existsSync(f)) {
    fs.unlinkSync(f)
    deleted.push(path.relative(root, f))
  }
}

console.log(
  JSON.stringify(
    { replacements: totalReplacements, touched: touched.size, deleted: deleted.length },
    null,
    2,
  ),
)
