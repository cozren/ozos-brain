import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Timeline } from '../components/Timeline'
import { PersonCard } from '../components/PersonCard'
import { AddPersonButton } from '../components/AddPersonButton'
import { api } from '../api'
import type { CyclesData, PersonMeta } from '../types'

export function PeopleHub() {
  const [cycles, setCycles] = useState<CyclesData | null>(null)
  const [selectedCycle, setSelectedCycle] = useState<string>('')
  const [people, setPeople] = useState<PersonMeta[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.getCycles(), api.getPeople()])
      .then(([c, p]) => {
        setCycles(c)
        setSelectedCycle(c.active_cycle)
        setPeople(p)
      })
      .catch(() => setError('Cannot reach backend at localhost:8765 — is it running?'))
  }, [])

  const handleEventUpdate = async (
    cycleId: string,
    eventId: string,
    start: string,
    end: string
  ) => {
    await api.updateEvent(cycleId, eventId, start, end)
    const updated = await api.getCycles()
    setCycles(updated)
  }

  const handleCycleRename = async (cycleId: string, name: string) => {
    const updated = await api.updateCycleName(cycleId, name)
    setCycles(updated)
  }

  // Create a global cycle, then switch the whole page to it.
  const handleCreateCycle = async (name: string, type: string) => {
    const before = cycles ? Object.keys(cycles.cycles) : []
    const updated = await api.createGlobalCycle(name, type)
    setCycles(updated)
    const created = Object.keys(updated.cycles).find((id) => !before.includes(id))
    if (created) setSelectedCycle(created)
  }

  // Delete a global cycle (definition + every person's folder), then switch away.
  const handleDeleteCycle = async (cycleId: string) => {
    const c = cycles?.cycles[cycleId]
    if (!confirm(`Delete cycle "${c?.name ?? cycleId}" for everyone? This cannot be undone.`))
      return
    const updated = await api.deleteGlobalCycle(cycleId)
    setCycles(updated)
    if (selectedCycle === cycleId) setSelectedCycle(updated.active_cycle)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageHeader
        title="People Hub"
        subtitle="Team cycles, performance reviews, and 1:1s."
        icon={<Users size={44} strokeWidth={1.5} />}
      />
      <main
        style={{
          flex: 1,
          padding: '0 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {error && (
          <div
            style={{
              padding: '12px 16px',
              border: '1px solid rgba(255,0,0,0.4)',
              color: '#FF6B6B',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              background: 'rgba(255,0,0,0.06)',
            }}
          >
            ⚠ {error}
          </div>
        )}
        {cycles && selectedCycle && (
          <Timeline
            cycles={cycles}
            selectedId={selectedCycle}
            onSelectCycle={setSelectedCycle}
            onCreate={handleCreateCycle}
            onDelete={handleDeleteCycle}
            onEventUpdate={handleEventUpdate}
            onCycleRename={handleCycleRename}
          />
        )}
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            overflowX: 'auto',
            paddingBottom: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 16, flex: 1, minWidth: 0 }}>
            {cycles &&
              people.map((person) => (
                <PersonCard
                  key={person.name}
                  person={person}
                  selectedCycle={selectedCycle}
                  onDelete={async () => {
                    await api.deletePerson(person.name)
                    setPeople((p) => p.filter((x) => x.name !== person.name))
                  }}
                />
              ))}
          </div>
          <AddPersonButton
            onAdd={async (p) => {
              await api.addPerson(p)
              const updated = await api.getPeople()
              setPeople(updated)
            }}
          />
        </div>
      </main>
    </div>
  )
}
