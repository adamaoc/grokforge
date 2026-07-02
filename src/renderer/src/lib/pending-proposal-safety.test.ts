import { describe, expect, it } from "vitest";
import {
  assessPendingWriteBatchSafety,
  shouldBlockPendingBatchAutoApply,
} from "./pending-proposal-safety";
import { mergeAgentEditSafetyResults } from "./legacy-agent/edit";

describe("assessPendingWriteBatchSafety", () => {
  it("flags severe shrink on modified files", async () => {
    const original = `${"line\n".repeat(40)}`;
    const results = await assessPendingWriteBatchSafety({
      batch: {
        operations: [
          {
            op: "write_file",
            path: "/proj/src/App.tsx",
            content: "import x from 'y'\n",
          },
        ],
      },
      roots: [{ id: "r1", label: "Proj", path: "/proj" }],
      readFile: async () => original,
    });
    const merged = mergeAgentEditSafetyResults(results);
    expect(merged.severity).toBe("severe");
    expect(shouldBlockPendingBatchAutoApply(merged)).toBe(true);
  });

  it("allows healthy new-file bootstrap proposals", async () => {
    const results = await assessPendingWriteBatchSafety({
      batch: {
        operations: [
          {
            op: "write_file",
            path: "/proj/index.html",
            content: "<!DOCTYPE html>\n<html><body>ok</body></html>\n",
          },
        ],
      },
      roots: [{ id: "r1", label: "Proj", path: "/proj" }],
      readFile: async () => null,
    });
    const merged = mergeAgentEditSafetyResults(results);
    expect(merged.severity).toBe("ok");
    expect(shouldBlockPendingBatchAutoApply(merged)).toBe(false);
  });
});
