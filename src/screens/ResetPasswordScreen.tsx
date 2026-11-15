import { useState, type FormEvent } from 'react'
import { KeyRound, Leaf } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Logo } from '../components/Shell'
import { Button, Input } from '../components/ui'

export function ResetPasswordScreen({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const { updatePassword, toast } = useApp()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña nueva necesita al menos 6 caracteres.')
      return
    }
    if (password !== repeat) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      await updatePassword(password)
      toast('Contraseña actualizada. Ya podés usar la app.', 'success')
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cambiar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size={58} />
          <h1 className="mt-4 font-display text-[30px] font-semibold leading-none tracking-tight text-ink">
            Nueva contraseña
          </h1>
          <p className="mt-2 max-w-[18rem] text-[13px] leading-relaxed text-muted">
            Elegí una contraseña nueva para tu cuenta de Comidas.
          </p>
        </div>

        <div className="card mt-7 p-5">
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <KeyRound className="size-3.5" />
                Contraseña nueva
              </span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Repetir contraseña
              </span>
              <Input
                type="password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                placeholder="Otra vez, para confirmar"
                autoComplete="new-password"
                required
              />
            </label>

            {error && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger-strong">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Guardar contraseña
            </Button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full text-center text-[11.5px] font-semibold text-muted underline decoration-line-strong underline-offset-2 transition hover:text-ink"
            >
              Volver al ingreso
            </button>
          </form>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1 text-[11px] font-medium text-muted">
          <Leaf className="size-3 text-brand" />
          Solo cenas vegetarianas
        </p>
      </div>
    </div>
  )
}
