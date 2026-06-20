import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import ProtectedRoute  from './components/ProtectedRoute'
import Login         from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard     from './pages/Dashboard'
import OrderForm     from './pages/OrderForm'
import AdminConsole  from './pages/AdminConsole'

// Catches Supabase's "password recovery" link, wherever it lands,
// and routes the person to the set-new-password screen.
// (Kept as a backup in case the recovery hash is detected slightly
// after the initial route decision below.)
function RecoveryRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])
  return null
}

// The root path ("/") needs special care: Supabase's password-recovery
// link lands here with a secret token in the URL fragment (after the #).
// If we redirect to /dashboard naively, React Router drops that fragment
// before Supabase has a chance to read it. So we check for it first and,
// if present, carry the fragment along to the reset-password screen.
function RootRedirect() {
  const isRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
  if (isRecovery) {
    return <Navigate to={`/reset-password${window.location.hash}`} replace />
  }
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RecoveryRedirect />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/orders/:id" element={
            <ProtectedRoute><OrderForm /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><AdminConsole /></ProtectedRoute>
          } />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
