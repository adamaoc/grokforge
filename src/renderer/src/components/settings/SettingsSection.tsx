import type { ReactNode } from 'react'

/** Card shell shared by settings sections. */
export function SettingsSection({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-sm"
      aria-labelledby={`${id}-heading`}
      data-testid={id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-base font-semibold text-white">
            {title}
          </h2>
          {description ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}
