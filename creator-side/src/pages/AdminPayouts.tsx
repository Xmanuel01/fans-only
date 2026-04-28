import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  fetchAdminPayoutRequests,
  getSession,
  reviewAdminPayoutRequest,
  signOut,
  type AdminPayoutRequest,
  type AdminPayoutReviewStatus,
} from '../supabaseClient';
import { env, isAdminEmail } from '../env';
import './AdminPayouts.css';

type FilterKey = 'open' | 'all' | AdminPayoutReviewStatus;

const formatMinorCurrency = (amountMinor: number, currency: string) => {
  const major = Math.max(0, amountMinor) / 100;
  if ((currency ?? 'KES').toUpperCase() === 'KES') {
    return `KSh ${major.toLocaleString(undefined, {
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${currency} ${major.toLocaleString(undefined, {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const statusLabel = (status: AdminPayoutReviewStatus) => {
  if (status === 'queued') return 'Pending review';
  if (status === 'submitted') return 'Processing';
  if (status === 'success') return 'Paid';
  if (status === 'failed') return 'Rejected';
  return 'Reversed';
};

const methodLabel = (method: AdminPayoutRequest['requestedMethod']) => {
  if (method === 'bank') return 'Bank payout';
  if (method === 'mobile_money') return 'Mobile money payout';
  return 'Withdrawal';
};

export default function AdminPayouts() {
  const [accessChecked, setAccessChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [requests, setRequests] = useState<AdminPayoutRequest[]>([]);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState<AdminPayoutReviewStatus | null>(null);
  const [reason, setReason] = useState('');

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextRequests = await fetchAdminPayoutRequests({ status: 'all', limit: 120 });
      setRequests(nextRequests);
      setSelectedId((current) => {
        if (current && nextRequests.some((item) => item.id === current)) {
          return current;
        }
        return nextRequests[0]?.id ?? null;
      });
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load withdrawal requests.');
      setRequests([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const session = await getSession();
        const email = session?.user?.email ?? null;
        if (!email || !isAdminEmail(email)) {
          if (!cancelled) {
            setAuthorized(false);
            setAccessChecked(true);
          }
          return;
        }
        if (cancelled) return;
        setAuthorized(true);
        setAccessChecked(true);
        await loadRequests();
      } catch (bootError) {
        console.error(bootError);
        if (!cancelled) {
          setAuthorized(false);
          setAccessChecked(true);
          setError('Could not verify admin access.');
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void loadRequests();
  }, [authorized]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requests;
    if (filter === 'open') {
      return requests.filter((item) => item.status === 'queued' || item.status === 'submitted');
    }
    return requests.filter((item) => item.status === filter);
  }, [filter, requests]);

  const selectedRequest = useMemo(
    () => filteredRequests.find((item) => item.id === selectedId) ?? filteredRequests[0] ?? null,
    [filteredRequests, selectedId],
  );

  const metrics = useMemo(() => {
    let openCount = 0;
    let processingCount = 0;
    let paidCount = 0;
    let reversedCount = 0;
    let queuedMinor = 0;
    let paidMinor = 0;

    for (const request of requests) {
      if (request.status === 'queued') {
        openCount += 1;
        queuedMinor += request.amountMinor;
      } else if (request.status === 'submitted') {
        processingCount += 1;
        queuedMinor += request.amountMinor;
      } else if (request.status === 'success') {
        paidCount += 1;
        paidMinor += request.amountMinor;
      } else if (request.status === 'reversed') {
        reversedCount += 1;
      }
    }

    return {
      openCount,
      processingCount,
      paidCount,
      reversedCount,
      queuedMinor,
      paidMinor,
    };
  }, [requests]);

  const submitReview = async (status: AdminPayoutReviewStatus) => {
    if (!selectedRequest) return;
    if ((status === 'failed' || status === 'reversed') && !reason.trim()) {
      setError('Add a reason before rejecting or reversing a withdrawal.');
      return;
    }

    try {
      setActing(status);
      setError(null);
      setNotice(null);
      await reviewAdminPayoutRequest({
        transferId: selectedRequest.id,
        status,
        reason: reason.trim() || null,
        metadata: { source: 'admin-dashboard' },
      });
      setNotice(`Withdrawal ${selectedRequest.reference} updated to ${statusLabel(status)}.`);
      setReason('');
      await loadRequests();
    } catch (actionError) {
      console.error(actionError);
      setError(actionError instanceof Error ? actionError.message : 'Could not update withdrawal request.');
    } finally {
      setActing(null);
    }
  };

  if (accessChecked && !authorized) {
    return <Navigate to="/" replace />;
  }

  const destination = selectedRequest?.destinationSnapshot ?? null;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-kicker">Admin workspace</div>
          <h1>Withdrawal queue</h1>
          <p>
            Review creator withdrawal requests, move approved items into processing, and close them
            out once payout is complete.
          </p>
        </div>
        <div className="admin-header__actions">
          <button className="admin-ghost-button" type="button" onClick={() => void loadRequests()}>
            Refresh
          </button>
          <button
            className="admin-ghost-button"
            type="button"
            onClick={async () => {
              await signOut();
              window.location.assign(`${env.creatorBasePath}/`);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="admin-metrics">
        <article className="admin-metric-card">
          <span>Pending review</span>
          <strong>{metrics.openCount}</strong>
          <small>{formatMinorCurrency(metrics.queuedMinor, 'KES')} awaiting action</small>
        </article>
        <article className="admin-metric-card">
          <span>Processing</span>
          <strong>{metrics.processingCount}</strong>
          <small>Marked as in-flight</small>
        </article>
        <article className="admin-metric-card">
          <span>Paid out</span>
          <strong>{metrics.paidCount}</strong>
          <small>{formatMinorCurrency(metrics.paidMinor, 'KES')} completed</small>
        </article>
        <article className="admin-metric-card">
          <span>Returned</span>
          <strong>{metrics.reversedCount}</strong>
          <small>Requests sent back to balance</small>
        </article>
      </section>

      <section className="admin-filter-row">
        {([
          ['open', 'Open'],
          ['all', 'All'],
          ['success', 'Paid'],
          ['failed', 'Rejected'],
          ['reversed', 'Returned'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-filter-chip${filter === key ? ' is-active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </section>

      {notice ? <div className="admin-notice">{notice}</div> : null}
      {error ? <div className="admin-error">{error}</div> : null}

      <div className="admin-grid">
        <section className="admin-queue">
          <div className="admin-panel-header">
            <h2>Requests</h2>
            <span>{loading ? 'Loading...' : `${filteredRequests.length} items`}</span>
          </div>
          <div className="admin-queue-list">
            {filteredRequests.length ? (
              filteredRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={`admin-queue-item${selectedRequest?.id === request.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedId(request.id);
                    setReason(request.failureReason ?? '');
                    setNotice(null);
                    setError(null);
                  }}
                >
                  <div className="admin-queue-item__top">
                    <strong>{request.creatorName ?? request.creatorEmail ?? 'Creator'}</strong>
                    <span className={`admin-status admin-status--${request.status}`}>{statusLabel(request.status)}</span>
                  </div>
                  <div className="admin-queue-item__meta">
                    <span>{methodLabel(request.requestedMethod)}</span>
                    <span>{formatMinorCurrency(request.amountMinor, request.currency)}</span>
                  </div>
                  <div className="admin-queue-item__time">{formatDateTime(request.createdAt)}</div>
                </button>
              ))
            ) : (
              <div className="admin-empty-state">No withdrawal requests found for this filter.</div>
            )}
          </div>
        </section>

        <section className="admin-detail">
          {selectedRequest ? (
            <>
              <div className="admin-panel-header">
                <div>
                  <h2>{formatMinorCurrency(selectedRequest.amountMinor, selectedRequest.currency)}</h2>
                  <span>{selectedRequest.reference}</span>
                </div>
                <span className={`admin-status admin-status--${selectedRequest.status}`}>
                  {statusLabel(selectedRequest.status)}
                </span>
              </div>

              <div className="admin-detail-grid">
                <article className="admin-detail-card">
                  <span className="admin-detail-card__label">Creator</span>
                  <strong>{selectedRequest.creatorName ?? 'Creator account'}</strong>
                  <small>{selectedRequest.creatorEmail ?? 'Email unavailable'}</small>
                  {selectedRequest.creatorHandle ? <small>@{selectedRequest.creatorHandle.replace(/^@/, '')}</small> : null}
                </article>
                <article className="admin-detail-card">
                  <span className="admin-detail-card__label">Requested method</span>
                  <strong>{methodLabel(selectedRequest.requestedMethod)}</strong>
                  <small>Submitted {formatDateTime(selectedRequest.createdAt)}</small>
                  <small>Updated {formatDateTime(selectedRequest.updatedAt)}</small>
                </article>
              </div>

              <article className="admin-destination-card">
                <div className="admin-destination-card__title">Destination snapshot</div>
                {destination ? (
                  <div className="admin-destination-card__rows">
                    {Object.entries(destination).map(([key, value]) => (
                      <div key={key} className="admin-destination-card__row">
                        <span>{key}</span>
                        <strong>{typeof value === 'string' && value.trim() ? value : String(value ?? '-')}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty-state">No destination snapshot stored on this request.</div>
                )}
              </article>

              <label className="admin-reason-field">
                <span>Operator note</span>
                <textarea
                  rows={4}
                  placeholder="Add an internal note or rejection reason."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-primary-button"
                  disabled={acting !== null || selectedRequest.status === 'submitted'}
                  onClick={() => void submitReview('submitted')}
                >
                  {acting === 'submitted' ? 'Updating...' : 'Mark processing'}
                </button>
                <button
                  type="button"
                  className="admin-success-button"
                  disabled={acting !== null || selectedRequest.status === 'success'}
                  onClick={() => void submitReview('success')}
                >
                  {acting === 'success' ? 'Updating...' : 'Mark paid'}
                </button>
                <button
                  type="button"
                  className="admin-warn-button"
                  disabled={acting !== null}
                  onClick={() => void submitReview('failed')}
                >
                  {acting === 'failed' ? 'Updating...' : 'Reject request'}
                </button>
                <button
                  type="button"
                  className="admin-ghost-button"
                  disabled={acting !== null}
                  onClick={() => void submitReview('reversed')}
                >
                  {acting === 'reversed' ? 'Updating...' : 'Return to balance'}
                </button>
              </div>
            </>
          ) : (
            <div className="admin-empty-state">Select a withdrawal request to review its details.</div>
          )}
        </section>
      </div>
    </div>
  );
}
