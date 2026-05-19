import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
  onClose?: () => void
}

type State = {
  error: Error | null
}

export class DiffViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DiffViewErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <p className="text-sm font-semibold text-red-200">Diff view crashed</p>
          <p className="max-w-md text-xs leading-relaxed text-red-200/80">
            {this.state.error.message || 'The diff editor hit an unexpected error.'}
          </p>
          {this.props.onClose ? (
            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={this.props.onClose}>
              Close diff
            </Button>
          ) : null}
        </div>
      )
    }
    return this.props.children
  }
}
