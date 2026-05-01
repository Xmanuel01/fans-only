import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  addAdminPayoutNote,
  fetchAdminPayoutDetail,
  fetchAdminPayoutRequests,
  getSession,
  resendAdminPayoutNotification,
  reviewAdminPayoutRequest,
  signOut,
  updateAdminPayoutControls,
  uploadAdminPayoutProof,
  type AdminPayoutAuditEvent,
  type AdminPayoutDetail,
  type AdminPayoutNotificationEvent,
  type AdminPayoutRequest,
  type AdminPayoutReviewStatus,
  type AdminRole,
} from '../supabaseClient';
import { env, isAdminEmail } from '../env';
import './AdminPayouts.css';

type FilterKey = 'all' | 'open' | AdminPayoutReviewStatus;
type RailFilter = 'all' | 'bank' | 'mobile_money';
type MetricWindow = 'day' | 'week' | 'month';

const PROCESSABLE_STATUSES: AdminPayoutReviewStatus[] = ['queued', 'submitted'];

const REVIEW_ORDER: FilterKey[] = ['open', 'queued', 'submitted', 'success', 'failed', 'reversed', 'all'];

const roleRank: Record<AdminRole, number> = {
  viewer: 0,
  operator: 1,
  super_admin: 2,
};

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

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Unknown';
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatMetricLabel = (window: MetricWindow) => {
  if (window === 'day') return 'today';
  if (window === 'week') return 'last 7 days';
  return 'last 30 days';
};

const statusLabel = (status: AdminPayoutReviewStatus) => {
  if (status === 'queued') return 'Pending review';
  if (status === 'submitted') return 'Processing';
  if (status === 'success') return 'Paid';
  if (status === 'failed') return 'Rejected';
  return 'Returned';
};

const methodLabel = (method: AdminPayoutRequest['requestedMethod']) => {
  if (method === 'bank') return 'Bank payout';
  if (method === 'mobile_money') return 'Mobile money payout';
  return 'Withdrawal';
};

const canActAs = (role: AdminRole, target: AdminRole) => roleRank[role] >= roleRank[target];

const amountMajorFromInput = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const addBusinessDays = (input: string, days: number) => {
  const date = new Date(input);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date;
};

const daysBetween = (start: string, end: string) => {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
};

const summarizeDestination = (snapshot: Record<string, unknown> | null) => {
  if (!snapshot) {
    return [];
  }
  return Object.entries(snapshot).map(([key, value]) => ({
    label: key.replace(/_/g, ' '),
    value:
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : value == null
            ? '-'
            : JSON.stringify(value),
  }));
};

const summarizeSnapshot = (snapshot: Record<string, unknown> | null) => {
  if (!snapshot) return [];
  return Object.entries(snapshot).map(([key, value]) => ({
    label: key.replace(/_/g, ' '),
    value:
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : value == null
            ? '-'
            : JSON.stringify(value),
  }));
};

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const next = value == null ? '' : String(value);
  if (/[,"\n]/.test(next)) {
    return `"${next.replace(/"/g, '""')}"`;
  }
  return next;
};

const toCsv = (rows: Array<Record<string, string | number | boolean | null | undefined>>) => {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(',')),
  ].join('\n');
};

const makeTimeline = (
  auditLog: AdminPayoutAuditEvent[],
  notifications: AdminPayoutNotificationEvent[],
  request: AdminPayoutDetail['request'],
) => {
  const auditItems = auditLog.map((event) => ({
    id: `audit-${event.id}`,
    at: event.created_at,
    kind: 'audit' as const,
    title: event.action.replace(/_/g, ' '),
    subtitle: `${event.actor_email} · ${event.actor_role}`,
    meta:
      event.from_status || event.to_status
        ? `${event.from_status ?? 'none'} -> ${event.to_status ?? 'none'}`
        : null,
    note: event.note,
  }));
  const notificationItems = notifications.map((event) => ({
    id: `notification-${event.id}`,
    at: event.created_at,
    kind: 'notification' as const,
    title: `Email ${event.status}`,
    subtitle: `${event.event_kind.replace(/_/g, ' ')} · ${event.recipient_email}`,
    meta: event.error_message ?? event.provider_message_id ?? null,
    note: null as string | null,
  }));
  const requestItem = {
    id: `request-${request.id}`,
    at: request.createdAt,
    kind: 'request' as const,
    title: 'request created',
    subtitle: request.creatorEmail ?? 'creator',
    meta: request.reference,
    note: request.reason,
  };

  return [requestItem, ...auditItems, ...notificationItems].sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime(),
  );
};

const buildFraudFlags = (request: AdminPayoutRequest) => {
  const flags: string[] = [];
  if (request.flags.largeWithdrawal) flags.push('Large amount');
  if (request.flags.rapidRepeat) flags.push('Rapid repeat');
  if (request.flags.newCreator) flags.push('New creator');
  if (request.flags.recentMethodChange) flags.push('Recent method change');
  if (request.flags.manualHold) flags.push('Manual hold');
  if (request.flags.payoutChangesLocked) flags.push('Profile locked');
  return flags;
};

export default function AdminPayouts() {
  const [accessChecked, setAccessChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<AdminRole>('viewer');
  const [requests, setRequests] = useState<AdminPayoutRequest[]>([]);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [railFilter, setRailFilter] = useState<RailFilter>('all');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [metricWindow, setMetricWindow] = useState<MetricWindow>('week');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detail, setDetail] = useState<AdminPayoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [externalReferenceDraft, setExternalReferenceDraft] = useState('');
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminPayoutRequests({ status: 'all', limit: 250 });
      setRole(response.role);
      setRequests(response.requests);
      setSelectedId((current) => {
        if (current && response.requests.some((item) => item.id === current)) {
          return current;
        }
        return response.requests[0]?.id ?? null;
      });
      setSelectedIds((current) => current.filter((id) => response.requests.some((item) => item.id === id)));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError instanceof Error ? loadError.message : 'Could not load withdrawal requests.');
      setRequests([]);
      setSelectedId(null);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (transferId: number) => {
    setDetailLoading(true);
    try {
      const nextDetail = await fetchAdminPayoutDetail(transferId);
      setDetail(nextDetail);
      setExternalReferenceDraft(nextDetail.request.externalReference ?? '');
      setReason(nextDetail.request.failureReason ?? '');
    } catch (detailError) {
      console.error(detailError);
      setError(detailError instanceof Error ? detailError.message : 'Could not load payout request detail.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
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
    if (!authorized || selectedId == null) return;
    void loadDetail(selectedId);
  }, [authorized, selectedId]);

  const filteredRequests = useMemo(() => {
    const minMinor = amountMajorFromInput(amountMin);
    const maxMinor = amountMajorFromInput(amountMax);
    const normalizedQuery = query.trim().toLowerCase();

    return requests.filter((request) => {
      if (filter === 'open') {
        if (!PROCESSABLE_STATUSES.includes(request.status)) return false;
      } else if (filter !== 'all' && request.status !== filter) {
        return false;
      }

      if (railFilter !== 'all' && request.requestedMethod !== railFilter) {
        return false;
      }

      if (dateFrom) {
        const created = new Date(request.createdAt);
        const start = new Date(`${dateFrom}T00:00:00`);
        if (created < start) return false;
      }

      if (dateTo) {
        const created = new Date(request.createdAt);
        const end = new Date(`${dateTo}T23:59:59`);
        if (created > end) return false;
      }

      if (minMinor != null && request.amountMinor < minMinor) return false;
      if (maxMinor != null && request.amountMinor > maxMinor) return false;

      if (normalizedQuery) {
        const haystack = [
          request.creatorEmail,
          request.creatorName,
          request.creatorHandle,
          request.reference,
          request.externalReference,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }

      return true;
    });
  }, [amountMax, amountMin, dateFrom, dateTo, filter, query, railFilter, requests]);

  const selectedRequest = useMemo(() => {
    if (selectedId == null) return filteredRequests[0] ?? requests[0] ?? null;
    return requests.find((item) => item.id === selectedId) ?? filteredRequests[0] ?? requests[0] ?? null;
  }, [filteredRequests, requests, selectedId]);

  useEffect(() => {
    if (selectedRequest && selectedRequest.id !== selectedId) {
      setSelectedId(selectedRequest.id);
    }
  }, [selectedId, selectedRequest]);

  const bulkEligibleIds = useMemo(
    () =>
      selectedIds.filter((id) =>
        requests.some((request) => request.id === id && request.status === 'queued'),
      ),
    [requests, selectedIds],
  );

  const metrics = useMemo(() => {
    const now = Date.now();
    const cutoffDays = metricWindow === 'day' ? 1 : metricWindow === 'week' ? 7 : 30;
    const cutoff = now - cutoffDays * 24 * 60 * 60 * 1000;

    let pendingMinor = 0;
    let processingMinor = 0;
    let paidMinor = 0;
    let failedMinor = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let escalatedCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let settlementDaysTotal = 0;
    let settlementSamples = 0;

    const processedWindow = {
      successMinor: 0,
      failedMinor: 0,
      count: 0,
    };

    for (const request of requests) {
      if (request.status === 'queued') {
        pendingMinor += request.amountMinor;
        pendingCount += 1;
      }
      if (request.status === 'submitted') {
        processingMinor += request.amountMinor;
        pendingCount += 1;
      }
      if (request.status === 'success') {
        paidMinor += request.amountMinor;
        successCount += 1;
      }
      if (request.status === 'failed' || request.status === 'reversed') {
        failedMinor += request.amountMinor;
        failureCount += 1;
      }

      const dueAt = addBusinessDays(request.createdAt, 5).getTime();
      if (PROCESSABLE_STATUSES.includes(request.status) && dueAt < now) {
        overdueCount += 1;
      }
      if (PROCESSABLE_STATUSES.includes(request.status) && dueAt - now < 24 * 60 * 60 * 1000) {
        escalatedCount += 1;
      }

      const updatedAt = new Date(request.updatedAt).getTime();
      if (updatedAt >= cutoff) {
        if (request.status === 'success') {
          processedWindow.successMinor += request.amountMinor;
          processedWindow.count += 1;
        }
        if (request.status === 'failed' || request.status === 'reversed') {
          processedWindow.failedMinor += request.amountMinor;
        }
      }

      if (request.status === 'success' && request.settledAt) {
        const days = daysBetween(request.createdAt, request.settledAt);
        if (days != null) {
          settlementDaysTotal += days;
          settlementSamples += 1;
        }
      }
    }

    const payoutSuccessRate =
      successCount + failureCount > 0 ? (successCount / (successCount + failureCount)) * 100 : 0;
    const averageSettlementDays =
      settlementSamples > 0 ? settlementDaysTotal / settlementSamples : 0;

    return {
      pendingMinor,
      processingMinor,
      paidMinor,
      failedMinor,
      pendingCount,
      overdueCount,
      escalatedCount,
      payoutSuccessRate,
      averageSettlementDays,
      processedWindow,
    };
  }, [metricWindow, requests]);

  const donutSegments = useMemo(() => {
    const total = metrics.pendingMinor + metrics.processingMinor + metrics.paidMinor || 1;
    const values = [
      { key: 'available', value: metrics.pendingMinor, color: '#7eb5ff' },
      { key: 'processing', value: metrics.processingMinor, color: '#5fd1a6' },
      { key: 'paid', value: metrics.paidMinor, color: '#f6b563' },
    ];
    let cumulative = 0;
    return values.map((segment) => {
      const length = (segment.value / total) * 100;
      const start = cumulative;
      cumulative += length;
      return {
        ...segment,
        dasharray: `${length} ${100 - length}`,
        dashoffset: 25 - start,
      };
    });
  }, [metrics.paidMinor, metrics.pendingMinor, metrics.processingMinor]);

  const reconciliationSeries = useMemo(() => {
    const periods = [
      { key: 'day', label: 'Today', hours: 24 },
      { key: 'week', label: '7 days', hours: 24 * 7 },
      { key: 'month', label: '30 days', hours: 24 * 30 },
    ] as const;
    const now = Date.now();

    return periods.map((period) => {
      const cutoff = now - period.hours * 60 * 60 * 1000;
      let paid = 0;
      let rejected = 0;
      let pending = 0;
      for (const request of requests) {
        const createdAt = new Date(request.createdAt).getTime();
        const updatedAt = new Date(request.updatedAt).getTime();
        if (request.status === 'success' && updatedAt >= cutoff) paid += request.amountMinor;
        if ((request.status === 'failed' || request.status === 'reversed') && updatedAt >= cutoff) {
          rejected += request.amountMinor;
        }
        if (PROCESSABLE_STATUSES.includes(request.status) && createdAt >= cutoff) {
          pending += request.amountMinor;
        }
      }
      const peak = Math.max(paid, rejected, pending, 1);
      return { ...period, paid, rejected, pending, peak };
    });
  }, [requests]);

  const activeDetail = detail?.request.id === selectedRequest?.id ? detail : null;
  const timeline = useMemo(
    () => (activeDetail ? makeTimeline(activeDetail.auditLog, activeDetail.notifications, activeDetail.request) : []),
    [activeDetail],
  );

  const submitReview = async (status: AdminPayoutReviewStatus, ids?: number[]) => {
    const targetIds = ids ?? (selectedRequest ? [selectedRequest.id] : []);
    if (!targetIds.length) return;
    if ((status === 'failed' || status === 'reversed') && !reason.trim() && targetIds.length === 1) {
      setError('Add a reason before rejecting or returning a withdrawal.');
      return;
    }

    try {
      setActing(status);
      setError(null);
      setNotice(null);

      const settled = await Promise.allSettled(
        targetIds.map((transferId) =>
          reviewAdminPayoutRequest({
            transferId,
            status,
            reason: targetIds.length === 1 ? reason.trim() || null : 'Bulk processing action',
            metadata: {
              source: 'admin-dashboard',
              external_reference: targetIds.length === 1 ? externalReferenceDraft.trim() || null : null,
              bulk: targetIds.length > 1,
            },
          }),
        ),
      );

      const failed = settled.filter((entry) => entry.status === 'rejected');
      if (failed.length) {
        const first = failed[0] as PromiseRejectedResult;
        throw first.reason;
      }

      setNotice(
        targetIds.length > 1
          ? `${targetIds.length} withdrawals moved to ${statusLabel(status)}.`
          : `Withdrawal ${selectedRequest?.reference ?? targetIds[0]} updated to ${statusLabel(status)}.`,
      );
      setReason('');
      setSelectedIds([]);
      await loadRequests();
      if (selectedRequest) {
        await loadDetail(selectedRequest.id);
      }
    } catch (actionError) {
      console.error(actionError);
      setError(actionError instanceof Error ? actionError.message : 'Could not update withdrawal request.');
    } finally {
      setActing(null);
    }
  };

  const submitNote = async () => {
    if (!selectedRequest || !noteDraft.trim()) return;
    try {
      setActing('note');
      setError(null);
      setNotice(null);
      await addAdminPayoutNote(selectedRequest.id, noteDraft.trim());
      setNoteDraft('');
      setNotice('Admin note saved.');
      await loadDetail(selectedRequest.id);
    } catch (noteError) {
      console.error(noteError);
      setError(noteError instanceof Error ? noteError.message : 'Could not save note.');
    } finally {
      setActing(null);
    }
  };

  const handleResend = async (eventKind: 'creator_requested' | 'admin_requested' | 'creator_status') => {
    if (!selectedRequest) return;
    try {
      setActing(`resend-${eventKind}`);
      setError(null);
      setNotice(null);
      await resendAdminPayoutNotification({ transferId: selectedRequest.id, eventKind });
      setNotice('Notification resend queued.');
      await loadDetail(selectedRequest.id);
    } catch (resendError) {
      console.error(resendError);
      setError(resendError instanceof Error ? resendError.message : 'Could not resend notification.');
    } finally {
      setActing(null);
    }
  };

  const handleControlUpdate = async (params: {
    manualHold?: boolean;
    holdReason?: string | null;
    payoutChangesLocked?: boolean;
    payoutChangesLockReason?: string | null;
  }) => {
    if (!selectedRequest) return;
    try {
      setActing('controls');
      setError(null);
      setNotice(null);
      await updateAdminPayoutControls({
        transferId: selectedRequest.id,
        creatorId: selectedRequest.creatorId,
        ...params,
      });
      setNotice('Payout controls updated.');
      await loadRequests();
      await loadDetail(selectedRequest.id);
    } catch (updateError) {
      console.error(updateError);
      setError(updateError instanceof Error ? updateError.message : 'Could not update payout controls.');
    } finally {
      setActing(null);
    }
  };

  const handleProofFile = async (file: File | null) => {
    if (!selectedRequest || !file) return;
    try {
      setProofUploading(true);
      setError(null);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      const dataBase64 = btoa(binary);
      const response = await uploadAdminPayoutProof({
        transferId: selectedRequest.id,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        dataBase64,
        externalReference: externalReferenceDraft.trim() || null,
      });
      setProofFileName(file.name);
      setExternalReferenceDraft(response.externalReference ?? '');
      setNotice('Payment proof uploaded.');
      await loadRequests();
      await loadDetail(selectedRequest.id);
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload payout proof.');
    } finally {
      setProofUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const exportCsv = (rows: AdminPayoutRequest[], fileName: string) => {
    if (!rows.length) {
      setError('Nothing to export for the current selection.');
      return;
    }
    const csv = toCsv(
      rows.map((request) => ({
        reference: request.reference,
        creator_name: request.creatorName ?? '',
        creator_email: request.creatorEmail ?? '',
        handle: request.creatorHandle ?? '',
        amount_kes: (request.amountMinor / 100).toFixed(2),
        status: request.status,
        method: request.requestedMethod ?? '',
        created_at: request.createdAt,
        updated_at: request.updatedAt,
        settled_at: request.settledAt ?? '',
        external_reference: request.externalReference ?? '',
        manual_hold: request.manualHold,
        hold_reason: request.holdReason ?? '',
      })),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (accessChecked && !authorized) {
    return <Navigate to="/" replace />;
  }

  const activeRequest = activeDetail?.request ?? selectedRequest;
  const dueDate = selectedRequest ? addBusinessDays(selectedRequest.createdAt, 5) : null;
  const nearingSla =
    selectedRequest && PROCESSABLE_STATUSES.includes(selectedRequest.status)
      ? dueDate != null && dueDate.getTime() - Date.now() < 24 * 60 * 60 * 1000
      : false;
  const overdue =
    selectedRequest && PROCESSABLE_STATUSES.includes(selectedRequest.status)
      ? dueDate != null && dueDate.getTime() < Date.now()
      : false;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <div className="admin-kicker">Admin workspace</div>
          <h1>Payout operations console</h1>
          <p>
            Review withdrawal risk, manage payout state, keep audit history intact, and hand off
            finance-ready exports without leaving the console.
          </p>
        </div>
        <div className="admin-header__actions">
          <span className={`admin-role-badge admin-role-badge--${role}`}>{role.replace('_', ' ')}</span>
          <button className="admin-ghost-button" type="button" onClick={() => void loadRequests()}>
            Refresh
          </button>
          <button
            className="admin-ghost-button"
            type="button"
            onClick={() => exportCsv(filteredRequests, `payouts-${Date.now()}.csv`)}
          >
            Export filtered CSV
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

      <section className="admin-hero-grid">
        <article className="admin-donut-card">
          <div className="admin-card-topline">
            <span>Funds position</span>
            <div className="admin-segment-legend">
              <span><i className="admin-dot admin-dot--queued" />Pending</span>
              <span><i className="admin-dot admin-dot--processing" />Processing</span>
              <span><i className="admin-dot admin-dot--paid" />Paid out</span>
            </div>
          </div>
          <div className="admin-donut-layout">
            <svg className="admin-donut" viewBox="0 0 42 42" aria-hidden="true">
              <circle className="admin-donut__track" cx="21" cy="21" r="15.915" />
              {donutSegments.map((segment) => (
                <circle
                  key={segment.key}
                  className="admin-donut__segment"
                  cx="21"
                  cy="21"
                  r="15.915"
                  stroke={segment.color}
                  strokeDasharray={segment.dasharray}
                  strokeDashoffset={segment.dashoffset}
                />
              ))}
            </svg>
            <div className="admin-donut-copy">
              <strong>{formatMinorCurrency(metrics.pendingMinor + metrics.processingMinor, 'KES')}</strong>
              <small>still on platform</small>
              <div className="admin-donut-copy__rows">
                <span>{formatMinorCurrency(metrics.pendingMinor, 'KES')} pending review</span>
                <span>{formatMinorCurrency(metrics.processingMinor, 'KES')} already in flight</span>
                <span>{formatMinorCurrency(metrics.paidMinor, 'KES')} settled historically</span>
              </div>
            </div>
          </div>
        </article>

        <section className="admin-metrics">
          <article className="admin-metric-card">
            <span>Total pending amount</span>
            <strong>{formatMinorCurrency(metrics.pendingMinor + metrics.processingMinor, 'KES')}</strong>
            <small>{metrics.pendingCount} requests in queue</small>
          </article>
          <article className="admin-metric-card">
            <span>Processed {formatMetricLabel(metricWindow)}</span>
            <strong>{formatMinorCurrency(metrics.processedWindow.successMinor, 'KES')}</strong>
            <small>{metrics.processedWindow.count} paid requests</small>
          </article>
          <article className="admin-metric-card">
            <span>Failed {formatMetricLabel(metricWindow)}</span>
            <strong>{formatMinorCurrency(metrics.processedWindow.failedMinor, 'KES')}</strong>
            <small>Rejected or returned</small>
          </article>
          <article className="admin-metric-card">
            <span>Payout success rate</span>
            <strong>{metrics.payoutSuccessRate.toFixed(0)}%</strong>
            <small>{metrics.averageSettlementDays.toFixed(1)} days avg settlement</small>
          </article>
        </section>
      </section>

      <section className="admin-summary-grid">
        <article className="admin-summary-card">
          <div className="admin-card-topline">
            <span>Reconciliation windows</span>
            <div className="admin-window-switch">
              {(['day', 'week', 'month'] as const).map((windowKey) => (
                <button
                  key={windowKey}
                  type="button"
                  className={`admin-window-chip${metricWindow === windowKey ? ' is-active' : ''}`}
                  onClick={() => setMetricWindow(windowKey)}
                >
                  {windowKey === 'day' ? 'Today' : windowKey === 'week' ? '7d' : '30d'}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-bars">
            {reconciliationSeries.map((period) => (
              <div key={period.key} className="admin-bars__group">
                <span>{period.label}</span>
                <div className="admin-bars__stack">
                  <div
                    className="admin-bars__value admin-bars__value--paid"
                    style={{ width: `${(period.paid / period.peak) * 100}%` }}
                  />
                  <div
                    className="admin-bars__value admin-bars__value--pending"
                    style={{ width: `${(period.pending / period.peak) * 100}%` }}
                  />
                  <div
                    className="admin-bars__value admin-bars__value--rejected"
                    style={{ width: `${(period.rejected / period.peak) * 100}%` }}
                  />
                </div>
                <small>
                  {formatMinorCurrency(period.paid, 'KES')} paid · {formatMinorCurrency(period.pending, 'KES')} open
                </small>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-summary-card">
          <div className="admin-card-topline">
            <span>SLA monitoring</span>
            <strong>{metrics.overdueCount} overdue</strong>
          </div>
          <div className="admin-sla-grid">
            <div className="admin-sla-tile">
              <strong>{metrics.escalatedCount}</strong>
              <small>due within 24h</small>
            </div>
            <div className="admin-sla-tile">
              <strong>{metrics.overdueCount}</strong>
              <small>breached 5-working-day target</small>
            </div>
            <div className="admin-sla-tile">
              <strong>{bulkEligibleIds.length}</strong>
              <small>selected and ready for bulk processing</small>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-toolbar">
        <div className="admin-toolbar__filters">
          {REVIEW_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`admin-filter-chip${filter === key ? ' is-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {key === 'open'
                ? 'Open'
                : key === 'all'
                  ? 'All'
                  : key === 'queued'
                    ? 'Pending'
                    : statusLabel(key)}
            </button>
          ))}
        </div>
        <div className="admin-toolbar__search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search creator, handle, email, or reference"
          />
        </div>
        <div className="admin-toolbar__row">
          <select value={railFilter} onChange={(event) => setRailFilter(event.target.value as RailFilter)}>
            <option value="all">All rails</option>
            <option value="bank">Bank payout</option>
            <option value="mobile_money">Mobile money payout</option>
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <input
            value={amountMin}
            onChange={(event) => setAmountMin(event.target.value)}
            placeholder="Min KES"
            inputMode="decimal"
          />
          <input
            value={amountMax}
            onChange={(event) => setAmountMax(event.target.value)}
            placeholder="Max KES"
            inputMode="decimal"
          />
        </div>
      </section>

      {notice ? <div className="admin-notice">{notice}</div> : null}
      {error ? <div className="admin-error">{error}</div> : null}

      <div className="admin-grid">
        <section className="admin-queue">
          <div className="admin-panel-header">
            <div>
              <h2>Requests</h2>
              <span>{loading ? 'Loading...' : `${filteredRequests.length} filtered · ${requests.length} total`}</span>
            </div>
            <div className="admin-panel-header__actions">
              <button
                type="button"
                className="admin-ghost-button"
                onClick={() => {
                  const ids = filteredRequests.map((request) => request.id);
                  setSelectedIds(ids);
                }}
              >
                Select filtered
              </button>
              <button
                type="button"
                className="admin-primary-button"
                disabled={!canActAs(role, 'operator') || !bulkEligibleIds.length || acting !== null}
                onClick={() => void submitReview('submitted', bulkEligibleIds)}
              >
                {acting === 'submitted' && bulkEligibleIds.length ? 'Updating...' : 'Bulk mark processing'}
              </button>
              <button
                type="button"
                className="admin-ghost-button"
                disabled={!selectedIds.length}
                onClick={() =>
                  exportCsv(
                    requests.filter((request) => selectedIds.includes(request.id)),
                    `payout-selection-${Date.now()}.csv`,
                  )
                }
              >
                Export selected
              </button>
            </div>
          </div>
          <div className="admin-queue-list">
            {filteredRequests.length ? (
              filteredRequests.map((request) => {
                const due = addBusinessDays(request.createdAt, 5);
                const isOverdue = PROCESSABLE_STATUSES.includes(request.status) && due.getTime() < Date.now();
                const isAging =
                  PROCESSABLE_STATUSES.includes(request.status) &&
                  due.getTime() >= Date.now() &&
                  due.getTime() - Date.now() < 24 * 60 * 60 * 1000;
                const flags = buildFraudFlags(request);
                return (
                  <div
                    key={request.id}
                    className={`admin-queue-item${selectedRequest?.id === request.id ? ' is-active' : ''}`}
                  >
                    <label className="admin-queue-item__select">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(request.id)}
                        onChange={(event) =>
                          setSelectedIds((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, request.id]))
                              : current.filter((value) => value !== request.id),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-queue-item__button"
                      onClick={() => {
                        setSelectedId(request.id);
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
                      <div className="admin-queue-item__submeta">
                        <span>{request.reference}</span>
                        <span>{request.creatorEmail ?? 'No email'}</span>
                      </div>
                      {flags.length ? (
                        <div className="admin-flag-row">
                          {flags.map((flag) => (
                            <span key={flag} className="admin-flag-chip">
                              {flag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="admin-queue-item__sla">
                        <span className={isOverdue ? 'is-critical' : isAging ? 'is-warning' : ''}>
                          {isOverdue ? 'Overdue' : isAging ? 'Due within 24h' : `Due ${formatDate(due.toISOString())}`}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="admin-empty-state">No withdrawal requests found for this filter.</div>
            )}
          </div>
        </section>

        <section className="admin-detail">
          {selectedRequest ? (
            <>
              <div className="admin-panel-header admin-panel-header--detail">
                <div>
                  <h2>{formatMinorCurrency(selectedRequest.amountMinor, selectedRequest.currency)}</h2>
                  <span>{selectedRequest.reference}</span>
                </div>
                <div className="admin-panel-header__detail-meta">
                  {nearingSla ? <span className="admin-pill admin-pill--warning">SLA watch</span> : null}
                  {overdue ? <span className="admin-pill admin-pill--critical">Overdue</span> : null}
                  <span className={`admin-status admin-status--${selectedRequest.status}`}>
                    {statusLabel(selectedRequest.status)}
                  </span>
                </div>
              </div>

              <div className="admin-detail-grid admin-detail-grid--top">
                <article className="admin-detail-card admin-profile-card">
                  <span className="admin-detail-card__label">Creator profile snapshot</span>
                  <div className="admin-profile-card__body">
                    <div className="admin-avatar-shell">
                      {selectedRequest.creatorAvatarUrl ? (
                        <img src={selectedRequest.creatorAvatarUrl} alt={selectedRequest.creatorName ?? 'Creator'} />
                      ) : (
                        <span>{(selectedRequest.creatorName ?? 'C').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <strong>{selectedRequest.creatorName ?? 'Creator account'}</strong>
                      <small>{selectedRequest.creatorEmail ?? 'Email unavailable'}</small>
                      {selectedRequest.creatorHandle ? <small>@{selectedRequest.creatorHandle.replace(/^@/, '')}</small> : null}
                      <small>Joined {formatDate(selectedRequest.creatorCreatedAt)}</small>
                    </div>
                  </div>
                  {activeDetail?.request.creatorSnapshot ? (
                    <div className="admin-kv-list">
                      {summarizeSnapshot(activeDetail.request.creatorSnapshot).slice(0, 6).map((item) => (
                        <div key={item.label} className="admin-kv-list__row">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>

                <article className="admin-detail-card">
                  <span className="admin-detail-card__label">Request summary</span>
                  <div className="admin-kv-list">
                    <div className="admin-kv-list__row">
                      <span>Requested method</span>
                      <strong>{methodLabel(selectedRequest.requestedMethod)}</strong>
                    </div>
                    <div className="admin-kv-list__row">
                      <span>Created</span>
                      <strong>{formatDateTime(selectedRequest.createdAt)}</strong>
                    </div>
                    <div className="admin-kv-list__row">
                      <span>Updated</span>
                      <strong>{formatDateTime(selectedRequest.updatedAt)}</strong>
                    </div>
                    <div className="admin-kv-list__row">
                      <span>Settlement target</span>
                      <strong>{dueDate ? formatDateTime(dueDate.toISOString()) : 'Unknown'}</strong>
                    </div>
                    <div className="admin-kv-list__row">
                      <span>External reference</span>
                      <strong>{selectedRequest.externalReference ?? 'Not attached'}</strong>
                    </div>
                    <div className="admin-kv-list__row">
                      <span>Proof file</span>
                      <strong>{proofFileName ?? activeRequest?.proofPath ?? 'Not uploaded'}</strong>
                    </div>
                  </div>
                </article>
              </div>

              <div className="admin-detail-grid admin-detail-grid--middle">
                <article className="admin-destination-card">
                  <div className="admin-destination-card__title">Destination snapshot</div>
                  {summarizeDestination(selectedRequest.destinationSnapshot).length ? (
                    <div className="admin-destination-card__rows">
                      {summarizeDestination(selectedRequest.destinationSnapshot).map((item) => (
                        <div key={item.label} className="admin-destination-card__row">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty-state">No destination snapshot stored on this request.</div>
                  )}
                </article>

                <article className="admin-destination-card">
                  <div className="admin-destination-card__title">Saved payout methods</div>
                  {activeDetail?.savedMethods.length ? (
                    <div className="admin-method-list">
                      {activeDetail.savedMethods.map((method) => {
                        const suspicious =
                          !method.accountName ||
                          (method.method === 'bank' && !method.accountNumberLast4) ||
                          (method.method === 'mobile_money' && !method.phoneNumberLast4);
                        return (
                          <div key={`${method.method}-${method.updatedAt ?? 'n/a'}`} className="admin-method-card">
                            <div className="admin-method-card__top">
                              <strong>{methodLabel(method.method)}</strong>
                              {suspicious ? <span className="admin-pill admin-pill--warning">Needs review</span> : null}
                            </div>
                            <small>{method.accountName}</small>
                            <small>
                              {method.method === 'bank'
                                ? `${method.bankName ?? method.bankCode ?? 'Bank'} · ****${method.accountNumberLast4 ?? '--'}`
                                : `Mobile ending ${method.phoneNumberLast4 ?? '--'}`}
                            </small>
                            <small>Saved {formatDateTime(method.updatedAt)}</small>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="admin-empty-state">No saved withdrawal methods on file.</div>
                  )}
                </article>
              </div>

              <div className="admin-detail-grid admin-detail-grid--controls">
                <article className="admin-control-card">
                  <div className="admin-destination-card__title">Actions</div>
                  <label className="admin-reason-field">
                    <span>Internal reason / payout note</span>
                    <textarea
                      rows={4}
                      placeholder="Reason for rejection, return, or operator handoff."
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <label className="admin-inline-field">
                    <span>External transfer reference</span>
                    <input
                      value={externalReferenceDraft}
                      onChange={(event) => setExternalReferenceDraft(event.target.value)}
                      placeholder="Bank confirmation or transaction reference"
                    />
                  </label>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-primary-button"
                      disabled={!canActAs(role, 'operator') || acting !== null || selectedRequest.status === 'submitted'}
                      onClick={() => void submitReview('submitted')}
                    >
                      {acting === 'submitted' ? 'Updating...' : 'Mark processing'}
                    </button>
                    <button
                      type="button"
                      className="admin-success-button"
                      disabled={!canActAs(role, 'operator') || acting !== null || selectedRequest.status === 'success'}
                      onClick={() => void submitReview('success')}
                    >
                      {acting === 'success' ? 'Updating...' : 'Mark paid'}
                    </button>
                    <button
                      type="button"
                      className="admin-warn-button"
                      disabled={!canActAs(role, 'super_admin') || acting !== null}
                      onClick={() => void submitReview('failed')}
                    >
                      {acting === 'failed' ? 'Updating...' : 'Reject'}
                    </button>
                    <button
                      type="button"
                      className="admin-ghost-button"
                      disabled={!canActAs(role, 'super_admin') || acting !== null}
                      onClick={() => void submitReview('reversed')}
                    >
                      {acting === 'reversed' ? 'Updating...' : 'Return to balance'}
                    </button>
                  </div>
                </article>

                <article className="admin-control-card">
                  <div className="admin-destination-card__title">Holds and profile controls</div>
                  <div className="admin-toggle-grid">
                    <button
                      type="button"
                      className={`admin-toggle-card${selectedRequest.manualHold ? ' is-active' : ''}`}
                      disabled={!canActAs(role, 'super_admin') || acting === 'controls'}
                      onClick={() =>
                        void handleControlUpdate({
                          manualHold: !selectedRequest.manualHold,
                          holdReason: selectedRequest.manualHold ? null : reason.trim() || 'Manual review hold',
                        })
                      }
                    >
                      <strong>{selectedRequest.manualHold ? 'Hold enabled' : 'Manual hold off'}</strong>
                      <small>{selectedRequest.holdReason ?? 'Pause this payout from operator execution.'}</small>
                    </button>
                    <button
                      type="button"
                      className={`admin-toggle-card${selectedRequest.payoutChangesLocked ? ' is-active' : ''}`}
                      disabled={!canActAs(role, 'super_admin') || acting === 'controls'}
                      onClick={() =>
                        void handleControlUpdate({
                          payoutChangesLocked: !selectedRequest.payoutChangesLocked,
                          payoutChangesLockReason: selectedRequest.payoutChangesLocked
                            ? null
                            : reason.trim() || 'Locked pending compliance review',
                        })
                      }
                    >
                      <strong>{selectedRequest.payoutChangesLocked ? 'Profile locked' : 'Profile changes allowed'}</strong>
                      <small>{selectedRequest.payoutChangesLockReason ?? 'Freeze payout-detail edits for review.'}</small>
                    </button>
                  </div>
                  <div className="admin-proof-upload">
                    <button
                      type="button"
                      className="admin-ghost-button"
                      disabled={!canActAs(role, 'operator') || proofUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {proofUploading ? 'Uploading proof...' : 'Upload payment proof'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      hidden
                      onChange={(event) => void handleProofFile(event.target.files?.[0] ?? null)}
                    />
                    {activeDetail?.request.proofUrl ? (
                      <a className="admin-link" href={activeDetail.request.proofUrl} target="_blank" rel="noreferrer">
                        View current proof
                      </a>
                    ) : null}
                  </div>
                </article>
              </div>

              <div className="admin-detail-grid admin-detail-grid--lower">
                <article className="admin-note-card">
                  <div className="admin-destination-card__title">Admin notes and handoff</div>
                  <label className="admin-reason-field">
                    <span>Private note</span>
                    <textarea
                      rows={4}
                      placeholder="Internal ops note. Not sent to creators."
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="admin-primary-button"
                    disabled={!canActAs(role, 'operator') || acting === 'note' || !noteDraft.trim()}
                    onClick={() => void submitNote()}
                  >
                    {acting === 'note' ? 'Saving...' : 'Save note'}
                  </button>
                  <div className="admin-note-list">
                    {activeDetail?.notes.length ? (
                      activeDetail.notes.map((note) => (
                        <div key={note.id} className="admin-note-item">
                          <div className="admin-note-item__top">
                            <strong>{note.author_email}</strong>
                            <span>{formatDateTime(note.created_at)}</span>
                          </div>
                          <small>{note.author_role}</small>
                          <p>{note.body}</p>
                        </div>
                      ))
                    ) : (
                      <div className="admin-empty-state">No private notes recorded yet.</div>
                    )}
                  </div>
                </article>

                <article className="admin-timeline-card">
                  <div className="admin-destination-card__title">Audit trail and event timeline</div>
                  <div className="admin-timeline">
                    {detailLoading ? (
                      <div className="admin-empty-state">Loading request detail...</div>
                    ) : timeline.length ? (
                      timeline.map((event) => (
                        <div key={event.id} className={`admin-timeline__item admin-timeline__item--${event.kind}`}>
                          <div className="admin-timeline__dot" />
                          <div>
                            <strong>{event.title}</strong>
                            <div className="admin-timeline__meta">
                              <span>{event.subtitle}</span>
                              <span>{formatDateTime(event.at)}</span>
                            </div>
                            {event.meta ? <small>{event.meta}</small> : null}
                            {event.note ? <p>{event.note}</p> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="admin-empty-state">No audit activity recorded yet.</div>
                    )}
                  </div>
                </article>
              </div>

              <div className="admin-detail-grid admin-detail-grid--notifications">
                <article className="admin-notification-card">
                  <div className="admin-destination-card__title">Notification delivery</div>
                  <div className="admin-notification-list">
                    {activeDetail?.notifications.length ? (
                      activeDetail.notifications.map((notification) => (
                        <div key={notification.id} className="admin-notification-item">
                          <div>
                            <strong>{notification.event_kind.replace(/_/g, ' ')}</strong>
                            <small>{notification.recipient_email}</small>
                          </div>
                          <div className="admin-notification-item__meta">
                            <span className={`admin-pill admin-pill--${notification.status}`}>{notification.status}</span>
                            <span>{formatDateTime(notification.created_at)}</span>
                            {notification.error_message ? <small>{notification.error_message}</small> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="admin-empty-state">No notification records stored yet.</div>
                    )}
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-ghost-button"
                      disabled={!canActAs(role, 'operator') || acting === 'resend-creator_requested'}
                      onClick={() => void handleResend('creator_requested')}
                    >
                      Resend creator request email
                    </button>
                    <button
                      type="button"
                      className="admin-ghost-button"
                      disabled={!canActAs(role, 'operator') || acting === 'resend-admin_requested'}
                      onClick={() => void handleResend('admin_requested')}
                    >
                      Resend admin alert
                    </button>
                    <button
                      type="button"
                      className="admin-ghost-button"
                      disabled={!canActAs(role, 'operator') || acting === 'resend-creator_status'}
                      onClick={() => void handleResend('creator_status')}
                    >
                      Resend status email
                    </button>
                  </div>
                </article>
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
