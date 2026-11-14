import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  History,
  Settings,
  ShoppingBasket,
} from 'lucide-react'
import clsx from 'clsx'

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[30%] bg-brand text-on-brand shadow-[0_6px_18px_-8px_rgba(47,106,79,0.9)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path
          d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"
          fill="currentColor"
          fillOpacity="0.96"
        />
        <path
          d="M9 7.4c0-1.4.9-2 1.6-3.4M13 7.4c0-1.4.9-2 1.4-3.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />
        <path d="M4.5 11h15" stroke="var(--color-brand)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

const TABS = [
  { to: '/', label: 'Semana', icon: CalendarDays, end: true },
  { to: '/platos', label: 'Platos', icon: BookOpen },
  { to: '/compras', label: 'Compras', icon: ShoppingBasket },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <main className="flex-1 px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-[calc(100%-1.5rem)] max-w-[540px] items-center gap-0.5 rounded-[20px] border border-line bg-surface/92 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-md">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition-colors',
                    isActive
                      ? 'bg-brand-soft/80 text-brand-dark'
                      : 'text-muted hover:bg-ink/[0.04] hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-[19px]" strokeWidth={isActive ? 2.3 : 1.9} />
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export function ScreenHeader({
  eyebrow,
  title,
  action,
  subtitle,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-brand">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-[1.05] tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
