import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { Shell, Logo } from './components/Shell'
import { Toaster } from './components/ui'
import { WeekScreen } from './screens/WeekScreen'
import { DishesScreen } from './screens/DishesScreen'
import { ShoppingScreen } from './screens/ShoppingScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { AuthScreen } from './screens/AuthScreen'

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

function Gate() {
  const { ready, user, isCloud } = useApp()

  if (!ready) return <Splash />
  if (isCloud && !user) return <AuthScreen />

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
  return (
    <AppProvider>
      <Gate />
      <Toaster />
    </AppProvider>
  )
}
