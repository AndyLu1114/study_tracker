import type { ReactNode } from 'react'

export function ClockRing({ progress, size = 260, stroke = 10, isBreak, children }: {
  progress: number
  size?: number
  stroke?: number
  isBreak?: boolean
  children?: ReactNode
}): ReactNode {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={isBreak ? 'var(--break)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  )
}
