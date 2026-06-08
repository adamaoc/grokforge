import { useLayoutEffect, type RefObject } from "react";

export function useTranscriptInitialScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  deps: {
    projectId: string | null;
    messagesHydrated: boolean;
  },
) {
  useLayoutEffect(() => {
    if (!deps.messagesHydrated) return;
    const root = scrollRef.current;
    if (!root) return;

    const scrollToBottom = () => {
      root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    };

    scrollToBottom();
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      scrollToBottom();
      raf2 = requestAnimationFrame(scrollToBottom);
    });
    const timeoutId = window.setTimeout(scrollToBottom, 200);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timeoutId);
    };
  }, [scrollRef, deps.projectId, deps.messagesHydrated]);
}
