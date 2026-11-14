import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Difficulty, Dish, Ingredient } from '../types'
import { Button, Field, Input, Sheet, Textarea } from './ui'
import { IngredientNameInput } from './IngredientNameInput'
import {
  CATEGORIES,
  COOK_MODES,
  guessCategory,
  modeBorder,
  normalizeCategory,
} from '../lib/constants'
import {
  buildIngredientCatalog,
  canonicalIngredientName,
} from '../lib/ingredients'
import { makeId } from '../lib/adapters'
import { useApp } from '../state/AppContext'

interface FormState {
  name: string
  difficulty: Difficulty
  minutes: string
  freezerFriendly: boolean
  favorite: boolean
  tags: string
  ingredients: Ingredient[]
  steps: string
  sourceUrl: string
}

function newIngredient(): Ingredient {
  return { id: makeId(), name: '', qty: '', unit: '', category: '' }
}

function toForm(dish: Dish | null): FormState {
  if (!dish) {
    return {
      name: '',
      difficulty: 'facil',
      minutes: '',
      freezerFriendly: false,
      favorite: false,
      tags: '',
      ingredients: [newIngredient()],
      steps: '',
      sourceUrl: '',
    }
  }
  return {
    name: dish.name,
    difficulty: dish.difficulty,
    minutes: dish.minutes ? String(dish.minutes) : '',
    freezerFriendly: dish.freezerFriendly,
    favorite: dish.favorite,
    tags: dish.tags.join(', '),
    ingredients:
      dish.ingredients.length > 0
        ? dish.ingredients.map((ingredient) => ({ ...ingredient }))
        : [newIngredient()],
    steps: dish.steps,
    sourceUrl: dish.sourceUrl,
  }
}

export function DishEditor({
  open,
  dish,
  onClose,
  onSaved,
}: {
  open: boolean
  dish: Dish | null
  onClose: () => void
  onSaved?: (dish: Dish) => void
}) {
  const { saveDish, deleteDish, toast, dishes } = useApp()
  const [form, setForm] = useState<FormState>(() => toForm(dish))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const ingredientCatalog = useMemo(() => buildIngredientCatalog(dishes), [dishes])

  useEffect(() => {
    if (open) {
      setForm(toForm(dish))
      setError('')
    }
  }, [open, dish])

  function patch(values: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...values }))
  }

  function patchIngredient(id: string, values: Partial<Ingredient>) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, ...values } : ingredient,
      ),
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Poné un nombre al plato.')
      return
    }
    setSaving(true)
    const next: Dish = {
      id: dish?.id ?? makeId(),
      name: form.name.trim(),
      difficulty: form.difficulty,
      minutes: form.minutes.trim() ? Math.max(1, Number(form.minutes) || 0) : null,
      freezerFriendly: form.freezerFriendly,
      favorite: form.favorite,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      ingredients: form.ingredients
        .map((ingredient) => ({
          ...ingredient,
          name: canonicalIngredientName(ingredientCatalog, ingredient.name),
          qty: ingredient.qty.trim(),
          unit: ingredient.unit.trim(),
          category: ingredient.category
            ? normalizeCategory(ingredient.category, ingredient.name)
            : undefined,
        }))
        .filter((ingredient) => ingredient.name.length > 0),
      steps: form.steps.trim(),
      sourceUrl: form.sourceUrl.trim(),
      createdAt: dish?.createdAt ?? new Date().toISOString(),
    }
    try {
      await saveDish(next)
      toast(dish ? 'Plato actualizado.' : 'Plato agregado al recetario.', 'success')
      onSaved?.(next)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!dish) return
    if (!window.confirm(`¿Eliminar "${dish.name}"? Esta acción no se puede deshacer.`)) return
    await deleteDish(dish.id)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={dish ? 'Editar plato' : 'Nuevo plato'}
      subtitle="Dificultad, tiempo e ingredientes para armar la lista de compras."
      footer={
        <div className="flex gap-2">
          {dish && (
            <Button variant="danger" size="icon" onClick={handleDelete} aria-label="Eliminar plato">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={handleSave} loading={saving}>
            {dish ? 'Guardar cambios' : 'Agregar al recetario'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(event) => {
              patch({ name: event.target.value })
              setError('')
            }}
            placeholder="Ej. Tarta de zapallito y queso"
            autoFocus
          />
          {error && <span className="mt-1 block text-xs font-medium text-danger-ink">{error}</span>}
        </Field>

        <div>
          <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">
            Dificultad
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COOK_MODES.map((mode) => {
              const active = form.difficulty === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => patch({ difficulty: mode.id as Difficulty })}
                  className={clsx(
                    'rounded-full border px-3 py-2 text-[12.5px] font-semibold transition',
                    active ? 'shadow-sm' : 'border-line bg-surface text-muted hover:text-ink',
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
                  {mode.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Minutos">
            <Input
              value={form.minutes}
              onChange={(event) => patch({ minutes: event.target.value.replace(/[^\d]/g, '') })}
              inputMode="numeric"
              placeholder="30"
            />
          </Field>
          <Field label="Etiquetas">
            <Input
              value={form.tags}
              onChange={(event) => patch({ tags: event.target.value })}
              placeholder="horno, clásico"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => patch({ freezerFriendly: !form.freezerFriendly })}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition',
              !form.freezerFriendly && 'border-line bg-surface text-muted hover:text-ink',
            )}
            style={
              form.freezerFriendly
                ? {
                    backgroundColor: 'var(--mode-freezer-soft)',
                    color: 'var(--mode-freezer)',
                    borderColor: modeBorder('var(--mode-freezer)'),
                  }
                : undefined
            }
          >
            🧊 Apto freezer
          </button>
          <button
            type="button"
            onClick={() => patch({ favorite: !form.favorite })}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition',
              !form.favorite && 'border-line bg-surface text-muted hover:text-ink',
            )}
            style={
              form.favorite
                ? {
                    backgroundColor: 'var(--color-favorite-soft)',
                    color: 'var(--color-favorite-ink)',
                    borderColor: modeBorder('var(--color-favorite)'),
                  }
                : undefined
            }
          >
            ★ Favorito
          </button>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              Ingredientes
            </span>
            <span className="text-[11px] text-muted">Se suman a la lista de compras</span>
          </div>
          <div className="space-y-2">
            {form.ingredients.map((ingredient) => (
              <div key={ingredient.id} className="rounded-xl border border-line bg-surface p-2">
                <div className="flex items-center gap-1.5">
                  <IngredientNameInput
                    value={ingredient.name}
                    onChange={(name) => patchIngredient(ingredient.id, { name })}
                    catalog={ingredientCatalog}
                  />
                  <input
                    value={ingredient.qty}
                    onChange={(event) => patchIngredient(ingredient.id, { qty: event.target.value })}
                    placeholder="Cant."
                    className="w-14 rounded-lg border border-line bg-field px-1.5 py-1.5 text-center text-[13px] focus:border-brand focus:outline-none"
                  />
                  <input
                    value={ingredient.unit}
                    onChange={(event) => patchIngredient(ingredient.id, { unit: event.target.value })}
                    placeholder="Unidad"
                    className="w-[68px] rounded-lg border border-line bg-field px-1.5 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        ingredients:
                          form.ingredients.length > 1
                            ? form.ingredients.filter((item) => item.id !== ingredient.id)
                            : [newIngredient()],
                      })
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger-ink"
                    aria-label="Quitar ingrediente"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <select
                  value={
                    ingredient.category
                      ? normalizeCategory(ingredient.category, ingredient.name)
                      : ''
                  }
                  onChange={(event) =>
                    patchIngredient(ingredient.id, { category: event.target.value })
                  }
                  className="mt-1.5 w-full rounded-lg border border-line bg-field px-2 py-1 text-[11.5px] text-muted focus:border-brand focus:outline-none"
                >
                  <option value="">
                    Categoría automática
                    {ingredient.name ? ` · ${guessCategory(ingredient.name)}` : ''}
                  </option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1.5"
            onClick={() => patch({ ingredients: [...form.ingredients, newIngredient()] })}
          >
            <Plus className="size-3.5" />
            Agregar ingrediente
          </Button>
        </div>

        <Field label="Receta" hint="Un paso por línea. Podés completarla más adelante.">
          <Textarea
            value={form.steps}
            onChange={(event) => patch({ steps: event.target.value })}
            placeholder={'Rehogar la cebolla.\nSumar el tomate y cocinar 10 minutos.'}
            rows={4}
          />
        </Field>

        <Field label="Link a la receta original">
          <Input
            value={form.sourceUrl}
            onChange={(event) => patch({ sourceUrl: event.target.value })}
            placeholder="https://..."
            inputMode="url"
          />
        </Field>
      </div>
    </Sheet>
  )
}
