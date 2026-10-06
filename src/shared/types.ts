export type Language = 'en' | 'zh-TW'
export type Theme = 'system' | 'light' | 'dark'

export interface Tag {
  id: string
  name: string
  /** Index into the fixed categorical palette, so a tag keeps its colour forever. */
  color: number
}

export interface Checkpoint {
  id: string
  title: string
  tagId: string | null
  done: boolean
  doneAt: number | null
}

/** A longer-term goal, broken into ordered checkpoints. */
export interface Goal {
  id: string
  title: string
  description: string
  tagId: string | null
  /** Local date, YYYY-MM-DD. */
  startDate: string
  endDate: string | null
  /** When set, the goal completes itself once this many hours are studied. */
  targetHours: number | null
  /** Set when the user marks the goal as completed. */
  completedAt: number | null
  checkpoints: Checkpoint[]
  createdAt: number
}

/** A planned study session, created in the Study Tracker. */
export interface Plan {
  id: string
  title: string
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Local time, HH:mm. */
  startTime: string
  durationMin: number
  tagId: string | null
  goalId: string | null
  checkpointId: string | null
  description: string
  createdAt: number
}

export interface Segment {
  start: number
  end: number
}

export type LogSource = 'stopwatch' | 'countdown' | 'pomodoro' | 'manual'

/** Actual study time, recorded by the clock or entered by hand. */
export interface StudyLog {
  id: string
  /** Focused intervals (epoch ms). Pauses and pomodoro breaks are not included. */
  segments: Segment[]
  source: LogSource
  tagId: string | null
  planId: string | null
  /**
   * Goal link kept on the session itself only once its plan is deleted;
   * while the plan exists, the plan's goal link is the one that counts.
   */
  goalId: string | null
  checkpointId: string | null
  note: string
  createdAt: number
}

export interface PomodoroSettings {
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  /** A long break replaces the short one after every N focus rounds. */
  longBreakEvery: number
}

export interface Settings {
  language: Language
  theme: Theme
  notifications: boolean
  countdownMin: number
  pomodoro: PomodoroSettings
  /** The help cards open by themselves until the user has seen them once. */
  seenHelp: boolean
}

export interface AppData {
  app: 'study-tracker'
  version: 1
  tags: Tag[]
  goals: Goal[]
  plans: Plan[]
  logs: StudyLog[]
  settings: Settings
}

export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro'
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak'
export type TimerStatus = 'idle' | 'running' | 'paused'

export interface TimerLink {
  tagId: string | null
  planId: string | null
}

export interface TimerState {
  status: TimerStatus
  mode: TimerMode
  phase: TimerPhase
  /** 1-based focus round (pomodoro only). */
  round: number
  /** Length of the current phase in ms; null for the stopwatch. */
  phaseDurationMs: number | null
  /** Time already spent in this phase before the current running stretch. */
  phaseElapsedMs: number
  /** When the current running stretch started; null unless running. */
  runningSince: number | null
  /** Completed focus intervals of this session. */
  segments: Segment[]
  countdownMs: number
  pomodoro: PomodoroSettings
  link: TimerLink
}
