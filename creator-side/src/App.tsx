import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import { env } from './env'
import { ErrorBoundary } from './ErrorBoundary'
import {
  BankingPage,
  PaymentsPage,
  PostsCreatePage,
  SubscriptionSettingsPage,
} from './pages/CorePages'
import './core.css'

const CREATOR_BASE_PATH = env.creatorBasePath ?? '/creator'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/posts/create" replace />} />
      <Route path="/posts/create" element={<PostsCreatePage />} />
      <Route path="/my/payments" element={<PaymentsPage />} />
      <Route path="/my/banking" element={<BankingPage />} />
      <Route path="/my/settings/subscription" element={<SubscriptionSettingsPage />} />

      <Route path="/my/payments/add_card" element={<Navigate to="/my/payments" replace />} />
      <Route path="/my/payments/*" element={<Navigate to="/my/payments" replace />} />

      <Route path="/my/settings" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/profile" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/account" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/notifications" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/privacy" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/display" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/language" element={<Navigate to="/my/settings/subscription" replace />} />
      <Route path="/my/settings/*" element={<Navigate to="/my/settings/subscription" replace />} />

      <Route path="/my/chats" element={<Navigate to="/posts/create" replace />} />
      <Route path="/my/notifications" element={<Navigate to="/posts/create" replace />} />
      <Route path="/my/collections" element={<Navigate to="/posts/create" replace />} />
      <Route path="/my/collections/*" element={<Navigate to="/posts/create" replace />} />
      <Route path="/my/tickets/create" element={<Navigate to="/posts/create" replace />} />
      <Route path="/aiko_mitsuri" element={<Navigate to="/posts/create" replace />} />

      <Route path="*" element={<Navigate to="/posts/create" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={CREATOR_BASE_PATH === '/' ? undefined : CREATOR_BASE_PATH}>
      <ErrorBoundary>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
