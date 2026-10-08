// macOS conventions: the standard app menu, staying in the Dock when the
// window closes (handled in index.ts), and running from /Applications.

import { app, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { t } from '../shared/i18n'
import type { Language } from '../shared/types'
import { readJson, writeJsonAtomic } from '../node/persistence'

export const isMac = process.platform === 'darwin'

/** App menu (About, Hide, Quit), Edit (so Cmd+C / Cmd+V work in text fields) and Window. */
export function setMacMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]))
}

/**
 * Apps opened straight from Downloads run from a temporary, randomized
 * location ("App Translocation"), which breaks the Claude connector's path.
 */
export function isTranslocated(): boolean {
  return isMac && process.execPath.includes('/AppTranslocation/')
}

/** Offers to move the app into /Applications, unless the user said not to ask again. */
export async function offerMoveToApplications(lang: Language): Promise<void> {
  if (!isMac || !app.isPackaged || app.isInApplicationsFolder()) return
  const prefsPath = join(app.getPath('userData'), 'mac-prefs.json')
  const prefs = (readJson(prefsPath) ?? {}) as { dontAskMove?: boolean }
  if (prefs.dontAskMove) return

  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'question',
    message: t(lang, 'mac.moveTitle'),
    detail: t(lang, 'mac.moveDetail'),
    buttons: [t(lang, 'mac.move'), t(lang, 'mac.notNow')],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: t(lang, 'mac.dontAsk')
  })
  if (response === 0) {
    try {
      // Moves the app and relaunches it from /Applications.
      app.moveToApplicationsFolder()
    } catch (err) {
      dialog.showErrorBox(t(lang, 'mac.moveTitle'), err instanceof Error ? err.message : String(err))
    }
  } else if (checkboxChecked) {
    writeJsonAtomic(prefsPath, { ...prefs, dontAskMove: true })
  }
}
