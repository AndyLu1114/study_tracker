import { useEffect, useState, type ReactNode } from 'react'
import { Download, Link2, Plus, Trash2, Unlink, Upload } from 'lucide-react'
import { useApp } from '../state'
import { Segmented, tagColor, useConfirm } from '../components/ui'
import { PageHead } from '../components/Help'
import { newId, nextTagColor, PALETTE_SIZE } from '../../../shared/store'
import type { Language, Tag, Theme } from '../../../shared/types'
import type { ConnectorStatus } from '../../../shared/api'

export function SettingsPage(): ReactNode {
  const { data, api, t } = useApp()
  const confirm = useConfirm()
  const [message, setMessage] = useState('')
  const [dataPath, setDataPath] = useState('')
  const [newTag, setNewTag] = useState('')
  const s = data.settings

  useEffect(() => {
    api.dataPath().then(setDataPath)
  }, [api])

  const addTag = async (): Promise<void> => {
    const name = newTag.trim()
    if (!name || data.tags.some((x) => x.name.toLowerCase() === name.toLowerCase())) return
    await api.apply({ type: 'upsertTag', tag: { id: newId(), name, color: nextTagColor(data.tags) } })
    setNewTag('')
  }

  const removeTag = async (tag: Tag): Promise<void> => {
    if (await confirm(t('settings.deleteTagConfirm', { name: tag.name }))) api.apply({ type: 'deleteTag', id: tag.id })
  }

  const doExport = async (): Promise<void> => {
    if (await api.exportData()) setMessage(t('settings.exported'))
  }

  const doImport = async (): Promise<void> => {
    if (!(await confirm(t('settings.importConfirm'), { danger: true, okLabel: t('settings.import').replace('…', '') }))) return
    const res = await api.importData()
    if (res.ok) setMessage(t('settings.imported'))
    else if (!res.cancelled) setMessage(t('settings.importFailed', { msg: res.error ?? '' }))
  }

  return (
    <div className="page narrow">
      <PageHead title={t('settings.title')} />

      <section className="card settings">
        <div className="setting-row">
          <div>
            <h3>{t('settings.language')}</h3>
          </div>
          <Segmented<Language>
            value={s.language}
            onChange={(language) => api.apply({ type: 'updateSettings', settings: { language } })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh-TW', label: '繁體中文' }
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <h3>{t('settings.theme')}</h3>
          </div>
          <Segmented<Theme>
            value={s.theme}
            onChange={(theme) => api.apply({ type: 'updateSettings', settings: { theme } })}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') }
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <h3>{t('settings.notifications')}</h3>
            <p className="muted small">{t('settings.notificationsDesc')}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={s.notifications}
              onChange={(e) => api.apply({ type: 'updateSettings', settings: { notifications: e.target.checked } })}
            />
            <span />
          </label>
        </div>
      </section>

      <section className="card settings">
        <div className="setting-block-head">
          <h3>{t('settings.tags')}</h3>
          <p className="muted small">{t('settings.tagsDesc')}</p>
        </div>
        <ul className="tag-list">
          {data.tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} onDelete={() => removeTag(tag)} />
          ))}
        </ul>
        <form
          className="inline-add"
          onSubmit={(e) => {
            e.preventDefault()
            addTag()
          }}
        >
          <input value={newTag} placeholder={t('settings.tagPlaceholder')} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn" type="submit" disabled={!newTag.trim()}>
            <Plus size={15} />
            {t('settings.addTag')}
          </button>
        </form>
      </section>

      <ClaudeConnector />

      <section className="card settings">
        <div className="setting-block-head">
          <h3>{t('settings.backup')}</h3>
          <p className="muted small">{t('settings.backupDesc')}</p>
        </div>
        <div className="button-row">
          <button className="btn" onClick={doExport}>
            <Download size={15} />
            {t('settings.export')}
          </button>
          <button className="btn" onClick={doImport}>
            <Upload size={15} />
            {t('settings.import')}
          </button>
          {message && <span className="muted small">{message}</span>}
        </div>
        {dataPath && (
          <p className="muted small data-path">
            {t('settings.dataFile')} <code>{dataPath}</code>
          </p>
        )}
      </section>
    </div>
  )
}

function TagRow({ tag, onDelete }: { tag: Tag; onDelete: () => void }): ReactNode {
  const { api, t, data } = useApp()
  const [name, setName] = useState(tag.name)
  useEffect(() => setName(tag.name), [tag.name])
  const commit = (): void => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === tag.name) return setName(tag.name)
    if (data.tags.some((x) => x.id !== tag.id && x.name.toLowerCase() === trimmed.toLowerCase())) return setName(tag.name)
    api.apply({ type: 'upsertTag', tag: { ...tag, name: trimmed } })
  }
  return (
    <li className="tag-row">
      <div className="swatches" role="radiogroup" aria-label={tag.name}>
        {Array.from({ length: PALETTE_SIZE }, (_, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={tag.color === i}
            className={`swatch${tag.color === i ? ' on' : ''}`}
            style={{ background: tagColor(i) }}
            onClick={() => api.apply({ type: 'upsertTag', tag: { ...tag, color: i } })}
          />
        ))}
      </div>
      <input className="tag-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <button className="icon-btn" onClick={onDelete} aria-label={t('common.delete')} title={t('common.delete')}>
        <Trash2 size={16} />
      </button>
    </li>
  )
}

/** Adds or removes Study Tracker in the Claude desktop app's settings. */
function ClaudeConnector(): ReactNode {
  const { api, t } = useApp()
  const [status, setStatus] = useState<ConnectorStatus | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.connectorStatus().then(setStatus)
  }, [api])

  const run = async (action: () => Promise<ConnectorStatus>, done: string): Promise<void> => {
    setBusy(true)
    const next = await action()
    setBusy(false)
    setStatus(next)
    setNote(next.error ? t('connector.error', { msg: next.error }) : done)
  }

  if (!status) return null
  const state = status.state
  const canConnect = state === 'notConnected' || state === 'needsUpdate' || state === 'connected'
  const label = {
    connected: t('connector.connected'),
    notConnected: t('connector.notConnected'),
    needsUpdate: t('connector.needsUpdate'),
    claudeMissing: t('connector.claudeMissing'),
    portable: t('connector.portable'),
    unavailable: t('connector.unavailable')
  }[state]

  return (
    <section className="card settings">
      <div className="setting-block-head">
        <h3>{t('connector.title')}</h3>
        <p className="muted small">{t('connector.desc')}</p>
        <p className="muted small">{t('connector.limits')}</p>
      </div>
      <div className="connector-row">
        <span className={`connector-state ${state}`}>
          <span className="connector-dot" />
          {label}
        </span>
        {canConnect && (
          <div className="button-row">
            {state === 'connected' ? (
              <button className="btn" disabled={busy} onClick={() => run(api.connectorDisconnect, t('connector.disconnected'))}>
                <Unlink size={15} />
                {t('connector.disconnect')}
              </button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => run(api.connectorConnect, t('connector.restart'))}>
                <Link2 size={15} />
                {state === 'needsUpdate' ? t('connector.reconnect') : t('connector.connect')}
              </button>
            )}
          </div>
        )}
      </div>
      {note && <p className="muted small connector-note">{note}</p>}
    </section>
  )
}
