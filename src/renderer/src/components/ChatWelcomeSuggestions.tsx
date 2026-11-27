import type { GrokProjectManifest } from '@/types'
import { Button } from '@/components/ui/button'

function suggestionsFor(project: GrokProjectManifest): string[] {
  const name = project.name.trim() || 'this project'
  const [first, second] = project.roots
  return [
    `Give me a tour of ${name}: what it does and how the code is organized`,
    `Look for bugs or missing tests in ${name} and suggest the most valuable fix`,
    first && second
      ? `How do ${first.label || first.id} and ${second.label || second.id} fit together?`
      : `Add a short "Getting started" section to the README for ${name}`,
  ]
}

type ChatWelcomeSuggestionsProps = {
  project: GrokProjectManifest
  onSelectPrompt: (text: string) => void
}

export function ChatWelcomeSuggestions({ project, onSelectPrompt }: ChatWelcomeSuggestionsProps) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Try</p>
      <div className="flex flex-col gap-2">
        {suggestionsFor(project).map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            className="h-auto min-h-9 justify-start whitespace-normal rounded-xl border-zinc-800 bg-zinc-900/80 px-3 py-2 text-left text-xs font-normal leading-snug text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
            onClick={() => onSelectPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  )
}
