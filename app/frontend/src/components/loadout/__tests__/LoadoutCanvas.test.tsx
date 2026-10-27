import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi } from 'vitest'
import { LoadoutCanvas, moveTile, setRowAlign, parseAlignZone } from '../LoadoutCanvas'
import type { LoadoutRow } from '../../../types/loadout'
import { DEFAULT_TILE_W, DEFAULT_TILE_H } from '../../../types/loadout'

// A simple fake renderTile: shows the current refId and exposes pick/remove.
function fakeRenderTile(
  refId: string | null,
  helpers: { onPick: (id: string) => void; onRemove: () => void }
) {
  return (
    <div>
      <span>ref:{refId ?? 'empty'}</span>
      <button onClick={() => helpers.onPick('chosen')}>pick</button>
      <button onClick={helpers.onRemove}>remove</button>
    </div>
  )
}

function renderCanvas(rows: LoadoutRow[]) {
  const onChange = vi.fn()
  render(<LoadoutCanvas rows={rows} onChange={onChange} renderTile={fakeRenderTile} />)
  return onChange
}

describe('LoadoutCanvas — empty state', () => {
  test('renders exactly one + button when there are no rows', () => {
    renderCanvas([])
    const adds = screen.getAllByRole('button', { name: /add/i })
    expect(adds).toHaveLength(1)
  })

  test('clicking the empty + adds one row with one empty tile', async () => {
    const onChange = renderCanvas([])
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next).toHaveLength(1)
    expect(next[0].tiles).toHaveLength(1)
    const tile = next[0].tiles[0]
    expect(tile.refId).toBeNull()
    expect(tile.w).toBe(DEFAULT_TILE_W)
    expect(tile.h).toBe(DEFAULT_TILE_H)
    expect(typeof tile.i).toBe('string')
    expect(tile.i.length).toBeGreaterThan(0)
    expect(typeof next[0].id).toBe('string')
  })
})

describe('LoadoutCanvas — row/tile mutations', () => {
  const oneRow: LoadoutRow[] = [{ id: 'row-1', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] }]

  test('the right-edge + adds an empty tile to that row', async () => {
    const onChange = renderCanvas(oneRow)
    await userEvent.click(screen.getByRole('button', { name: /add tile/i }))

    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next).toHaveLength(1)
    expect(next[0].tiles).toHaveLength(2)
    expect(next[0].tiles[1].refId).toBeNull()
    expect(next[0].tiles[1].w).toBe(DEFAULT_TILE_W)
  })

  test('the bottom + strip appends a new row with one empty tile', async () => {
    const onChange = renderCanvas(oneRow)
    await userEvent.click(screen.getByRole('button', { name: /add row/i }))

    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next).toHaveLength(2)
    expect(next[1].tiles).toHaveLength(1)
    expect(next[1].tiles[0].refId).toBeNull()
    // The original row is preserved.
    expect(next[0].tiles[0].i).toBe('t1')
  })

  test('onPick sets the refId of the picked tile', async () => {
    const onChange = renderCanvas([{ id: 'row-1', tiles: [{ i: 't1', refId: null, w: 6, h: 10 }] }])
    await userEvent.click(screen.getByRole('button', { name: 'pick' }))

    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next[0].tiles[0].refId).toBe('chosen')
  })

  test('removing the only tile in a row removes the row itself', async () => {
    const onChange = renderCanvas([
      { id: 'row-1', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] },
      { id: 'row-2', tiles: [{ i: 't2', refId: 'b', w: 6, h: 10 }] },
    ])
    const tiles = screen.getAllByText(/^ref:/)
    const firstTile = tiles[0].closest('.loadout-tile') as HTMLElement
    await userEvent.click(within(firstTile).getByRole('button', { name: 'remove' }))

    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('row-2')
  })

  test('rows persisted with no tiles are not rendered and are dropped on the next change', async () => {
    const onChange = renderCanvas([
      { id: 'row-empty', tiles: [] },
      { id: 'row-1', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] },
    ])
    // The empty row shell is not shown on the board.
    expect(document.querySelectorAll('.loadout-row')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /add row/i }))
    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    // The stale empty row is gone; only the real row plus the new one remain.
    expect(next.map((r) => r.id)).toContain('row-1')
    expect(next.map((r) => r.id)).not.toContain('row-empty')
    expect(next).toHaveLength(2)
  })

  test('when every persisted row is empty, the big + empty state is shown', () => {
    renderCanvas([{ id: 'row-empty', tiles: [] }])
    expect(screen.getByRole('button', { name: /add first tile/i })).toBeInTheDocument()
  })

  test('onRemove removes the tile from its row', async () => {
    const onChange = renderCanvas([
      {
        id: 'row-1',
        tiles: [
          { i: 't1', refId: 'a', w: 6, h: 10 },
          { i: 't2', refId: 'b', w: 6, h: 10 },
        ],
      },
    ])
    // Remove the first tile.
    const tiles = screen.getAllByText(/^ref:/)
    expect(tiles).toHaveLength(2)
    const firstTile = tiles[0].closest('.loadout-tile') as HTMLElement
    await userEvent.click(within(firstTile).getByRole('button', { name: 'remove' }))

    const next = onChange.mock.calls[0][0] as LoadoutRow[]
    expect(next[0].tiles).toHaveLength(1)
    expect(next[0].tiles[0].i).toBe('t2')
  })
})

describe('LoadoutCanvas — tile chrome', () => {
  test('drag grip is a corner handle, not a full-width head bar', () => {
    renderCanvas([{ id: 'row-1', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] }])
    const tile = document.querySelector('.loadout-tile') as HTMLElement
    // The old full-width header row is gone…
    expect(tile.querySelector('.loadout-tile__head')).toBeNull()
    // …replaced by a small grip pinned in the tile's top-left corner.
    expect(within(tile).getByLabelText('Drag tile')).toBeInTheDocument()
  })
})

describe('LoadoutCanvas — resize', () => {
  test('dragging a tile resize handle snaps and updates w/h', async () => {
    const onChange = renderCanvas([{ id: 'row-1', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] }])

    const handle = screen.getByTestId('resize-t1')
    // Start the resize.
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      })
    )
    // Drag right + down by enough to cross at least one column / row-unit.
    // 1 col ~= 96 + 16 = 112px, 1 row-unit = 30px. Move +250x / +90y => +2 cols / +3 units.
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 350,
        clientY: 190,
        pointerId: 1,
      })
    )
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as LoadoutRow[]
    const tile = next[0].tiles[0]
    expect(tile.w).toBeGreaterThan(6)
    expect(tile.h).toBeGreaterThan(10)
  })
})

describe('moveTile — cross-row move logic', () => {
  const rows: LoadoutRow[] = [
    {
      id: 'row-1',
      tiles: [
        { i: 'a', refId: 'a', w: 6, h: 10 },
        { i: 'b', refId: 'b', w: 6, h: 10 },
      ],
    },
    { id: 'row-2', tiles: [{ i: 'c', refId: 'c', w: 6, h: 10 }] },
  ]

  test('moves a tile from one row into another row', () => {
    // Move 'a' (row-1) to be before 'c' (row-2).
    const next = moveTile(rows, 'a', 'row-2', 'c')
    expect(next[0].tiles.map((t) => t.i)).toEqual(['b'])
    expect(next[1].tiles.map((t) => t.i)).toEqual(['a', 'c'])
  })

  test('reorders a tile within the same row', () => {
    const next = moveTile(rows, 'b', 'row-1', 'a')
    expect(next[0].tiles.map((t) => t.i)).toEqual(['b', 'a'])
    expect(next[1].tiles.map((t) => t.i)).toEqual(['c'])
  })

  test('dropping onto a row container (no target tile) appends to that row', () => {
    const next = moveTile(rows, 'a', 'row-2', null)
    expect(next[0].tiles.map((t) => t.i)).toEqual(['b'])
    expect(next[1].tiles.map((t) => t.i)).toEqual(['c', 'a'])
  })

  test('returns the original rows when the tile is not found', () => {
    const next = moveTile(rows, 'zzz', 'row-2', null)
    expect(next).toBe(rows)
  })
})

describe('setRowAlign', () => {
  const rows: LoadoutRow[] = [
    { id: 'row-1', tiles: [{ i: 'a', refId: 'a', w: 6, h: 10 }] },
    { id: 'row-2', tiles: [{ i: 'b', refId: 'b', w: 6, h: 10 }] },
  ]

  test('sets alignment on the target row only', () => {
    const next = setRowAlign(rows, 'row-2', 'right')
    expect(next[0].align).toBeUndefined()
    expect(next[1].align).toBe('right')
  })

  test('overwrites an existing alignment', () => {
    const next = setRowAlign(setRowAlign(rows, 'row-1', 'left'), 'row-1', 'center')
    expect(next[0].align).toBe('center')
  })
})

describe('parseAlignZone', () => {
  test('parses an align-zone drop id into row id + alignment', () => {
    expect(parseAlignZone('align:row-1:left')).toEqual({ rowId: 'row-1', align: 'left' })
    expect(parseAlignZone('align:widget-revenue-traffic:right')).toEqual({
      rowId: 'widget-revenue-traffic',
      align: 'right',
    })
  })

  test('returns null for non-align-zone ids', () => {
    expect(parseAlignZone('row-zone:row-1')).toBeNull()
    expect(parseAlignZone('t1')).toBeNull()
    expect(parseAlignZone('align:row-1:sideways')).toBeNull()
  })
})

describe('LoadoutCanvas — row alignment', () => {
  test('a row renders its saved alignment as a data-align attribute', () => {
    renderCanvas([
      { id: 'row-1', align: 'left', tiles: [{ i: 't1', refId: 'a', w: 6, h: 10 }] },
      { id: 'row-2', align: 'right', tiles: [{ i: 't2', refId: 'b', w: 6, h: 10 }] },
      { id: 'row-3', tiles: [{ i: 't3', refId: 'c', w: 6, h: 10 }] },
    ])
    const rowEls = Array.from(document.querySelectorAll('.loadout-row')) as HTMLElement[]
    expect(rowEls[0].dataset.align).toBe('left')
    expect(rowEls[1].dataset.align).toBe('right')
    // No explicit alignment falls back to the default 'center'.
    expect(rowEls[2].dataset.align).toBe('center')
  })
})
