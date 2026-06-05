import { useCallback, useEffect, useMemo, useState } from "react";
import gfLogoUrl from "../../../../../assets/GF-logo.png";
import { Plus, Settings } from "lucide-react";
import type { RecentProjectEntry } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  readWelcomeRecentsLayout,
  writeWelcomeRecentsLayout,
  type WelcomeRecentsLayout,
} from "@/lib/welcome-recents-layout";
import {
  CREATOR_PROFILE_URL,
  WELCOME_RECENTS_FILTER_INPUT_ID,
} from "./welcome-constants";
import { welcomeKeyboardTargetAllowsGlobalShortcut } from "./welcome-keyboard-shortcuts";
import { WelcomeDeleteStoredDialog } from "./WelcomeDeleteStoredDialog";
import { GrokForgeWordmark } from "./GrokForgeWordmark";
import { WelcomeRecentPickerSection } from "./WelcomeRecentPickerSection";
import { WelcomeRemoveFromListDialog } from "./WelcomeRemoveFromListDialog";
import { WelcomeRenameRecentDialog } from "./WelcomeRenameRecentDialog";
import {
  getRecentFolderLabel,
  getRecentRootsSubtitle,
} from "./recent-entry-labels";
import { useWelcomeMetaDigitOpen } from "./useWelcomeMetaDigitOpen";
import { useWelcomeRecents } from "./useWelcomeRecents";
import { buildWelcomeRecentRowViewModels } from "./welcome-recent-row-view-model";
import { clearAgentChatUnread } from "@/lib/agent-chat-unread-storage";
import { useAgentChatActivityOptional } from "@/context/AgentChatActivityProvider";

export interface ProjectWelcomeProps {
  isLoadingProject: boolean;
  onBrowseProject: () => void;
  onOpenRecent: (projectId: string) => void;
  onOpenSettings: () => void;
  /** macOS: inset traffic lights — top drag strip in welcome + matches `trafficLightPosition` in main (021 / 022). */
  macTitleBarInset?: boolean;
}

export function ProjectWelcome({
  isLoadingProject,
  onBrowseProject,
  onOpenRecent,
  onOpenSettings,
  macTitleBarInset,
}: ProjectWelcomeProps) {
  const { recents, recentsLoaded } = useWelcomeRecents();
  const agentActivity = useAgentChatActivityOptional();
  const [removeFromListConfirmId, setRemoveFromListConfirmId] = useState<
    string | null
  >(null);
  const [deleteStoredConfirmId, setDeleteStoredConfirmId] = useState<
    string | null
  >(null);
  const [removeFromListSaving, setRemoveFromListSaving] = useState(false);
  const [deleteStoredSaving, setDeleteStoredSaving] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{
    projectId: string;
    initialName: string;
    folderLabel: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [recentsLayout, setRecentsLayout] = useState<WelcomeRecentsLayout>(() =>
    readWelcomeRecentsLayout(),
  );
  const [recentsFilter, setRecentsFilter] = useState("");
  const [recentsFilterOpen, setRecentsFilterOpen] = useState(false);

  const handleRecentsLayoutChange = useCallback(
    (next: WelcomeRecentsLayout) => {
      setRecentsLayout(next);
      writeWelcomeRecentsLayout(next);
    },
    [],
  );

  useEffect(() => {
    if (renameDialog) setRenameDraft(renameDialog.initialName);
  }, [renameDialog]);

  const openCreatorProfile = useCallback(() => {
    const open = window.electron?.openExternalUrl;
    if (!open) {
      toast.error("Opening links requires the GrokForge desktop app.");
      return;
    }
    void open(CREATOR_PROFILE_URL).then((res) => {
      if (!res.ok) toast.error(res.error ?? "Could not open link");
    });
  }, []);

  const pendingRemoveFromListEntry = removeFromListConfirmId
    ? recents.find((e) => e.projectId === removeFromListConfirmId)
    : undefined;

  const pendingDeleteStoredEntry = deleteStoredConfirmId
    ? recents.find((e) => e.projectId === deleteStoredConfirmId)
    : undefined;

  const openRemoveFromListConfirm = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setRemoveFromListConfirmId(projectId);
    },
    [],
  );

  const openDeleteStoredConfirm = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      e.preventDefault();
      setDeleteStoredConfirmId(projectId);
    },
    [],
  );

  const confirmRemoveFromList = useCallback(async () => {
    if (!removeFromListConfirmId) return;
    const api = window.electron?.removeRecentProject;
    if (!api) {
      toast.error("Removing from the list requires the GrokForge desktop app.");
      return;
    }
    setRemoveFromListSaving(true);
    try {
      const res = await api(removeFromListConfirmId);
      setRemoveFromListConfirmId(null);
      if (!res.ok) toast.error(res.error);
    } finally {
      setRemoveFromListSaving(false);
    }
  }, [removeFromListConfirmId]);

  const confirmDeleteStoredProject = useCallback(async () => {
    if (!deleteStoredConfirmId) return;
    const del = window.electron?.deleteProject;
    if (!del) {
      toast.error("Deleting a project requires the GrokForge desktop app.");
      return;
    }
    setDeleteStoredSaving(true);
    try {
      const id = deleteStoredConfirmId;
      const res = await del(id);
      setDeleteStoredConfirmId(null);
      if (!res.ok) toast.error(res.error);
      else {
        clearAgentChatUnread(id);
        agentActivity?.refreshAgentChatUnreadUi();
      }
    } finally {
      setDeleteStoredSaving(false);
    }
  }, [deleteStoredConfirmId, agentActivity]);

  const openRenameDialog = useCallback(
    (e: React.MouseEvent, entry: RecentProjectEntry) => {
      e.stopPropagation();
      e.preventDefault();
      setRenameDialog({
        projectId: entry.projectId,
        initialName: entry.displayName,
        folderLabel: getRecentFolderLabel(entry),
      });
    },
    [],
  );

  const saveRename = useCallback(async () => {
    if (!renameDialog) return;
    const api = window.electron?.updateRecentPickerName;
    if (!api) {
      toast.error("Renaming requires the GrokForge desktop app.");
      return;
    }
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast.error("Enter a display name.");
      return;
    }
    setRenameSaving(true);
    try {
      const res = await api(renameDialog.projectId, trimmed);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRenameDialog(null);
    } finally {
      setRenameSaving(false);
    }
  }, [renameDialog, renameDraft]);

  const hasRecents = recents.length > 0;

  const filteredRecents = useMemo(() => {
    const q = recentsFilterOpen ? recentsFilter.trim().toLowerCase() : "";
    if (!q) return recents;
    return recents.filter((entry) => {
      const hay = [
        entry.displayName,
        entry.primaryRootPath ?? "",
        entry.rootLabels?.join(" ") ?? "",
        getRecentFolderLabel(entry),
        getRecentRootsSubtitle(entry),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recents, recentsFilter, recentsFilterOpen]);

  const filteredRowViewModels = useMemo(
    () => buildWelcomeRecentRowViewModels(filteredRecents),
    [filteredRecents],
  );

  const metaQuickOpenProjectIds = useMemo(
    () => filteredRowViewModels.map((r) => r.entry.projectId),
    [filteredRowViewModels],
  );

  const showRecentProjectsShell = !recentsLoaded || hasRecents;
  const showRecentProjects = recentsLoaded && hasRecents;
  const showEmptyProjectAction = recentsLoaded && !hasRecents;

  const { metaDigitHintsVisible } = useWelcomeMetaDigitOpen({
    enabled: showRecentProjects && metaQuickOpenProjectIds.length > 0,
    projectIdsInOpenOrder: metaQuickOpenProjectIds,
    isLoadingProject,
    onOpenRecent,
  });

  const filterQueryActive =
    recentsFilterOpen && recentsFilter.trim().length > 0;

  useEffect(() => {
    if (!showRecentProjects) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.code !== "KeyK") return;

      const active = document.activeElement;
      const filterFocused =
        active instanceof HTMLElement &&
        active.id === WELCOME_RECENTS_FILTER_INPUT_ID;

      if (filterFocused) {
        e.preventDefault();
        e.stopPropagation();
        setRecentsFilterOpen(false);
        return;
      }

      if (!welcomeKeyboardTargetAllowsGlobalShortcut(e.target)) return;

      e.preventDefault();
      e.stopPropagation();
      setRecentsFilterOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showRecentProjects]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gf-canvas text-white">
      {macTitleBarInset ? (
        <div
          className="gf-drag-region h-10 shrink-0 bg-gf-canvas"
          aria-hidden
        />
      ) : null}

      <nav
        className="gf-no-drag flex shrink-0 items-center justify-end gap-2 px-4 py-2 sm:px-5"
        aria-label="Welcome toolbar"
      >
        {showRecentProjectsShell ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2 rounded-xl border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
            onClick={() => void onBrowseProject()}
            disabled={isLoadingProject}
          >
            <Plus size={16} className="shrink-0" aria-hidden />
            Open / create
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenSettings}
              disabled={isLoadingProject}
              className="rounded-xl bg-zinc-900 p-2.5 text-zinc-300 outline-none transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gf-canvas disabled:pointer-events-none disabled:opacity-50"
              aria-label="Settings"
            >
              <Settings size={18} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Settings
          </TooltipContent>
        </Tooltip>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-8",
            showRecentProjectsShell
              ? hasRecents
                ? "pb-6 pt-1"
                : "pb-6 pt-2"
              : "items-center justify-center pb-8 pt-4",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-4xl flex-col items-center",
              showRecentProjectsShell
                ? "mx-auto shrink-0"
                : "mx-auto space-y-8 text-center",
            )}
          >
            <GrokForgeWordmark compact={hasRecents} />
            <p
              className={cn(
                "text-zinc-400",
                hasRecents
                  ? "mt-1.5 text-center text-base sm:text-lg"
                  : "mt-1 text-center text-2xl",
              )}
            >
              The agentic coding tool for Grok
            </p>
          </div>

          {showRecentProjectsShell ? (
            <WelcomeRecentPickerSection
              sectionClassName={hasRecents ? "mt-4 sm:mt-5" : "mt-8"}
              metaDigitHintsVisible={metaDigitHintsVisible}
              showRecentProjects={showRecentProjects}
              recentsLayout={recentsLayout}
              onRecentsLayoutChange={handleRecentsLayoutChange}
              recentsFilterOpen={recentsFilterOpen}
              onRecentsFilterOpenChange={setRecentsFilterOpen}
              recentsFilter={recentsFilter}
              onRecentsFilterChange={setRecentsFilter}
              filterQueryActive={filterQueryActive}
              filteredRowViewModels={filteredRowViewModels}
              isLoadingProject={isLoadingProject}
              onOpenRecent={onOpenRecent}
              onRename={openRenameDialog}
              onRemoveFromList={openRemoveFromListConfirm}
              onDeleteStored={openDeleteStoredConfirm}
            />
          ) : showEmptyProjectAction ? (
            <button
              type="button"
              onClick={() => void onBrowseProject()}
              disabled={isLoadingProject}
              className="mt-10 flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-white px-8 py-3.5 text-base font-semibold text-black outline-none transition-colors hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gf-canvas disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {isLoadingProject ? (
                <>Opening project...</>
              ) : (
                <>
                  Open Project or Create New
                  <span className="text-lg">→</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      <WelcomeRemoveFromListDialog
        open={removeFromListConfirmId !== null}
        saving={removeFromListSaving}
        pendingEntry={pendingRemoveFromListEntry}
        onOpenChange={(open) => {
          if (!open && !removeFromListSaving) setRemoveFromListConfirmId(null);
        }}
        onConfirm={() => void confirmRemoveFromList()}
        onCancel={() => setRemoveFromListConfirmId(null)}
      />

      <WelcomeDeleteStoredDialog
        open={deleteStoredConfirmId !== null}
        saving={deleteStoredSaving}
        pendingEntry={pendingDeleteStoredEntry}
        onOpenChange={(open) => {
          if (!open && !deleteStoredSaving) setDeleteStoredConfirmId(null);
        }}
        onConfirm={() => void confirmDeleteStoredProject()}
        onCancel={() => setDeleteStoredConfirmId(null)}
      />

      <WelcomeRenameRecentDialog
        open={renameDialog !== null}
        folderLabel={renameDialog?.folderLabel ?? null}
        draft={renameDraft}
        saving={renameSaving}
        onDraftChange={setRenameDraft}
        onOpenChange={(open) => {
          if (!open && !renameSaving) setRenameDialog(null);
        }}
        onSave={() => void saveRename()}
        onCancel={() => setRenameDialog(null)}
        onDraftKeyDown={(ev) => {
          if (ev.key === "Enter" && renameDraft.trim() && !renameSaving) {
            ev.preventDefault();
            void saveRename();
          }
        }}
      />

      <footer className="gf-no-drag sticky bottom-0 z-10 shrink-0 border-t border-zinc-800 bg-gf-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-2 text-center text-xs leading-relaxed text-zinc-500">
          <p className="text-pretty flex">
            This is not an official Grok or xAI tool—just a project built by a
            single dev playing with Grok.{" "}
            <button
              type="button"
              className="font-medium text-gf-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-gf-canvas"
              onClick={openCreatorProfile}
            >
              x.com/adamaoc
            </button>
          </p>
          <p className="text-zinc-600">
            Powered by Grok • xAI • {new Date().getFullYear()}
          </p>
        </div>

        <span className="absolute right-[1.5rem] bottom-[1.5rem]">
          <img src={gfLogoUrl} alt="GrokForge logo" className="w-8 h-8" />
        </span>
      </footer>
    </div>
  );
}
