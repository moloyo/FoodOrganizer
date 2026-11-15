import { useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronRight,
  Cloud,
  Download,
  Leaf,
  LogOut,
  Moon,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  Waves,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button } from '../components/ui'
import { MODES } from '../lib/constants'
import { readTheme, storeTheme, THEMES, type ThemeId } from '../lib/theme'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import type { Snapshot } from '../types'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function SettingsScreen() {
  const {
    user,
    isCloud,
    cloudConfigured,
    signOut,
    exportData,
    importData,
    loadExamples,
    normalizeIngredients,
    wipeData,
    deleteAccount,
    dishes,
    toast,
  } = useApp()
  const { canInstall, installed, install } = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  const THEME_ICONS = { clasico: Sun, cool: Waves, oscuro: Moon } as const

  async function handleExport() {
    setBusy('export')
    try {
      const snapshot = await exportData()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `comidas-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast('Copia de seguridad descargada.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos exportar.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleImport(file: File) {
    setBusy('import')
    try {
      const parsed = JSON.parse(await file.text()) as Snapshot
      if (parsed?.app !== 'comidas' || !Array.isArray(parsed.dishes)) {
        throw new Error('El archivo no es un backup de Comidas.')
      }
      if (
        !window.confirm(
          'Importar reemplaza los platos, menús y compras actuales. ¿Querés continuar?',
        )
      ) {
        return
      }
      await importData(parsed)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos importar el archivo.', 'error')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleNormalize() {
    setBusy('normalize')
    try {
      await normalizeIngredients()
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteAccount() {
    if (
      !window.confirm(
        '¿Eliminar tu cuenta y todos tus datos de la nube? Esta acción no se puede deshacer.',
      )
    ) {
      return
    }
    if (!window.confirm('Última confirmación: se borra tu cuenta y no vas a poder recuperarla.')) {
      return
    }
    setBusy('delete-account')
    try {
      await deleteAccount()
      toast('Tu cuenta y tus datos fueron eliminados.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos eliminar la cuenta.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Configuración"
        title="Ajustes"
        subtitle={isCloud ? 'Tus datos se sincronizan en la nube.' : 'Tus datos viven en este dispositivo.'}
      />

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand-dark">
            {(user?.email?.[0] ?? 'L').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-ink">
              {user?.email ?? 'Sesión local'}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: isCloud ? 'var(--mode-facil)' : 'var(--mode-media)' }}
              />
              {isCloud ? 'Cuenta en la nube' : 'Solo este dispositivo'}
            </p>
          </div>
          {isCloud && (
            <Button size="icon" variant="ghost" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <Section title="Apariencia">
        <div className="card p-3">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((option) => {
              const active = theme === option.id
              const Icon = THEME_ICONS[option.id]
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    storeTheme(option.id)
                    setTheme(option.id)
                  }}
                  className={clsx(
                    'rounded-2xl border p-2 text-left transition',
                    active
                      ? 'border-brand bg-brand-soft/40 ring-2 ring-brand/20'
                      : 'border-line hover:border-line-strong',
                  )}
                >
                  <span
                    className="mb-2 flex h-12 items-center justify-center gap-1.5 rounded-xl border border-black/5"
                    style={{ backgroundColor: option.preview.background }}
                    aria-hidden
                  >
                    <span
                      className="h-5 w-3 rounded-md"
                      style={{ backgroundColor: option.preview.surface }}
                    />
                    <span
                      className="size-4 rounded-full"
                      style={{ backgroundColor: option.preview.brand }}
                    />
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: option.preview.accent }}
                    />
                  </span>
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-ink">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-muted">
                    {option.hint}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 px-1 text-[10.5px] leading-snug text-muted">
            El tema se guarda en este dispositivo y no cambia tus datos.
          </p>
        </div>
      </Section>

      <Section title="Aplicación">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Smartphone className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink">
                {installed ? 'App instalada' : 'Instalala en el celular'}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                {installed
                  ? 'Ya se abre como una app y funciona sin conexión.'
                  : 'Pantalla completa, ícono propio y funciona sin conexión.'}
              </p>
            </div>
          </div>

          <div className="mt-3">
            {installed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
                <Check className="size-3" />
                Lista para usar
              </span>
            ) : canInstall ? (
              <Button size="sm" onClick={() => void install()}>
                <Download className="size-3.5" />
                Instalar app
              </Button>
            ) : (
              <p className="rounded-xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
                {isIOS
                  ? 'En Safari: tocá Compartir y elegí "Agregar a pantalla de inicio".'
                  : 'En Chrome o Edge: abrí el menú del navegador y elegí "Instalar aplicación".'}
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Datos">
        <div className="card divide-y divide-line overflow-hidden">
          <button
            onClick={handleExport}
            disabled={busy === 'export'}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20 disabled:opacity-60"
          >
            <Download className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Exportar copia de seguridad</span>
            <ChevronRight className="size-4 text-line-strong" />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'import'}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20 disabled:opacity-60"
          >
            <Upload className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Importar desde un archivo</span>
            <ChevronRight className="size-4 text-line-strong" />
          </button>
          <button
            onClick={() => void loadExamples()}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20"
          >
            <Sparkles className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Cargar platos de ejemplo</span>
            <span className="text-[11px] text-muted">{dishes.length} platos</span>
          </button>
          <button
            onClick={() => void handleNormalize()}
            disabled={busy === 'normalize'}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20 disabled:opacity-60"
          >
            <Wand2 className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Normalizar ingredientes</span>
            <span className="text-[11px] text-muted">Unificar nombres</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImport(file)
          }}
        />
      </Section>

      {!cloudConfigured && (
        <Section title="Nube">
          <div className="card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Cloud className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">Conectar Supabase</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                  Para sincronizar el menú entre el celular y la compu, con cuenta propia.
                </p>
              </div>
            </div>
            <details className="mt-3 rounded-xl bg-cream p-3">
              <summary className="cursor-pointer text-[11.5px] font-semibold text-brand">
                Ver los 4 pasos
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted">
                <li>Creá un proyecto gratis en supabase.com.</li>
                <li>
                  En el SQL Editor, ejecutá el archivo <code>supabase/schema.sql</code> del
                  proyecto.
                </li>
                <li>
                  Copiá la URL y la anon key a <code>.env.local</code> (usá{' '}
                  <code>.env.example</code> como guía).
                </li>
                <li>Reiniciá la app: al entrar te va a pedir crear cuenta.</li>
              </ol>
            </details>
          </div>
        </Section>
      )}

      <Section title="Cómo funciona">
        <div className="card p-4">
          <p className="text-[12px] leading-snug text-muted">
            Cada día elegís una dificultad y la app te sugiere platos que encajan. Podés incluir
            opciones más fáciles, o marcar el día como "del freezer".
          </p>
          <div className="mt-3 space-y-1.5">
            {MODES.map((mode) => (
              <div key={mode.id} className="flex items-center justify-between text-[11.5px]">
                <span className="flex items-center gap-1.5 font-medium text-ink">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: mode.color }}
                  />
                  {mode.label}
                </span>
                <span className="text-muted">{mode.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Zona peligrosa">
        <div className="space-y-2">
          {isCloud && (
            <button
              onClick={() => void handleDeleteAccount()}
              disabled={busy === 'delete-account'}
              className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft disabled:opacity-60"
            >
              <Trash2 className="size-4 text-danger-ink" />
              <span className="flex-1 text-[13px] font-medium text-danger-strong">
                Eliminar mi cuenta
              </span>
              <span className="text-[10.5px] text-danger-ink/70">Cuenta y datos</span>
            </button>
          )}
          <button
            onClick={() => {
              if (
                window.confirm('¿Borrar todos los platos, menús y compras? No se puede deshacer.') &&
                window.confirm('Última confirmación: se van a borrar todos tus datos.')
              ) {
                void wipeData()
              }
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft"
          >
            <Trash2 className="size-4 text-danger-ink" />
            <span className="flex-1 text-[13px] font-medium text-danger-strong">
              Borrar todos mis datos
            </span>
          </button>
        </div>
      </Section>

      <footer className="mt-8 flex flex-col items-center gap-1 pb-2 text-center">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-brand">
          <Leaf className="size-3" />
          Pensado para cenas vegetarianas
        </span>
        <span className="text-[10.5px] text-muted">Comidas v0.1 · PWA</span>
      </footer>
    </div>
  )
}
