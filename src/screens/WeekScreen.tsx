import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { DayCard } from '../components/DayCard'
import { DishDetail } from '../components/DishDetail'
import { DishEditor } from '../components/DishEditor'
import { DishPickerSheet } from '../components/DishPickerSheet'
import { Logo, ScreenHeader } from '../components/Shell'
import { Button } from '../components/ui'
import {
  currentWeekStart,
  dayDate,
  formatWeekRange,
  isCurrentWeek,
  relativeWeekLabel,
} from '../lib/date'
import type { Dish } from '../types'

export function WeekScreen() {
  const {
    weekStart,
    days,
    dishes,
    shiftWeek,
    goToWeek,
    fillEmptyDays,
    clearWeek,
    loadExamples,
    setDayDish,
    busy,
  } = useApp()

  const [pickerDay, setPickerDay] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<Dish | null>(null)
  const [viewingDish, setViewingDish] = useState<Dish | null>(null)
  const [pendingDay, setPendingDay] = useState<number | null>(null)
  const [filling, setFilling] = useState(false)

  const planned = days.filter((day) => day.dishId).length
  const todayWeek = isCurrentWeek(weekStart)
  const year = weekStart.slice(0, 4)

  const message =
    planned === 0
      ? 'Marcá la dificultad de cada día y te sugerimos qué cocinar.'
      : planned === 7
        ? 'Semana completa. ¡A cocinar!'
        : `Te falta${7 - planned === 1 ? '' : 'n'} ${7 - planned} cena${7 - planned === 1 ? '' : 's'} por elegir.`

  async function handleFill() {
    setFilling(true)
    try {
      await fillEmptyDays()
    } finally {
      setFilling(false)
    }
  }

  function openNewDish(day: number | null) {
    setPendingDay(day)
    setEditingDish(null)
    setEditorOpen(true)
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Menú semanal"
        title="La semana"
        action={<Logo />}
        subtitle="Solo cenas. Elegí cuánta energía tenés cada día."
      />

      <div className="card flex items-stretch overflow-hidden">
        <button
          onClick={() => shiftWeek(-1)}
          className="grid w-11 place-items-center text-muted transition hover:bg-brand-soft/40 hover:text-brand"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 py-2.5 text-center">
          <p className="font-display text-[17px] font-semibold leading-tight text-ink">
            {relativeWeekLabel(weekStart)}
          </p>
          <p className="text-[11.5px] text-muted">
            {formatWeekRange(weekStart)} · {year}
          </p>
        </div>
        <button
          onClick={() => shiftWeek(1)}
          className="grid w-11 place-items-center text-muted transition hover:bg-brand-soft/40 hover:text-brand"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {!todayWeek && (
        <button
          onClick={() => goToWeek(currentWeekStart())}
          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand"
        >
          <RotateCcw className="size-3" />
          Volver a esta semana
        </button>
      )}

      <div className="card mt-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ink">{planned} de 7 cenas</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {planned > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('¿Vaciar todos los platos y dificultades de esta semana?')) {
                    void clearWeek()
                  }
                }}
                className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-danger-soft hover:text-danger-ink"
                aria-label="Vaciar semana"
                title="Vaciar semana"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <Button size="sm" onClick={handleFill} loading={filling}>
              <Sparkles className="size-3.5" />
              Sorpréndeme
            </Button>
          </div>
        </div>
        <div className="h-1.5 bg-cream">
          <div
            className="h-full rounded-r-full bg-brand transition-all duration-500"
            style={{ width: `${(planned / 7) * 100}%` }}
          />
        </div>
      </div>

      {dishes.length === 0 && !busy && (
        <div className="mt-3 rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
          <p className="text-[13px] font-semibold text-ink">Tu recetario está vacío</p>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Cargá platos con su dificultad y la app te va a sugerir qué cocinar cada noche.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void loadExamples()}>
              <UtensilsCrossed className="size-3.5" />
              Cargar ejemplos
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openNewDish(null)}>
              Crear plato
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {days.map((day) => (
          <DayCard
            key={day.day}
            day={day}
            date={dayDate(weekStart, day.day)}
            dish={dishes.find((dish) => dish.id === day.dishId)}
            onPick={() => setPickerDay(day.day)}
            onView={() =>
              setViewingDish(
                dishes.find((dish) => dish.id === day.dishId) ?? null,
              )
            }
          />
        ))}
      </div>

      <p className="mt-4 px-1 text-center text-[11px] leading-relaxed text-muted">
        Tocá una dificultad para ajustarla. Los días con menos tiempo pueden ser muy fáciles o
        directamente del freezer.
      </p>

      <DishPickerSheet
        dayIndex={pickerDay}
        onClose={() => setPickerDay(null)}
        onCreateDish={() => openNewDish(pickerDay)}
      />

      <DishDetail
        dish={viewingDish}
        onClose={() => setViewingDish(null)}
        onEdit={(dish) => {
          setViewingDish(null)
          setPendingDay(null)
          setEditingDish(dish)
          setEditorOpen(true)
        }}
      />

      <DishEditor
        open={editorOpen}
        dish={editingDish}
        onClose={() => setEditorOpen(false)}
        onSaved={(dish) => {
          if (pendingDay !== null) void setDayDish(pendingDay, dish.id)
          setPendingDay(null)
        }}
      />
    </div>
  )
}
