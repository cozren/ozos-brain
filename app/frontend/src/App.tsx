import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Home } from './pages/Home'
import { PeopleHub } from './pages/PeopleHub'
import { ControlTower } from './pages/ControlTower'
import { SystemHealth } from './pages/SystemHealth'
import { GoalsTasks } from './pages/GoalsTasks'
import { KnowledgeHub } from './pages/KnowledgeHub'
import { DataHub } from './pages/DataHub'
import { Reporting } from './pages/Reporting'
import { FloatingChat } from './components/chat/FloatingChat'
import { resolveInitialPage } from './lib/initial-page'
import type { Page, NavState } from './components/Sidebar'

const STORAGE_KEY_PAGE = 'ozos-brain-page'
const STORAGE_KEY_NAV = 'ozos-brain-nav-state'

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    resolveInitialPage(window.location.search, localStorage.getItem(STORAGE_KEY_PAGE))
  )
  const [navState, setNavState] = useState<NavState>(
    () => (Number(localStorage.getItem(STORAGE_KEY_NAV)) as NavState) || 1
  )

  // `?page=` is a one-shot launch hint (see resolveInitialPage). Drop it once
  // applied so a later reload restores wherever the user navigated to instead.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('page')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PAGE, page)
  }, [page])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NAV, String(navState))
  }, [navState])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        navState={navState}
        onNavStateChange={setNavState}
      />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {page === 'home' && <Home />}
        {page === 'people-hub' && <PeopleHub />}
        {page === 'control-tower' && <ControlTower />}
        {page === 'system-health' && <SystemHealth />}
        {page === 'knowledge-hub' && <KnowledgeHub />}
        {page === 'data-hub' && <DataHub />}
        {page === 'reporting' && <Reporting />}
        {page === 'goals-tasks' && <GoalsTasks />}
      </main>
      <FloatingChat page={page} />
    </div>
  )
}
