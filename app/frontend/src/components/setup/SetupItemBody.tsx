import { useEffect, useState } from 'react'
import type { GmailStatus, RoutingPayload, SetupCadence, SetupItem } from '../../types/setup'
import { api } from '../../api'
import { StakeholderForm } from './StakeholderForm'
import { CycleForm } from './CycleForm'
import { EnvForm } from './EnvForm'
import { FolderForm } from './FolderForm'
import { RoutingForm } from './RoutingForm'
import { McpPanel } from './McpPanel'
import { GmailPanel } from './GmailPanel'
import { PlaceholderPanel } from './PlaceholderPanel'
import { GoalsPanel } from './GoalsPanel'
import { CODE, HINT } from './formStyles'

interface Props {
  item: SetupItem
  onChanged: () => void
  cadence?: SetupCadence | null
}

// Sub-rows for repeatable items (one line per person added).
function Rows({ item }: { item: SetupItem }) {
  if (item.rows.length === 0) return null
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {item.rows.map((row) => (
        <li
          key={row.id}
          style={{
            display: 'flex',
            gap: 12,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-dim)',
            paddingLeft: 10,
            borderLeft: '2px solid rgba(34,197,94,0.5)',
          }}
        >
          <span style={{ color: 'var(--text)' }}>{row.display_name}</span>
          <span>{row.id}</span>
          {row.added_at && <span>{row.added_at.slice(0, 10)}</span>}
        </li>
      ))}
    </ul>
  )
}

function ProfilePanel({ item }: { item: SetupItem }) {
  const p = item.derived?.profile
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {p?.name ? (
        <p style={{ ...HINT, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {p.name} · id {p.me}
          {p.voice_text ? ` · voice: ${p.voice_text}` : ' · no voice line yet'}
        </p>
      ) : (
        <p style={HINT}>No user config found. Run this in the engine checkout:</p>
      )}
      {!p?.name && <code style={CODE}>./ozos init</code>}
    </div>
  )
}

// Loads the env booleans once per mount; the form never sees values.
function EnvItem({ item, onChanged }: { item: SetupItem; onChanged: () => void }) {
  const [status, setStatus] = useState<Record<string, boolean>>({})
  useEffect(() => {
    api
      .getSetupEnv()
      .then(setStatus)
      .catch(() => setStatus({}))
  }, [])
  return (
    <EnvForm
      names={item.env}
      status={status}
      onSave={async (vars) => {
        const written = await api.setSetupEnv(vars)
        const next = await api.getSetupEnv().catch(() => status)
        setStatus(next)
        onChanged()
        return written
      }}
    />
  )
}

// Loads the current routing first: the form replaces the folder list on save, so
// it must start from what is there (stakeholders add team folders behind its back).
// If it cannot be loaded, no form is offered: a blank save would wipe the folders.
function RoutingItem({ onChanged }: { onChanged: () => void }) {
  const [routing, setRouting] = useState<RoutingPayload | null | undefined>(undefined)
  useEffect(() => {
    api
      .getSetupRouting()
      .then(setRouting)
      .catch(() => setRouting(null))
  }, [])
  if (routing === undefined) return <p style={HINT}>Loading routing…</p>
  if (routing === null)
    return (
      <p style={{ ...HINT, color: '#F59E0B' }}>
        Could not load the current routing; reload before editing folders.
      </p>
    )
  return (
    <RoutingForm
      routing={routing}
      onSave={async (payload) => {
        await api.setSetupRouting(payload)
        setRouting(await api.getSetupRouting().catch(() => payload))
        onChanged()
      }}
    />
  )
}

function GmailItem({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  useEffect(() => {
    api
      .getSetupGmail()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])
  return (
    <GmailPanel
      status={status}
      onSaveDrive={async (folderId) => {
        await api.setSetupRouting({ drive_parent_folder_id: folderId || null })
        setStatus(await api.getSetupGmail())
        onChanged()
      }}
    />
  )
}

// The per-kind form slot under an item row.
export function SetupItemBody({ item, onChanged, cadence }: Props) {
  switch (item.kind) {
    case 'profile':
      return <ProfilePanel item={item} />
    case 'gmail':
      return <GmailItem onChanged={onChanged} />
    case 'manual':
      return (
        <p style={HINT}>
          In a Claude Code session run <code>/sync-notes</code>; it fetches Granola meetings and
          feeds them to the notes pipeline. Mark this done once the first run succeeds.
        </p>
      )
    case 'routing':
      return <RoutingItem onChanged={onChanged} />
    case 'mcp':
      return <McpPanel item={item} />
    case 'env':
      return <EnvItem item={item} onChanged={onChanged} />
    case 'folder':
      return (
        <FolderForm
          defaultFolder={item.default_folder ?? 'drop'}
          existing={item.status === 'done' && item.notes ? item.notes : null}
          onCreate={async (folder) => {
            const entry = await api.addSetupFolder(item.id, folder)
            onChanged()
            return entry
          }}
        />
      )
    case 'people':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Rows item={item} />
          <StakeholderForm
            onSubmit={async (payload) => {
              const result = await api.addStakeholder(payload)
              onChanged()
              return result
            }}
          />
        </div>
      )
    case 'cycle':
      return (
        <CycleForm
          cadence={cadence}
          onSubmit={async (payload) => {
            const result = await api.setSetupCycle(payload)
            onChanged()
            return result
          }}
        />
      )
    case 'goals':
      return <GoalsPanel item={item} onChanged={onChanged} />
    case 'placeholder':
      return <PlaceholderPanel itemId={item.id} />
    default:
      return null
  }
}
