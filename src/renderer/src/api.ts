import type { StudyApi } from '../../shared/api'
import { createBrowserApi } from './browserApi'

declare global {
  interface Window {
    studyApi?: StudyApi
  }
}

/** The Electron preload API, or an in-page backend when running in a plain browser. */
export function getApi(): StudyApi {
  return window.studyApi ?? createBrowserApi()
}
