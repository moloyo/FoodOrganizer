import { useState, type FormEvent } from 'react'
import { Leaf } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { Logo } from '../components/Shell'
import { Button, Input } from '../components/ui'

export function AuthScreen() {
  const { signIn, signUp, resetPassword } = useApp()
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!email.trim()) {
      setError('Ingresá tu email.')
      return
    }
    if (mode !== 'forgot' && password.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'forgot') {
        await resetPassword(email.trim())
        setNotice(
          'Si ese email tiene una cuenta, te va a llegar un link para elegir una contraseña nueva.',
        )
        return
      }
      if (mode === 'in') {
        await signIn(email.trim(), password)
      } else {
        const result = await signUp(email.trim(), password)
        if (result.needsConfirmation) {
          setNotice('Te mandamos un email para confirmar la cuenta. Confirmalo y después ingresá.')
          setMode('in')
        } else {
          setNotice('Cuenta creada. Ya podés empezar.')
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos completar la operación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size={58} />
          <h1 className="mt-4 font-display text-[34px] font-semibold leading-none tracking-tight text-ink">
            Comidas
          </h1>
          <p className="mt-2 max-w-[17rem] text-[13px] leading-relaxed text-muted">
            Las cenas de la semana, resueltas según el tiempo que tengas.
          </p>
        </div>

        <div className="card mt-7 p-5">
          {mode === 'forgot' ? (
            <div className="mb-4">
              <p className="text-[13px] font-semibold text-ink">Recuperar contraseña</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                Poné el email de tu cuenta y te mandamos un link para elegir una nueva.
              </p>
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
              {(
                [
                  { id: 'in', label: 'Ingresar' },
                  { id: 'up', label: 'Crear cuenta' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMode(tab.id)
                    setError('')
                    setNotice('')
                  }}
                  className={clsx(
                    'rounded-lg py-2 text-[12.5px] font-semibold transition',
                    mode === tab.id
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Email
              </span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vos@email.com"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>
            {mode !== 'forgot' && (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Contraseña
                </span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                  required
                />
              </label>
            )}

            {mode === 'in' && (
              <div className="-mt-1 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot')
                    setError('')
                    setNotice('')
                  }}
                  className="text-[11.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-2"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger-strong">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-xl bg-success-soft px-3 py-2 text-[12px] font-medium text-success-ink">
                {notice}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              {mode === 'in' ? 'Entrar' : mode === 'up' ? 'Crear mi cuenta' : 'Mandar link'}
            </Button>
          </form>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
            {mode === 'forgot'
              ? '¿Ya la recordaste?'
              : mode === 'in'
                ? '¿Primera vez?'
                : '¿Ya tenés cuenta?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'in' ? 'up' : 'in')
                setError('')
                setNotice('')
              }}
              className="font-semibold text-brand underline decoration-brand/30 underline-offset-2"
            >
              {mode === 'forgot' ? 'Ingresá' : mode === 'in' ? 'Creá tu cuenta' : 'Ingresá'}
            </button>
          </p>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1 text-[11px] font-medium text-muted">
          <Leaf className="size-3 text-brand" />
          Solo cenas vegetarianas
        </p>
      </div>
    </div>
  )
}
