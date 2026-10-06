import { useEffect, useState, type ReactNode } from 'react'
import { Download, Plus, Trash2, Upload } from 'lucide-react'
import { useApp } from '../state'
import { Segmented, tagColor, useConfirm } from '../components/ui'
import { newId, nextTagColor, PALETTE_SIZE } from '../../../shared/store'
import type { Language, Tag, Theme } from '../../../shared/types'

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
      <header className="page-head">
        <h1>{t('settings.title')}</h1>
      </header>

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
