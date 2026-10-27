import { describe, test, expect } from 'vitest'
import { STATUS_COLOR, STATUS_LABEL, sortGoals, statusCounts } from '../goals'
import type { Goal, GoalStatus } from '../../types/goals'

const goal = (id: string, status: GoalStatus, title = id): Goal => ({
  id,
  title,
  description: '',
  owner: '',
  status,
  progress: null,
  target_date: '',
  source: 'manual',
  external_id: null,
  data_point_id: null,
  updated_at: null,
  synced_at: null,
})

describe('goal status helpers', () => {
  test('every status has a label and a colour', () => {
    const all: GoalStatus[] = [
      'on_track',
      'at_risk',
      'off_track',
      'complete',
      'cancelled',
      'pending',
    ]
    for (const s of all) {
      expect(STATUS_LABEL[s]).toBeTruthy()
      expect(STATUS_COLOR[s]).toBeTruthy()
    }
    expect(STATUS_LABEL.on_track).toBe('On track')
    expect(STATUS_LABEL.at_risk).toBe('At risk')
    expect(STATUS_LABEL.off_track).toBe('Off track')
  })

  test('sortGoals puts off track first, then at risk, pending, on track, complete, cancelled, then by title', () => {
    const sorted = sortGoals([
      goal('z', 'complete'),
      goal('b', 'on_track', 'Beta'),
      goal('a', 'on_track', 'Alpha'),
      goal('c', 'cancelled'),
      goal('p', 'pending'),
      goal('r', 'at_risk'),
      goal('o', 'off_track'),
    ])
    expect(sorted.map((g) => g.id)).toEqual(['o', 'r', 'p', 'a', 'b', 'z', 'c'])
  })

  test('statusCounts counts every status, zero included', () => {
    const counts = statusCounts([
      goal('a', 'on_track'),
      goal('b', 'on_track'),
      goal('c', 'at_risk'),
    ])
    expect(counts.on_track).toBe(2)
    expect(counts.at_risk).toBe(1)
    expect(counts.off_track).toBe(0)
  })
})
