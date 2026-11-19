import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import LogOut from 'lucide-react/icons/log-out'
import Mail from 'lucide-react/icons/mail'
import RefreshCw from 'lucide-react/icons/refresh-cw'
import { isSyncConfigured, signInWithOAuth, signInWithOtp, signOut, useAuth, useSyncStatus } from '@/sync'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Field, Input } from '@/ui/Input'
import { toast } from '@/ui/Toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8a6 6 0 0 1 0-12c1.9 0 3.1.8 3.8 1.5l2.6-2.5A9.6 9.6 0 0 0 12 2.3a9.7 9.7 0 1 0 0 19.4c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-2z"
      />
    </svg>
  )
}

export function AccountSection() {
  const { t } = useTranslation()
  const user = useAuth((s) => s.user)
  const loading = useAuth((s) => s.loading)
  const status = useSyncStatus((s) => s.status)
  const pending = useSyncStatus((s) => s.pending)
  const lastSyncedAt = useSyncStatus((s) => s.lastSyncedAt)
  const lastError = useSyncStatus((s) => s.lastError)
  const retry = useSyncStatus((s) => s.retry)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailOk = EMAIL_RE.test(email.trim())

  const sendLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailOk) return setError(t('account.email.invalid'))
    setBusy(true)
    setError(null)
    try {
      await signInWithOtp(email.trim())
      setSent(email.trim())
    } catch {
      setError(t('account.email.failed'))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(null)
    try {
      await signInWithOAuth('google')
    } catch {
      setError(t('account.google.failed'))
    }
  }

  const out = async () => {
    try {
      await signOut()
      toast(t('account.signedOut'), { tone: 'ok' })
    } catch {
      toast(t('account.signOutFailed'), { tone: 'danger' })
    }
  }

  const statusKey = status === 'synced' ? 'idle' : status
  const statusText = `${t(`sync.${statusKey}`)}${pending > 0 && status !== 'disabled' ? `, ${t('sync.pending', { count: pending })}` : ''}`

  return (
    <div className="flex flex-col gap-4" data-testid="account-section">
      {!isSyncConfigured ? (
        <Banner tone="info" title={t('account.disabled.title')}>
          {t('account.disabled.body')}
        </Banner>
      ) : null}

      {user ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">{t('account.signedInAs')}</p>
            <p className="font-medium text-fg [overflow-wrap:anywhere]" data-testid="account-email">
              {user.email ?? user.id}
            </p>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-[15px] sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">{t('account.status')}</dt>
            <dd className="text-fg" data-testid="account-status">
              {statusText}
            </dd>
            {lastSyncedAt ? (
              <>
                <dt className="text-muted">{t('account.lastSync')}</dt>
                <dd className="text-fg">{new Date(lastSyncedAt).toLocaleString()}</dd>
              </>
            ) : null}
          </dl>
          {status === 'error' && lastError ? (
            <Banner tone="danger" title={t('account.syncError')}>
              {lastError}
            </Banner>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button icon={<RefreshCw size={18} />} onClick={retry}>
              {t('account.syncNow')}
            </Button>
            <Button icon={<LogOut size={18} />} onClick={() => void out()}>
              {t('account.signOut')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <form onSubmit={(e) => void sendLink(e)} noValidate className="flex flex-col gap-3">
            <Field
              label={t('account.email.label')}
              hint={isSyncConfigured ? t('account.email.hint') : undefined}
              error={error ?? undefined}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={email}
                  disabled={!isSyncConfigured}
                  placeholder="nome@esempio.it"
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                  data-testid="account-email-input"
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="primary"
              icon={<Mail size={18} />}
              busy={busy}
              disabled={!isSyncConfigured || loading}
              className="self-start"
              data-testid="account-send"
            >
              {t('account.email.send')}
            </Button>
            {sent ? (
              <Banner tone="ok" title={t('account.email.sentTitle')}>
                {t('account.email.sent', { email: sent })}
              </Banner>
            ) : null}
          </form>
          <div className="flex flex-col gap-3 sm:border-l sm:border-line sm:pl-4">
            <p className="text-sm font-medium text-fg">{t('account.or')}</p>
            <Button
              icon={<GoogleMark />}
              onClick={() => void google()}
              disabled={!isSyncConfigured || loading}
              className="self-start"
              data-testid="account-google"
            >
              {t('account.google.action')}
            </Button>
            <p className="text-sm text-muted">{t('account.why')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
