import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import type { Task, ReviewGoalTask, AnyTask } from '../types/tasks'
import { isReviewGoal } from '../types/tasks'
import {
  filterByLabel,
  colorFor,
  reorderById,
  splitByDone,
  sortByCompletedDesc,
} from '../lib/tasks'
import { TaskItem, type TaskPatch } from './tasks/TaskItem'
import { AddTask } from './tasks/AddTask'
import { ColorPopover } from './tasks/ColorPopover'

const CYAN = 'var(--neon-cyan)'

export function PersonalTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<ReviewGoalTask[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [labelColors, setLabelColors] = useState<Record<string, string>>({})
  const [active, setActive] = useState<string | null>(null)
  const [recoloring, setRecoloring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null) // task being dragged
  const [overId, setOverId] = useState<string | null>(null) // task hovered as drop target
  const [completedView, setCompletedView] = useState(false) // "Completed" filter chip selected
  const [completedOpen, setCompletedOpen] = useState(false) // Completed backlog expanded

  const load = useCallback(() => {
    setError(null)
    api
      .getTasks()
      .then((d) => {
        setTasks(d.tasks)
        setGoals(d.reviewGoals)
        setLabels(d.labels)
        setLabelColors(d.labelColors)
        setLoaded(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load tasks'))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // Patch routes to the right endpoint; on success we reconcile locally, on failure reload.
  const patch = (item: AnyTask, fields: TaskPatch) => {
    if (isReviewGoal(item)) {
      const { title, description, done, subtasks, plan } = fields
      api
        .updateReviewGoal(item.cycle, item.index, { title, description, done, subtasks, plan })
        .then((g: ReviewGoalTask) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
        .catch(load)
    } else {
      api
        .updateTask(item.id, fields)
        .then((t: Task) => {
          setTasks((ts) => ts.map((x) => (x.id === t.id ? t : x)))
          refreshLabels()
        })
        .catch(load)
    }
  }

  const create = (title: string, description: string, ls: string[]) =>
    api
      .createTask(title, description, ls)
      .then((t: Task) => {
        setTasks((ts) => [...ts, t])
        refreshLabels()
      })
      .catch(load)

  const remove = (id: string) =>
    api
      .deleteTask(id)
      .then(() => {
        setTasks((ts) => ts.filter((t) => t.id !== id))
        refreshLabels()
      })
      .catch(load)

  // Drag-to-reorder own tasks. Reordering operates on the full `tasks` array
  // (so it holds even under a label filter, where only a subset is on screen);
  // review goals aren't in `tasks` and can't be dragged. Optimistic, with a
  // single persisted id-order; reload on failure.
  const endDrag = () => {
    setDragId(null)
    setOverId(null)
  }
  const reorder = (fromId: string, toId: string) => {
    const next = reorderById(tasks, fromId, toId)
    if (next === tasks) return
    setTasks(next)
    api.reorderTasks(next.map((t) => t.id)).catch(load)
  }

  // Labels (and their auto-assigned colors) are derived server-side; simplest
  // correct refresh is a reload of the list payload.
  const refreshLabels = () =>
    api
      .getTasks()
      .then((d) => {
        setLabels(d.labels)
        setLabelColors(d.labelColors)
      })
      .catch(() => {})

  // Recolor a label everywhere — write-through then merge the returned map.
  const recolor = (label: string, color: string) => {
    setRecoloring(null)
    api
      .setLabelColor(label, color)
      .then((d) => setLabelColors(d.labelColors))
      .catch(() => {})
  }

  if (error) {
    return (
      <div
        style={{
          border: '1px solid rgba(245,90,90,0.4)',
          borderRadius: 10,
          padding: 20,
          color: '#f8a0a0',
          fontFamily: 'var(--font-mono)',
          fontSize: 13.5,
        }}
      >
        Couldn’t load tasks: {error}
        <button
          onClick={load}
          style={{
            marginLeft: 12,
            background: 'none',
            border: `1px solid ${CYAN}`,
            color: CYAN,
            borderRadius: 6,
            padding: '5px 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 12,
          }}
        >
          retry
        </button>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div
        style={{ color: '#9fb6cc', fontFamily: 'var(--font-mono)', fontSize: 13.5, padding: 20 }}
      >
        Loading tasks…
      </div>
    )
  }

  const all: AnyTask[] = [...tasks, ...goals]
  // Active list vs Completed backlog, both within the current label filter.
  const scope = filterByLabel(all, active)
  const { active: activeTasks, completed: completedTasks } = splitByDone(scope)
  const completedCount = all.filter((i) => i.done).length // for the chip badge (all labels)
  const allCompleted = sortByCompletedDesc(all.filter((i) => i.done)) // the Completed-only view

  // One card; reorder handle only on own (non-review) ACTIVE tasks.
  const renderCard = (item: AnyTask, withDrag: boolean) => (
    <TaskItem
      key={item.id}
      item={item}
      allLabels={labels}
      labelColors={labelColors}
      onPatch={(f) => patch(item, f)}
      onDelete={isReviewGoal(item) ? undefined : () => remove(item.id)}
      drag={
        withDrag && !isReviewGoal(item)
          ? {
              dragging: dragId === item.id,
              dropTarget: overId === item.id && dragId !== null && dragId !== item.id,
              onDragStart: () => setDragId(item.id),
              onDragOver: () => {
                if (dragId && dragId !== item.id) setOverId(item.id)
              },
              onDrop: () => {
                if (dragId) reorder(dragId, item.id)
                endDrag()
              },
              onDragEnd: endDrag,
            }
          : undefined
      }
    />
  )

  const emptyBox = (text: string) => (
    <div
      style={{
        fontSize: 13.5,
        color: '#9fb6cc',
        padding: 30,
        textAlign: 'center',
        border: '1px dashed #2a3f57',
        borderRadius: 10,
      }}
    >
      {text}
    </div>
  )

  const chip = (label: string | null, text: string) => {
    const on = !completedView && active === label
    const dot = label ? colorFor(label, labelColors) : null
    const editable = !!label
    return (
      <span
        key={text}
        onClick={() => {
          setActive(label)
          setCompletedView(false)
        }}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          borderRadius: 18,
          padding: '7px 15px',
          cursor: 'pointer',
          color: on ? '#7fe3ff' : '#9fb6cc',
          border: `1px solid ${on ? 'rgba(45,212,255,0.6)' : '#2a3f57'}`,
          background: on ? 'rgba(45,212,255,0.12)' : 'transparent',
          textShadow: on ? '0 0 7px rgba(45,212,255,0.4)' : 'none',
        }}
      >
        {dot && (
          <span
            onClick={
              editable
                ? (e) => {
                    e.stopPropagation()
                    setRecoloring((r) => (r === label ? null : label))
                  }
                : undefined
            }
            title={editable ? 'change color' : undefined}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: dot,
              flexShrink: 0,
              cursor: editable ? 'pointer' : 'default',
              boxShadow: `0 0 5px ${dot}`,
            }}
          />
        )}
        {text}
        {recoloring === label && label && (
          <ColorPopover
            current={dot ?? ''}
            onPick={(c) => recolor(label, c)}
            onClose={() => setRecoloring(null)}
          />
        )}
      </span>
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {chip(null, `All (${all.length})`)}
        {labels.map((l) => chip(l, l))}
        {completedCount > 0 && (
          <span
            onClick={() => setCompletedView((v) => !v)}
            title="show completed tasks"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
              borderRadius: 18,
              padding: '7px 15px',
              cursor: 'pointer',
              color: completedView ? '#9bffc4' : '#9fb6cc',
              border: `1px solid ${completedView ? 'rgba(0,255,136,0.6)' : '#2a3f57'}`,
              background: completedView ? 'rgba(0,255,136,0.12)' : 'transparent',
              textShadow: completedView ? '0 0 7px rgba(0,255,136,0.4)' : 'none',
            }}
          >
            <span style={{ color: '#00ff88' }}>✓</span> Completed ({completedCount})
          </span>
        )}
      </div>

      {!completedView && <AddTask allLabels={labels} labelColors={labelColors} onCreate={create} />}

      {completedView ? (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 2,
              color: '#5fcf8a',
              margin: '4px 0 12px',
            }}
          >
            COMPLETED · {allCompleted.length} DONE
          </div>
          {allCompleted.length === 0
            ? emptyBox('Nothing completed yet.')
            : allCompleted.map((i) => renderCard(i, false))}
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 2,
              color: '#62b4e6',
              margin: '4px 0 12px',
            }}
          >
            {active ? `“${active.toUpperCase()}”` : 'ALL TASKS'} · {activeTasks.length} OPEN /{' '}
            {scope.length} TOTAL
          </div>

          {scope.length === 0 ? (
            emptyBox(
              active ? `No tasks tagged “${active}”.` : 'No tasks yet — add your first one above.'
            )
          ) : (
            <>
              {activeTasks.map((i) => renderCard(i, true))}

              {completedTasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    onClick={() => setCompletedOpen((o) => !o)}
                    title={completedOpen ? 'collapse' : 'expand'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '7px 4px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 2,
                      color: '#5fcf8a',
                    }}
                  >
                    <span
                      style={{
                        color: '#3f9ad4',
                        fontSize: 10,
                        transform: completedOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform 200ms',
                      }}
                    >
                      ▶
                    </span>
                    <span style={{ color: '#00ff88' }}>✓</span>
                    COMPLETED · {completedTasks.length}
                  </div>
                  {completedOpen && (
                    <div style={{ marginTop: 8 }}>
                      {sortByCompletedDesc(completedTasks).map((i) => renderCard(i, false))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
