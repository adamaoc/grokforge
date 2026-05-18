import type { RecentProjectEntry } from "@/types";
import { cn } from "@/lib/utils";
import { RecentProjectActions } from "./RecentProjectActions";
import type { WelcomeRecentRowViewModel } from "./welcome-recent-row-view-model";
import { WELCOME_META_QUICK_OPEN_MAX } from "./welcome-keyboard-shortcuts";

export function WelcomeRecentCards({
  rows,
  metaDigitHintsVisible,
  isLoadingProject,
  onOpenRecent,
  onRename,
  onRemoveFromList,
  onDeleteStored,
}: {
  rows: WelcomeRecentRowViewModel[];
  metaDigitHintsVisible: boolean;
  isLoadingProject: boolean;
  onOpenRecent: (projectId: string) => void;
  onRename: (e: React.MouseEvent, entry: RecentProjectEntry) => void;
  onRemoveFromList: (e: React.MouseEvent, projectId: string) => void;
  onDeleteStored: (e: React.MouseEvent, projectId: string) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
      {rows.map(({ entry, openedLabel, rootsLine, rootsLineTitle }, index) => (
        <article
          key={entry.projectId}
          className={cn(
            "relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3 text-left transition-colors",
            "hover:border-zinc-700 hover:bg-zinc-900/80",
            !isLoadingProject && "cursor-pointer",
            isLoadingProject && "pointer-events-none opacity-60",
          )}
          onClick={(e) => {
            if (isLoadingProject) return;
            const el = e.target as HTMLElement;
            if (el.closest("button") || el.closest('[role="toolbar"]')) return;
            onOpenRecent(entry.projectId);
          }}
        >
          {metaDigitHintsVisible && index < WELCOME_META_QUICK_OPEN_MAX ? (
            <span
              aria-hidden
              className="pointer-events-none absolute left-[-5px] top-[-4px] z-[1] flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-zinc-950/95 px-1 text-[11px] font-semibold tabular-nums text-gf-accent shadow-md ring-1 ring-zinc-600"
            >
              {index + 1}
            </span>
          ) : null}
          <div className="flex items-start gap-2">
            <button
              type="button"
              disabled={isLoadingProject}
              onClick={() => onOpenRecent(entry.projectId)}
              className={cn(
                "flex min-w-0 flex-1 flex-col rounded-lg text-left outline-none transition-colors",
                "hover:bg-zinc-900/40",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gf-canvas",
              )}
              aria-label={`Open project ${entry.displayName}`}
            >
              <span
                className="block truncate text-sm font-semibold leading-snug text-white"
                title={entry.displayName}
              >
                {entry.displayName}
              </span>
              {entry.primaryRootPath ? (
                <>
                  <span
                    className="mt-0.5 block truncate font-mono text-[11px] text-zinc-400"
                    title={entry.primaryRootPath}
                  >
                    {entry.primaryRootPath}
                  </span>
                  {entry.rootLabels && entry.rootLabels.length > 0 ? (
                    <span
                      className="mt-0.5 block truncate text-[11px] text-zinc-500"
                      title={rootsLineTitle}
                    >
                      {rootsLine}
                    </span>
                  ) : null}
                </>
              ) : (
                <span
                  className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500"
                  title={rootsLineTitle}
                >
                  {rootsLine}
                </span>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                <span>
                  {entry.rootsCount} root{entry.rootsCount === 1 ? "" : "s"}
                </span>
                <span className="text-zinc-600">·</span>
                <span>{openedLabel}</span>
              </div>
            </button>
            <RecentProjectActions
              projectId={entry.projectId}
              projectLabel={entry.displayName}
              isLoadingProject={isLoadingProject}
              onRename={(e) => onRename(e, entry)}
              onRemoveFromList={(e) => onRemoveFromList(e, entry.projectId)}
              onDeleteStored={(e) => onDeleteStored(e, entry.projectId)}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
