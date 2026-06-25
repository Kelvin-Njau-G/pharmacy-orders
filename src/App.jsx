import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute  from './components/ProtectedRoute'
import Login         from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard     from './pages/Dashboard'
import OrderForm     from './pages/OrderForm'
import AdminConsole  from './pages/AdminConsole'

// When Supabase's recovery email is clicked, the browser lands on the root
// URL with the recovery token in the hash (e.g. /#access_token=XXX&type=recovery).
// We forward the whole hash to /reset-password so Supabase can auto-process
// it there. For any other landing on root, we go to the dashboard.
function RootRedirect() {
  const hash   = typeof window !== 'undefined' ? window.location.hash   : ''
  const search = typeof window !== 'undefined' ? window.location.search : ''

  if (hash.includes('type=recovery')) {
    return <Navigate to={`/reset-password${hash}`} replace />
  }
  // PKCE flow sends a ?code= query param instead of a hash fragment
  if (search.includes('code=')) {
    return <Navigate to={`/reset-password${search}`} replace />
  }
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"          element={<Login />} />
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
          <Route path="/"  element={<RootRedirect />} />
          <Route path="*"  element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
