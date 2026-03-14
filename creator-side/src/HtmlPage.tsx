import { useEffect, useMemo, useRef, useState } from 'react';
import { ROUTE_MAP } from './routes';

const HEAD_MARKER = 'data-html-head';
const FETCH_TIMEOUT_MS = 10000;
const BASE_URL = import.meta.env.BASE_URL ?? '/';
const assetUrl = (path: string) => `${BASE_URL}${path.replace(/^\/+/, '')}`;

export const normalizePath = (input: string): string => {
  let path = input || '/';
  try {
    path = decodeURIComponent(path);
  } catch {
    path = input || '/';
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  if (path.endsWith('.html')) {
    path = path.slice(0, -5);
  }
  if (path.endsWith('/index')) {
    path = path.slice(0, -6);
  }

  if (path === '') {
    path = '/';
  }

  return path || '/';
};

export const resolveSnapshotFile = (path: string): string | null => {
  const normalized = normalizePath(path);
  return ROUTE_MAP[normalized] ?? null;
};

const cloneNode = (node: Node): Node | null => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    if (element.tagName.toLowerCase() === 'script') {
      return null;
    }
  }

  return node.cloneNode(true);
};

const clearInjectedHead = () => {
  document
    .head
    .querySelectorAll(`[${HEAD_MARKER}]`)
    .forEach((node) => node.remove());
};

const syncHead = (doc: Document) => {
  const head = document.head;
  const title = doc.title;

  if (title) {
    document.title = title;
  }

  clearInjectedHead();

  for (const element of Array.from(doc.head.children)) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'title' || tagName === 'script') {
      continue;
    }

    const clone = element.cloneNode(true) as Element;

    clone.setAttribute(HEAD_MARKER, 'true');
    head.appendChild(clone);
  }
};

type BodyState = {
  baselineAttributes: Map<string, string>;
  baselineCaptured: boolean;
  appliedAttributes: Set<string>;
  nodes: Node[];
};

const captureBaselineAttributes = (body: HTMLElement, state: BodyState) => {
  if (state.baselineCaptured) {
    return;
  }

  state.baselineCaptured = true;
  state.baselineAttributes = new Map(
    Array.from(body.attributes, (attr) => [attr.name, attr.value])
  );
};

const clearBodyAttributes = (body: HTMLElement) => {
  for (const attr of Array.from(body.attributes)) {
    body.removeAttribute(attr.name);
  }
};

const syncBody = (doc: Document, state: BodyState) => {
  const body = document.body;

  captureBaselineAttributes(body, state);
  clearBodyAttributes(body);
  state.appliedAttributes.clear();

  for (const attr of Array.from(doc.body.attributes)) {
    body.setAttribute(attr.name, attr.value);
    state.appliedAttributes.add(attr.name);
  }

  for (const node of state.nodes) {
    node.parentNode?.removeChild(node);
  }

  state.nodes = [];

  const root = document.getElementById('react-root');

  for (const node of Array.from(doc.body.childNodes)) {
    const clone = cloneNode(node);

    if (!clone) {
      continue;
    }

    if (root) {
      body.insertBefore(clone, root);
    } else {
      body.appendChild(clone);
    }

    state.nodes.push(clone);
  }
};

const clearInjectedBody = (state: BodyState) => {
  const body = document.body;

  for (const node of state.nodes) {
    node.parentNode?.removeChild(node);
  }

  state.nodes = [];

  if (!state.baselineCaptured) {
    return;
  }

  clearBodyAttributes(body);

  for (const [name, value] of state.baselineAttributes) {
    body.setAttribute(name, value);
  }

  state.appliedAttributes.clear();
  state.baselineAttributes.clear();
  state.baselineCaptured = false;
};

export function HtmlPage({ path }: { path: string }) {
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const bodyStateRef = useRef<BodyState>({
    baselineAttributes: new Map<string, string>(),
    baselineCaptured: false,
    appliedAttributes: new Set<string>(),
    nodes: [],
  });
  const baselineTitleRef = useRef<string | null>(null);

  const normalizedPath = useMemo(() => normalizePath(path), [path]);

  useEffect(() => {
    if (baselineTitleRef.current === null) {
      baselineTitleRef.current = document.title;
    }

    return () => {
      if (baselineTitleRef.current !== null) {
        document.title = baselineTitleRef.current;
      }
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);
    const file = resolveSnapshotFile(normalizedPath);

    if (!file) {
      setError(`No snapshot found for ${normalizedPath}`);
      window.clearTimeout(timeoutId);
      return () => {};
    }

    setError(null);

    fetch(assetUrl(`pages/${file}`), { cache: 'force-cache', signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${file}`);
        }
        return response.text();
      })
      .then((html) => {
        if (canceled) {
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        syncHead(doc);
        syncBody(doc, bodyStateRef.current);
      })
      .catch((fetchError: Error) => {
        if (canceled) {
          return;
        }
        if (fetchError.name === 'AbortError') {
          setError('Request timed out. Please try again.');
          return;
        }
        setError(fetchError.message);
        console.error(fetchError);
      });

    return () => {
      canceled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
      clearInjectedHead();
      clearInjectedBody(bodyStateRef.current);
    };
  }, [normalizedPath, retryCount]);

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#0a0d12',
          color: '#e8edf5',
          fontFamily: '"Open Sans", "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            width: 'min(560px, 100%)',
            border: '1px solid #1f2733',
            borderRadius: '14px',
            padding: '20px',
            background: '#0d1117',
            display: 'grid',
            gap: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px' }}>Page Unavailable</h2>
          <p style={{ margin: 0, color: '#9fb0c7', fontSize: '14px' }}>
            We could not load this page snapshot for <code>{normalizedPath}</code>.
          </p>
          <p style={{ margin: 0, color: '#7b8897', fontSize: '13px' }}>{error}</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '8px 14px',
                background: '#00aef0',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <a
              href="/"
              style={{
                borderRadius: '999px',
                padding: '8px 14px',
                border: '1px solid #1f2733',
                color: '#e8edf5',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
