import { useEffect, type ComponentType } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthGate } from './AuthGate';
import { env } from './env';
import { ErrorBoundary } from './ErrorBoundary';
import { HtmlPage, normalizePath, resolveSnapshotFile } from './HtmlPage';
import AdminPayouts from './pages/AdminPayouts';
import ProfileAiko from './pages/ProfileAiko';
import { MyHome } from './pages/MyPages';
import SettingsProfile from './pages/SettingsProfile';
import {
  SettingsAccount,
  SettingsDisplay,
  SettingsHome,
  SettingsLanguage,
  SettingsNotifications,
  SettingsSubscription,
} from './pages/SettingsPages';
import {
  MyBanking,
  MyChats,
  MyCollections,
  MyNotifications,
  MyPayments,
  MyPaymentsAddCard,
  MyWithdraw,
  PostsCreate,
  MySubscribersActive,
  MySubscriptionsActive,
  MySubscriptionsExpired,
  MyTicketsCreate,
} from './pages/MyPages';

const REACT_ROUTES: Record<string, ComponentType> = {
  '/': MyHome,
  '/admin': AdminPayouts,
  '/my/settings/profile': SettingsProfile,
  '/my/settings': SettingsHome,
  '/my/settings/account': SettingsAccount,
  '/my/settings/notifications': SettingsNotifications,
  '/my/settings/subscription': SettingsSubscription,
  '/my/settings/display': SettingsDisplay,
  '/my/settings/language': SettingsLanguage,
  '/my/chats': MyChats,
  '/my/notifications': MyNotifications,
  '/my/collections': MyCollections,
  '/my/collections/user-lists/subscriptions/active': MySubscriptionsActive,
  '/my/collections/user-lists/subscriptions/expired': MySubscriptionsExpired,
  '/my/collections/user-lists/subscribers/active': MySubscribersActive,
  '/my/payments': MyPayments,
  '/my/payments/add_card': MyPaymentsAddCard,
  '/my/withdraw': MyWithdraw,
  '/my/banking': MyBanking,
  '/my/tickets/create': MyTicketsCreate,
  '/posts/create': PostsCreate,
};

if (!import.meta.env.PROD) {
  REACT_ROUTES['/aiko_mitsuri'] = ProfileAiko;
}

const CREATOR_BASE_PATH = env.creatorBasePath ?? '/creator';

const stripBasePath = (path: string) => {
  if (!CREATOR_BASE_PATH || CREATOR_BASE_PATH === '/') {
    return path;
  }
  if (path.startsWith(CREATOR_BASE_PATH)) {
    const stripped = path.slice(CREATOR_BASE_PATH.length);
    return stripped || '/';
  }
  return path;
};

function RouteLoader() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = normalizePath(stripBasePath(location.pathname));
  const ReactPage = REACT_ROUTES[normalizedPath];

  useEffect(() => {
    if (normalizedPath !== location.pathname) {
      navigate(`${normalizedPath}${location.search}${location.hash}`, {
        replace: true,
      });
      return;
    }

    if (!resolveSnapshotFile(normalizedPath) && !ReactPage) {
      navigate('/', { replace: true });
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    navigate,
    normalizedPath,
    ReactPage,
  ]);

  if (ReactPage) {
    return (
      <>
        <LinkInterceptor />
        <ScrollRestoration />
        <ReactPage />
      </>
    );
  }

  return (
    <>
      <LinkInterceptor />
      <ScrollRestoration />
      <HtmlPage path={normalizedPath} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={CREATOR_BASE_PATH === '/' ? undefined : CREATOR_BASE_PATH}>
      <ErrorBoundary>
        <AuthGate>
          <RouteLoader />
        </AuthGate>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

function ScrollRestoration() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return null;
}

function LinkInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest('a');

      if (!anchor) {
        return;
      }

      if (anchor.target && anchor.target !== '_self') {
        return;
      }

      if (anchor.hasAttribute('download')) {
        return;
      }

      const href = anchor.getAttribute('href');

      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }

      let url: URL;

      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) {
        return;
      }

      const nextPath = normalizePath(stripBasePath(url.pathname));

      if (!resolveSnapshotFile(nextPath) && !REACT_ROUTES[nextPath]) {
        return;
      }

      event.preventDefault();
      navigate(`${nextPath}${url.search}${url.hash}`);
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [navigate]);

  return null;
}
