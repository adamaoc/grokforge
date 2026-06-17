import { commandLikelyMutatesWorkspace } from '../routing/command-intent'
import {
  assessScaffoldCommand,
  buildNonEmptyScaffoldTargetWarning,
  detectScaffoldOutputFailure,
  extractViteScaffoldTarget,
  isViteScaffoldCommand,
  scaffoldCommandHasOverwrite,
  type ViteTemplateId,
} from './helpers/scaffold-command'
import { scheduleWorkspaceFilesystemRefresh } from '../../main/workspace/fs-notify'
import { listScaffoldTargetEntryNames, resolveScaffoldTargetAbsolutePath } from '../../main/workspace/scaffold-target-fs'
import type { AgentToolExecutionContext } from './contracts/execution-context'
import type { GrokProjectManifest } from '../../main/project/manifest'
import {
  evaluateAgentCommandRisk,
  isDiagnosticAutoApproveCommand,
} from '../policy/command/run-command-policy'
import { runCommandInRootForAgent } from './run-command'
import type { AgentWorkspaceToolResult } from './workspace-tools'
import { z } from 'zod'
import {
  RUN_COMMAND_DEFAULT_TIMEOUT_MS,
  RUN_COMMAND_MAX_TIMEOUT_MS,
  RUN_COMMAND_MIN_TIMEOUT_MS,
} from './contracts/run-command-contract'

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
    scaffoldExpectedTemplate?: ViteTemplateId | null
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

  const scaffoldAssessment = assessScaffoldCommand({
    command: args.command,
    expectedTemplate: options.scaffoldExpectedTemplate ?? null,
  })
  if (!scaffoldAssessment.ok) {
    return {
      ok: false,
      displayTitle: 'Scaffold command needs fix',
      displayDetail: scaffoldAssessment.reason,
      content: JSON.stringify({
        ok: false,
        validation: 'scaffold_command',
        error: scaffoldAssessment.reason,
        suggestedCommand: scaffoldAssessment.suggestedCommand,
        expectedTemplate: scaffoldAssessment.expectedTemplate,
      }),
    }
  }

  const autoApprove = isDiagnosticAutoApproveCommand(args.command)

  let approvalWarning: string | undefined
  if (isViteScaffoldCommand(args.command) && !scaffoldCommandHasOverwrite(args.command)) {
    const targetRel = extractViteScaffoldTarget(args.command)
    const entryNames = listScaffoldTargetEntryNames(root.path, targetRel)
    approvalWarning =
      buildNonEmptyScaffoldTargetWarning({
        entryNames,
        targetLabel: resolveScaffoldTargetAbsolutePath(root.path, targetRel),
      }) ?? undefined
  }

  if (!autoApprove) {
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
        warning: approvalWarning,
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
  }

  ctx.emitProgress({
    title: autoApprove ? 'Running diagnostic command' : 'Running approved command',
    detail: args.command,
  })

  const result = await runCommandInRootForAgent(options.manifest, {
    rootId: args.rootId,
    command: args.command,
    timeoutMs,
    acknowledgedDestructive: true,
  })

  if (result.ok) {
    const commandSucceeded =
      !result.timedOut && (result.exitCode === 0 || result.exitCode === null) && !result.signal
    const scaffoldOutputFailure =
      commandSucceeded && isViteScaffoldCommand(args.command)
        ? detectScaffoldOutputFailure(result.output)
        : null

    if (scaffoldOutputFailure) {
      return {
        ok: false,
        displayTitle: 'Scaffold produced no files',
        displayDetail: scaffoldOutputFailure,
        content: JSON.stringify({
          ok: false,
          scaffoldCancelled: true,
          command: args.command,
          rootId: args.rootId,
          exitCode: result.exitCode,
          error: scaffoldOutputFailure,
          output: result.output,
        }),
      }
    }

    const shouldRefreshWorkspace =
      commandSucceeded && commandLikelyMutatesWorkspace(args.command)
    if (shouldRefreshWorkspace) {
      scheduleWorkspaceFilesystemRefresh({
        projectId: ctx.projectId,
        manifest: options.manifest,
        paths: [root.path],
        notifyRenderer: true,
        reason: 'agent_command',
      })
    }
    return {
      ok: true,
      displayTitle: 'Command finished',
      displayDetail: [
        `exit ${result.exitCode ?? '?'}`,
        result.signal ? `signal ${result.signal}` : '',
        result.truncated ? 'output truncated' : '',
        result.timedOut ? 'timed out' : '',
        shouldRefreshWorkspace ? 'file tree refreshing' : '',
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
