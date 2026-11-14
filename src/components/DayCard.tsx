import clsx from 'clsx'
import { ArrowLeftRight, Clock, Dices, Snowflake, UtensilsCrossed, X } from 'lucide-react'
import type { DayPlan, Dish } from '../types'
import { DAY_SHORT, isToday as isTodayDate } from '../lib/date'
import { modeMeta } from '../lib/constants'
import { matchesMode } from '../lib/suggest'
import { useApp } from '../state/AppContext'
import { ModeChips, ModeTag } from './ModeChips'

export function DayCard({
  day,
  dish,
  date,
  onPick,
  onView,
}: {
  day: DayPlan
  dish?: Dish
  date: Date
  onPick: () => void
  onView: () => void
}) {
  const { setDayMode, setDayDish, shuffleDay, toast } = useApp()
  const today = isTodayDate(date)
  const meta = modeMeta(day.mode)

  async function handleModeChange(mode: DayPlan['mode']) {
    if (dish && !matchesMode(dish, mode)) {
      await setDayMode(day.day, mode)
      toast('Cambiamos la dificultad y quitamos el plato.', 'info')
      return
    }
    await setDayMode(day.day, mode)
  }

  return (
    <section
      className={clsx(
        'card p-3 transition-colors',
        today && 'ring-2 ring-brand/25',
        day.dishId && 'bg-surface',
      )}
      aria-label={`${DAY_SHORT[day.day]} ${date.getDate()}`}
    >
      <div className="flex gap-3">
        <div
          className={clsx(
            'flex h-[52px] w-11 shrink-0 flex-col items-center justify-center rounded-xl',
            today ? 'bg-brand text-on-brand' : 'bg-cream text-ink',
          )}
        >
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] opacity-75">
            {DAY_SHORT[day.day]}
          </span>
          <span className="font-display text-[19px] font-semibold leading-none">
            {date.getDate()}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <ModeChips value={day.mode} onChange={handleModeChange} />
            {today && (
              <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">
                Hoy
              </span>
            )}
          </div>

          <div className="mt-2">
            {dish ? (
              <div className="flex items-center gap-1 rounded-xl border border-line bg-cream/50 pl-2.5 pr-1 py-1.5">
                <button
                  onClick={onView}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Ver receta de ${dish.name}`}
                >
                  <p className="truncate text-[14px] font-semibold leading-snug text-ink">
                    {dish.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                    <ModeTag mode={dish.difficulty} />
                    {dish.minutes ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="size-3" />
                        {dish.minutes} min
                      </span>
                    ) : null}
                    {dish.freezerFriendly && (
                      <span className="inline-flex items-center gap-0.5">
                        <Snowflake className="size-3" />
                        freezer
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={onPick}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-brand"
                  aria-label="Elegir otro plato"
                  title="Cambiar plato"
                >
                  <ArrowLeftRight className="size-3.5" />
                </button>
                <button
                  onClick={() => shuffleDay(day.day)}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-brand"
                  aria-label="Sugerir otro plato"
                  title="Sugerir otro"
                >
                  <Dices className="size-4" />
                </button>
                <button
                  onClick={() => setDayDish(day.day, null)}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-danger-ink"
                  aria-label="Quitar plato"
                  title="Quitar"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={onPick}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-cream/30 text-[12px] font-semibold text-muted transition hover:border-brand/50 hover:bg-brand-soft/30 hover:text-brand"
                >
                  <UtensilsCrossed className="size-3.5" />
                  {day.mode ? 'Elegir plato' : 'Elegir plato o dificultad'}
                </button>
                <button
                  onClick={() => shuffleDay(day.day)}
                  className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-brand transition hover:border-brand/40 hover:bg-brand-soft/40"
                  aria-label="Sorpréndeme"
                  title={meta ? `Sorpréndeme con algo ${meta.label.toLowerCase()}` : 'Sorpréndeme'}
                >
                  <Dices className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
