/**
 * Load approved plan artifact content for virtual `gf-plan:<planId>` read_file paths.
 */

import { readFileSync } from 'node:fs'
import { loadPlanArtifact, planJsonPath, planMdPath } from '../store/plan-store'
import { renderPlanMarkdown } from './plan-artifact'

export function readGfPlanArtifactContent(
  projectId: string,
  planId: string,
  format: 'json' | 'md',
): string {
  if (format === 'md') {
    try {
      return readFileSync(planMdPath(projectId, planId), 'utf8')
    } catch {
      const artifact = loadPlanArtifact(projectId, planId)
      if (!artifact) throw new Error(`Plan not found: ${planId}`)
      return renderPlanMarkdown(artifact)
    }
  }
  try {
    return readFileSync(planJsonPath(projectId, planId), 'utf8')
  } catch {
    const artifact = loadPlanArtifact(projectId, planId)
    if (!artifact) throw new Error(`Plan not found: ${planId}`)
    return JSON.stringify(artifact, null, 2)
  }
}