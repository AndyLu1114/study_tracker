import type { ReactNode } from 'react'
import { BarChart3, CalendarDays, ListTodo, Settings as SettingsIcon, Timer } from 'lucide-react'
import { useApp, type Page } from './state'
import { PlannerPage } from './pages/PlannerPage'
import { ClockPage } from './pages/ClockPage'
import { CalendarPage } from './pages/CalendarPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { MiniClock } from './pages/MiniClock'
import { SidebarTimer } from './components/SidebarTimer'
import type { MessageKey } from '../../shared/i18n'
import iconUrl from './assets/icon.svg'

const NAV: { page: Page; label: MessageKey; icon: typeof Timer }[] = [
  { page: 'planner', label: 'nav.planner', icon: ListTodo },
  { page: 'clock', label: 'nav.clock', icon: Timer },
  { page: 'calendar', label: 'nav.calendar', icon: CalendarDays },
  { page: 'stats', label: 'nav.stats', icon: BarChart3 },
  { page: 'settings', label: 'nav.settings', icon: SettingsIcon }
]

export function App(): ReactNode {
  const { t, page, setPage } = useApp()
  if (window.location.hash === '#/mini') return <MiniClock />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={iconUrl} alt="" />
          {t('app.name')}
        </div>
        <nav>
          {NAV.map(({ page: p, label, icon: Icon }) => (
            <button key={p} className={`nav-item${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>
              <Icon size={18} strokeWidth={1.8} />
              {t(label)}
            </button>
          ))}
        </nav>
        <SidebarTimer />
      </aside>
      <main className="content">
        {page === 'planner' && <PlannerPage />}
        {page === 'clock' && <ClockPage />}
        {page === 'calendar' && <CalendarPage />}
        {page === 'stats' && <StatsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
