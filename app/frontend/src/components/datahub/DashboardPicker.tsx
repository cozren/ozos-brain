import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, ChevronDown, FolderPlus, Trash2, GripVertical, X } from 'lucide-react'
import { DASHBOARDS, type DashboardDef } from './dashboards/registry'
import {
  organizePicker,
  createFolder,
  renameFolder,
  deleteFolder,
  moveDashboard,
  type PickerFoldersConfig,
} from './dashboards/pickerFolders'
import '../../styles/dashboard-picker.css'

interface DashboardPickerProps {
  folders: PickerFoldersConfig
  onFoldersChange: (next: PickerFoldersConfig) => void
  onPick: (id: string) => void
}

// A drag target is resolved to a category + folder (null = loose) + insert index.
interface Container {
  category: string
  folderId: string | null
}

const FOLDER_PREFIX = 'fld::'
const LOOSE_PREFIX = 'loose::'

const containerId = (c: Container) =>
  c.folderId === null
    ? `${LOOSE_PREFIX}${c.category}`
    : `${FOLDER_PREFIX}${c.category}::${c.folderId}`

function parseContainerId(id: string): Container | null {
  if (id.startsWith(LOOSE_PREFIX))
    return { category: id.slice(LOOSE_PREFIX.length), folderId: null }
  if (id.startsWith(FOLDER_PREFIX)) {
    const [category, folderId] = id.slice(FOLDER_PREFIX.length).split('::')
    return { category, folderId }
  }
  return null
}

function newFolderId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return `fld-${c.randomUUID().slice(0, 8)}`
  return `fld-${Date.now().toString(36)}`
}

export function DashboardPicker({ folders, onFoldersChange, onPick }: DashboardPickerProps) {
  const organized = useMemo(() => organizePicker(DASHBOARDS, folders), [folders])

  // Everything is collapsed on open — expand state is intentionally not persisted.
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Map every dashboard id to the container it currently lives in, so a drag can
  // resolve its source and (via the item under the cursor) its target container.
  const itemContainer = useMemo(() => {
    const map = new Map<string, Container>()
    for (const cat of organized) {
      for (const f of cat.folders)
        for (const d of f.dashboards) map.set(d.id, { category: cat.category, folderId: f.id })
      for (const d of cat.loose) map.set(d.id, { category: cat.category, folderId: null })
    }
    return map
  }, [organized])

  const indexInContainer = (target: Container, dashboardId: string): number => {
    const cat = organized.find((c) => c.category === target.category)
    if (!cat) return 0
    const list =
      target.folderId === null
        ? cat.loose
        : (cat.folders.find((f) => f.id === target.folderId)?.dashboards ?? [])
    const at = list.findIndex((d) => d.id === dashboardId)
    return at === -1 ? list.length : at
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const source = itemContainer.get(activeId)
    if (!source || !e.over) return

    const overId = String(e.over.id)
    // `over` is either another dashboard (item) or an empty container drop zone.
    const overContainer = parseContainerId(overId)
    const target = overContainer ?? itemContainer.get(overId)
    if (!target) return

    // Sub-folders are scoped to their category — ignore cross-category drops.
    if (target.category !== source.category) return

    const index = overContainer ? Number.MAX_SAFE_INTEGER : indexInContainer(target, overId)
    onFoldersChange(moveDashboard(folders, source.category, activeId, target.folderId, index))
  }

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  return (
    <div className="dhp" role="menu">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {organized.map((cat) => {
          const catOpen = openCats.has(cat.category)
          return (
            <section key={cat.category} className="dhp__cat">
              <div className="dhp__cat-head">
                <button
                  className="dhp__disclose"
                  onClick={() => toggle(openCats, cat.category, setOpenCats)}
                  aria-expanded={catOpen}
                >
                  {catOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="dhp__cat-name">{cat.category}</span>
                </button>
                {catOpen && (
                  <NewFolderButton
                    onCreate={(name) =>
                      onFoldersChange(createFolder(folders, cat.category, name, newFolderId()))
                    }
                  />
                )}
              </div>

              {catOpen && (
                <div className="dhp__cat-body">
                  {cat.folders.map((folder) => (
                    <FolderSection
                      key={folder.id}
                      category={cat.category}
                      folderId={folder.id}
                      name={folder.name}
                      dashboards={folder.dashboards}
                      open={openFolders.has(folder.id)}
                      onToggle={() => toggle(openFolders, folder.id, setOpenFolders)}
                      onRename={(name) =>
                        onFoldersChange(renameFolder(folders, cat.category, folder.id, name))
                      }
                      onDelete={() =>
                        onFoldersChange(deleteFolder(folders, cat.category, folder.id))
                      }
                      onPick={onPick}
                    />
                  ))}
                  <LooseZone category={cat.category} dashboards={cat.loose} onPick={onPick} />
                </div>
              )}
            </section>
          )
        })}
      </DndContext>
    </div>
  )
}

// ── Sub-folder ────────────────────────────────────────────────────────────────

interface FolderSectionProps {
  category: string
  folderId: string
  name: string
  dashboards: DashboardDef[]
  open: boolean
  onToggle: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onPick: (id: string) => void
}

function FolderSection(props: FolderSectionProps) {
  const { category, folderId, name, dashboards, open, onToggle, onRename, onDelete, onPick } = props
  const [editing, setEditing] = useState(false)
  // The whole folder is a drop zone so a dashboard can be filed even while collapsed.
  const { setNodeRef, isOver } = useDroppable({ id: containerId({ category, folderId }) })

  return (
    <div
      ref={setNodeRef}
      className={`dhp__folder${isOver ? ' dhp__folder--over' : ''}`}
      data-testid={`folder-${folderId}`}
    >
      <div className="dhp__folder-head">
        <button className="dhp__disclose" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {editing ? (
            <InlineName
              initial={name}
              onCommit={(n) => {
                onRename(n)
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span className="dhp__folder-name" onDoubleClick={() => setEditing(true)}>
              {name || 'Untitled'}{' '}
              <span className="dhp__count" aria-hidden="true">
                {dashboards.length}
              </span>
            </span>
          )}
        </button>
        <button
          className="dhp__icon-btn"
          onClick={onDelete}
          title="Delete folder (its dashboards return to loose)"
          aria-label={`Delete folder ${name}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {open && (
        <div className="dhp__folder-body">
          <SortableContext
            items={dashboards.map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            {dashboards.map((d) => (
              <DashboardRow key={d.id} def={d} onPick={onPick} />
            ))}
          </SortableContext>
          {dashboards.length === 0 && <div className="dhp__empty">Drag dashboards here</div>}
        </div>
      )}
    </div>
  )
}

// ── Loose (unfiled) dashboards for a category ─────────────────────────────────

function LooseZone({
  category,
  dashboards,
  onPick,
}: {
  category: string
  dashboards: DashboardDef[]
  onPick: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId({ category, folderId: null }) })
  return (
    <div
      ref={setNodeRef}
      className={`dhp__loose${isOver ? ' dhp__loose--over' : ''}`}
      data-testid={`loose-${category}`}
    >
      <SortableContext items={dashboards.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        {dashboards.map((d) => (
          <DashboardRow key={d.id} def={d} onPick={onPick} />
        ))}
      </SortableContext>
    </div>
  )
}

// ── A single draggable / clickable dashboard row ──────────────────────────────

function DashboardRow({ def, onPick }: { def: DashboardDef; onPick: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: def.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="dhp__row">
      <span className="dhp__grip" {...attributes} {...listeners} aria-label="Drag to reorder">
        <GripVertical size={13} />
      </span>
      <button className="dhp__pick" onClick={() => onPick(def.id)}>
        {def.label}
      </button>
    </div>
  )
}

// ── Inline text entry for creating / renaming a folder ────────────────────────

function InlineName({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const commit = () => {
    const trimmed = value.trim()
    if (trimmed) onCommit(trimmed)
    else onCancel()
  }
  return (
    <input
      className="dhp__input"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={commit}
      aria-label="Folder name"
    />
  )
}

function NewFolderButton({ onCreate }: { onCreate: (name: string) => void }) {
  const [adding, setAdding] = useState(false)
  if (adding) {
    return (
      <div className="dhp__new-folder">
        <InlineName
          initial=""
          onCommit={(n) => {
            onCreate(n)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
        <button
          className="dhp__icon-btn"
          onClick={() => setAdding(false)}
          aria-label="Cancel new folder"
        >
          <X size={13} />
        </button>
      </div>
    )
  }
  return (
    <button
      className="dhp__icon-btn"
      onClick={() => setAdding(true)}
      title="New sub-folder"
      aria-label="New sub-folder"
    >
      <FolderPlus size={14} />
    </button>
  )
}
