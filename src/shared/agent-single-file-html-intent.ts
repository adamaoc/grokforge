/**
 * Single-file HTML creation intent (story 162).
 * Detects when user/plan explicitly targets one .html file so creation recovery
 * can use shell-first → edit extension without weakening integrity gates.
 */

import { userMatchesStaticFileBootstrapIntent } from './agent-scaffold-strategy'
import {
  planImpliesMultiFileBootstrap,
  planImpliesNpmScaffold,
  type GreenfieldScaffoldPlanHint,
} from './workspace-greenfield'

const EXPLICIT_SINGLE_HTML_FILE_RE =
  /\b(?:single|one)\s+html\s+file\b/i

/** Dogfood / 163: "Keep this all as 1 single html file" */
const KEEP_AS_SINGLE_HTML_RE =
  /\bkeep\s+(?:this\s+)?(?:all\s+)?(?:as\s+)?(?:1\s+)?single\s+html\b/i

const HTML_PROTOTYPE_USER_RE =
  /\b(?:task\s*board|kanban|html\s+prototype|html\s+file|\.html)\b/i

export type UserRequestsSingleFileHtmlInput = {
  userText?: string
  plan?: GreenfieldScaffoldPlanHint | null
}

export function htmlProposalContainsInlineScript(content: string): boolean {
  return /<script\b/i.test(content)
}

export function isHtmlCreationPath(resolvedPath: string, fileExistsOnDisk: boolean): boolean {
  if (fileExistsOnDisk) return false
  const normalized = resolvedPath.replace(/\\/g, '/')
  return /\.html?$/i.test(normalized)
}

function planRequestsSingleHtmlFileOnly(plan: GreenfieldScaffoldPlanHint): boolean {
  const paths = plan.filesLikelyTouched ?? []
  if (paths.length !== 1) return false
  const only = paths[0]?.replace(/\\/g, '/') ?? ''
  if (!/\.html?$/i.test(only)) return false
  if (planImpliesNpmScaffold(plan)) return false
  if (planImpliesMultiFileBootstrap(plan)) return false
  return true
}

function userRequestsSingleFileHtmlFromText(userText: string): boolean {
  const trimmed = userText.trim()
  if (!trimmed) return false
  if (EXPLICIT_SINGLE_HTML_FILE_RE.test(trimmed)) return true
  if (KEEP_AS_SINGLE_HTML_RE.test(trimmed)) return true
  if (userMatchesStaticFileBootstrapIntent(trimmed) && HTML_PROTOTYPE_USER_RE.test(trimmed)) {
    return true
  }
  return false
}

export function userRequestsSingleFileHtml(input: UserRequestsSingleFileHtmlInput): boolean {
  const userText = (input.userText ?? '').trim()
  const plan = input.plan ?? null
  if (userText && userRequestsSingleFileHtmlFromText(userText)) return true
  if (plan && planRequestsSingleHtmlFileOnly(plan)) return true
  return false
}
