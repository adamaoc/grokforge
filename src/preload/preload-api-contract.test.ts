import { describe, expect, it } from 'vitest'
import type { ElectronAPI } from '../shared/preload-api-contract'
import type { electronAPI } from './preload'

type Extends<A, B> = A extends B ? true : false
type Assert<T extends true> = T

type _PreloadApiMatchesContract = Assert<Extends<typeof electronAPI, ElectronAPI>>
type _ContractMatchesPreloadApi = Assert<Extends<ElectronAPI, typeof electronAPI>>

describe('preload API contract', () => {
  it('is enforced at compile time', () => {
    expect(true).toBe(true)
  })
})
