import type { WorkLoopGuardState } from './work-loop-guard'

export function formatWorkTurnRecoverySummary(
  state: WorkLoopGuardState,
  maxIterations: number,
): string {
  const lines: string[] = [
    `**Turn stopped:** the agent used all **${maxIterations}** tool rounds without a final answer.`,
    '',
    '**What happened**',
    `- Discovery tools (read/search/list/index): **${state.discoveryInvocations}** calls`,
    `- Write proposals (write_file/edit): **${state.writeInvocations}** calls`,
  ]

  if (state.writtenPaths.size > 0) {
    const paths = [...state.writtenPaths].sort().slice(0, 8)
    lines.push(`- Files proposed this turn: ${paths.map((p) => `\`${p}\``).join(', ')}`)
    const heavy = [...state.pathWriteCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    if (heavy.length > 0) {
      lines.push(
        '- Repeated rewrites:',
        ...heavy.map(([path, count]) => `  - \`${path}\` (${count}×)`),
      )
    }
  } else {
    lines.push('- No file proposals were prepared.')
  }

  lines.push(
    '',
    'Proposals may still be on the proposal card (Velocity applies them when the turn ends cleanly).',
    'Ask **what happened?** for a short summary, or **continue** to pick up remaining work.',
  )

  return lines.join('\n')
}