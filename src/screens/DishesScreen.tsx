import { useMemo, useState } from 'react'
import { Plus, Search, Snowflake, Star, UtensilsCrossed } from 'lucide-react'
import clsx from 'clsx'
import type { Difficulty, Dish } from '../types'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { DishDetail } from '../components/DishDetail'
import { DishEditor } from '../components/DishEditor'
import { Button, Chip, EmptyState, Input } from '../components/ui'
import { ModeTag } from '../components/ModeChips'
import { COOK_MODES, DIFFICULTY_RANK } from '../lib/constants'

type Filter = 'all' | 'fav' | 'freezer' | Difficulty

export function DishesScreen() {
  const { dishes, saveDish } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Dish | null>(null)
  const [viewing, setViewing] = useState<Dish | null>(null)

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const list = dishes.filter((dish) => {
      if (filter === 'fav' && !dish.favorite) return false
      if (filter === 'freezer' && !dish.freezerFriendly) return false
      if (filter !== 'all' && filter !== 'fav' && filter !== 'freezer' && dish.difficulty !== filter) {
        return false
      }
      if (!text) return true
      return `${dish.name} ${dish.tags.join(' ')} ${dish.ingredients.map((i) => i.name).join(' ')}`
        .toLowerCase()
        .includes(text)
    })
    return list.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      const rank = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
      return rank !== 0 ? rank : a.name.localeCompare(b.name, 'es')
    })
  }, [dishes, filter, query])

  const freezerCount = dishes.filter((dish) => dish.freezerFriendly).length

  function openDish(dish: Dish | null) {
    setEditing(dish)
    setEditorOpen(true)
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Recetario"
        title="Platos"
        subtitle={
          dishes.length === 0
            ? 'Cargá tus recetas y su dificultad.'
            : `${dishes.length} platos · ${freezerCount} aptos para freezer`
        }
        action={
          <Button size="sm" onClick={() => openDish(null)}>
            <Plus className="size-4" />
            Nuevo
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar plato, ingrediente o etiqueta"
          className="pl-9"
        />
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos
        </Chip>
        <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
          <Star className="size-3" />
          Favoritos
        </Chip>
        <Chip active={filter === 'freezer'} onClick={() => setFilter('freezer')}>
          <Snowflake className="size-3" />
          Freezer
        </Chip>
        {COOK_MODES.map((mode) => (
          <Chip
            key={mode.id}
            active={filter === mode.id}
            onClick={() => setFilter(filter === mode.id ? 'all' : (mode.id as Difficulty))}
          >
            {mode.label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title={dishes.length === 0 ? 'Todavía no hay platos' : 'No encontramos platos'}
            description={
              dishes.length === 0
                ? 'Agregá tu primera receta: nombre, dificultad e ingredientes. Después la app la usa para sugerir cenas.'
                : 'Probá con otro filtro o buscá por otro ingrediente.'
            }
            action={
              <Button size="sm" onClick={() => openDish(null)}>
                <Plus className="size-4" />
                Agregar plato
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {filtered.map((dish) => (
            <div key={dish.id} className="card flex flex-col p-3.5">
              <div className="flex items-start gap-1.5">
                <button
                  onClick={() => setViewing(dish)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Ver receta de ${dish.name}`}
                >
                  <p className="text-[14px] font-semibold leading-snug text-ink">{dish.name}</p>
                </button>
                <button
                  onClick={() => void saveDish({ ...dish, favorite: !dish.favorite })}
                  className={clsx(
                    'grid size-7 shrink-0 place-items-center rounded-full transition',
                    dish.favorite
                      ? 'text-favorite'
                      : 'text-line-strong hover:bg-cream hover:text-favorite',
                  )}
                  aria-label={dish.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                >
                  <Star className="size-4" fill={dish.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted">
                <ModeTag mode={dish.difficulty} />
                {dish.minutes ? <span>{dish.minutes} min</span> : null}
                {dish.freezerFriendly && (
                  <span className="inline-flex items-center gap-0.5">
                    <Snowflake className="size-3" />
                    freezer
                  </span>
                )}
              </div>

              {dish.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {dish.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-cream px-1.5 py-0.5 text-[10px] font-medium text-muted"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {dish.ingredients.length > 0 && (
                <p className="mt-2 line-clamp-1 text-[11px] text-muted">
                  {dish.ingredients.map((ingredient) => ingredient.name).join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <DishDetail
        dish={viewing}
        onClose={() => setViewing(null)}
        onEdit={(dish) => {
          setViewing(null)
          openDish(dish)
        }}
      />

      <DishEditor
        open={editorOpen}
        dish={editing}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
