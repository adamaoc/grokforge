/**
 * Heuristics for when executor turns should prefer `run_command` (story 126).
 */

const COMMAND_VERIFY_RE =
  /\b(npm\s+(run\s+)?(typecheck|test|build|lint|check)|pnpm\s+(run\s+)?(typecheck|test|build)|yarn\s+(run\s+)?(typecheck|test|build)|npx\s+tsc|vitest|jest|pytest|cargo\s+(test|build)|go\s+(test|build))\b/i

const COMMAND_INSTALL_SCAFFOLD_RE =
  /\b(npm\s+(install|ci|create|init)|pnpm\s+(install|create|dlx)|yarn\s+(install|create)|bun\s+(install|create)|git\s+init|git\s+clone|npx\s+create)\b/i

const BOOTSTRAP_USER_RE =
  /\b(scaffold|bootstrap|greenfield|from\s+scratch|new\s+project|set\s+up\s+(a\s+)?(vite|react|next|app|project)|create\s+(a\s+)?(vite|react|next|todo|full|new))\b/i

/** Whether user text implies greenfield bootstrap / CLI scaffold (not iterative feature edit). */
export function isBootstrapScaffoldUserText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return impliesCommandExecution(t) || BOOTSTRAP_USER_RE.test(t)
}

/** Whether user text or plan verification implies install, scaffold, or verify via CLI. */
export function impliesCommandExecution(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return COMMAND_VERIFY_RE.test(t) || COMMAND_INSTALL_SCAFFOLD_RE.test(t)
}

/** Commands that likely create or mutate files under workspace roots — refresh index after success. */
export function commandLikelyMutatesWorkspace(command: string): boolean {
  const c = command.trim().toLowerCase()
  if (!c) return false
  if (COMMAND_INSTALL_SCAFFOLD_RE.test(c)) return true
  if (/\bgit\s+(init|clone)\b/i.test(c)) return true
  if (/\b(npm|pnpm|yarn|bun)\s+create\b/i.test(c)) return true
  return false
}
