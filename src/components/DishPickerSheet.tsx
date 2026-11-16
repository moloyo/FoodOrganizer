import { useMemo, useState } from 'react'
import { Plus, Search, Snowflake, UtensilsCrossed, X } from 'lucide-react'
import type { Dish } from '../types'
import { useApp } from '../state/AppContext'
import { candidatesFor } from '../lib/suggest'
import { DAY_NAMES, DAY_SHORT } from '../lib/date'
import { modeMeta } from '../lib/constants'
import { Button, Chip, EmptyState, Input, Sheet } from './ui'
import { ModeTag } from './ModeChips'

export function DishPickerSheet({
  dayIndex,
  slot,
  onClose,
  onCreateDish,
}: {
  dayIndex: number | null
  slot: number
  onClose: () => void
  onCreateDish: () => void
}) {
  const { days, dishes, setMealDish } = useApp()
  const [search, setSearch] = useState('')
  const [includeEasier, setIncludeEasier] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const plan = dayIndex === null ? null : days[dayIndex]
  const meal = plan?.meals.find((item) => item.slot === slot)
  const mode = meal?.mode ?? null
  const meta = modeMeta(mode)
  const hasMany = (plan?.meals.length ?? 1) > 1
  const noun = hasMany ? 'Comida' : 'Cena'

  const usedBy = useMemo(() => {
    const map = new Map<string, number>()
    for (const day of days) {
      for (const item of day.meals) {
        if (item.dishId) map.set(item.dishId, day.day)
      }
    }
    return map
  }, [days])

  const list = useMemo(() => {
    const base = showAll ? dishes : candidatesFor(dishes, mode, { includeEasier })
    const query = search.trim().toLowerCase()
    const filtered = query
      ? base.filter((dish) =>
          `${dish.name} ${dish.tags.join(' ')} ${dish.ingredients.map((i) => i.name).join(' ')}`
            .toLowerCase()
            .includes(query),
        )
      : base

    const score = (dish: Dish) => {
      let value = 0
      if (mode && mode !== 'freezer' && dish.difficulty === mode) value -= 2
      if (dish.favorite) value -= 1
      return value
    }

    return [...filtered].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, 'es'))
  }, [dishes, includeEasier, mode, search, showAll])

  async function select(dish: Dish) {
    if (dayIndex === null) return
    await setMealDish(dayIndex, slot, dish.id)
    onClose()
  }

  async function clear() {
    if (dayIndex === null) return
    await setMealDish(dayIndex, slot, null)
    onClose()
  }

  function handleCreate() {
    onClose()
    onCreateDish()
  }

  return (
    <Sheet
      open={dayIndex !== null}
      onClose={onClose}
      wide
      title={dayIndex === null ? `Elegir ${noun.toLowerCase()}` : `${noun} del ${DAY_NAMES[dayIndex].toLowerCase()}`}
      subtitle={
        meta
          ? `${meta.label} · ${meta.hint.toLowerCase()}`
          : 'Sin dificultad elegida · mostrando todo el recetario'
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleCreate}>
            <Plus className="size-4" />
            Plato nuevo
          </Button>
          {meal?.dishId && (
            <Button variant="danger" onClick={clear}>
              <X className="size-4" />
              Quitar
            </Button>
          )}
        </div>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, ingrediente o etiqueta"
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {mode !== 'freezer' && (
          <Chip active={includeEasier} onClick={() => setIncludeEasier((value) => !value)}>
            Incluir más fáciles
          </Chip>
        )}
        <Chip active={showAll} onClick={() => setShowAll((value) => !value)}>
          Ver todo el recetario
        </Chip>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {list.length} {list.length === 1 ? 'plato disponible' : 'platos disponibles'}
      </p>

      <div className="mt-2 space-y-2">
        {list.map((dish) => {
          const usedDay = usedBy.get(dish.id)
          return (
            <button
              key={dish.id}
              onClick={() => select(dish)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-brand/45 hover:bg-brand-soft/20"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold leading-snug text-ink">
                  {dish.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                  <ModeTag mode={dish.difficulty} />
                  {dish.minutes ? <span>{dish.minutes} min</span> : null}
                  {dish.freezerFriendly && (
                    <span className="inline-flex items-center gap-0.5">
                      <Snowflake className="size-3" />
                      freezer
                    </span>
                  )}
                  {usedDay !== undefined && usedDay !== dayIndex && (
                    <span className="font-medium text-accent">
                      Ya está el {DAY_SHORT[usedDay].toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-dark">
                <Plus className="size-4" />
              </span>
            </button>
          )
        })}
      </div>

      {list.length === 0 && (
        <div className="mt-3">
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title="No encontramos platos"
            description={
              search
                ? 'Probá con otra búsqueda o mirá todo el recetario.'
                : 'Sumá un plato nuevo o cambiá el filtro.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={() => setShowAll(true)}>
                Ver todo el recetario
              </Button>
            }
          />
        </div>
      )}
    </Sheet>
  )
}
