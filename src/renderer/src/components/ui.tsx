import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../state'
import { newId, nextTagColor } from '../../../shared/store'
import type { Plan } from '../../../shared/types'
import { longDate } from '../format'

export function Modal({ title, onClose, children, footer, width = 480 }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

// ---- Confirm dialog (window.confirm steals focus in Electron on Windows) ----

type ConfirmFn = (message: string, opts?: { danger?: boolean; okLabel?: string }) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn>(async () => false)
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: ReactNode }): ReactNode {
  const { t } = useApp()
  const [req, setReq] = useState<{ message: string; danger: boolean; okLabel?: string; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback<ConfirmFn>(
    (message, opts) => new Promise((resolve) => setReq({ message, danger: opts?.danger ?? true, okLabel: opts?.okLabel, resolve })),
    []
  )
  const close = (v: boolean): void => {
    req?.resolve(v)
    setReq(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <Modal
          title={t('app.name')}
          onClose={() => close(false)}
          width={400}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>
                {t('common.cancel')}
              </button>
              <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>
                {req.okLabel ?? t('common.delete')}
              </button>
            </>
          }
        >
          <p className="confirm-text">{req.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): ReactNode {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Segmented<V extends string>({ value, options, onChange, size }: {
  value: V
  options: { value: V; label: string }[]
  onChange: (v: V) => void
  size?: 'sm'
}): ReactNode {
  return (
    <div className={`segmented${size === 'sm' ? ' sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TagDot({ tagId, size = 10 }: { tagId: string | null; size?: number }): ReactNode {
  const { tagById } = useApp()
  const tag = tagById(tagId)
  return <span className="tag-dot" style={{ width: size, height: size, background: tagColor(tag?.color) }} aria-hidden />
}

export function TagPill({ tagId }: { tagId: string | null }): ReactNode {
  const { tagById, t } = useApp()
  const tag = tagById(tagId)
  return (
    <span className="tag-pill">
      <TagDot tagId={tagId} size={8} />
      {tag ? tag.name : t('common.untagged')}
    </span>
  )
}

export function tagColor(color: number | undefined): string {
  return color === undefined ? 'var(--c-none)' : `var(--c${color})`
}

/** Tag dropdown with an inline "new tag" option. */
export function TagSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }): ReactNode {
  const { data, api, t } = useApp()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (adding) inputRef.current?.focus()
  }, [adding])

  const create = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return setAdding(false)
    const existing = data.tags.find((x) => x.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      onChange(existing.id)
    } else {
      const tag = { id: newId(), name: trimmed, color: nextTagColor(data.tags) }
      await api.apply({ type: 'upsertTag', tag })
      onChange(tag.id)
    }
    setName('')
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="inline-add">
        <input
          ref={inputRef}
          value={name}
          placeholder={t('plan.newTagPrompt')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              create()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setAdding(false)
            }
          }}
        />
        <button type="button" className="btn primary sm" onClick={create}>
          {t('settings.addTag')}
        </button>
      </div>
    )
  }

  return (
    <div className="select-with-dot">
      <TagDot tagId={value} />
      <select
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '__new') setAdding(true)
          else onChange(e.target.value || null)
        }}
      >
        <option value="">{t('common.untagged')}</option>
        {data.tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
        <option value="__new">{t('plan.newTag')}</option>
      </select>
    </div>
  )
}

/** Plan dropdown; lists plans nearest to today first. */
export function PlanSelect({ value, onChange, plans }: {
  value: string | null
  onChange: (plan: Plan | null) => void
  plans?: Plan[]
}): ReactNode {
  const { data, t, loc } = useApp()
  const list = plans ?? data.plans
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(data.plans.find((p) => p.id === e.target.value) ?? null)}
    >
      <option value="">{t('common.noPlan')}</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {longDate(p.date, loc)} {p.startTime} · {p.title}
        </option>
      ))}
      {value && !list.some((p) => p.id === value) && (() => {
        const p = data.plans.find((x) => x.id === value)
        return p ? <option value={p.id}>{longDate(p.date, loc)} {p.startTime} · {p.title}</option> : null
      })()}
    </select>
  )
}

/** Hours + minutes inputs bound to a minute count. */
export function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }): ReactNode {
  const { t } = useApp()
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const set = (nh: number, nm: number): void => onChange(Math.max(0, (Number.isFinite(nh) ? nh : 0) * 60 + (Number.isFinite(nm) ? nm : 0)))
  return (
    <div className="duration-input">
      <input type="number" min={0} max={23} value={h} onChange={(e) => set(parseInt(e.target.value, 10), m)} />
      <span>{t('common.hours')}</span>
      <input type="number" min={0} max={59} step={5} value={m} onChange={(e) => set(h, parseInt(e.target.value, 10))} />
      <span>{t('common.minutes')}</span>
    </div>
  )
}
