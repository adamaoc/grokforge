import type { AgentToolExecutionContext } from '../shared/agent-tool-execution-context'
import type { GrokProjectManifest } from './manifest'
import { evaluateAgentCommandRisk } from './run-command-policy'
import { runCommandInRootForAgent } from './run-command'
import type { AgentWorkspaceToolResult } from './agent-workspace-tools'
import { z } from 'zod'
import {
  RUN_COMMAND_DEFAULT_TIMEOUT_MS,
  RUN_COMMAND_MAX_TIMEOUT_MS,
  RUN_COMMAND_MIN_TIMEOUT_MS,
} from '../shared/run-command-contract'

export const RunCommandToolArgsSchema = z.object({
  rootId: z.string().min(1).max(256),
  command: z.string().min(1).max(8000),
  timeoutMs: z.number().int().min(RUN_COMMAND_MIN_TIMEOUT_MS).max(RUN_COMMAND_MAX_TIMEOUT_MS).optional(),
  purpose: z.string().min(1).max(500),
})

export type RunCommandToolArgs = z.infer<typeof RunCommandToolArgsSchema>

export type RunCommandToolOutcome = AgentWorkspaceToolResult

export async function executeRunCommandTool(
  ctx: AgentToolExecutionContext,
  args: RunCommandToolArgs,
  options: {
    requestId: string
    manifest: GrokProjectManifest
  },
): Promise<RunCommandToolOutcome> {
  const root = options.manifest.roots.find((r) => r.id === args.rootId)
  const timeoutMs = args.timeoutMs ?? RUN_COMMAND_DEFAULT_TIMEOUT_MS
  if (!root) {
    return { ok: false, displayTitle: 'Command request failed', content: JSON.stringify({ ok: false, error: 'Unknown workspace root.' }) }
  }

  const risk = evaluateAgentCommandRisk(args.command)
  if (risk.kind === 'blocked') {
    return {
      ok: false,
      displayTitle: 'Command blocked',
      displayDetail: risk.reason,
      content: JSON.stringify({ ok: false, blocked: true, error: risk.reason }),
    }
  }

  ctx.emitProgress({ title: 'Command awaiting approval', detail: args.command })

  const approved = await ctx.askCommandApproval({
    requestId: options.requestId,
    request: {
      rootId: root.id,
      rootLabel: root.label,
      rootPath: root.path,
      command: args.command,
      timeoutMs,
      purpose: args.purpose,
      risk: risk.kind,
      policyReason: risk.reason,
    },
  })

  if (!approved) {
    ctx.emitProgress({ title: 'Command rejected', detail: args.command })
    return {
      ok: false,
      displayTitle: 'Command rejected',
      displayDetail: args.command,
      content: JSON.stringify({
        ok: false,
        rejected: true,
        error: 'User rejected the command. Continue without claiming it ran.',
        command: args.command,
      }),
    }
  }

  ctx.emitProgress({ title: 'Running approved command', detail: args.command })

  const result = await runCommandInRootForAgent(options.manifest, {
    rootId: args.rootId,
    command: args.command,
    timeoutMs,
    acknowledgedDestructive: true,
  })

  if (result.ok) {
    return {
      ok: true,
      displayTitle: 'Command finished',
      displayDetail: [
        `exit ${result.exitCode ?? '?'}`,
        result.signal ? `signal ${result.signal}` : '',
        result.truncated ? 'output truncated' : '',
        result.timedOut ? 'timed out' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      content: JSON.stringify({
        ok: true,
        command: args.command,
        rootId: args.rootId,
        exitCode: result.exitCode,
        signal: result.signal,
        truncated: result.truncated,
        timedOut: Boolean(result.timedOut),
        output: result.output,
      }),
    }
  }

  return {
    ok: false,
    displayTitle: 'Command failed',
    displayDetail: result.error,
    content: JSON.stringify({
      ok: false,
      command: args.command,
      error: result.error,
      code: result.code,
      output: result.output,
    }),
  }
}

export function parseRunCommandToolArgs(raw: unknown): ReturnType<typeof RunCommandToolArgsSchema.safeParse> {
  return RunCommandToolArgsSchema.safeParse(raw)
}
