#!/usr/bin/env node
// Scripted ACP agent for Electron UI E2E (GROKFORGE_ACP_AGENT_OVERRIDE). Speaks newline-
// delimited JSON-RPC on stdio like `grok agent stdio` / claude-agent-acp: on each prompt it
// reads README.md through the client, proposes an edit, and writes it only if allowed.
import { join } from 'node:path'

let nextId = 1
const pending = new Map()
let cwd = process.cwd()
let cancelled = false

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = `agent-${nextId++}`
    pending.set(id, { resolve, reject })
    send({ id, method, params })
  })
const update = (sessionId, u) => send({ method: 'session/update', params: { sessionId, update: u } })

async function handlePrompt(params) {
  const sid = params.sessionId
  const readme = join(cwd, 'README.md')
  cancelled = false

  update(sid, {
    sessionUpdate: 'plan',
    entries: [
      { content: 'Read README.md', status: 'in_progress' },
      { content: 'Add a Getting started section', status: 'pending' },
    ],
  })
  update(sid, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Checking the README first.' } })
  update(sid, {
    sessionUpdate: 'tool_call',
    toolCallId: 'read-1',
    title: 'Read README.md',
    kind: 'read',
    status: 'in_progress',
    locations: [{ path: readme }],
  })
  const { content: before } = await request('fs/read_text_file', { sessionId: sid, path: readme })
  update(sid, { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'completed' })
  update(sid, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: "The README has no setup instructions yet, so I'll add a **Getting started** section." },
  })

  const after = `${before.trimEnd()}\n\n## Getting started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`
  const editCall = {
    toolCallId: 'edit-1',
    title: 'Edit README.md',
    kind: 'edit',
    status: 'pending',
    locations: [{ path: readme }],
    content: [{ type: 'diff', path: readme, oldText: before, newText: after }],
  }
  update(sid, { sessionUpdate: 'tool_call', ...editCall })
  const decision = await request('session/request_permission', {
    sessionId: sid,
    toolCall: editCall,
    options: [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  })
  if (cancelled) return { stopReason: 'cancelled' }
  const allowed = decision?.outcome?.outcome === 'selected' && decision.outcome.optionId === 'allow'
  if (allowed) await request('fs/write_text_file', { sessionId: sid, path: readme, content: after })
  update(sid, { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: allowed ? 'completed' : 'failed' })
  update(sid, {
    sessionUpdate: 'plan',
    entries: [
      { content: 'Read README.md', status: 'completed' },
      { content: 'Add a Getting started section', status: allowed ? 'completed' : 'pending' },
    ],
  })
  update(sid, {
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: allowed ? 'Added the section to `README.md`.' : 'Okay — I left `README.md` unchanged.' },
  })
  return { stopReason: 'end_turn' }
}

async function onRequest(msg) {
  switch (msg.method) {
    case 'initialize':
      return { protocolVersion: 1, agentCapabilities: { loadSession: false }, authMethods: [] }
    case 'session/new':
      cwd = msg.params.cwd
      return {
        sessionId: 'mock-session-1',
        modes: {
          currentModeId: 'default',
          availableModes: [
            { id: 'default', name: 'Manual' },
            { id: 'acceptEdits', name: 'Accept edits' },
            { id: 'plan', name: 'Plan' },
          ],
        },
        _meta: { modelState: { currentModelId: 'mock-model' } },
      }
    case 'session/set_mode':
      return {}
    case 'session/prompt':
      return handlePrompt(msg.params)
    default:
      throw Object.assign(new Error(`unknown method ${msg.method}`), { code: -32601 })
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    const msg = JSON.parse(line)
    if (msg.method && msg.id != null) {
      onRequest(msg).then(
        (result) => send({ id: msg.id, result: result ?? null }),
        (err) => send({ id: msg.id, error: { code: err.code ?? -32603, message: err.message } }),
      )
    } else if (msg.method === 'session/cancel') {
      cancelled = true
    } else if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    }
  }
})
process.stdin.on('end', () => process.exit(0))
