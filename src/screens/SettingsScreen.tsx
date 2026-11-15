import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  Leaf,
  Link2,
  LogOut,
  Moon,
  Pencil,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Users,
  Wand2,
  Waves,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button, Input } from '../components/ui'
import { MODES } from '../lib/constants'
import { buildInviteLink } from '../lib/invite'
import { canLeaveHousehold } from '../lib/household'
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

function formatInviteDate(value: string): string {
  return new Date(value).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function SettingsScreen() {
  const {
    user,
    household,
    householdMembers,
    householdInvites,
    refreshHousehold,
    createInvite,
    revokeInvite,
    renameHousehold,
    leaveHousehold,
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
  const [editName, setEditName] = useState(household?.name ?? '')
  const [newLink, setNewLink] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [householdBusy, setHouseholdBusy] = useState<string | null>(null)

  useEffect(() => {
    setEditName(household?.name ?? '')
  }, [household?.id, household?.name])

  const activeInvites = householdInvites.filter(
    (invite) => !invite.revokedAt && new Date(invite.expiresAt) > new Date(),
  )
  const puedeSalir = canLeaveHousehold(household)

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

  async function handleRefreshHousehold() {
    setHouseholdBusy('refresh')
    try {
      await refreshHousehold()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos cargar tu hogar.', 'error')
    } finally {
      setHouseholdBusy(null)
    }
  }

  async function handleRename() {
    const name = editName.trim()
    if (!name) {
      toast('Poné un nombre para el hogar.', 'error')
      return
    }
    if (name.length > 60) {
      toast('El nombre puede tener hasta 60 caracteres.', 'error')
      return
    }
    setHouseholdBusy('rename')
    try {
      await renameHousehold(name)
      toast('Nombre actualizado.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos renombrar el hogar.', 'error')
    } finally {
      setHouseholdBusy(null)
    }
  }

  async function handleCreateInvite() {
    setHouseholdBusy('create')
    try {
      const invite = await createInvite()
      setNewToken(invite.token)
      setNewLink(buildInviteLink(invite.token))
      toast('Link de invitación creado.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos crear el link.', 'error')
    } finally {
      setHouseholdBusy(null)
    }
  }

  async function copyLink(link: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Portapapeles no disponible.')
      await navigator.clipboard.writeText(link)
      toast('Link copiado.', 'success')
    } catch {
      // Fallback para navegadores sin permiso sobre el portapapeles.
      const area = document.createElement('textarea')
      area.value = link
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.top = '-9999px'
      document.body.appendChild(area)
      area.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      document.body.removeChild(area)
      toast(
        copied ? 'Link copiado.' : 'No pudimos copiar el link.',
        copied ? 'success' : 'error',
      )
    }
  }

  async function handleRevoke(token: string) {
    setHouseholdBusy(`revoke:${token}`)
    try {
      await revokeInvite(token)
      if (newToken === token) {
        setNewLink(null)
        setNewToken(null)
      }
      toast('Link revocado.', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos revocar el link.', 'error')
    } finally {
      setHouseholdBusy(null)
    }
  }

  async function handleLeaveHousehold() {
    if (!canLeaveHousehold(household)) {
      toast(
        'Sos el único miembro del hogar. Abrí un link de invitación para cambiarte.',
        'info',
      )
      return
    }
    if (
      !window.confirm(
        '¿Salir del hogar? Los datos compartidos quedan en el hogar y vas a pasar a un hogar nuevo vacío.',
      )
    ) {
      return
    }
    setHouseholdBusy('leave')
    try {
      await leaveHousehold()
      setNewLink(null)
      setNewToken(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos salir del hogar.', 'error')
    } finally {
      setHouseholdBusy(null)
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
            {household && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                <Users className="size-3 shrink-0" />
                <span className="truncate">{household.name}</span>
              </p>
            )}
          </div>
          {isCloud && (
            <Button size="icon" variant="ghost" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {isCloud && (
        <Section title="Hogar">
          {!household ? (
            <div className="card p-4">
              <p className="text-[12.5px] leading-snug text-muted">
                Todavía no pudimos cargar tu hogar.
              </p>
              <Button
                size="sm"
                variant="soft"
                className="mt-3"
                onClick={() => void handleRefreshHousehold()}
                disabled={householdBusy === 'refresh'}
              >
                {householdBusy === 'refresh' ? 'Cargando…' : 'Reintentar'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Users className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink">{household.name}</p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
                      <Users className="size-3" />
                      {household.memberCount} miembro{household.memberCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={60}
                    placeholder="Nombre del hogar"
                    aria-label="Nombre del hogar"
                    className="h-9 text-[12.5px]"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => void handleRename()}
                    disabled={householdBusy === 'rename'}
                  >
                    <Pencil className="size-3.5" />
                    Guardar
                  </Button>
                </div>
              </div>

              <div className="card divide-y divide-line overflow-hidden">
                {householdMembers.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cream text-[11px] font-semibold uppercase text-muted">
                      {member.email?.[0] ?? '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                      {member.email}
                      {user?.id === member.userId && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted">(vos)</span>
                      )}
                    </span>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                        member.role === 'owner'
                          ? 'bg-brand-soft text-brand-dark'
                          : 'bg-cream text-muted',
                      )}
                    >
                      {member.role === 'owner' ? 'Dueño' : 'Miembro'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-brand" />
                  <p className="text-[13px] font-semibold text-ink">Invitaciones</p>
                </div>

                {newLink && (
                  <div className="mt-3 rounded-xl bg-brand-soft/50 p-3">
                    <p className="mb-1.5 text-[11px] font-semibold text-brand-dark">
                      Nuevo link listo para compartir
                    </p>
                    <Input
                      value={newLink}
                      readOnly
                      aria-label="Nuevo link de invitación"
                      className="h-9 text-[11.5px]"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void copyLink(newLink)}
                      >
                        <Copy className="size-3.5" />
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => newToken && void handleRevoke(newToken)}
                        disabled={!newToken || householdBusy === `revoke:${newToken}`}
                      >
                        <Trash2 className="size-3.5" />
                        Revocar
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => void handleCreateInvite()}
                  disabled={householdBusy === 'create'}
                >
                  <Link2 className="size-3.5" />
                  {householdBusy === 'create' ? 'Creando…' : 'Crear link de invitación'}
                </Button>

                {activeInvites.length > 0 ? (
                  <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {activeInvites.map((invite) => (
                      <div key={invite.token} className="flex items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11.5px] font-medium text-ink">
                            {invite.token.slice(0, 8)}…
                          </p>
                          <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                            Vence el {formatInviteDate(invite.expiresAt)} · usado{' '}
                            {invite.usedCount} {invite.usedCount === 1 ? 'vez' : 'veces'}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Copiar link de invitación"
                          onClick={() => void copyLink(buildInviteLink(invite.token))}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Revocar link de invitación"
                          onClick={() => void handleRevoke(invite.token)}
                          disabled={householdBusy === `revoke:${invite.token}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
                    No hay links activos.
                  </p>
                )}
              </div>

            </div>
          )}
        </Section>
      )}

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
          {isCloud && puedeSalir && (
            <button
              onClick={() => void handleLeaveHousehold()}
              disabled={householdBusy === 'leave'}
              className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft disabled:opacity-60"
            >
              <LogOut className="size-4 text-danger-ink" />
              <span className="flex-1 text-[13px] font-medium text-danger-strong">
                {householdBusy === 'leave' ? 'Saliendo del hogar…' : 'Salir del hogar'}
              </span>
              <span className="text-[10.5px] text-danger-ink/70">Datos compartidos</span>
            </button>
          )}
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
