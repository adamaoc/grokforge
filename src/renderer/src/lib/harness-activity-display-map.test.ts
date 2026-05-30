import { describe, expect, it } from 'vitest'
import { mapActivityTitleForDisplay } from './harness-activity-display-map'

describe('mapActivityTitleForDisplay', () => {
  it('humanizes harness scaffold conflict title', () => {
    const mapped = mapActivityTitleForDisplay('Harness: scaffold strategy conflict')
    expect(mapped.displayTitle).not.toMatch(/Harness:/i)
    expect(mapped.technicalTitle).toBe('Harness: scaffold strategy conflict')
  })

  it('maps scaffold routing correction titles', () => {
    const mapped = mapActivityTitleForDisplay('Scaffold routing: CLI first')
    expect(mapped.displayTitle).toContain('Scaffold routing')
    expect(mapped.technicalTitle).toBe('Scaffold routing: CLI first')
  })

  it('preserves step labels', () => {
    expect(mapActivityTitleForDisplay('Step 2 of 4').displayTitle).toBe('Step 2 of 4')
  })

  it('maps legacy work tool round labels', () => {
    const mapped = mapActivityTitleForDisplay('Work tool round')
    expect(mapped.displayTitle).toBe('Working…')
    expect(mapped.technicalTitle).toBe('Work tool round')
  })

  it('maps compacted edit failure titles (story 155)', () => {
    const mapped = mapActivityTitleForDisplay('Edit proposal failed ×3 on script.js')
    expect(mapped.displayTitle).toBe('Edit issue on script.js (×3)')
    expect(mapped.technicalTitle).toBe('Edit proposal failed ×3 on script.js')
  })
})
