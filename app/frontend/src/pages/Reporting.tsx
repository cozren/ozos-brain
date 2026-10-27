import { BarChart3 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { ReportingCanvas } from '../components/reporting/ReportingCanvas'

export function Reporting() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageHeader
        title="Insights Hub"
        subtitle="Curated data, market intel and research reports"
        icon={<BarChart3 size={44} strokeWidth={1.5} />}
      />
      <ReportingCanvas />
    </div>
  )
}
