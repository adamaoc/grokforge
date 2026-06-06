import { useMemo, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { isAllowedExternalOpenUrl } from '../../../shared/security/external-open-url'

export type ChatMarkdownRole = 'assistant' | 'user'

const remarkPlugins = [remarkGfm, remarkBreaks] as const

function isClickableExternalHref(href: string): boolean {
  try {
    return isAllowedExternalOpenUrl(new URL(href))
  } catch {
    return false
  }
}

async function openExternalHrefInBrowser(href: string): Promise<void> {
  const el = window.electron
  if (!el?.openExternalUrl) {
    toast.error('Opening links requires the GrokForge desktop app.')
    return
  }
  const res = await el.openExternalUrl(href)
  if (!res.ok) toast.error(res.error ?? 'Could not open link')
}

const mdRootClass =
  'min-w-0 max-w-full overflow-x-hidden text-sm leading-relaxed break-words [&_p]:mb-3 [&_p]:break-words [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ol]:my-2 [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_li]:pl-0.5 [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400 [&_hr]:my-4 [&_hr]:border-zinc-800 [&_table]:my-3 [&_table]:w-full [&_table]:max-w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[13px] [&_th]:border [&_th]:border-zinc-800 [&_th]:bg-zinc-900/80 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium [&_td]:border [&_td]:border-zinc-800 [&_td]:px-2 [&_td]:py-1.5 [&_strong]:font-semibold [&_strong]:text-white [&_a]:text-gf-accent [&_a]:underline-offset-2 [&_a]:hover:underline'

function markdownComponents(role: ChatMarkdownRole): Components {
  return {
    a({ href, children, className, ...rest }) {
      if (href && isClickableExternalHref(href)) {
        return (
          <a
            {...rest}
            href={href}
            className={cn(className)}
            onClick={(e) => {
              e.preventDefault()
              void openExternalHrefInBrowser(href)
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <span className="text-zinc-500 underline decoration-zinc-600 decoration-dotted" title={href ?? 'Link'}>
          {children}
        </span>
      )
    },
    pre({ children }) {
      return (
        <pre className="my-3 max-h-72 min-w-0 w-full max-w-full overflow-x-auto overflow-y-auto custom-scrollbar rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-[13px] leading-relaxed text-zinc-200">
          {children}
        </pre>
      )
    },
    code({ className, children, ...rest }) {
      const text = flattenText(children)
      const hasLang = /\blanguage-/.test(String(className ?? ''))
      /** Fenced blocks are `<pre><code>`; inline `code` never contains raw newlines (see mdast inlineCode). */
      const isBlock = hasLang || text.includes('\n')
      if (isBlock) {
        return (
          <code
            className={cn('block min-w-0 max-w-full whitespace-pre font-mono text-[13px] text-zinc-200', className)}
            {...rest}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className={cn(
            'rounded-md border border-zinc-700/80 bg-zinc-950 px-1.5 py-0.5 font-mono text-[12px] text-gf-accent/95',
            role === 'user' && 'border-zinc-600/90 bg-black/25 text-gf-accent/90',
            className,
          )}
          {...rest}
        >
          {children}
        </code>
      )
    },
  }
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (isValidElement(node) && node.props && typeof node.props === 'object' && 'children' in node.props) {
    return flattenText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

export interface ChatThreadMarkdownProps {
  content: string
  role: ChatMarkdownRole
  className?: string
}

export function ChatThreadMarkdown({ content, role, className }: ChatThreadMarkdownProps) {
  const components = useMemo(() => markdownComponents(role), [role])

  if (!content.trim()) {
    return null
  }

  return (
    <div className={cn(mdRootClass, className)}>
      <ReactMarkdown remarkPlugins={[...remarkPlugins]} rehypePlugins={[rehypeSanitize]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
