import { useRef } from "react";
import { Paperclip, Send } from "lucide-react";
import { AGENT_CHAT_MAX_ATTACHMENTS } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN,
} from "../../../../shared/chat/attachment-contract";
import { useChatThreadComposerStore } from "./chat-thread-store";

type ChatComposerProps = {
  busy: boolean;
  onSend: () => void;
  onFilesSelected: (files: FileList) => void;
};

export function ChatComposer({
  busy,
  onSend,
  onFilesSelected,
}: ChatComposerProps) {
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  const input = useChatThreadComposerStore((state) => state.input);
  const setInput = useChatThreadComposerStore((state) => state.setInput);
  const composerDragActive = useChatThreadComposerStore(
    (state) => state.composerDragActive,
  );
  const setComposerDragActive = useChatThreadComposerStore(
    (state) => state.setComposerDragActive,
  );

  return (
    <>
      <input
        ref={attachmentFileInputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico,.avif,.heic,.heif,.tif,.tiff,.pdf,.txt,.md,.markdown,.json,.csv,.yaml,.yml,.xml,.html,.htm,.css,.scss,.less,.ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte,.rs,.go,.java,.kt,.kts,.swift,.rb,.php,.c,.h,.cpp,.hpp,.cc,.cs,.fs,.sql,.sh,.bash,.zsh,.ps1,.toml,.ini,.cfg,.conf,.log,.rtf,.mdx,.tex,.rst"
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) onFilesSelected(list);
          e.target.value = "";
        }}
      />
      <div
        className={cn(
          "relative min-w-0 rounded-2xl transition-shadow",
          composerDragActive &&
            "ring-2 ring-primary ring-offset-2 ring-offset-zinc-950",
        )}
        onDragEnter={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setComposerDragActive(true);
        }}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        }}
        onDragLeave={(ev) => {
          ev.preventDefault();
          if (!ev.currentTarget.contains(ev.relatedTarget as Node))
            setComposerDragActive(false);
        }}
        onDrop={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setComposerDragActive(false);
          if (ev.dataTransfer.files?.length)
            onFilesSelected(ev.dataTransfer.files);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              className="gf-no-drag absolute bottom-[0.7rem] left-2 z-10 h-9 w-9 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white"
              aria-label="Attach files"
              onClick={() => attachmentFileInputRef.current?.click()}
            >
              <Paperclip size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[16rem] text-xs">
            Attach images or documents - drop files here or click. Max{" "}
            {AGENT_CHAT_MAX_ATTACHMENTS} files ·{" "}
            {Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / (1024 * 1024))} MiB
            each ·{" "}
            {Math.round(
              CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_TURN / (1024 * 1024),
            )}{" "}
            MiB total per message.
          </TooltipContent>
        </Tooltip>
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask GrokForge anything about your project..."
          className={cn(
            "gf-chat-composer custom-scrollbar gf-no-drag w-full min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-12 pr-14 text-sm text-zinc-100 shadow-none placeholder:text-zinc-500",
            "focus-visible:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          disabled={busy}
          aria-label="Message to agent"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              disabled={busy}
              onClick={onSend}
              className="gf-no-drag absolute bottom-[0.8rem] right-2 h-8 w-8 rounded-xl bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
              aria-label="Send message"
            >
              <Send size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[14rem] text-xs">
            Send (Enter) / New line (Shift+Enter)
          </TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}
