import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, HelpCircle, Languages, Moon, Play, Target, X } from 'lucide-react'
import { useApp, type Page } from '../state'
import { ClockRing } from './ClockRing'
import type { MessageKey } from '../../../shared/i18n'
import iconUrl from '../assets/icon.svg'

const CARDS = ['welcome', 'goals', 'plans', 'clock', 'calendar', 'stats', 'settings'] as const
type Card = (typeof CARDS)[number]

const CARD_FOR_PAGE: Record<Page, Card> = {
  goals: 'goals',
  planner: 'plans',
  clock: 'clock',
  calendar: 'calendar',
  stats: 'stats',
  settings: 'settings'
}

const HelpContext = createContext<(card?: Card) => void>(() => {})

/** Opens the help cards; with no argument, at the card for the current page. */
export const useHelp = (): ((card?: Card) => void) => useContext(HelpContext)

export function HelpProvider({ children }: { children: ReactNode }): ReactNode {
  const { data, api, page } = useApp()
  const [index, setIndex] = useState<number | null>(null)
  const open = useCallback((card?: Card) => setIndex(CARDS.indexOf(card ?? CARD_FOR_PAGE[page])), [page])

  // First launch: show the tour once from the start.
  useEffect(() => {
    if (!data.settings.seenHelp) setIndex(0)
  }, [])

  const close = (): void => {
    setIndex(null)
    if (!data.settings.seenHelp) api.apply({ type: 'updateSettings', settings: { seenHelp: true } })
  }

  return (
    <HelpContext.Provider value={open}>
      {children}
      {index !== null && <HelpCards index={index} setIndex={setIndex} onClose={close} />}
    </HelpContext.Provider>
  )
}

export function HelpButton(): ReactNode {
  const { t } = useApp()
  const open = useHelp()
  return (
    <button className="icon-btn help-btn" onClick={() => open()} title={t('help.button')} aria-label={t('help.button')}>
      <HelpCircle size={20} strokeWidth={1.8} />
    </button>
  )
}

/** Page title row: title on the left, page actions and the help button on the right. */
export function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }): ReactNode {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted small">{subtitle}</p>}
      </div>
      <div className="page-actions">
        {children}
        <HelpButton />
      </div>
    </header>
  )
}

function HelpCards({ index, setIndex, onClose }: { index: number; setIndex: (i: number) => void; onClose: () => void }): ReactNode {
  const { t } = useApp()
  const card = CARDS[index]
  const last = index === CARDS.length - 1
  const steps = t(`help.${card}.steps` as MessageKey).split('\n')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && !last) setIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, last, onClose, setIndex])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help-modal" role="dialog" aria-modal="true" aria-label={t(`help.${card}.title` as MessageKey)}>
        <button className="icon-btn help-close" onClick={onClose} aria-label={t('common.close')}>
          <X size={18} />
        </button>
        <div className="help-art">
          <Illustration card={card} />
        </div>
        <div className="help-body">
          <span className="help-count">
            {index + 1} / {CARDS.length}
          </span>
          <h2>{t(`help.${card}.title` as MessageKey)}</h2>
          {steps.length === 1 || card === 'welcome' ? (
            steps.map((s) => (
              <p key={s} className="help-text">
                {s}
              </p>
            ))
          ) : (
            <ol className="help-steps">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </div>
        <footer className="help-foot">
          <div className="help-dots">
            {CARDS.map((c, i) => (
              <button key={c} className={i === index ? 'on' : ''} onClick={() => setIndex(i)} aria-label={`${i + 1}`} />
            ))}
          </div>
          <div className="button-row">
            {index > 0 && (
              <button className="btn" onClick={() => setIndex(index - 1)}>
                <ChevronLeft size={16} />
                {t('help.prev')}
              </button>
            )}
            {last ? (
              <button className="btn primary" onClick={onClose} autoFocus>
                {t('help.done')}
              </button>
            ) : (
              <button className="btn primary" onClick={() => setIndex(index + 1)} autoFocus>
                {t('help.next')}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

/** Small, static mock-ups of each screen, drawn with the app's own styles. */
function Illustration({ card }: { card: Card }): ReactNode {
  const { t, data } = useApp()
  const zh = data.settings.language === 'zh-TW'
  switch (card) {
    case 'welcome':
      return <img src={iconUrl} alt="" className="art-icon" />
    case 'goals':
      return (
        <div className="art-card art-goal">
          <div className="art-goal-head">
            <Target size={15} />
            <strong>{zh ? '學習 LLM' : 'Study LLMs'}</strong>
          </div>
          <div className="progress">
            <div style={{ width: '66%', background: 'var(--c2)' }} />
          </div>
          {[
            [zh ? 'Transformer 架構' : 'Transformer architecture', true],
            [zh ? 'Attention 論文' : 'Attention is all you need', true],
            ['llama.cpp', false]
          ].map(([label, done]) => (
            <div key={label as string} className={`art-check${done ? ' done' : ''}`}>
              <span />
              {label}
            </div>
          ))}
        </div>
      )
    case 'plans':
      return (
        <div className="art-plans">
          <div className="art-input">
            LL<span className="art-caret" />
          </div>
          <div className="art-card art-suggest">
            <div className="art-suggest-label">{t('plan.suggestGoals')}</div>
            <div className="art-suggest-item on">
              <Target size={13} /> {zh ? '學習 LLM' : 'Study LLMs'}
              <ChevronRight size={13} className="art-suggest-arrow" />
            </div>
            <div className="art-suggest-item">
              <Target size={13} /> {zh ? 'LLM 微調' : 'LLM fine-tuning'}
            </div>
          </div>
        </div>
      )
    case 'clock':
      return (
        <ClockRing progress={0.68} size={128} stroke={7}>
          <span className="art-ring-phase">{t('clock.focus')}</span>
          <span className="art-ring-time">16:58</span>
        </ClockRing>
      )
    case 'calendar':
      return (
        <div className="art-calendar">
          <div className="art-block">
            <strong>{zh ? '特徵值 第五章' : 'Eigenvalues, ch. 5'}</strong>
            <span>14:00–16:00</span>
          </div>
          <div className="context-menu art-menu">
            <div className="context-item art-hover">
              <span className="context-icon">
                <Play size={14} />
              </span>
              <span className="context-label">{t('menu.startTimer')}</span>
              <span className="context-hint">{t('menu.timeLeft', { time: zh ? '45分' : '45m' })}</span>
            </div>
            <div className="context-item">
              <span className="context-icon" />
              <span className="context-label">{t('common.edit')}</span>
            </div>
          </div>
        </div>
      )
    case 'stats':
      return (
        <div className="art-stats">
          <div className="art-grid">
            {[0, 2, 3, 0, 1, 4, 2, 3, 1, 0, 2, 4, 3, 2].map((l, i) => (
              <span key={i} className={`checkin-cell sm l${l}`} />
            ))}
          </div>
          <div className="art-bars">
            {[40, 72, 55, 90, 64].map((h, i) => (
              <span key={i} style={{ height: h }}>
                <i style={{ height: '45%', background: 'var(--c0)' }} />
                <i style={{ height: '55%', background: 'var(--c2)' }} />
              </span>
            ))}
          </div>
        </div>
      )
    case 'settings':
      return (
        <div className="art-settings">
          <span className="art-chip">
            <Languages size={15} /> English · 繁體中文
          </span>
          <span className="art-chip">
            <Moon size={15} /> {t('settings.themeDark')}
          </span>
          <span className="art-chip">
            <Download size={15} /> {t('settings.export')}
          </span>
        </div>
      )
  }
}
