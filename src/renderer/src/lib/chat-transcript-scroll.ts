export function scrollTranscriptToBottom(
  root: HTMLElement | null,
  options?: { behavior?: ScrollBehavior },
): void {
  if (!root) return
  const behavior = options?.behavior ?? 'instant'
  if (behavior === 'instant') {
    root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
    return
  }
  root.scrollTo({ top: root.scrollHeight, behavior })
}

export function scrollTranscriptToElement(
  root: HTMLElement | null,
  selector: string,
  options?: { behavior?: ScrollBehavior },
): void {
  if (!root) return
  const element = root.querySelector(selector)
  if (!element || !(element instanceof HTMLElement)) return
  element.scrollIntoView({
    behavior: options?.behavior ?? 'instant',
    block: 'nearest',
  })
}
