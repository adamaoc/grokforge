import { Button } from '@/components/ui/button'

const EXAMPLE_PROMPTS = [
  'Describe a small change in plain English — e.g. fix the login button styling',
  'Search the workspace for where API keys are loaded',
  'Explain how this project is organized across roots',
] as const

type ChatWelcomeSuggestionsProps = {
  onSelectPrompt: (text: string) => void
}

export function ChatWelcomeSuggestions({ onSelectPrompt }: ChatWelcomeSuggestionsProps) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Suggestions</p>
      <div className="flex flex-col gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
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
