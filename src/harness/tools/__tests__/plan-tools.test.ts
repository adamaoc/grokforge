import { describe, expect, it } from 'vitest'
import { PLAN_PROFILE } from '../../profile/plan-profile'
import { getToolSchemas } from '../tools'

describe('plan profile tool schemas', () => {
  it('exposes only list_files and read_file', () => {
    const schemas = getToolSchemas(PLAN_PROFILE)
    const names = schemas.map((s) => s.function.name).sort()
    expect(names).toEqual(['list_files', 'read_file'])
  })
})