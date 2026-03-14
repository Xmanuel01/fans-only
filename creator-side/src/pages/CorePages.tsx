import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { env } from '../env'
import {
  fetchCreatorPricing,
  fetchPayoutAccount,
  fetchPayoutSummary,
  fetchPayoutTransfers,
  publishCreatorPost,
  requestCreatorPayout,
  requestPaypalPayout,
  signOut,
  updateCreatorPricing,
  upsertBankPayoutAccount,
  upsertMpesaPayoutAccount,
  upsertPaypalPayoutAccount,
  type PayoutAccount,
  type PayoutSummary,
  type PayoutTransfer,
} from '../supabaseClient'

const CONSUMER_APP_URL = env.consumerAppUrl
const isExternalUrl = (value: string | null) => Boolean(value && /^https?:\/\//i.test(value))
const CONSUMER_APP_EXTERNAL = isExternalUrl(CONSUMER_APP_URL)
const MIN_SUBSCRIPTION_PRICE_KES = 50

const formatMoney = (minor: number, currency = 'KES') => {
  const major = Math.round(minor) / 100
  return `${currency} ${major.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function CreatorShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="creator-shell">
      <aside className="creator-sidebar">
        <div className="creator-brand">SpicyX Creator</div>
        <nav className="creator-nav">
          <NavLink to="/posts/create" className={({ isActive }) => `creator-nav-link${isActive ? ' active' : ''}`}>
            Create post/story
          </NavLink>
          <NavLink to="/my/payments" className={({ isActive }) => `creator-nav-link${isActive ? ' active' : ''}`}>
            Payouts
          </NavLink>
          <NavLink to="/my/banking" className={({ isActive }) => `creator-nav-link${isActive ? ' active' : ''}`}>
            Payout account
          </NavLink>
          <NavLink
            to="/my/settings/subscription"
            className={({ isActive }) => `creator-nav-link${isActive ? ' active' : ''}`}
          >
            Subscription pricing
          </NavLink>
        </nav>

        <div className="creator-sidebar-footer">
          {CONSUMER_APP_URL ? (
            <a
              className="creator-link-btn"
              href={CONSUMER_APP_URL}
              target={CONSUMER_APP_EXTERNAL ? '_blank' : undefined}
              rel={CONSUMER_APP_EXTERNAL ? 'noreferrer' : undefined}
            >
              Open user app
            </a>
          ) : null}
          <button className="creator-ghost-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="creator-main">
        <header className="creator-header">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  )
}

function StatusMessage({ status }: { status: { kind: 'ok' | 'error'; message: string } | null }) {
  if (!status) return null
  return <div className={`creator-alert ${status.kind}`}>{status.message}</div>
}

export function PostsCreatePage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'subscribers' | 'ppv'>('public')
  const [priceMajor, setPriceMajor] = useState('')
  const [contentRating, setContentRating] = useState<'sfw' | 'nsfw'>('nsfw')
  const [postType, setPostType] = useState<'post' | 'story'>('post')
  const [storyHours, setStoryHours] = useState('24')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const computedStoryExpires = useMemo(() => {
    const hours = Number(storyHours)
    if (!Number.isFinite(hours) || hours <= 0) return null
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  }, [storyHours])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setStatus({ kind: 'error', message: 'Title is required.' })
      return
    }

    const price = Number(priceMajor)
    const priceCents = visibility === 'ppv' ? Math.round(price * 100) : 0
    if (visibility === 'ppv' && (!Number.isFinite(price) || price <= 0)) {
      setStatus({ kind: 'error', message: 'Set a valid PPV price.' })
      return
    }

    if (postType === 'story' && !computedStoryExpires) {
      setStatus({ kind: 'error', message: 'Set a valid story expiry window (hours).' })
      return
    }

    setSubmitting(true)
    setStatus(null)
    try {
      await publishCreatorPost({
        title: cleanTitle,
        body: body.trim() || null,
        visibility,
        price_cents: priceCents,
        currency: 'KES',
        content_rating: contentRating,
        post_type: postType,
        expires_at: postType === 'story' ? computedStoryExpires : null,
        files,
      })
      setStatus({ kind: 'ok', message: `${postType === 'story' ? 'Story' : 'Post'} published.` })
      setTitle('')
      setBody('')
      setVisibility('public')
      setPriceMajor('')
      setFiles([])
      setPostType('post')
      setStoryHours('24')
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not publish content.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CreatorShell title="Create post/story" subtitle="Upload real production content for your audience.">
      <StatusMessage status={status} />
      <form className="creator-form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Post title" maxLength={180} />
        </label>

        <label>
          Description
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Tell fans what this content includes"
            rows={5}
          />
        </label>

        <div className="creator-grid two">
          <label>
            Content type
            <select value={postType} onChange={(event) => setPostType(event.target.value as 'post' | 'story')}>
              <option value="post">Post</option>
              <option value="story">Story</option>
            </select>
          </label>

          <label>
            Visibility
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as 'public' | 'subscribers' | 'ppv')}
            >
              <option value="public">Public</option>
              <option value="subscribers">Subscribers only</option>
              <option value="ppv">Pay-per-view</option>
            </select>
          </label>
        </div>

        <div className="creator-grid two">
          <label>
            Content rating
            <select value={contentRating} onChange={(event) => setContentRating(event.target.value as 'sfw' | 'nsfw')}>
              <option value="nsfw">NSFW</option>
              <option value="sfw">SFW</option>
            </select>
          </label>

          {visibility === 'ppv' ? (
            <label>
              PPV price (KES)
              <input
                type="number"
                min="1"
                step="0.01"
                value={priceMajor}
                onChange={(event) => setPriceMajor(event.target.value)}
                placeholder="500"
              />
            </label>
          ) : (
            <div className="creator-hint">Price not required for this visibility.</div>
          )}
        </div>

        {postType === 'story' ? (
          <label>
            Story expires after (hours)
            <input
              type="number"
              min="1"
              max="168"
              step="1"
              value={storyHours}
              onChange={(event) => setStoryHours(event.target.value)}
            />
          </label>
        ) : null}

        <label>
          Media files (images/video)
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>

        {files.length ? (
          <div className="creator-file-list">
            {files.map((file) => (
              <div key={`${file.name}-${file.size}`}>{`${file.name} (${Math.round(file.size / 1024)} KB)`}</div>
            ))}
          </div>
        ) : null}

        <button className="creator-primary-btn" disabled={submitting} type="submit">
          {submitting ? 'Publishing...' : `Publish ${postType}`}
        </button>
      </form>
    </CreatorShell>
  )
}

export function PaymentsPage() {
  const [summary, setSummary] = useState<PayoutSummary | null>(null)
  const [transfers, setTransfers] = useState<PayoutTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [amountMajor, setAmountMajor] = useState('')
  const [provider, setProvider] = useState<'mpesa' | 'bank' | 'paypal'>('mpesa')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [nextSummary, nextTransfers] = await Promise.all([
        fetchPayoutSummary(),
        fetchPayoutTransfers(25),
      ])
      setSummary(nextSummary)
      setTransfers(nextTransfers)
      setStatus(null)
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not load payouts.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const requestPayout = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(amountMajor)
    if (amountMajor && (!Number.isFinite(amount) || amount <= 0)) {
      setStatus({ kind: 'error', message: 'Enter a valid payout amount.' })
      return
    }
    const amountMinor = amountMajor ? Math.round(amount * 100) : undefined

    setRequesting(true)
    setStatus(null)
    try {
      if (provider === 'paypal') {
        await requestPaypalPayout({ amountMinor, currency: 'KES', reason: 'creator_dashboard' })
      } else {
        await requestCreatorPayout({
          amountMinor,
          currency: 'KES',
          reason: 'creator_dashboard',
          provider,
        })
      }
      setAmountMajor('')
      setStatus({ kind: 'ok', message: 'Payout request submitted.' })
      await load()
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not request payout.' })
    } finally {
      setRequesting(false)
    }
  }

  return (
    <CreatorShell title="Payouts" subtitle="Review balances and submit payout requests.">
      <StatusMessage status={status} />

      <div className="creator-card">
        <div className="creator-metric-row">
          <div>
            <div className="creator-metric-label">Available</div>
            <div className="creator-metric-value">
              {formatMoney(summary?.available_amount_minor ?? 0, summary?.currency ?? 'KES')}
            </div>
          </div>
          <div>
            <div className="creator-metric-label">Pending</div>
            <div className="creator-metric-value">
              {formatMoney(summary?.pending_amount_minor ?? 0, summary?.currency ?? 'KES')}
            </div>
          </div>
        </div>
      </div>

      <form className="creator-card creator-inline-form" onSubmit={requestPayout}>
        <label>
          Amount (KES)
          <input
            type="number"
            min="1"
            step="0.01"
            value={amountMajor}
            onChange={(event) => setAmountMajor(event.target.value)}
            placeholder="Leave empty for max available"
          />
        </label>

        <label>
          Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value as 'mpesa' | 'bank' | 'paypal')}>
            <option value="mpesa">M-PESA</option>
            <option value="bank">Bank</option>
            <option value="paypal">PayPal</option>
          </select>
        </label>

        <button className="creator-primary-btn" disabled={requesting} type="submit">
          {requesting ? 'Submitting...' : 'Request payout'}
        </button>
      </form>

      <div className="creator-card">
        <div className="creator-table-head">
          <h3>Recent transfers</h3>
          <button className="creator-ghost-btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {!transfers.length ? (
          <p className="creator-muted">No payout transfers yet.</p>
        ) : (
          <div className="creator-table-wrap">
            <table className="creator-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Failure reason</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>{transfer.id}</td>
                    <td>{formatMoney(transfer.amount_minor, transfer.currency)}</td>
                    <td>{transfer.status}</td>
                    <td>{formatDateTime(transfer.created_at)}</td>
                    <td>{transfer.failure_reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CreatorShell>
  )
}

export function BankingPage() {
  const [account, setAccount] = useState<PayoutAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [provider, setProvider] = useState<'mpesa' | 'bank' | 'paypal'>('mpesa')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [bankName, setBankName] = useState('')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const result = await fetchPayoutAccount()
      setAccount(result)
      if (result) {
        setProvider(result.provider)
        setAccountName(result.account_name ?? '')
        setBankCode(result.bank_code ?? '')
        setBankName(result.bank_name ?? '')
        setPaypalEmail(result.paypal_email ?? '')
      }
      setStatus(null)
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not load payout account.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      if (provider === 'mpesa') {
        if (!accountName.trim() || !accountNumber.trim()) {
          setStatus({ kind: 'error', message: 'Account name and M-PESA number are required.' })
          setSaving(false)
          return
        }
        await upsertMpesaPayoutAccount({
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
          bankCode: bankCode.trim() || undefined,
          currency: 'KES',
        })
      } else if (provider === 'bank') {
        if (!accountName.trim() || !accountNumber.trim() || !bankCode.trim()) {
          setStatus({ kind: 'error', message: 'Bank account name, number, and bank code are required.' })
          setSaving(false)
          return
        }
        await upsertBankPayoutAccount({
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
          bankCode: bankCode.trim(),
          bankName: bankName.trim() || undefined,
          currency: 'KES',
        })
      } else {
        if (!paypalEmail.trim()) {
          setStatus({ kind: 'error', message: 'PayPal email is required.' })
          setSaving(false)
          return
        }
        await upsertPaypalPayoutAccount({
          paypalEmail: paypalEmail.trim(),
          currency: 'KES',
        })
      }

      setStatus({ kind: 'ok', message: 'Payout account saved.' })
      setAccountNumber('')
      await load()
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not save payout account.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CreatorShell title="Payout account" subtitle="Configure where creator payouts should be sent.">
      <StatusMessage status={status} />

      <div className="creator-card">
        <h3>Current payout destination</h3>
        {loading ? <p className="creator-muted">Loading account...</p> : null}
        {!loading && !account ? <p className="creator-muted">No payout account configured yet.</p> : null}
        {!loading && account ? (
          <div className="creator-details-grid">
            <div>
              <span>Provider</span>
              <strong>{account.provider}</strong>
            </div>
            <div>
              <span>Account name</span>
              <strong>{account.account_name}</strong>
            </div>
            <div>
              <span>Account ending</span>
              <strong>{account.account_number_last4 ?? '-'}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>{account.currency}</strong>
            </div>
          </div>
        ) : null}
      </div>

      <form className="creator-form" onSubmit={save}>
        <div className="creator-grid two">
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value as 'mpesa' | 'bank' | 'paypal')}>
              <option value="mpesa">M-PESA</option>
              <option value="bank">Bank</option>
              <option value="paypal">PayPal</option>
            </select>
          </label>

          <label>
            Account name
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Legal account name" />
          </label>
        </div>

        {provider === 'paypal' ? (
          <label>
            PayPal email
            <input type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} placeholder="you@example.com" />
          </label>
        ) : (
          <div className="creator-grid two">
            <label>
              {provider === 'mpesa' ? 'M-PESA number' : 'Bank account number'}
              <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Account number" />
            </label>

            <label>
              Bank code
              <input value={bankCode} onChange={(event) => setBankCode(event.target.value)} placeholder="Optional for M-PESA" />
            </label>
          </div>
        )}

        {provider === 'bank' ? (
          <label>
            Bank name
            <input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Your bank name" />
          </label>
        ) : null}

        <button className="creator-primary-btn" disabled={saving} type="submit">
          {saving ? 'Saving...' : 'Save payout account'}
        </button>
      </form>
    </CreatorShell>
  )
}

export function SubscriptionSettingsPage() {
  const [priceMajor, setPriceMajor] = useState('')
  const [currency, setCurrency] = useState('KES')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const pricing = await fetchCreatorPricing()
      if (pricing) {
        setPriceMajor((pricing.subscription_price_cents / 100).toString())
        setCurrency(pricing.subscription_currency)
      } else {
        setPriceMajor('')
        setCurrency('KES')
      }
      setStatus(null)
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not load subscription pricing.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(priceMajor)
    if (!Number.isFinite(amount) || amount < MIN_SUBSCRIPTION_PRICE_KES) {
      setStatus({ kind: 'error', message: `Enter a valid subscription price of at least KSh ${MIN_SUBSCRIPTION_PRICE_KES}.` })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      await updateCreatorPricing({
        subscription_price_cents: Math.round(amount * 100),
        subscription_currency: currency,
      })
      setStatus({ kind: 'ok', message: 'Subscription pricing updated.' })
      await load()
    } catch (error: any) {
      console.error(error)
      setStatus({ kind: 'error', message: error?.message ?? 'Could not update pricing.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CreatorShell title="Subscription pricing" subtitle="Set your recurring subscription price for fans.">
      <StatusMessage status={status} />

      <form className="creator-form" onSubmit={submit}>
        <div className="creator-grid two">
          <label>
            Subscription amount
            <input
              type="number"
              min={MIN_SUBSCRIPTION_PRICE_KES}
              step="1"
              value={priceMajor}
              onChange={(event) => setPriceMajor(event.target.value)}
              placeholder={String(MIN_SUBSCRIPTION_PRICE_KES)}
            />
          </label>

          <label>
            Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="KES">KES</option>
            </select>
          </label>
        </div>

        <div className="creator-hint">
          {loading
            ? 'Loading pricing...'
            : `Current price: ${priceMajor || '0'} ${currency}. Minimum KSh ${MIN_SUBSCRIPTION_PRICE_KES}.`}
        </div>

        <button className="creator-primary-btn" disabled={saving} type="submit">
          {saving ? 'Saving...' : 'Save subscription price'}
        </button>
      </form>
    </CreatorShell>
  )
}
