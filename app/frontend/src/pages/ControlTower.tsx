// frontend/src/pages/ControlTower.tsx
import { TowerControl } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

export function ControlTower() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageHeader
        title="Control Tower"
        subtitle="Command center — content coming soon."
        icon={<TowerControl size={44} strokeWidth={1.5} />}
      />
    </div>
  )
}
