import type { DataAdapter } from '../../types'
import { createLocalAdapter } from './local'
import { createCloudAdapter } from './cloud'

function normalizeUrl(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '')
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL ?? '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const cloudConfigured = Boolean(url && key)

let adapter: DataAdapter | null = null

export function getAdapter(): DataAdapter {
  if (!adapter) {
    adapter = cloudConfigured ? createCloudAdapter(url, key) : createLocalAdapter()
  }
  return adapter
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
