import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown, Copy, History } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button, EmptyState } from '../components/ui'
import { ModeTag } from '../components/ModeChips'
import { DAY_SHORT, formatWeekRange, isCurrentWeek, relativeWeekLabel } from '../lib/date'
import { modeMeta } from '../lib/constants'
import type { DayMeals } from '../types'

export function HistoryScreen() {
  const { history, plansForWeek, weekStart, repeatWeek, goToWeek } = useApp()
  const navigate = useNavigate()
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [repeating, setRepeating] = useState<string | null>(null)

  async function handleRepeat(week: string) {
    setRepeating(week)
    try {
      const copied = await repeatWeek(week)
      if (copied > 0) {
        goToWeek(weekStart)
        navigate('/')
      }
    } finally {
      setRepeating(null)
    }
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Tu cocina"
        title="Historial"
        subtitle={
          history.length === 0
            ? 'Acá vas a ver las semanas que fuiste planificando.'
            : `${history.length} semana${history.length === 1 ? '' : 's'} guardada${history.length === 1 ? '' : 's'}`
        }
      />

      {history.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<History className="size-6" />}
            title="Todavía no hay historial"
            description="Cuando planifiques una semana, va a quedar guardada acá para que puedas repetirla."
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate('/')}>
                <CalendarDays className="size-4" />
                Ir a la semana
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((week) => {
            const days = plansForWeek(week)
            const meals = days.flatMap((day) => day.meals)
            const count = meals.filter((meal) => meal.dishId).length
            const singlePerDay = days.every((day) => day.meals.length === 1)
            const noun = singlePerDay ? 'cena' : 'comida'
            const expanded = openWeek === week
            const current = isCurrentWeek(week) || week === weekStart
            return (
              <div key={week} className="card overflow-hidden">
                <button
                  onClick={() => setOpenWeek(expanded ? null : week)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                  aria-expanded={expanded}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] font-semibold leading-tight text-ink">
                      {relativeWeekLabel(week)}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {formatWeekRange(week)} · {count} {noun}{count === 1 ? '' : 's'}
                    </p>
                    <div className="mt-2 flex gap-1">
                      {days.map((day) => {
                        const meta = modeMeta(day.meals[0]?.mode ?? null)
                        return (
                          <span
                            key={day.day}
                            className="h-1.5 flex-1 rounded-full"
                            style={{ backgroundColor: meta?.color ?? 'var(--color-line)', opacity: meta ? 0.85 : 1 }}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <ChevronDown
                    className={clsx(
                      'size-4 shrink-0 text-muted transition-transform duration-200',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-line bg-cream/40 px-4 py-3">
                    <div className="divide-y divide-line/70">
                      {days.map((day) => (
                        <HistoryDay key={day.day} day={day} noun={noun} />
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!current && (
                        <Button
                          size="sm"
                          onClick={() => void handleRepeat(week)}
                          loading={repeating === week}
                        >
                          <Copy className="size-3.5" />
                          Copiar a esta semana
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          goToWeek(week)
                          navigate('/')
                        }}
                      >
                        <CalendarDays className="size-3.5" />
                        Ver semana
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HistoryDay({ day, noun }: { day: DayMeals; noun: string }) {
  const { dishes } = useApp()
  const planned = day.meals.filter((meal) => meal.dishId)
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-1 w-8 shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
        {DAY_SHORT[day.day]}
      </span>
      <div className="min-w-0 flex-1">
        {planned.length > 0 ? (
          planned.map((meal) => {
            const dish = dishes.find((item) => item.id === meal.dishId)
            return (
              <p key={meal.slot} className="truncate text-[13px] font-medium text-ink">
                {dish?.name ?? 'Plato eliminado'}
              </p>
            )
          })
        ) : (
          <p className="text-[12px] text-muted">Sin {noun}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {day.meals.map((meal) => (
          <ModeTag key={meal.slot} mode={meal.mode} />
        ))}
      </div>
    </div>
  )
}
