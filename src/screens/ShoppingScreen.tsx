import { useMemo, useState, type FormEvent } from 'react'
import {
  Check,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  ShoppingBasket,
  Sparkles,
  Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button, EmptyState, Input, Sheet } from '../components/ui'
import { CATEGORIES, CATEGORY_COLORS, guessCategory } from '../lib/constants'
import { formatWeekRange } from '../lib/date'
import { sortShopping } from '../lib/suggest'
import type { ShoppingItem } from '../types'

export function ShoppingScreen() {
  const {
    shopping,
    shoppingOutdated,
    regenerateShopping,
    toggleShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    clearCheckedShopping,
    weekStart,
    days,
    toast,
    busy,
  } = useApp()

  const [text, setText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editDetail, setEditDetail] = useState('')

  const ordered = useMemo(() => sortShopping(shopping), [shopping])
  const checked = shopping.filter((item) => item.checked).length
  const plannedDishes = days.filter((day) => day.dishId).length

  const groups = useMemo(() => {
    const map = new Map<string, typeof ordered>()
    for (const item of ordered) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return [...map.entries()].sort(
      (a, b) =>
        (CATEGORIES as readonly string[]).indexOf(a[0]) -
        (CATEGORIES as readonly string[]).indexOf(b[0]),
    )
  }, [ordered])

  async function handleRegenerate() {
    setGenerating(true)
    try {
      await regenerateShopping()
    } finally {
      setGenerating(false)
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    await addShoppingItem(value, guessCategory(value))
  }

  function openEdit(item: ShoppingItem) {
    const [name, ...rest] = item.text.split(' · ')
    setEditing(item)
    setEditName(name)
    setEditDetail(rest.join(' · '))
  }

  async function saveEdit() {
    if (!editing) return
    const name = editName.trim()
    if (!name) {
      toast('Poné un nombre al ítem.', 'error')
      return
    }
    const detail = editDetail.trim()
    await updateShoppingItem(editing.id, `${name}${detail ? ` · ${detail}` : ''}`)
    setEditing(null)
  }

  async function removeItem(item: ShoppingItem) {
    if (!window.confirm(`¿Quitar "${item.text}" de la lista?`)) return
    await deleteShoppingItem(item.id)
  }

  async function handleShare() {
    const lines: string[] = [`Compras ${formatWeekRange(weekStart)}`]
    for (const [category, items] of groups) {
      const pending = items.filter((item) => !item.checked)
      if (pending.length === 0) continue
      lines.push('', category)
      for (const item of pending) lines.push(`- ${item.text}`)
    }
    const message = lines.join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Lista de compras', text: message })
        return
      }
      await navigator.clipboard.writeText(message)
      toast('Lista copiada al portapapeles.', 'success')
    } catch {
      toast('No pudimos compartir la lista.', 'error')
    }
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Semana"
        title="Compras"
        subtitle={`${formatWeekRange(weekStart)} · ${
          shopping.length === 0 ? 'lista vacía' : `${shopping.length - checked} pendientes`
        }`}
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRegenerate}
            loading={generating}
            disabled={plannedDishes === 0}
          >
            <RefreshCw className="size-3.5" />
            Generar
          </Button>
        }
      />

      {shopping.length > 0 && (
        <div className="card mb-3 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-semibold text-ink">
              {checked} de {shopping.length} comprados
            </p>
            <div className="flex items-center gap-1">
              {checked > 0 && (
                <button
                  onClick={() => void clearCheckedShopping()}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-cream hover:text-ink"
                >
                  Limpiar tildados
                </button>
              )}
              <button
                onClick={handleShare}
                className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-cream hover:text-brand"
                aria-label="Compartir lista"
                title="Compartir lista"
              >
                <Share2 className="size-4" />
              </button>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${shopping.length ? (checked / shopping.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {shoppingOutdated && plannedDishes > 0 && !busy && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/60 p-3.5">
          <Sparkles className="size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-ink">
              {shopping.length === 0 ? 'Armá la lista de la semana' : 'La lista está desactualizada'}
            </p>
            <p className="text-[11px] leading-snug text-muted">
              {shopping.length === 0
                ? 'Sumá los ingredientes de las cenas que elegiste.'
                : 'Hay platos nuevos que todavía no están incluidos.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={handleRegenerate} loading={generating}>
            {shopping.length === 0 ? 'Armar' : 'Actualizar'}
          </Button>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Agregar ítem (ej. pan rallado)"
          className="flex-1"
        />
        <Button type="submit" size="icon" aria-label="Agregar ítem" disabled={!text.trim()}>
          <Plus className="size-4" />
        </Button>
      </form>

      {shopping.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<ShoppingBasket className="size-6" />}
            title="La lista está vacía"
            description={
              plannedDishes > 0
                ? 'Tocá "Armar" y juntamos los ingredientes de todas las cenas de la semana.'
                : 'Elegí las cenas de la semana o agregá ítems manualmente.'
            }
            action={
              plannedDishes > 0 ? (
                <Button size="sm" onClick={handleRegenerate} loading={generating}>
                  <Sparkles className="size-3.5" />
                  Armar lista
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map(([category, items]) => (
            <section key={category}>
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[category] ?? 'var(--color-muted)' }}
                />
                <h2 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">
                  {category}
                </h2>
                <span className="text-[10.5px] text-muted/70">{items.length}</span>
              </div>
              <div className="card divide-y divide-line overflow-hidden">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 pl-3.5 pr-1.5 transition hover:bg-brand-soft/15"
                  >
                    <button
                      onClick={() => void toggleShopping(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                      aria-label={item.checked ? `Desmarcar ${item.text}` : `Marcar ${item.text}`}
                    >
                      <span
                        className={clsx(
                          'grid size-5 shrink-0 place-items-center rounded-md border transition',
                          item.checked
                            ? 'border-brand bg-brand text-on-brand'
                            : 'border-line-strong bg-field',
                        )}
                      >
                        {item.checked && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span
                        className={clsx(
                          'min-w-0 text-[13.5px] leading-snug transition',
                          item.checked ? 'text-muted line-through' : 'text-ink',
                        )}
                      >
                        {item.text}
                      </span>
                    </button>
                    {item.dishId === null && (
                      <div className="flex shrink-0 items-center">
                        <button
                          onClick={() => openEdit(item)}
                          className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-cream hover:text-brand"
                          aria-label={`Editar ${item.text}`}
                          title="Editar ítem"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => void removeItem(item)}
                          className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger-ink"
                          aria-label={`Quitar ${item.text}`}
                          title="Quitar ítem"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Editar ítem"
        subtitle="Solo los ítems manuales se pueden editar o borrar."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => void saveEdit()}>
              Guardar
            </Button>
          </div>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Nombre
          </span>
          <Input
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            placeholder="Ej.: Pan rallado"
            autoFocus
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Cantidad / detalle
          </span>
          <Input
            value={editDetail}
            onChange={(event) => setEditDetail(event.target.value)}
            placeholder="Ej.: 500 g, 2 u, 1 lata"
          />
        </label>
      </Sheet>
    </div>
  )
}
