import clsx from 'clsx'
import { MODES, modeBorder, modeMeta } from '../lib/constants'
import type { DayMode } from '../types'

export function ModeChips({
  value,
  onChange,
  className,
}: {
  value: DayMode | null
  onChange: (mode: DayMode | null) => void
  className?: string
}) {
  return (
    <div className={clsx('flex flex-wrap gap-1.5', className)} role="group" aria-label="Dificultad del día">
      {MODES.map((mode) => {
        const active = value === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            title={mode.hint}
            aria-pressed={active}
            onClick={() => onChange(active ? null : mode.id)}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-[7px] text-[11.5px] font-semibold leading-none transition-all duration-150',
              active
                ? 'shadow-sm'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
            )}
            style={
              active
                ? {
                    backgroundColor: mode.soft,
                    color: mode.color,
                    borderColor: modeBorder(mode.color),
                  }
                : undefined
            }
          >
            {mode.id === 'freezer' ? (
              <span className="text-[11px]">🧊</span>
            ) : (
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: active ? mode.color : 'var(--color-line-strong)' }}
              />
            )}
            {mode.short}
          </button>
        )
      })}
    </div>
  )
}

export function ModeTag({ mode }: { mode: DayMode | null }) {
  const meta = modeMeta(mode)
  if (!meta) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
      style={{ backgroundColor: meta.soft, color: meta.color }}
    >
      {meta.id === 'freezer' ? '🧊' : <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />}
      {meta.label}
    </span>
  )
}
