import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

declare global {
  interface Window {
    ipcRenderer?: any;
    db?: any;
  }
}


if (window.ipcRenderer && (window.ipcRenderer as any).sendSync) {
  window.alert = (msg) => {
    (window.ipcRenderer as any).sendSync('show-alert', msg);
  };
  window.confirm = (msg) => {
    return (window.ipcRenderer as any).sendSync('show-confirm', msg);
  };
}

// Global UI error reporters
window.addEventListener('error', (event) => {
  try {
    // @ts-ignore
    window.db?.invoke?.('log-renderer-error', {
      source: 'Frontend Window',
      message: event.message || 'Window error',
      stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`
    });
  } catch (_) {}
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason;
    // @ts-ignore
    window.db?.invoke?.('log-renderer-error', {
      source: 'Frontend Promise Rejection',
      message: reason?.message || String(reason || 'Unhandled Promise Rejection'),
      stack: reason?.stack
    });
  } catch (_) {}
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Unhandled React Error:', error, errorInfo);
    try {
      // @ts-ignore
      window.db?.invoke?.('log-renderer-error', {
        source: 'React ErrorBoundary',
        message: error?.message || String(error),
        stack: (error?.stack || '') + '\nComponentStack: ' + (errorInfo?.componentStack || '')
      });
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0F291E',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '32px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
          }}>
            <h1 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '12px', color: '#6EE7B7' }}>
              Nova FreshMart POS
            </h1>
            <p style={{ fontSize: '14px', color: '#E2E8F0', marginBottom: '20px' }}>
              The application encountered a display issue and has safely recovered.
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '12px',
              padding: '12px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#FCD34D',
              textAlign: 'left',
              maxHeight: '120px',
              overflow: 'auto',
              marginBottom: '24px',
              wordBreak: 'break-all'
            }}>
              {String(this.state.error?.message || this.state.error || 'Unknown Error')}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#008B44',
                color: '#ffffff',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '14px',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,139,68,0.4)'
              }}
            >
              Restart Nova FreshMart
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

