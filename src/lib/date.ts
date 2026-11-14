import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale/es'

export const DAY_NAMES = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function weekStartOf(date: Date = new Date()): string {
  return toISODate(startOfWeek(date, { weekStartsOn: 1 }))
}

export function currentWeekStart(): string {
  return weekStartOf(new Date())
}

export function addWeeks(weekStart: string, amount: number): string {
  return toISODate(addDays(parseISO(weekStart), amount * 7))
}

export function weekDates(weekStart: string): Date[] {
  const start = parseISO(weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function dayDate(weekStart: string, day: number): Date {
  return addDays(parseISO(weekStart), day)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatWeekRange(weekStart: string): string {
  const dates = weekDates(weekStart)
  const first = dates[0]
  const last = dates[6]
  const sameMonth = first.getMonth() === last.getMonth()
  if (sameMonth) {
    return `${format(first, 'd', { locale: es })} – ${format(last, 'd MMM', { locale: es })}`
  }
  const sameYear = first.getFullYear() === last.getFullYear()
  return sameYear
    ? `${format(first, 'd MMM', { locale: es })} – ${format(last, 'd MMM', { locale: es })}`
    : `${format(first, 'd MMM yy', { locale: es })} – ${format(last, 'd MMM yy', { locale: es })}`
}

export function formatWeekLong(weekStart: string): string {
  return `Semana del ${formatWeekRange(weekStart)}`
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === currentWeekStart()
}

export function formatDayHeader(date: Date): string {
  return capitalize(format(date, "EEE d 'de' MMM", { locale: es }))
}

export function relativeWeekLabel(weekStart: string): string {
  const current = currentWeekStart()
  if (weekStart === current) return 'Esta semana'
  if (weekStart === addWeeks(current, -1)) return 'Semana pasada'
  if (weekStart === addWeeks(current, 1)) return 'Próxima semana'
  return formatWeekRange(weekStart)
}
