import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { appConfigured } from './lib/adapters'
import { Shell, Logo } from './components/Shell'
import { Toaster } from './components/ui'
import { WeekScreen } from './screens/WeekScreen'
import { DishesScreen } from './screens/DishesScreen'
import { ShoppingScreen } from './screens/ShoppingScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AuthScreen } from './screens/AuthScreen'
import { InviteScreen } from './screens/InviteScreen'
import { ResetPasswordScreen } from './screens/ResetPasswordScreen'
import { clearRecovery, recoveryPending } from './lib/recovery'
import { captureInvite, clearPendingInvite, readPendingInvite } from './lib/invite'

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="animate-pop">
        <Logo size={56} />
      </div>
      <p className="font-display text-[22px] font-semibold text-ink">Comidas</p>
      <p className="text-[12px] text-muted">Preparando la semana…</p>
    </div>
  )
}

function ConfigMissing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Logo size={56} />
        <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
          Falta configurar Supabase
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Comidas funciona con cuenta: el menú, los platos y las compras se guardan en tu
          cuenta y se sincronizan entre dispositivos.
        </p>
        <div className="card mt-6 p-4 text-left">
          <p className="text-[12px] font-semibold text-ink">Para levantarla en desarrollo:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted">
            <li>
              Copiá <code>.env.example</code> a <code>.env.local</code>.
            </li>
            <li>
              Completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
            </li>
            <li>Ejecutá <code>supabase/schema.sql</code> en el SQL Editor de Supabase.</li>
            <li>Reiniciá el servidor de desarrollo y creá tu cuenta.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function Gate() {
  const { ready, loaded, user, isCloud } = useApp()
  const [recovering, setRecovering] = useState(recoveryPending)
  const [inviteToken, setInviteToken] = useState<string | null>(() => readPendingInvite())

  useEffect(() => {
    const onHashChange = () => {
      const token = captureInvite()
      if (token) setInviteToken(token)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function finishRecovery() {
    clearRecovery()
    setRecovering(false)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#/`,
    )
  }

  function finishInvite() {
    clearPendingInvite()
    setInviteToken(null)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#/`,
    )
  }

  if (!ready) return <Splash />

  if (isCloud && recovering) {
    return <ResetPasswordScreen onDone={finishRecovery} onCancel={finishRecovery} />
  }

  if (isCloud && !user) return <AuthScreen invitePending={Boolean(inviteToken)} />

  // Evita mostrar estados vacíos ("recetario vacío") mientras llegan los datos de la nube.
  if (!loaded) return <Splash />

  // Un link de invitación se atiende antes de entrar al tablero: si la persona
  // recién creó su cuenta, primero confirmamos a qué hogar se quiere unir.
  if (isCloud && inviteToken) {
    return <InviteScreen token={inviteToken} onDone={finishInvite} />
  }

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<WeekScreen />} />
          <Route path="/platos" element={<DishesScreen />} />
          <Route path="/compras" element={<ShoppingScreen />} />
          <Route path="/historial" element={<HistoryScreen />} />
          <Route path="/ajustes" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}

export default function App() {
  if (!appConfigured) return <ConfigMissing />

  return (
    <AppProvider>
      <Gate />
      <Toaster />
    </AppProvider>
  )
}
