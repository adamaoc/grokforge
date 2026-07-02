import type { Root } from "@/types";
import type { ParsedAgentToolBatch } from "../lib/legacy-agent/tools";
import {
  analyzeAgentEditSafety,
  mergeAgentEditSafetyResults,
  shouldBlockVelocityAutoApply,
  type AgentEditSafetyResult,
} from "../lib/legacy-agent/edit";
import { isPathUnderWorkspaceRoots } from "./workspace-path-check";

type ReadFileFn = (path: string) => Promise<string | null>;

export async function assessPendingWriteBatchSafety(input: {
  batch: ParsedAgentToolBatch;
  roots: Root[];
  readFile: ReadFileFn;
  userMessageHint?: string;
}): Promise<AgentEditSafetyResult[]> {
  const results: AgentEditSafetyResult[] = [];
  for (const op of input.batch.operations) {
    if (op.op !== "write_file") continue;
    if (!isPathUnderWorkspaceRoots(op.path, input.roots)) continue;
    const original = await input.readFile(op.path);
    const status = original === null ? ("created" as const) : ("modified" as const);
    results.push(
      analyzeAgentEditSafety({
        original,
        modified: op.content,
        status,
        userMessageHint: input.userMessageHint,
        resolvedPath: op.path,
      }),
    );
  }
  return results;
}

export async function assessMergedPendingWriteBatchSafety(input: {
  batch: ParsedAgentToolBatch;
  roots: Root[];
  readFile: ReadFileFn;
  userMessageHint?: string;
}): Promise<AgentEditSafetyResult> {
  const results = await assessPendingWriteBatchSafety(input);
  return mergeAgentEditSafetyResults(results);
}

export function shouldBlockPendingBatchAutoApply(
  merged: AgentEditSafetyResult,
): boolean {
  return shouldBlockVelocityAutoApply(merged);
}
