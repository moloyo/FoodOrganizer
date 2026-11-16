import { useState } from 'react'
import clsx from 'clsx'
import {
  ArrowLeftRight,
  Clock,
  Dices,
  Plus,
  Snowflake,
  StickyNote,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import type { DayMeals, Dish, MealEntry } from '../types'
import { DAY_NAMES, DAY_SHORT, isToday as isTodayDate } from '../lib/date'
import { modeMeta } from '../lib/constants'
import { useApp } from '../state/AppContext'
import { ModeChips, ModeTag } from './ModeChips'
import { Button, Sheet, Textarea } from './ui'

export function DayCard({
  day,
  dishes,
  date,
  onPick,
  onView,
}: {
  day: DayMeals
  dishes: Dish[]
  date: Date
  /** Abre el selector de platos para una comida concreta. */
  onPick: (slot: number) => void
  onView: (dish: Dish) => void
}) {
  const {
    addMeal,
    removeMeal,
    setMealMode,
    setMealDish,
    setDayNote,
    shuffleMeal,
  } = useApp()
  const today = isTodayDate(date)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  const hasMany = day.meals.length > 1
  const anyDish = day.meals.some((meal) => meal.dishId)

  function openNote() {
    setNoteDraft(day.note)
    setNoteOpen(true)
  }

  async function saveNote() {
    await setDayNote(day.day, noteDraft.trim())
    setNoteOpen(false)
  }

  function renderMeal(meal: MealEntry) {
    const dish = meal.dishId
      ? dishes.find((item) => item.id === meal.dishId)
      : undefined
    const meta = modeMeta(meal.mode)

    return (
      <div
        key={meal.slot}
        className="rounded-xl border border-line bg-cream/40 p-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <ModeChips
            value={meal.mode}
            onChange={(mode) => void setMealMode(day.day, meal.slot, mode)}
          />
          {hasMany && (
            <button
              onClick={() => void removeMeal(day.day, meal.slot)}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger-ink"
              aria-label="Quitar comida"
              title="Quitar comida"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-2">
          {dish ? (
            <div className="flex items-center gap-1 rounded-xl border border-line bg-cream/50 pl-2.5 pr-1 py-1.5">
              <button
                onClick={() => onView(dish)}
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
                onClick={() => onPick(meal.slot)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-brand"
                aria-label="Elegir otro plato"
                title="Cambiar plato"
              >
                <ArrowLeftRight className="size-3.5" />
              </button>
              <button
                onClick={() => void shuffleMeal(day.day, meal.slot)}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-brand"
                aria-label="Sugerir otro plato"
                title="Sugerir otro"
              >
                <Dices className="size-4" />
              </button>
              <button
                onClick={() => void setMealDish(day.day, meal.slot, null)}
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
                onClick={() => onPick(meal.slot)}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-cream/30 text-[12px] font-semibold text-muted transition hover:border-brand/50 hover:bg-brand-soft/30 hover:text-brand"
              >
                <UtensilsCrossed className="size-3.5" />
                {meal.mode ? 'Elegir plato' : 'Elegir plato o dificultad'}
              </button>
              <button
                onClick={() => void shuffleMeal(day.day, meal.slot)}
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
    )
  }

  return (
    <section
      className={clsx(
        'card p-3 transition-colors',
        today && 'ring-2 ring-brand/25',
        anyDish && 'bg-surface',
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
          {today && (
            <div className="mb-1.5 flex justify-end">
              <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand">
                Hoy
              </span>
            </div>
          )}

          <div className="space-y-2">{day.meals.map(renderMeal)}</div>

          <button
            onClick={() => void addMeal(day.day)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-[11.5px] font-semibold text-brand transition hover:border-brand/50 hover:bg-brand-soft/40"
          >
            <Plus className="size-3.5" />
            Agregar otra comida
          </button>

          <button
            type="button"
            onClick={openNote}
            className="mt-2.5 flex w-full items-start gap-1.5 rounded-none border-t border-line pt-2.5 text-left transition hover:bg-brand-soft/20"
            aria-label={day.note ? 'Editar nota del día' : 'Agregar nota del día'}
          >
            <StickyNote className="mt-0.5 size-3 shrink-0 text-muted" />
            <span
              className={clsx(
                'min-w-0 flex-1 whitespace-pre-wrap text-[11px] leading-snug',
                day.note ? 'text-muted' : 'italic text-muted/60',
              )}
            >
              {day.note || 'Agregar nota del día'}
            </span>
          </button>
        </div>
      </div>

      <Sheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Nota del día"
        subtitle={`${DAY_NAMES[day.day]} ${date.getDate()}`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setNoteOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => void saveNote()}>
              Guardar nota
            </Button>
          </div>
        }
      >
        <Textarea
          rows={4}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="Ej.: sobró arroz, usarlo el jueves. Comprar pan antes de salir."
          autoFocus
        />
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          La nota es una sola por día y no cambia las sugerencias ni la lista de compras.
        </p>
      </Sheet>
    </section>
  )
}
