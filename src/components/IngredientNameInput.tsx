import { useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  canonicalIngredientName,
  searchIngredients,
  type IngredientSuggestion,
} from '../lib/ingredients'

/**
 * Input de nombre de ingrediente con sugerencias.
 * - Al enfocar muestra los ingredientes más usados.
 * - Filtra por prefijo, palabra, substring y errores de tipeo ("eso" → "Queso").
 * - Al salir del campo unifica el nombre con el canónico existente.
 */
export function IngredientNameInput({
  value,
  onChange,
  catalog,
  placeholder = 'Ingrediente',
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  catalog: IngredientSuggestion[]
  placeholder?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const pickingRef = useRef(false)
  const listId = useId().replace(/:/g, '')

  const suggestions = useMemo(
    () => searchIngredients(catalog, value),
    [catalog, value],
  )
  const activeIndex = Math.min(highlight, Math.max(0, suggestions.length - 1))
  const showList = open && suggestions.length > 0

  function choose(name: string) {
    onChange(name)
    setOpen(false)
    setHighlight(0)
  }

  function closeAndNormalize() {
    if (pickingRef.current) return
    onChange(canonicalIngredientName(catalog, value))
    setOpen(false)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => {
          setOpen(true)
          setHighlight(0)
        }}
        onBlur={closeAndNormalize}
        onKeyDown={(event) => {
          if (!showList) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((index) => (index + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight(
              (index) => (index - 1 + suggestions.length) % suggestions.length,
            )
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const suggestion = suggestions[activeIndex]
            if (suggestion) choose(suggestion.name)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border border-line bg-field px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none"
      />

      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-float)]"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.key}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onPointerDown={() => {
                pickingRef.current = true
              }}
              onPointerUp={() => {
                pickingRef.current = false
              }}
              onPointerCancel={() => {
                pickingRef.current = false
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(suggestion.name)}
              className={clsx(
                'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                index === activeIndex
                  ? 'bg-brand-soft text-brand-dark'
                  : 'text-ink hover:bg-cream',
              )}
            >
              <span className="truncate font-medium">{suggestion.name}</span>
              <span className="shrink-0 text-[10px] text-muted">{suggestion.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
