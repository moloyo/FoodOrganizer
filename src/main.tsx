import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/recovery'
import { captureInvite } from './lib/invite'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import './index.css'
import App from './App'
import { applyTheme, readTheme } from './lib/theme'

// Antes de pintar, aplicamos el tema guardado para evitar un destello de otro color.
applyTheme(readTheme())
// Si llegamos por un link de invitación, lo recordamos antes de que Supabase toque el hash.
captureInvite()

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
