import React from 'react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

const DefaultFallback = ({ message }: { message: string }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: '#0b1016',
      color: '#e5eef9',
      fontFamily: '"Open Sans", "Segoe UI", sans-serif',
    }}
  >
    <div
      style={{
        width: 'min(560px, 100%)',
        border: '1px solid #1f2733',
        borderRadius: 14,
        padding: 20,
        background: '#0d1117',
        display: 'grid',
        gap: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Something went wrong</h2>
      <p style={{ margin: 0, color: '#9fb0c7', fontSize: 14 }}>
        The creator dashboard encountered an unexpected error.
      </p>
      <p style={{ margin: 0, color: '#7b8897', fontSize: 13 }}>{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: 'none',
          borderRadius: 999,
          padding: '8px 14px',
          background: '#00aef0',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
          width: 'fit-content',
        }}
      >
        Reload page
      </button>
    </div>
  </div>
);

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: 'Unexpected error.',
  };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Unhandled error', error, info);
  }

  render() {
    const { children, fallback } = this.props;
    const { hasError, message } = this.state;

    if (hasError) {
      return fallback ?? <DefaultFallback message={message} />;
    }

    return children;
  }
}
