import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  icon?: ReactNode
  hint?: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** Right-click menu at the cursor. Disabled items simply do nothing. */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.min(menu.x, window.innerWidth - width - 8),
      top: Math.min(menu.y, window.innerHeight - height - 8)
    })
  }, [menu])

  useEffect(() => {
    const close = (e: Event): void => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('contextmenu', close, true)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('contextmenu', close, true)
      window.removeEventListener('wheel', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={`context-item${item.danger ? ' danger' : ''}`}
          aria-disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return
            onClose()
            item.onSelect()
          }}
        >
          <span className="context-icon">{item.icon}</span>
          <span className="context-label">{item.label}</span>
          {item.hint && <span className="context-hint">{item.hint}</span>}
        </button>
      ))}
    </div>,
    document.body
  )
}
