import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addWeeks,
  dayDate,
  formatWeekRange,
  formatWeekLong,
  relativeWeekLabel,
  toISODate,
  weekDates,
  weekStartOf,
} from '../src/lib/date'

describe('fechas de la semana', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('la semana empieza el lunes', () => {
    expect(weekStartOf(new Date(2026, 10, 9))).toBe('2026-11-09') // lunes
    expect(weekStartOf(new Date(2026, 10, 14))).toBe('2026-11-09') // sábado
    expect(weekStartOf(new Date(2026, 10, 15))).toBe('2026-11-09') // domingo
    expect(weekStartOf(new Date(2026, 10, 16))).toBe('2026-11-16') // lunes siguiente
  })

  it('suma y resta semanas', () => {
    expect(addWeeks('2026-11-09', 1)).toBe('2026-11-16')
    expect(addWeeks('2026-11-09', -1)).toBe('2026-11-02')
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
  })

  it('devuelve los siete días desde el lunes', () => {
    const dates = weekDates('2026-11-09')
    expect(dates).toHaveLength(7)
    expect(toISODate(dates[0])).toBe('2026-11-09')
    expect(toISODate(dates[6])).toBe('2026-11-15')
    expect(toISODate(dayDate('2026-11-09', 3))).toBe('2026-11-12')
  })

  it('formatea el rango en español', () => {
    expect(formatWeekRange('2026-11-09')).toBe('9 – 15 nov')
    expect(formatWeekRange('2026-11-30')).toBe('30 nov – 6 dic')
    expect(formatWeekLong('2026-11-09')).toBe('Semana del 9 – 15 nov')
  })

  it('etiqueta la semana actual, la anterior y la próxima', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 14, 12))
    expect(relativeWeekLabel('2026-11-09')).toBe('Esta semana')
    expect(relativeWeekLabel('2026-11-02')).toBe('Semana pasada')
    expect(relativeWeekLabel('2026-11-16')).toBe('Próxima semana')
    expect(relativeWeekLabel('2026-10-26')).toBe('26 oct – 1 nov')
  })
})
