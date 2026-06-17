/** Thrown when the tool loop hits the per-turn tool round cap without a final answer. */
export class HarnessIterationExhaustedError extends Error {
  readonly kind = 'iteration_exhausted' as const
  readonly steps: number
  readonly maxIterations: number
  readonly recoverySummary: string

  constructor(
    steps: number,
    maxIterations: number,
    message: string,
    recoverySummary: string,
  ) {
    super(message)
    this.name = 'HarnessIterationExhaustedError'
    this.steps = steps
    this.maxIterations = maxIterations
    this.recoverySummary = recoverySummary
  }
}

export function isHarnessIterationExhaustedError(err: unknown): err is HarnessIterationExhaustedError {
  return err instanceof HarnessIterationExhaustedError
}