import { useEffect, useMemo, useRef, useState } from 'react';
import { ROUTE_MAP } from './routes';

const HEAD_MARKER = 'data-html-head';

export const normalizePath = (input: string): string => {
  let path = decodeURIComponent(input || '/');

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
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
  attributes: Set<string>;
  nodes: Node[];
};

const syncBody = (doc: Document, state: BodyState) => {
  const body = document.body;

  for (const attr of state.attributes) {
    body.removeAttribute(attr);
  }

  state.attributes.clear();

  for (const attr of Array.from(doc.body.attributes)) {
    body.setAttribute(attr.name, attr.value);
    state.attributes.add(attr.name);
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

  for (const attr of state.attributes) {
    body.removeAttribute(attr);
  }

  state.attributes.clear();

  for (const node of state.nodes) {
    node.parentNode?.removeChild(node);
  }

  state.nodes = [];
};

export function HtmlPage({ path }: { path: string }) {
  const [error, setError] = useState<string | null>(null);
  const bodyStateRef = useRef<BodyState>({
    attributes: new Set<string>(),
    nodes: [],
  });

  const normalizedPath = useMemo(() => normalizePath(path), [path]);

  useEffect(() => {
    let canceled = false;
    const file = resolveSnapshotFile(normalizedPath);

    if (!file) {
      setError(`No snapshot found for ${normalizedPath}`);
      return () => {};
    }

    setError(null);

    fetch(`/pages/${file}`, { cache: 'force-cache' })
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
        setError(fetchError.message);
        console.error(fetchError);
      });

    return () => {
      canceled = true;
      clearInjectedHead();
      clearInjectedBody(bodyStateRef.current);
    };
  }, [normalizedPath]);

  if (error) {
    return <span style={{ display: 'none' }}>{error}</span>;
  }

  return null;
}
