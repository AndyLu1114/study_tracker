import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StudyApi } from '../../shared/api'
import { t as translate, formatDuration, locale, type MessageKey } from '../../shared/i18n'
import type { AppData, Tag, TimerState } from '../../shared/types'

export type Page = 'goals' | 'planner' | 'clock' | 'calendar' | 'stats' | 'settings'

interface AppContextValue {
  api: StudyApi
  data: AppData
  timer: TimerState
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  fmt: (ms: number) => string
  loc: string
  tagById: (id: string | null) => Tag | undefined
  page: Page
  setPage: (p: Page) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}

function useResolvedTheme(theme: AppData['settings']['theme']): 'light' | 'dark' {
  const query = '(prefers-color-scheme: dark)'
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (): void => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

export function AppProvider({ api, children }: { api: StudyApi; children: ReactNode }): ReactNode {
  const [data, setData] = useState<AppData | null>(null)
  const [timer, setTimer] = useState<TimerState | null>(null)
  const [page, setPage] = useState<Page>('goals')

  useEffect(() => {
    const offData = api.onData(setData)
    const offTimer = api.onTimer(setTimer)
    api.getData().then(setData)
    api.getTimer().then(setTimer)
    return () => {
      offData()
      offTimer()
    }
  }, [api])

  const lang = data?.settings.language ?? 'en'
  const theme = useResolvedTheme(data?.settings.theme ?? 'system')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.name')
  }, [theme, lang])

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])
  const fmt = useCallback((ms: number) => formatDuration(lang, ms), [lang])
  const tags = data?.tags
  const tagById = useCallback((id: string | null) => (id ? tags?.find((x) => x.id === id) : undefined), [tags])

  const value = useMemo(
    () => (data && timer ? { api, data, timer, t, fmt, loc: locale(lang), tagById, page, setPage } : null),
    [api, data, timer, t, fmt, lang, tagById, page]
  )
  if (!value) return null
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Re-renders every `intervalMs` while `active`. Returns the current time. */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
  return now
}
