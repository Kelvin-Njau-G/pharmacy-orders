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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
