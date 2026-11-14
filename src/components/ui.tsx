import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'

/* --------------------------------- Botón --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-on-brand shadow-[0_6px_16px_-8px_rgba(47,106,79,0.8)] hover:bg-brand-dark active:scale-[0.98]',
  secondary:
    'bg-surface text-ink border border-line-strong hover:border-brand/50 hover:bg-brand-soft/40 active:scale-[0.98]',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5 active:scale-[0.98]',
  soft: 'bg-brand-soft text-brand-dark hover:bg-brand-soft/70 active:scale-[0.98]',
  danger: 'bg-danger-soft text-danger-ink hover:bg-danger-soft/70 active:scale-[0.98]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl justify-center',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  )
}

/* ------------------------------- Formularios ------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('field', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('field resize-y', className)} {...props} />
}

/* --------------------------------- Chips --------------------------------- */

export function Chip({
  active = false,
  color,
  soft,
  onClick,
  children,
  className,
}: {
  active?: boolean
  color?: string
  soft?: string
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold leading-none transition-all duration-150',
        active ? 'shadow-sm' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
        className,
      )}
      style={
        active
          ? {
              backgroundColor: soft ?? 'var(--color-brand-soft)',
              color: color ?? 'var(--color-brand-dark)',
              borderColor: `color-mix(in srgb, ${color ?? 'var(--color-brand)'} 38%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </button>
  )
}

/* --------------------------------- Sheet --------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade bg-black/50 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={clsx(
          'relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-hidden rounded-t-[28px] border border-line bg-cream shadow-[var(--shadow-float)] sm:rounded-[28px]',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="shrink-0 px-5 pt-3 pb-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold leading-tight text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-surface/70 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------ Empty state ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* --------------------------------- Badge --------------------------------- */

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: color }} />
}

/* -------------------------------- Toasts -------------------------------- */

export function Toaster() {
  const { toasts, dismissToast } = useApp()
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismissToast(toast.id)}
          className={clsx(
            'pointer-events-auto w-full max-w-sm animate-rise rounded-2xl border px-4 py-3 text-left text-[13px] font-medium shadow-[var(--shadow-float)] backdrop-blur',
            toast.tone === 'error' && 'border-danger-border bg-danger-soft/95 text-danger-strong',
            toast.tone === 'success' &&
              'border-success-border bg-success-soft/95 text-success-ink',
            toast.tone === 'info' && 'border-line-strong bg-surface/95 text-ink',
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>,
    document.body,
  )
}
