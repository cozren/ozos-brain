import { useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlignLeft, AlignCenter, AlignRight, GripHorizontal, Plus } from 'lucide-react'
import type { LoadoutRow, LoadoutTile, RowAlign } from '../../types/loadout'
import { DEFAULT_TILE_W, DEFAULT_TILE_H } from '../../types/loadout'
import '../../styles/loadout.css'

const ROW_ALIGNS: RowAlign[] = ['left', 'center', 'right']

// 1 column ≈ 96px + 16px margin; one row-unit = 30px. Matches the old canvases.
const COL_PX = 96
const MARGIN = 16
const ROW_UNIT = 30
const MIN_W = 2
const MIN_H = 4

let idCounter = 0
function uid(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}-${performance.now().toFixed(0)}`
}

function newTile(): LoadoutTile {
  return { i: uid('tile'), refId: null, w: DEFAULT_TILE_W, h: DEFAULT_TILE_H }
}

function tilePx(w: number): number {
  return w * COL_PX + (w - 1) * MARGIN
}

// Pure, testable move: pull `tileId` out of whatever row it's in and insert it
// into `toRowId`, before `targetTileId` (or appended if targetTileId is null).
// Used by both the within-row reorder and cross-row drop paths.
export function moveTile(
  rows: LoadoutRow[],
  tileId: string,
  toRowId: string,
  targetTileId: string | null
): LoadoutRow[] {
  const fromRow = rows.find((r) => r.tiles.some((t) => t.i === tileId))
  if (!fromRow) return rows
  const tile = fromRow.tiles.find((t) => t.i === tileId)!

  // Reorder within the same row via arrayMove for stable index handling.
  if (fromRow.id === toRowId) {
    const from = fromRow.tiles.findIndex((t) => t.i === tileId)
    const to =
      targetTileId === null
        ? fromRow.tiles.length - 1
        : fromRow.tiles.findIndex((t) => t.i === targetTileId)
    if (from === -1 || to === -1) return rows
    const reordered = arrayMove(fromRow.tiles, from, to)
    return rows.map((r) => (r.id === toRowId ? { ...r, tiles: reordered } : r))
  }

  // Cross-row: remove from source, insert into target.
  return rows.map((r) => {
    if (r.id === fromRow.id) {
      return { ...r, tiles: r.tiles.filter((t) => t.i !== tileId) }
    }
    if (r.id === toRowId) {
      const idx =
        targetTileId === null ? r.tiles.length : r.tiles.findIndex((t) => t.i === targetTileId)
      const at = idx === -1 ? r.tiles.length : idx
      const tiles = [...r.tiles]
      tiles.splice(at, 0, tile)
      return { ...r, tiles }
    }
    return r
  })
}

// Pure: set a row's alignment (left/center/right). Used by the align-zone drop.
export function setRowAlign(rows: LoadoutRow[], rowId: string, align: RowAlign): LoadoutRow[] {
  return rows.map((r) => (r.id === rowId ? { ...r, align } : r))
}

// Parse an align-zone droppable id ("align:<rowId>:<align>") back into its row
// and alignment; null for any other droppable id or an unknown alignment.
export function parseAlignZone(overId: string): { rowId: string; align: RowAlign } | null {
  if (!overId.startsWith('align:')) return null
  const rest = overId.slice('align:'.length)
  const sep = rest.lastIndexOf(':')
  if (sep <= 0) return null
  const rowId = rest.slice(0, sep)
  const align = rest.slice(sep + 1)
  return ROW_ALIGNS.includes(align as RowAlign) ? { rowId, align: align as RowAlign } : null
}

// Alignment drop zones sit in a thin strip at the top of each row while
// dragging. Give them priority when the pointer is over that strip (drop =
// re-align the row); otherwise defer to the tiles beneath for reordering.
const alignAwareCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const alignHit = hits.find((c) => String(c.id).startsWith('align:'))
  if (alignHit) return [alignHit]
  const tileHits = hits.filter((c) => !String(c.id).startsWith('align:'))
  if (tileHits.length) return tileHits
  return closestCenter(args)
}

interface SortableTileProps {
  tile: LoadoutTile
  onPick: (id: string) => void
  onRemove: () => void
  onResize: (w: number, h: number) => void
  renderTile: LoadoutCanvasProps['renderTile']
}

function SortableTile({ tile, onPick, onRemove, onResize, renderTile }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.i,
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    width: tilePx(tile.w),
    height: tile.h * ROW_UNIT,
    opacity: isDragging ? 0.4 : 1,
  }

  function startResize(e: React.PointerEvent) {
    // Keep dnd-kit's pointer sensor out of it — this is a resize, not a drag.
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = tile.w
    const startH = tile.h

    function onMove(ev: PointerEvent) {
      const dCols = Math.round((ev.clientX - startX) / (COL_PX + MARGIN))
      const dRows = Math.round((ev.clientY - startY) / ROW_UNIT)
      const w = Math.max(MIN_W, startW + dCols)
      const h = Math.max(MIN_H, startH + dRows)
      onResize(w, h)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="loadout-tile" ref={setNodeRef} style={style}>
      {/* Corner grip instead of a full-width bar: sits on the same line as the
          tile's own header (title / remove X) so drag chrome costs no height. */}
      <div className="loadout-tile__grip" aria-label="Drag tile" {...attributes} {...listeners}>
        <GripHorizontal size={12} />
      </div>
      <div className="loadout-tile__body">{renderTile(tile.refId, { onPick, onRemove })}</div>
      <div
        className="loadout-tile__resize"
        data-testid={`resize-${tile.i}`}
        onPointerDown={startResize}
        aria-label="Resize tile"
        role="separator"
      />
    </div>
  )
}

export interface LoadoutCanvasProps {
  rows: LoadoutRow[]
  onChange: (rows: LoadoutRow[]) => void
  renderTile: (
    refId: string | null,
    helpers: { onPick: (id: string) => void; onRemove: () => void }
  ) => ReactNode
}

export function LoadoutCanvas({ rows: rowsProp, onChange, renderTile }: LoadoutCanvasProps) {
  // Empty rows (e.g. persisted after their last tile was removed by an older
  // build) are invisible shells on the board — drop them up front so every
  // mutation below also writes back a cleaned layout.
  const rows = rowsProp.filter((r) => r.tiles.length > 0)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Map tile id → row id so onDragEnd can resolve which row a dragged tile is in.
  const tileRow = useRef(new Map<string, string>())
  tileRow.current = new Map()
  for (const r of rows) for (const t of r.tiles) tileRow.current.set(t.i, r.id)

  // Activation constraint so a small move (or the resize handle) doesn't start
  // a drag; the handle also stops propagation.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function addFirst() {
    onChange([{ id: uid('row'), tiles: [newTile()] }])
  }

  function addTileToRow(rowId: string) {
    onChange(rows.map((r) => (r.id === rowId ? { ...r, tiles: [...r.tiles, newTile()] } : r)))
  }

  function appendRow() {
    onChange([...rows, { id: uid('row'), tiles: [newTile()] }])
  }

  function pick(rowId: string, tileI: string, refId: string) {
    onChange(
      rows.map((r) =>
        r.id === rowId
          ? { ...r, tiles: r.tiles.map((t) => (t.i === tileI ? { ...t, refId } : t)) }
          : r
      )
    )
  }

  function remove(rowId: string, tileI: string) {
    // A row that just lost its last tile goes with it — no empty shells.
    onChange(
      rows
        .map((r) => (r.id === rowId ? { ...r, tiles: r.tiles.filter((t) => t.i !== tileI) } : r))
        .filter((r) => r.tiles.length > 0)
    )
  }

  function resize(rowId: string, tileI: string, w: number, h: number) {
    onChange(
      rows.map((r) =>
        r.id === rowId
          ? { ...r, tiles: r.tiles.map((t) => (t.i === tileI ? { ...t, w, h } : t)) }
          : r
      )
    )
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const tileId = String(active.id)
    const overId = String(over.id)
    if (tileId === overId) return

    // Dropped on a row's alignment zone: move the tile into that row (append)
    // and set the row's alignment from which zone (left/center/right) it hit.
    const zone = parseAlignZone(overId)
    if (zone) {
      const moved = moveTile(rows, tileId, zone.rowId, null)
      const next = setRowAlign(moved, zone.rowId, zone.align)
      onChange(next.filter((r) => r.tiles.length > 0))
      return
    }

    // Otherwise `over` is either another tile id or a row container id.
    let toRowId: string
    let targetTileId: string | null
    if (overId.startsWith('row-zone:')) {
      toRowId = overId.slice('row-zone:'.length)
      targetTileId = null
    } else {
      toRowId = tileRow.current.get(overId) ?? tileRow.current.get(tileId)!
      targetTileId = overId
    }
    const next = moveTile(rows, tileId, toRowId, targetTileId)
    // Dragging the only tile out of a row leaves an empty shell — drop it.
    if (next !== rows) onChange(next.filter((r) => r.tiles.length > 0))
  }

  if (rows.length === 0) {
    return (
      <div className="loadout-canvas loadout-canvas--empty">
        <button className="loadout-add-big" onClick={addFirst} aria-label="Add first tile">
          <Plus size={40} />
        </button>
      </div>
    )
  }

  return (
    <div className="loadout-canvas">
      <DndContext
        sensors={sensors}
        collisionDetection={alignAwareCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {rows.map((row) => (
          <RowZone
            key={row.id}
            rowId={row.id}
            align={row.align ?? 'center'}
            active={activeId !== null}
          >
            <SortableContext
              items={row.tiles.map((t) => t.i)}
              strategy={horizontalListSortingStrategy}
            >
              {row.tiles.map((tile) => (
                <SortableTile
                  key={tile.i}
                  tile={tile}
                  renderTile={renderTile}
                  onPick={(id) => pick(row.id, tile.i, id)}
                  onRemove={() => remove(row.id, tile.i)}
                  onResize={(w, h) => resize(row.id, tile.i, w, h)}
                />
              ))}
            </SortableContext>
            <button
              className="loadout-add-tile"
              onClick={() => addTileToRow(row.id)}
              aria-label="Add tile to row"
            >
              <Plus size={20} />
            </button>
          </RowZone>
        ))}

        <button className="loadout-add-row" onClick={appendRow} aria-label="Add row">
          <Plus size={16} /> Add row
        </button>
      </DndContext>
    </div>
  )
}

// A row is a droppable container (zone id "row-zone:<rowId>"); tiles inside it
// are sortable items. Dropping onto the zone (vs. a tile) appends to the row.
// While dragging, a thin strip of three alignment drop zones appears at the top
// — dropping onto one moves the tile in AND left/center/right-aligns the row.
function RowZone({
  rowId,
  align,
  active,
  children,
}: {
  rowId: string
  align: RowAlign
  active: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row-zone:${rowId}` })
  return (
    <div
      ref={setNodeRef}
      className={`loadout-row${isOver && active ? ' is-over' : ''}`}
      data-row-id={rowId}
      data-align={align}
    >
      {active && (
        <div className="loadout-align-bar" aria-hidden>
          {ROW_ALIGNS.map((pos) => (
            <AlignZone key={pos} rowId={rowId} pos={pos} current={align} />
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight }

// One of the three drop targets in a row's alignment strip. Highlights while
// hovered (drop target) and marks the row's current alignment.
function AlignZone({ rowId, pos, current }: { rowId: string; pos: RowAlign; current: RowAlign }) {
  const { setNodeRef, isOver } = useDroppable({ id: `align:${rowId}:${pos}` })
  const Icon = ALIGN_ICON[pos]
  return (
    <div
      ref={setNodeRef}
      className={`loadout-align-zone${isOver ? ' is-over' : ''}${
        current === pos ? ' is-current' : ''
      }`}
    >
      <Icon size={14} />
      {pos}
    </div>
  )
}
