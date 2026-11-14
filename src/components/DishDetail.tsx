import { Clock, ExternalLink, Pencil, Snowflake } from 'lucide-react'
import type { Dish } from '../types'
import { Button, Sheet } from './ui'
import { ModeTag } from './ModeChips'
import { modeMeta } from '../lib/constants'

export function DishDetail({
  dish,
  onClose,
  onEdit,
}: {
  dish: Dish | null
  onClose: () => void
  onEdit: (dish: Dish) => void
}) {
  const steps = (dish?.steps ?? '')
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean)

  return (
    <Sheet
      open={Boolean(dish)}
      onClose={onClose}
      title={dish?.name ?? ''}
      subtitle={dish ? modeMeta(dish.difficulty)?.label : undefined}
      footer={
        dish ? (
          <Button className="w-full" onClick={() => onEdit(dish)}>
            <Pencil className="size-4" />
            Editar plato
          </Button>
        ) : undefined
      }
    >
      {dish && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
            <ModeTag mode={dish.difficulty} />
            {dish.minutes ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {dish.minutes} min
              </span>
            ) : null}
            {dish.freezerFriendly && (
              <span className="inline-flex items-center gap-1">
                <Snowflake className="size-3.5" />
                Apto freezer
              </span>
            )}
            {dish.favorite && <span className="font-semibold text-favorite-ink">★ Favorito</span>}
          </div>

          {dish.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {dish.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-cream px-1.5 py-0.5 text-[10.5px] font-medium text-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {dish.ingredients.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                Ingredientes
              </h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {dish.ingredients.map((ingredient) => (
                  <li
                    key={ingredient.id}
                    className="flex items-baseline justify-between gap-3 px-3 py-2 text-[13px]"
                  >
                    <span className="text-ink">{ingredient.name}</span>
                    <span className="shrink-0 text-[11.5px] text-muted">
                      {[ingredient.qty, ingredient.unit].filter(Boolean).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {steps.length > 0 && (
            <section>
              <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                Preparación
              </h3>
              <ol className="space-y-2.5">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10.5px] font-bold text-brand-dark">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-[13px] leading-relaxed text-ink">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!steps.length && dish.ingredients.length === 0 && (
            <p className="rounded-xl bg-cream px-3 py-3 text-[12px] leading-relaxed text-muted">
              Todavía no cargaste la receta. Tocá "Editar plato" para agregar ingredientes y pasos.
            </p>
          )}

          {dish.sourceUrl && (
            <a
              href={dish.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand underline decoration-brand/25 underline-offset-2"
            >
              <ExternalLink className="size-3.5" />
              Ver receta original
            </a>
          )}
        </div>
      )}
    </Sheet>
  )
}
