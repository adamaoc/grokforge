import { useState } from "react";
import { ChevronRight, FileDiff, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InlineLineDiff } from "@/components/InlineLineDiff";
import { cn } from "@/lib/utils";
import type {
  AgentTurnChanges,
  TurnChangedFile,
  TurnRootChanges,
} from "../../../../shared/agent/checkpoint-contract";
import { countTurnChanges } from "../../../../shared/agent/checkpoint-contract";

type DiffState =
  | { status: "loading" }
  | { status: "ready"; before: string | null; after: string | null; binary: boolean; truncated: boolean }
  | { status: "error"; error: string };

const STATUS_LETTER: Record<TurnChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

const STATUS_CLASS: Record<TurnChangedFile["status"], string> = {
  added: "text-emerald-400 border-emerald-900/60",
  modified: "text-amber-300 border-amber-900/60",
  deleted: "text-red-400 border-red-900/60",
};

const fileKey = (root: TurnRootChanges, file: TurnChangedFile) => `${root.rootId}\u0000${file.path}`;

/**
 * Everything the agent changed during one turn, diffed against the checkpoint taken before
 * it. Each file can be inspected and reverted; "Undo turn" restores all of them.
 */
export function TurnChangesCard({
  projectId,
  changes,
}: {
  projectId: string;
  changes: AgentTurnChanges;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({});
  const [reverted, setReverted] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const totals = countTurnChanges(changes);
  const multiRoot = changes.roots.length > 1;
  const allReverted = changes.roots.every((r) => r.files.every((f) => reverted.has(fileKey(r, f))));

  const loadDiff = async (root: TurnRootChanges, file: TurnChangedFile) => {
    const key = fileKey(root, file);
    if (diffs[key]?.status === "ready") return;
    const api = window.electron?.agentCheckpointFileDiff;
    if (!api) return;
    setDiffs((d) => ({ ...d, [key]: { status: "loading" } }));
    const res = await api({ projectId, rootId: root.rootId, checkpoint: root.checkpoint, path: file.path });
    setDiffs((d) => ({
      ...d,
      [key]: res.ok
        ? { status: "ready", before: res.before, after: res.after, binary: res.binary, truncated: res.truncated }
        : { status: "error", error: res.error },
    }));
  };

  const toggle = (root: TurnRootChanges, file: TurnChangedFile) => {
    const key = fileKey(root, file);
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (!file.binary) void loadDiff(root, file);
  };

  const revert = async (targets: Array<{ root: TurnRootChanges; files: TurnChangedFile[] }>, label: string) => {
    const api = window.electron?.agentCheckpointRevert;
    if (!api) return;
    setBusy(label);
    let count = 0;
    try {
      for (const { root, files } of targets) {
        const pending = files.filter((f) => !reverted.has(fileKey(root, f)));
        if (!pending.length) continue;
        const res = await api({
          projectId,
          rootId: root.rootId,
          checkpoint: root.checkpoint,
          paths: pending.map((f) => f.path),
        });
        if (!res.ok) {
          toast.error(`Could not revert: ${res.error}`);
          return;
        }
        count += res.reverted.length;
        setReverted((prev) => {
          const next = new Set(prev);
          for (const f of pending) next.add(fileKey(root, f));
          return next;
        });
      }
      if (count > 0) toast.success(`Reverted ${count} file${count === 1 ? "" : "s"}`);
    } finally {
      setBusy(null);
      setConfirmUndo(false);
    }
  };

  return (
    <div
      className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60"
      data-turn-changes=""
    >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <FileDiff size={14} className="shrink-0 text-gf-accent" aria-hidden />
          <span className="font-medium text-zinc-200">
            Changed {totals.files} file{totals.files === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-[11px]">
            <span className="text-emerald-400">+{totals.additions}</span>{" "}
            <span className="text-red-400">−{totals.deletions}</span>
          </span>
        </div>
        {allReverted ? (
          <span className="text-[11px] text-zinc-500">All changes reverted</span>
        ) : confirmUndo ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-400">Revert every file?</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-lg border-red-900/70 px-2 text-xs text-red-200 hover:bg-red-950/40"
              disabled={busy !== null}
              onClick={() => void revert(changes.roots.map((root) => ({ root, files: root.files })), "all")}
            >
              {busy === "all" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
              Undo turn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-lg px-2 text-xs text-zinc-400"
              onClick={() => setConfirmUndo(false)}
            >
              Keep
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-lg px-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={() => setConfirmUndo(true)}
          >
            <Undo2 size={12} aria-hidden /> Undo turn
          </Button>
        )}
      </div>

      <ul className="divide-y divide-zinc-800/60">
        {changes.roots.map((root) =>
          root.files.map((file, idx) => {
            const key = fileKey(root, file);
            const isOpen = expanded === key;
            const isReverted = reverted.has(key);
            const diff = diffs[key];
            return (
              <li key={key}>
                {multiRoot && idx === 0 ? (
                  <div className="bg-zinc-900/40 px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500">
                    {root.rootLabel}
                  </div>
                ) : null}
                <div className={cn("flex min-w-0 items-center gap-2 px-3 py-1.5", isReverted && "opacity-50")}>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggle(root, file)}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight
                      size={12}
                      className={cn("shrink-0 text-zinc-500 transition-transform", isOpen && "rotate-90")}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "w-4 shrink-0 rounded border text-center font-mono text-[9px] leading-[14px]",
                        STATUS_CLASS[file.status],
                      )}
                      title={file.status}
                    >
                      {STATUS_LETTER[file.status]}
                    </span>
                    <span
                      className={cn("truncate font-mono text-[11px] text-zinc-200", isReverted && "line-through")}
                      title={file.path}
                    >
                      {file.path}
                    </span>
                    {file.binary ? (
                      <span className="shrink-0 text-[10px] text-zinc-500">binary</span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px]">
                        <span className="text-emerald-400">+{file.additions}</span>{" "}
                        <span className="text-red-400">−{file.deletions}</span>
                      </span>
                    )}
                  </button>
                  {isReverted ? (
                    <span className="shrink-0 text-[10px] text-zinc-500">Reverted</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 shrink-0 gap-1 rounded-md px-1.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-white"
                      disabled={busy !== null}
                      onClick={() => void revert([{ root, files: [file] }], key)}
                      aria-label={`Revert ${file.path}`}
                    >
                      {busy === key ? (
                        <Loader2 size={11} className="animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw size={11} aria-hidden />
                      )}
                      Revert
                    </Button>
                  )}
                </div>
                {isOpen ? (
                  <div className="border-t border-zinc-800/60 bg-zinc-950">
                    {file.binary || diff?.status === "ready" && diff.binary ? (
                      <p className="px-3 py-2 text-[11px] text-zinc-500">Binary file, no preview.</p>
                    ) : !diff || diff.status === "loading" ? (
                      <p className="px-3 py-2 text-[11px] text-zinc-500">Loading diff…</p>
                    ) : diff.status === "error" ? (
                      <p className="px-3 py-2 text-[11px] text-red-300">{diff.error}</p>
                    ) : (
                      <>
                        <InlineLineDiff before={diff.before} after={diff.after} />
                        {diff.truncated ? (
                          <p className="px-3 pb-2 text-[10px] text-zinc-500">Large file: diff truncated.</p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          }),
        )}
      </ul>
    </div>
  );
}
