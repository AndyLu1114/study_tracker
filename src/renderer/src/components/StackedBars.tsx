import { useState, type ReactNode } from 'react'
import { useApp } from '../state'
import { useWidth } from './useWidth'
import { tagColor } from './ui'
import { formatHours } from '../../../shared/i18n'
import type { PeriodTotals } from '../../../shared/stats'

const HEIGHT = 240
const PAD = { top: 28, right: 8, bottom: 28, left: 52 }
const BAR_MAX = 24
const HOUR = 3_600_000

let measureCtx: CanvasRenderingContext2D | null = null
/** Rendered width of a bar-value label (matches `.bars .bar-value`). */
function labelWidth(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = `500 11.5px ${getComputedStyle(document.body).fontFamily}`
  return measureCtx.measureText(text).width
}

function niceStep(maxMs: number): number {
  const steps = [0.25, 0.5, 1, 2, 3, 4, 5, 10, 20, 25, 50, 100, 200].map((h) => h * HOUR)
  return steps.find((s) => maxMs / s <= 4) ?? steps[steps.length - 1]
}

/** Rect with rounded top corners only (the data end), square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function StackedBars({ series, labels, tagOrder }: {
  series: PeriodTotals[]
  labels: string[]
  /** Stack order, bottom first. */
  tagOrder: (string | null)[]
}): ReactNode {
  const { data, fmt, tagById, t } = useApp()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const lang = data.settings.language

  const max = Math.max(...series.map((s) => s.breakdown.totalMs), 0)
  const step = niceStep(max || HOUR)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = series.length ? plotW / series.length : 0
  const barW = Math.min(BAR_MAX, band * 0.5)
  const y = (ms: number): number => PAD.top + plotH - (ms / top) * plotH
  // Full label if it fits over its bar, else the compact one, else none (the tooltip has it).
  const valueLabel = (ms: number): string | null => {
    const room = band - 4
    const full = fmt(ms)
    if (labelWidth(full) <= room) return full
    const short = formatHours(lang, ms)
    return labelWidth(short) <= room ? short : null
  }

  return (
    <div className="bars" ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={t('stats.studyTime')}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'grid'} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="tick">
                {v === 0 ? '0' : formatHours(lang, v)}
              </text>
            </g>
          ))}
          {series.map((s, i) => {
            const cx = PAD.left + band * i + band / 2
            const x = cx - barW / 2
            const slices = tagOrder
              .map((id) => s.breakdown.slices.find((sl) => sl.tagId === id))
              .filter((sl): sl is NonNullable<typeof sl> => !!sl && sl.ms > 0)
            let acc = 0
            return (
              <g key={s.start} className={hover === i ? 'band hover' : 'band'}>
                <rect x={PAD.left + band * i} y={PAD.top - 20} width={band} height={plotH + 20} className="hit" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                {slices.map((sl, j) => {
                  const y0 = y(acc)
                  acc += sl.ms
                  const y1 = y(acc)
                  const isTop = j === slices.length - 1
                  // 2px surface gap between stacked segments.
                  const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0))
                  const color = tagColor(tagById(sl.tagId)?.color)
                  return isTop ? (
                    <path key={j} d={topRounded(x, y1, barW, h, 4)} fill={color} pointerEvents="none" />
                  ) : (
                    <rect key={j} x={x} y={y1} width={barW} height={h} fill={color} pointerEvents="none" />
                  )
                })}
                {s.breakdown.totalMs > 0 && valueLabel(s.breakdown.totalMs) && (
                  <text x={cx} y={y(s.breakdown.totalMs) - 8} textAnchor="middle" className="bar-value">
                    {valueLabel(s.breakdown.totalMs)}
                  </text>
                )}
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="tick x">
                  {labels[i]}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && series[hover] && (() => {
        // Sit beside the hovered column so it never covers the bar or the figures above.
        const right = hover < series.length / 2
        const left = PAD.left + band * (right ? hover + 1 : hover) + (right ? -band * 0.15 : band * 0.15)
        const top = Math.min(Math.max(y(series[hover].breakdown.totalMs), PAD.top + 40), PAD.top + plotH - 40)
        return (
        <div className={`tooltip ${right ? 'side-right' : 'side-left'}`} style={{ left, top }}>
          <div className="tooltip-head">
            <span>{labels[hover]}</span>
            <strong>{fmt(series[hover].breakdown.totalMs)}</strong>
          </div>
          {series[hover].breakdown.slices.map((sl) => (
            <div key={sl.tagId ?? 'none'} className="tooltip-row">
              <span className="tag-dot" style={{ background: tagColor(tagById(sl.tagId)?.color) }} />
              <span>{tagById(sl.tagId)?.name ?? t('common.untagged')}</span>
              <span className="tooltip-val">{fmt(sl.ms)}</span>
            </div>
          ))}
        </div>
        )
      })()}
    </div>
  )
}
